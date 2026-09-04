import { z, type ZodError } from "zod";

import {
  conversationSchema,
  messageSchema,
  type Conversation,
  type Message,
} from "../../domain/models";
import type { ApplicationError, ApplicationErrorCode } from "../error";

const optionalTrimmedTitleSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().max(200).optional(),
);

export const createConversationInputSchema = conversationSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ title: optionalTrimmedTitleSchema });

export const updateConversationTitleInputSchema = z.object({
  id: conversationSchema.shape.id,
  title: z.string().trim().min(1).max(200),
});

export const appendMessageInputSchema = messageSchema.omit({
  id: true,
  createdAt: true,
});

export const conversationIdSchema = conversationSchema.shape.id;

export type CreateConversationInput = z.input<
  typeof createConversationInputSchema
>;
export type UpdateConversationTitleInput = z.input<
  typeof updateConversationTitleInputSchema
>;
export type AppendMessageInput = z.input<typeof appendMessageInputSchema>;
export type ConversationValidationIssue = ZodError<unknown>["issues"][number];

export type ConversationWithMessages = Readonly<{
  conversation: Conversation;
  messages: readonly Message[];
}>;

export type ConversationUseCaseError =
  | {
      readonly kind: "validation";
      readonly code: "VALIDATION_ERROR";
      readonly issues: readonly ConversationValidationIssue[];
    }
  | {
      readonly kind: "not_found";
      readonly code: "NOT_FOUND";
      readonly id: string;
    }
  | {
      readonly kind: "conflict";
      readonly code: "COHERENT_HISTORY_REQUIRED" | "MESSAGE_ACTION_NOT_ALLOWED";
      readonly laterMessageCount: number;
    }
  | {
      readonly kind: "application";
      readonly code: ApplicationErrorCode;
      readonly error: ApplicationError;
    };

export type ConversationUseCaseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ConversationUseCaseError };

export type ConversationUseCaseDependencies = Readonly<{
  generateId?: () => string;
  now?: () => Date;
}>;

export interface ConversationApplicationService {
  create(input: unknown): Promise<ConversationUseCaseResult<Conversation>>;
  updateTitle(input: unknown): Promise<ConversationUseCaseResult<Conversation>>;
  appendMessage(input: unknown): Promise<ConversationUseCaseResult<Message>>;
  retrieve(
    id: unknown,
  ): Promise<ConversationUseCaseResult<ConversationWithMessages>>;
  delete(id: unknown): Promise<ConversationUseCaseResult<void>>;
}
