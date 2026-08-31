import { z } from "zod";

import { conversationSchema, messageSchema } from "@/domain/models";
import type {
  ChatMessage,
  ConversationRepository,
  MemoryExtractionProvider,
  MessageRepository,
} from "@/domain/ports";
import {
  normalizeApplicationError,
  type ApplicationError,
} from "@/application/error";

import type { MemorySettingsService } from "./settings";

export const MEMORY_EXTRACTION_LIMITS = {
  maxMessages: 12,
  maxCharacters: 6_000,
  maxCandidates: 3,
  maxCandidateCharacters: 280,
} as const;

const extractionInputSchema = z.object({
  conversationId: conversationSchema.shape.id,
  model: z.string().trim().min(1).max(200),
});
const providerCandidatesSchema = z.object({
  candidates: z
    .array(
      z
        .string()
        .transform((value) => value.trim())
        .pipe(
          z
            .string()
            .min(1)
            .max(MEMORY_EXTRACTION_LIMITS.maxCandidateCharacters),
        ),
    )
    .max(MEMORY_EXTRACTION_LIMITS.maxCandidates),
});
const messageListSchema = z.array(messageSchema);
export type MemoryExtractionCandidate = Readonly<{
  subject: "user";
  content: string;
}>;

export type MemoryExtractionError =
  | { readonly kind: "consent_required"; readonly message: string }
  | { readonly kind: "validation"; readonly message: string }
  | { readonly kind: "not_found"; readonly message: string }
  | { readonly kind: "provider"; readonly message: string }
  | {
      readonly kind: "application";
      readonly error: ApplicationError;
      readonly message: string;
    };
export type MemoryExtractionResult =
  | { readonly ok: true; readonly data: readonly MemoryExtractionCandidate[] }
  | { readonly ok: false; readonly error: MemoryExtractionError };

export function selectExtractionMessages(
  messages: readonly unknown[],
): ChatMessage[] {
  const parsed = messageListSchema.parse(messages);
  const selected: ChatMessage[] = [];
  let remainingCharacters = MEMORY_EXTRACTION_LIMITS.maxCharacters;

  for (const message of [...parsed].sort((left, right) => {
    const timestampDifference =
      right.createdAt.getTime() - left.createdAt.getTime();
    return timestampDifference !== 0
      ? timestampDifference
      : right.id.localeCompare(left.id);
  })) {
    if (
      selected.length === MEMORY_EXTRACTION_LIMITS.maxMessages ||
      message.content.length > remainingCharacters
    ) {
      continue;
    }
    selected.push({ role: message.role, content: message.content });
    remainingCharacters -= message.content.length;
  }

  return selected.reverse();
}

export class MemoryExtractionService {
  public constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly settings: MemorySettingsService,
    private readonly provider: MemoryExtractionProvider,
  ) {}

  public async extract(input: unknown): Promise<MemoryExtractionResult> {
    const parsedInput = extractionInputSchema.safeParse(input);
    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: "Choose a valid conversation and provider model.",
        },
      };
    }

    const settings = await this.settings.load();
    if (!settings.ok) {
      return {
        ok: false,
        error: {
          kind: "application",
          error: settings.error,
          message: settings.error.message,
        },
      };
    }
    if (!settings.data.memoryExtractionEnabled) {
      return {
        ok: false,
        error: {
          kind: "consent_required",
          message: "Enable memory extraction before requesting candidates.",
        },
      };
    }

    try {
      const conversation = await this.conversations.getById(
        parsedInput.data.conversationId,
      );
      if (conversation === null) {
        return {
          ok: false,
          error: {
            kind: "not_found",
            message: "The selected conversation no longer exists.",
          },
        };
      }
      const messages = selectExtractionMessages(
        (await this.messages.list()).filter(
          (message) => message.conversationId === conversation.id,
        ),
      );
      if (messages.length === 0) {
        return {
          ok: false,
          error: {
            kind: "validation",
            message:
              "The selected conversation has no messages that fit the extraction limit.",
          },
        };
      }
      const output = await this.provider.extractMemories({
        model: parsedInput.data.model,
        messages,
      });
      const candidates = providerCandidatesSchema.safeParse(output);
      if (!candidates.success) {
        return {
          ok: false,
          error: {
            kind: "provider",
            message: "The provider returned invalid memory candidates.",
          },
        };
      }
      return {
        ok: true,
        data: candidates.data.candidates.map((content) => ({
          subject: "user",
          content,
        })),
      };
    } catch (error: unknown) {
      const normalized = normalizeApplicationError(error, { kind: "provider" });
      return {
        ok: false,
        error: {
          kind: "application",
          error: normalized,
          message: normalized.message,
        },
      };
    }
  }
}
