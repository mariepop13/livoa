import { describe, expect, it } from "vitest";

import type { Conversation, Message } from "../../domain/models";
import type {
  ConversationMessageSequenceRepository,
  ConversationRepository,
  MessageRepository,
} from "../../domain/ports";
import {
  deleteMessage,
  editUserMessage,
  replaceAssistantMessage,
} from "./message-actions";

const conversationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const assistantId = "33333333-3333-4333-8333-333333333333";
const laterUserId = "44444444-4444-4444-8444-444444444444";
const replacementId = "55555555-5555-4555-8555-555555555555";
const timestamp = new Date("2026-01-01T12:00:00.000Z");

const conversation: Conversation = {
  id: conversationId,
  characterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const messages: Message[] = [
  {
    id: userId,
    conversationId,
    role: "user",
    content: "Original question",
    createdAt: new Date("2026-01-01T12:00:01.000Z"),
  },
  {
    id: assistantId,
    conversationId,
    role: "assistant",
    content: "Original answer",
    model: "old-model",
    provider: "old-provider",
    createdAt: new Date("2026-01-01T12:00:02.000Z"),
  },
  {
    id: laterUserId,
    conversationId,
    role: "user",
    content: "Later question",
    createdAt: new Date("2026-01-01T12:00:03.000Z"),
  },
];

class MemoryConversationRepository implements ConversationRepository {
  public async list(): Promise<Conversation[]> {
    return [conversation];
  }

  public async getById(id: string): Promise<Conversation | null> {
    return id === conversationId ? conversation : null;
  }

  public async save(): Promise<void> {}
  public async delete(): Promise<void> {}
}

class MemoryMessageRepository implements MessageRepository {
  public constructor(public readonly messages: Message[]) {}

  public async list(): Promise<Message[]> {
    return [...this.messages];
  }

  public async getById(id: string): Promise<Message | null> {
    return this.messages.find((message) => message.id === id) ?? null;
  }

  public async save(message: Message): Promise<void> {
    this.messages.push(message);
  }

  public async delete(id: string): Promise<void> {
    const index = this.messages.findIndex((message) => message.id === id);
    if (index !== -1) {
      this.messages.splice(index, 1);
    }
  }
}

class MemorySequenceRepository implements ConversationMessageSequenceRepository {
  public constructor(private readonly messages: MemoryMessageRepository) {}

  public async replaceMessageSequence(input: {
    deletedMessageIds: readonly string[];
    messages: readonly Message[];
  }): Promise<void> {
    for (const id of input.deletedMessageIds) {
      await this.messages.delete(id);
    }
    for (const message of input.messages) {
      await this.messages.save(message);
    }
  }
}

function createRepositories(initialMessages: Message[] = messages) {
  const messageRepository = new MemoryMessageRepository([...initialMessages]);
  return {
    conversations: new MemoryConversationRepository(),
    messages: messageRepository,
    sequence: new MemorySequenceRepository(messageRepository),
  };
}

describe("conversation message actions", () => {
  it("edits a user message only by replacing its coherent sequence", async () => {
    const repositories = createRepositories();

    await expect(
      editUserMessage(
        repositories.conversations,
        repositories.messages,
        repositories.sequence,
        {
          conversationId,
          messageId: userId,
          content: "Edited question",
          history: "discard_following",
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { content: "Edited question" },
    });

    await expect(repositories.messages.list()).resolves.toEqual([
      { ...messages[0], content: "Edited question" },
    ]);
  });

  it("rejects unsafe single-message deletion and truncates only when selected", async () => {
    const repositories = createRepositories();

    await expect(
      deleteMessage(
        repositories.conversations,
        repositories.messages,
        repositories.sequence,
        { conversationId, messageId: assistantId, history: "single" },
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: "conflict",
        code: "COHERENT_HISTORY_REQUIRED",
        laterMessageCount: 1,
      },
    });
    await expect(repositories.messages.list()).resolves.toEqual(messages);

    await expect(
      deleteMessage(
        repositories.conversations,
        repositories.messages,
        repositories.sequence,
        {
          conversationId,
          messageId: assistantId,
          history: "discard_following",
        },
      ),
    ).resolves.toEqual({ ok: true, data: undefined });
    await expect(repositories.messages.list()).resolves.toEqual([messages[0]]);
  });

  it("replaces an assistant response only after an explicit sequence replacement", async () => {
    const repositories = createRepositories();

    await expect(
      replaceAssistantMessage(
        repositories.conversations,
        repositories.messages,
        repositories.sequence,
        {
          conversationId,
          messageId: assistantId,
          content: "Regenerated answer",
          model: "new-model",
          provider: "new-provider",
          history: "discard_following",
        },
        { generateId: () => replacementId, now: () => timestamp },
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { id: replacementId, content: "Regenerated answer" },
    });
    await expect(repositories.messages.list()).resolves.toEqual([
      messages[0],
      {
        id: replacementId,
        conversationId,
        role: "assistant",
        content: "Regenerated answer",
        model: "new-model",
        provider: "new-provider",
        createdAt: timestamp,
      },
    ]);
  });
});
