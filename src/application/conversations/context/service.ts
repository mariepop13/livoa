import type { Message } from "../../../domain/models";
import {
  contextAssemblyInputSchema,
  type ContextAssemblyResult,
  type ContextValidationIssue,
  type ConversationContext,
  type ConversationContextAssembler,
} from "./contracts";

function success<T>(data: T): ContextAssemblyResult<T> {
  return { ok: true, data };
}

function validationFailure(
  issues: readonly ContextValidationIssue[],
): ContextAssemblyResult<never> {
  return {
    ok: false,
    error: {
      kind: "validation",
      code: "VALIDATION_ERROR",
      issues,
    },
  };
}

function compareIds(left: string, right: string): number {
  const comparedLength = Math.min(left.length, right.length);
  for (let index = 0; index < comparedLength; index += 1) {
    const byCodeUnit = left.charCodeAt(index) - right.charCodeAt(index);
    if (byCodeUnit !== 0) {
      return byCodeUnit;
    }
  }

  return left.length - right.length;
}

function orderMessages(messages: readonly Message[]): Message[] {
  return [...messages].sort((left, right) => {
    const byCreatedAt = left.createdAt.getTime() - right.createdAt.getTime();
    return byCreatedAt === 0 ? compareIds(left.id, right.id) : byCreatedAt;
  });
}

function selectMessages(
  messages: readonly Message[],
  maxMessages: number,
  maxCharacters: number,
): Readonly<{
  messages: readonly Message[];
  charactersUsed: number;
  truncatedMessageIds: readonly Message["id"][];
}> {
  let remainingCharacters = maxCharacters;
  const selected: Message[] = [];
  const truncatedMessageIds: Message["id"][] = [];

  for (const message of [...orderMessages(messages)].reverse()) {
    if (selected.length >= maxMessages || remainingCharacters === 0) {
      break;
    }

    const content = message.content.slice(0, remainingCharacters);
    const isTruncated = content.length < message.content.length;
    selected.push(isTruncated ? { ...message, content } : message);
    remainingCharacters -= content.length;

    if (isTruncated) {
      truncatedMessageIds.push(message.id);
      break;
    }
  }

  const orderedMessages = [...selected].reverse();
  const charactersUsed = orderedMessages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  return {
    messages: orderedMessages,
    charactersUsed,
    truncatedMessageIds: [...truncatedMessageIds].reverse(),
  };
}

export function assembleConversationContext(
  input: unknown,
): ContextAssemblyResult<ConversationContext> {
  const parsedInput = contextAssemblyInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error.issues);
  }

  const { conversation, messages, limits } = parsedInput.data;
  const selected = selectMessages(
    messages,
    limits.maxMessages,
    limits.maxCharacters,
  );

  return success({
    conversationId: conversation.id,
    messages: selected.messages,
    charactersUsed: selected.charactersUsed,
    omittedMessageCount: messages.length - selected.messages.length,
    truncatedMessageIds: selected.truncatedMessageIds,
  });
}

export function createConversationContextAssembler(): ConversationContextAssembler {
  return { assemble: assembleConversationContext };
}
