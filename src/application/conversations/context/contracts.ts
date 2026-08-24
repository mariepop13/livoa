import { z, type ZodError } from "zod";

import {
  conversationSchema,
  messageSchema,
  type Conversation,
  type Message,
} from "../../../domain/models";

export const contextAssemblyLimitsSchema = z.object({
  maxMessages: z.number().finite().int().nonnegative(),
  maxCharacters: z.number().finite().int().nonnegative(),
});

export const contextAssemblyInputSchema = z
  .object({
    conversation: conversationSchema,
    messages: z.array(messageSchema),
    limits: contextAssemblyLimitsSchema,
  })
  .superRefine((input, context) => {
    const messageIds = new Set<string>();

    input.messages.forEach((message, index) => {
      if (message.conversationId !== input.conversation.id) {
        context.addIssue({
          code: "custom",
          path: ["messages", index, "conversationId"],
          message: "Message does not belong to the supplied conversation.",
        });
      }

      if (messageIds.has(message.id)) {
        context.addIssue({
          code: "custom",
          path: ["messages", index, "id"],
          message: "Message IDs must be unique within the supplied context.",
        });
      }
      messageIds.add(message.id);
    });
  });

export type ContextAssemblyLimits = z.infer<typeof contextAssemblyLimitsSchema>;
export type ContextAssemblyInput = z.input<typeof contextAssemblyInputSchema>;
export type ContextValidationIssue = ZodError<unknown>["issues"][number];

export type ConversationContext = Readonly<{
  conversationId: Conversation["id"];
  messages: readonly Message[];
  charactersUsed: number;
  omittedMessageCount: number;
  truncatedMessageIds: readonly Message["id"][];
}>;

export type ContextAssemblyError = {
  readonly kind: "validation";
  readonly code: "VALIDATION_ERROR";
  readonly issues: readonly ContextValidationIssue[];
};

export type ContextAssemblyResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ContextAssemblyError };

export interface ConversationContextAssembler {
  assemble(input: unknown): ContextAssemblyResult<ConversationContext>;
}
