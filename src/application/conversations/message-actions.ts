import { z, type ZodError } from "zod";

import type { Message } from "../../domain/models";
import type {
  ConversationMessageSequenceRepository,
  ConversationRepository,
  MessageRepository,
} from "../../domain/ports";
import { normalizeApplicationError } from "../error";
import {
  conversationIdSchema,
  type ConversationUseCaseResult,
} from "./contracts";
import { retrieveConversation } from "./service";

const messageActionInputSchema = z.object({
  conversationId: conversationIdSchema,
  messageId: z.string().uuid(),
});

const editUserMessageInputSchema = messageActionInputSchema.extend({
  content: z.string().max(100_000),
  history: z.literal("discard_following"),
});

const deleteMessageInputSchema = messageActionInputSchema.extend({
  history: z.enum(["single", "discard_following"]),
});

const replaceAssistantMessageInputSchema = messageActionInputSchema.extend({
  content: z.string().min(1).max(100_000),
  model: z.string().max(200),
  provider: z.string().max(100),
  history: z.literal("discard_following"),
});

export type EditUserMessageInput = z.input<typeof editUserMessageInputSchema>;
export type DeleteMessageInput = z.input<typeof deleteMessageInputSchema>;
export type ReplaceAssistantMessageInput = z.input<
  typeof replaceAssistantMessageInputSchema
>;

export interface ConversationMessageActionService {
  editUserMessage(input: unknown): Promise<ConversationUseCaseResult<Message>>;
  deleteMessage(input: unknown): Promise<ConversationUseCaseResult<void>>;
  replaceAssistantMessage(
    input: unknown,
  ): Promise<ConversationUseCaseResult<Message>>;
}

type MessageActionDependencies = Readonly<{
  generateId?: () => string;
  now?: () => Date;
}>;

function success<T>(data: T): ConversationUseCaseResult<T> {
  return { ok: true, data };
}

function validationFailure(
  error: ZodError<unknown>,
): ConversationUseCaseResult<never> {
  return {
    ok: false,
    error: {
      kind: "validation",
      code: "VALIDATION_ERROR",
      issues: error.issues,
    },
  };
}

function actionNotAllowedFailure(): ConversationUseCaseResult<never> {
  return {
    ok: false,
    error: {
      kind: "conflict",
      code: "MESSAGE_ACTION_NOT_ALLOWED",
      laterMessageCount: 0,
    },
  };
}

function coherentHistoryRequiredFailure(
  laterMessageCount: number,
): ConversationUseCaseResult<never> {
  return {
    ok: false,
    error: {
      kind: "conflict",
      code: "COHERENT_HISTORY_REQUIRED",
      laterMessageCount,
    },
  };
}

function applicationFailure(
  error: unknown,
  operation: "write" | "delete",
): ConversationUseCaseResult<never> {
  const normalized = normalizeApplicationError(error, {
    kind: "storage",
    operation,
  });

  return {
    ok: false,
    error: {
      kind: "application",
      code: normalized.code,
      error: normalized,
    },
  };
}

function defaultIdGenerator(): string {
  return globalThis.crypto.randomUUID();
}

function timestamp(dependencies: MessageActionDependencies): Date {
  const value = dependencies.now?.() ?? new Date();
  return new Date(value.getTime());
}

async function resolveSequence(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  input: { conversationId: string; messageId: string },
): Promise<
  ConversationUseCaseResult<
    Readonly<{ target: Message; following: readonly Message[] }>
  >
> {
  const retrieved = await retrieveConversation(
    conversationRepository,
    messageRepository,
    input.conversationId,
  );
  if (!retrieved.ok) {
    return retrieved;
  }

  const targetIndex = retrieved.data.messages.findIndex(
    (message) => message.id === input.messageId,
  );
  if (targetIndex === -1) {
    return {
      ok: false,
      error: {
        kind: "not_found",
        code: "NOT_FOUND",
        id: input.messageId,
      },
    };
  }

  const target = retrieved.data.messages[targetIndex];
  if (target === undefined) {
    return {
      ok: false,
      error: {
        kind: "not_found",
        code: "NOT_FOUND",
        id: input.messageId,
      },
    };
  }

  return success({
    target,
    following: retrieved.data.messages.slice(targetIndex + 1),
  });
}

async function replaceSequence(
  repository: ConversationMessageSequenceRepository,
  conversationId: string,
  target: Message,
  following: readonly Message[],
  replacements: readonly Message[],
  operation: "write" | "delete",
): Promise<ConversationUseCaseResult<void>> {
  try {
    await repository.replaceMessageSequence({
      conversationId,
      deletedMessageIds: [target.id, ...following.map((message) => message.id)],
      messages: replacements,
    });
    return success(undefined);
  } catch (error: unknown) {
    return applicationFailure(error, operation);
  }
}

export async function editUserMessage(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  sequenceRepository: ConversationMessageSequenceRepository,
  input: unknown,
): Promise<ConversationUseCaseResult<Message>> {
  const parsedInput = editUserMessageInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const sequence = await resolveSequence(
    conversationRepository,
    messageRepository,
    parsedInput.data,
  );
  if (!sequence.ok) {
    return sequence;
  }
  if (sequence.data.target.role !== "user") {
    return actionNotAllowedFailure();
  }

  const replacement: Message = {
    ...sequence.data.target,
    content: parsedInput.data.content,
  };
  const replaced = await replaceSequence(
    sequenceRepository,
    parsedInput.data.conversationId,
    sequence.data.target,
    sequence.data.following,
    [replacement],
    "write",
  );
  return replaced.ok ? success(replacement) : replaced;
}

export async function deleteMessage(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  sequenceRepository: ConversationMessageSequenceRepository,
  input: unknown,
): Promise<ConversationUseCaseResult<void>> {
  const parsedInput = deleteMessageInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const sequence = await resolveSequence(
    conversationRepository,
    messageRepository,
    parsedInput.data,
  );
  if (!sequence.ok) {
    return sequence;
  }
  if (
    parsedInput.data.history === "single" &&
    sequence.data.following.length > 0
  ) {
    return coherentHistoryRequiredFailure(sequence.data.following.length);
  }

  return replaceSequence(
    sequenceRepository,
    parsedInput.data.conversationId,
    sequence.data.target,
    sequence.data.following,
    [],
    "delete",
  );
}

export async function replaceAssistantMessage(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  sequenceRepository: ConversationMessageSequenceRepository,
  input: unknown,
  dependencies: MessageActionDependencies = {},
): Promise<ConversationUseCaseResult<Message>> {
  const parsedInput = replaceAssistantMessageInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const sequence = await resolveSequence(
    conversationRepository,
    messageRepository,
    parsedInput.data,
  );
  if (!sequence.ok) {
    return sequence;
  }
  if (sequence.data.target.role !== "assistant") {
    return actionNotAllowedFailure();
  }

  const replacement: Message = {
    id: dependencies.generateId?.() ?? defaultIdGenerator(),
    conversationId: parsedInput.data.conversationId,
    content: parsedInput.data.content,
    model: parsedInput.data.model,
    provider: parsedInput.data.provider,
    role: "assistant",
    createdAt: timestamp(dependencies),
  };
  const replaced = await replaceSequence(
    sequenceRepository,
    parsedInput.data.conversationId,
    sequence.data.target,
    sequence.data.following,
    [replacement],
    "write",
  );
  return replaced.ok ? success(replacement) : replaced;
}

export function createConversationMessageActionService(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  sequenceRepository: ConversationMessageSequenceRepository,
  dependencies: MessageActionDependencies = {},
): ConversationMessageActionService {
  return {
    editUserMessage: (input) =>
      editUserMessage(
        conversationRepository,
        messageRepository,
        sequenceRepository,
        input,
      ),
    deleteMessage: (input) =>
      deleteMessage(
        conversationRepository,
        messageRepository,
        sequenceRepository,
        input,
      ),
    replaceAssistantMessage: (input) =>
      replaceAssistantMessage(
        conversationRepository,
        messageRepository,
        sequenceRepository,
        input,
        dependencies,
      ),
  };
}
