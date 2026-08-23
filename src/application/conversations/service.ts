import { z, type ZodError } from "zod";

import {
  conversationSchema,
  messageSchema,
  type Conversation,
  type Message,
} from "../../domain/models";
import type {
  ConversationRepository,
  MessageRepository,
} from "../../domain/ports";
import { normalizeApplicationError } from "../error";
import {
  appendMessageInputSchema,
  conversationIdSchema,
  createConversationInputSchema,
  type ConversationApplicationService,
  type ConversationUseCaseDependencies,
  type ConversationUseCaseResult,
  type ConversationWithMessages,
  updateConversationTitleInputSchema,
} from "./contracts";

const messageListSchema = z.array(messageSchema);

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

function notFoundFailure(id: string): ConversationUseCaseResult<never> {
  return {
    ok: false,
    error: { kind: "not_found", code: "NOT_FOUND", id },
  };
}

function applicationFailure(
  error: unknown,
  operation: "read" | "write",
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

function getTimestamp(dependencies: ConversationUseCaseDependencies): Date {
  const timestamp = dependencies.now?.() ?? new Date();
  return new Date(timestamp.getTime());
}

function parseConversation(
  value: unknown,
): ConversationUseCaseResult<Conversation> {
  const parsed = conversationSchema.safeParse(value);
  return parsed.success
    ? success(parsed.data)
    : applicationFailure(parsed.error, "read");
}

export async function createConversation(
  repository: ConversationRepository,
  input: unknown,
  dependencies: ConversationUseCaseDependencies = {},
): Promise<ConversationUseCaseResult<Conversation>> {
  const parsedInput = createConversationInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  const timestamp = getTimestamp(dependencies);
  const parsedConversation = conversationSchema.safeParse({
    ...parsedInput.data,
    id: dependencies.generateId?.() ?? defaultIdGenerator(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  if (!parsedConversation.success) {
    return validationFailure(parsedConversation.error);
  }

  try {
    await repository.save(parsedConversation.data);
    return success(parsedConversation.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function updateConversationTitle(
  repository: ConversationRepository,
  input: unknown,
  dependencies: ConversationUseCaseDependencies = {},
): Promise<ConversationUseCaseResult<Conversation>> {
  const parsedInput = updateConversationTitleInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  let currentConversation: Conversation | null;
  try {
    currentConversation = await repository.getById(parsedInput.data.id);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  if (currentConversation === null) {
    return notFoundFailure(parsedInput.data.id);
  }

  const parsedCurrentConversation = parseConversation(currentConversation);
  if (!parsedCurrentConversation.ok) {
    return parsedCurrentConversation;
  }

  const parsedConversation = conversationSchema.safeParse({
    ...parsedCurrentConversation.data,
    title: parsedInput.data.title,
    updatedAt: getTimestamp(dependencies),
  });
  if (!parsedConversation.success) {
    return validationFailure(parsedConversation.error);
  }

  try {
    await repository.save(parsedConversation.data);
    return success(parsedConversation.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function appendMessage(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  input: unknown,
  dependencies: ConversationUseCaseDependencies = {},
): Promise<ConversationUseCaseResult<Message>> {
  const parsedInput = appendMessageInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return validationFailure(parsedInput.error);
  }

  let conversation: Conversation | null;
  try {
    conversation = await conversationRepository.getById(
      parsedInput.data.conversationId,
    );
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  if (conversation === null) {
    return notFoundFailure(parsedInput.data.conversationId);
  }

  const parsedConversation = parseConversation(conversation);
  if (!parsedConversation.ok) {
    return parsedConversation;
  }

  const parsedMessage = messageSchema.safeParse({
    ...parsedInput.data,
    id: dependencies.generateId?.() ?? defaultIdGenerator(),
    createdAt: getTimestamp(dependencies),
  });
  if (!parsedMessage.success) {
    return validationFailure(parsedMessage.error);
  }

  try {
    await messageRepository.save(parsedMessage.data);
    return success(parsedMessage.data);
  } catch (error: unknown) {
    return applicationFailure(error, "write");
  }
}

export async function retrieveConversation(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  id: unknown,
): Promise<ConversationUseCaseResult<ConversationWithMessages>> {
  const parsedId = conversationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationFailure(parsedId.error);
  }

  let conversation: Conversation | null;
  try {
    conversation = await conversationRepository.getById(parsedId.data);
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  if (conversation === null) {
    return notFoundFailure(parsedId.data);
  }

  const parsedConversation = parseConversation(conversation);
  if (!parsedConversation.ok) {
    return parsedConversation;
  }

  let messages: Message[];
  try {
    messages = await messageRepository.list();
  } catch (error: unknown) {
    return applicationFailure(error, "read");
  }

  const parsedMessages = messageListSchema.safeParse(messages);
  if (!parsedMessages.success) {
    return applicationFailure(parsedMessages.error, "read");
  }

  const conversationMessages = parsedMessages.data
    .filter((message) => message.conversationId === parsedId.data)
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const byCreatedAt =
        left.message.createdAt.getTime() - right.message.createdAt.getTime();
      return byCreatedAt === 0 ? left.index - right.index : byCreatedAt;
    })
    .map(({ message }) => message);

  return success({
    conversation: parsedConversation.data,
    messages: conversationMessages,
  });
}

export function createConversationApplicationService(
  conversationRepository: ConversationRepository,
  messageRepository: MessageRepository,
  dependencies: ConversationUseCaseDependencies = {},
): ConversationApplicationService {
  return {
    create: (input) =>
      createConversation(conversationRepository, input, dependencies),
    updateTitle: (input) =>
      updateConversationTitle(conversationRepository, input, dependencies),
    appendMessage: (input) =>
      appendMessage(
        conversationRepository,
        messageRepository,
        input,
        dependencies,
      ),
    retrieve: (id) =>
      retrieveConversation(conversationRepository, messageRepository, id),
  };
}

export const getConversation = retrieveConversation;

export type {
  AppendMessageInput,
  ConversationApplicationService,
  ConversationUseCaseDependencies,
  ConversationUseCaseError,
  ConversationUseCaseResult,
  ConversationWithMessages,
  CreateConversationInput,
  UpdateConversationTitleInput,
} from "./contracts";
