import { describe, expect, it } from "vitest";

import type { Conversation, Message } from "../../domain/models";
import type {
  ConversationRepository,
  MessageRepository,
} from "../../domain/ports";
import {
  appendMessage,
  createConversation,
  createConversationApplicationService,
  retrieveConversation,
  updateConversationTitle,
} from "./service";

const conversationId = "11111111-1111-4111-8111-111111111111";
const secondConversationId = "22222222-2222-4222-8222-222222222222";
const firstMessageId = "33333333-3333-4333-8333-333333333333";
const secondMessageId = "44444444-4444-4444-8444-444444444444";
const timestamp = new Date("2026-01-01T12:00:00.000Z");
const earlierTimestamp = new Date("2026-01-01T11:59:00.000Z");
const laterTimestamp = new Date("2026-01-01T12:01:00.000Z");

const conversation: Conversation = {
  id: conversationId,
  characterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  personaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "A first conversation",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const firstMessage: Message = {
  id: firstMessageId,
  conversationId,
  role: "user",
  content: "Hello",
  createdAt: earlierTimestamp,
};

const secondMessage: Message = {
  id: secondMessageId,
  conversationId,
  role: "assistant",
  content: "Hi there",
  model: "test-model",
  provider: "test-provider",
  createdAt: laterTimestamp,
};

class MemoryConversationRepository implements ConversationRepository {
  private readonly conversations = new Map<string, Conversation>();

  public getByIdCalls = 0;
  public saveCalls = 0;
  public getByIdFailure: unknown = null;
  public saveFailure: unknown = null;

  public constructor(initialConversations: Conversation[] = []) {
    for (const initialConversation of initialConversations) {
      this.conversations.set(initialConversation.id, initialConversation);
    }
  }

  public async list(): Promise<Conversation[]> {
    return [...this.conversations.values()];
  }

  public async getById(id: string): Promise<Conversation | null> {
    this.getByIdCalls += 1;
    if (this.getByIdFailure !== null) {
      throw this.getByIdFailure;
    }
    return this.conversations.get(id) ?? null;
  }

  public async save(entity: Conversation): Promise<void> {
    this.saveCalls += 1;
    if (this.saveFailure !== null) {
      throw this.saveFailure;
    }
    this.conversations.set(entity.id, entity);
  }

  public async delete(id: string): Promise<void> {
    this.conversations.delete(id);
  }
}

class MemoryMessageRepository implements MessageRepository {
  private readonly messages: Message[];

  public listCalls = 0;
  public saveCalls = 0;
  public listFailure: unknown = null;
  public saveFailure: unknown = null;

  public constructor(initialMessages: Message[] = []) {
    this.messages = [...initialMessages];
  }

  public async list(): Promise<Message[]> {
    this.listCalls += 1;
    if (this.listFailure !== null) {
      throw this.listFailure;
    }
    return [...this.messages];
  }

  public async getById(id: string): Promise<Message | null> {
    return this.messages.find((message) => message.id === id) ?? null;
  }

  public async save(entity: Message): Promise<void> {
    this.saveCalls += 1;
    if (this.saveFailure !== null) {
      throw this.saveFailure;
    }
    this.messages.push(entity);
  }

  public async delete(id: string): Promise<void> {
    const index = this.messages.findIndex((message) => message.id === id);
    if (index !== -1) {
      this.messages.splice(index, 1);
    }
  }
}

describe("conversation application service", () => {
  it("creates and updates a conversation through the repository port", async () => {
    const repository = new MemoryConversationRepository();
    const service = createConversationApplicationService(
      repository,
      new MemoryMessageRepository(),
      { generateId: () => secondConversationId, now: () => timestamp },
    );

    await expect(
      service.create({
        characterId: conversation.characterId,
        personaId: conversation.personaId,
        title: "  A first conversation  ",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: secondConversationId,
        characterId: conversation.characterId,
        personaId: conversation.personaId,
        title: "A first conversation",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await expect(
      service.updateTitle({
        id: secondConversationId,
        title: "  Renamed conversation  ",
      }),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: secondConversationId,
        characterId: conversation.characterId,
        personaId: conversation.personaId,
        title: "Renamed conversation",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    expect(repository.saveCalls).toBe(2);
  });

  it("appends a message only to an existing conversation", async () => {
    const conversationRepository = new MemoryConversationRepository([
      conversation,
    ]);
    const messageRepository = new MemoryMessageRepository();

    await expect(
      appendMessage(
        conversationRepository,
        messageRepository,
        { conversationId, role: "user", content: "  Keep this content  " },
        { generateId: () => firstMessageId, now: () => timestamp },
      ),
    ).resolves.toEqual({
      ok: true,
      data: {
        id: firstMessageId,
        conversationId,
        role: "user",
        content: "  Keep this content  ",
        createdAt: timestamp,
      },
    });
    expect(messageRepository.saveCalls).toBe(1);

    await expect(
      appendMessage(conversationRepository, messageRepository, {
        conversationId: secondConversationId,
        role: "user",
        content: "No",
      }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: "not_found", code: "NOT_FOUND", id: secondConversationId },
    });
    expect(messageRepository.saveCalls).toBe(1);
  });

  it("retrieves only the conversation messages in chronological order", async () => {
    const conversationRepository = new MemoryConversationRepository([
      conversation,
    ]);
    const messageRepository = new MemoryMessageRepository([
      secondMessage,
      {
        ...firstMessage,
        conversationId: secondConversationId,
      },
      firstMessage,
    ]);

    await expect(
      retrieveConversation(
        conversationRepository,
        messageRepository,
        conversationId,
      ),
    ).resolves.toEqual({
      ok: true,
      data: { conversation, messages: [firstMessage, secondMessage] },
    });
    expect(messageRepository.listCalls).toBe(1);
  });

  it("returns validation and not-found failures without touching storage", async () => {
    const conversationRepository = new MemoryConversationRepository();
    const messageRepository = new MemoryMessageRepository();

    await expect(
      createConversation(conversationRepository, {
        characterId: "not-a-uuid",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    await expect(
      updateConversationTitle(conversationRepository, {
        id: conversationId,
        title: "",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    await expect(
      retrieveConversation(conversationRepository, messageRepository, "bad-id"),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    await expect(
      updateConversationTitle(conversationRepository, {
        id: conversationId,
        title: "Missing",
      }),
    ).resolves.toEqual({
      ok: false,
      error: { kind: "not_found", code: "NOT_FOUND", id: conversationId },
    });
    expect(conversationRepository.getByIdCalls).toBe(1);
    expect(conversationRepository.saveCalls).toBe(0);
    expect(messageRepository.saveCalls).toBe(0);
  });

  it("normalizes repository failures without exposing their details", async () => {
    const conversationRepository = new MemoryConversationRepository([
      conversation,
    ]);
    const messageRepository = new MemoryMessageRepository();
    const secret = "Bearer conversation-secret";

    conversationRepository.saveFailure = new Error(secret);
    await expect(
      updateConversationTitle(
        conversationRepository,
        { id: conversationId, title: "Updated" },
        { now: () => laterTimestamp },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: {
          code: "STORAGE_ERROR",
          message: "Local data could not be saved.",
        },
      },
    });

    conversationRepository.saveFailure = null;
    messageRepository.saveFailure = new Error(secret);
    await expect(
      appendMessage(
        conversationRepository,
        messageRepository,
        { conversationId, role: "user", content: "Hello" },
        { generateId: () => firstMessageId, now: () => timestamp },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: {
          code: "STORAGE_ERROR",
          message: "Local data could not be saved.",
        },
      },
    });

    messageRepository.saveFailure = null;
    messageRepository.listFailure = new Error(secret);
    await expect(
      retrieveConversation(
        conversationRepository,
        messageRepository,
        conversationId,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        kind: "application",
        code: "STORAGE_ERROR",
        error: {
          code: "STORAGE_ERROR",
          message: "Local data could not be read.",
        },
      },
    });

    expect(
      JSON.stringify(
        await retrieveConversation(
          conversationRepository,
          messageRepository,
          conversationId,
        ),
      ),
    ).not.toContain(secret);
  });
});
