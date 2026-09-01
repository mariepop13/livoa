import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";

import type {
  AppSettings,
  Character,
  Conversation,
  Memory,
  Message,
  Persona,
} from "../../../domain/models";
import {
  IndexedDbAppSettingsRepository,
  IndexedDbCharacterCardRepository,
  IndexedDbCharacterMemoryDeletionRepository,
  IndexedDbCharacterRepository,
  IndexedDbConversationMessageDeletionRepository,
  IndexedDbConversationRepository,
  IndexedDbMemoryCharacterWriteRepository,
  IndexedDbMemoryRepository,
  IndexedDbMessageRepository,
  IndexedDbPersonaRepository,
  createIndexedDbRepositories,
} from "./repositories";
import { IndexedDbRepository } from "./indexeddb-repository";
import type {
  StoredAppSettings,
  StoredCharacter,
  StoredCharacterCard,
  StoredConversation,
  StoredMemory,
  StoredMessage,
  StoredPersona,
} from "./record-schemas";
import { SETTINGS_RECORD_ID } from "./record-schemas";
import type { IndexedDbTable } from "./indexeddb-repository";

class MemoryTable<
  Record extends { id: string },
> implements IndexedDbTable<Record> {
  private readonly records = new Map<string, unknown>();

  public async toArray(): Promise<Record[]> {
    return [...this.records.values()].map((record) => record as Record);
  }

  public async get(id: string): Promise<Record | undefined> {
    const record = this.records.get(id);
    return record === undefined ? undefined : (record as Record);
  }

  public async put(record: Record): Promise<unknown> {
    this.records.set(record.id, record);
    return record.id;
  }

  public async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  public seedRaw(id: string, record: unknown): void {
    this.records.set(id, record);
  }
}

const character: Character = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Astra",
  description: "A patient guide.",
  personality: "Thoughtful and curious.",
  systemPrompt: "Be helpful.",
  greeting: "Hello.",
  avatar: "https://example.com/astra.png",
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
  updatedAt: new Date("2026-01-02T12:00:00.000Z"),
};

const persona: Persona = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Marie",
  description: "A curious user.",
  createdAt: new Date("2026-02-01T12:00:00.000Z"),
  updatedAt: new Date("2026-02-02T12:00:00.000Z"),
};

const conversation: Conversation = {
  id: "33333333-3333-4333-8333-333333333333",
  characterId: character.id,
  personaId: persona.id,
  title: "A first conversation",
  createdAt: new Date("2026-03-01T12:00:00.000Z"),
  updatedAt: new Date("2026-03-02T12:00:00.000Z"),
};

const message: Message = {
  id: "44444444-4444-4444-8444-444444444444",
  conversationId: conversation.id,
  role: "assistant",
  content: "Welcome.",
  model: "test-model",
  provider: "test-provider",
  createdAt: new Date("2026-04-01T12:00:00.000Z"),
};

const memory: Memory = {
  id: "55555555-5555-4555-8555-555555555555",
  characterId: character.id,
  subject: "user",
  content: "Prefers concise answers.",
  createdAt: new Date("2026-05-01T12:00:00.000Z"),
  updatedAt: new Date("2026-05-02T12:00:00.000Z"),
};

const settings: AppSettings = {
  theme: "dark",
  memoryExtractionEnabled: false,
  memoryContextEnabled: false,
  providers: [
    {
      id: "provider-1",
      providerId: "openai-compatible",
      baseUrl: "https://example.com/v1",
      selectedModelId: "test-model",
      enabled: true,
    },
  ],
};

describe("IndexedDB repository adapters", () => {
  it("deletes a character and its memories in one transaction", async () => {
    const characterIds = new Set([character.id]);
    const memoryCharacterIds = new Set([memory.characterId]);
    let transactions = 0;
    const characterTable = {
      delete: async (id: string) => {
        characterIds.delete(id);
      },
    };
    const memoryTable = {
      where: () => ({
        equals: (id: string) => ({
          delete: async () => {
            memoryCharacterIds.delete(id);
          },
        }),
      }),
    };
    const transaction = {
      execute: async (work: () => Promise<void>) => {
        transactions += 1;
        await work();
      },
    };
    const repository = new IndexedDbCharacterMemoryDeletionRepository(
      transaction,
      characterTable,
      memoryTable,
    );

    await repository.deleteCharacterAndMemories(character.id);

    expect(transactions).toBe(1);
    expect(characterIds).not.toContain(character.id);
    expect(memoryCharacterIds).not.toContain(character.id);
  });

  it("keeps both records when the cascade transaction fails", async () => {
    const characterIds = new Set([character.id]);
    const memoryCharacterIds = new Set([memory.characterId]);
    const characterTable = {
      delete: async () => {
        throw new Error("character write failed");
      },
    };
    const memoryTable = {
      where: () => ({
        equals: (id: string) => ({
          delete: async () => {
            memoryCharacterIds.delete(id);
          },
        }),
      }),
    };
    const transaction = {
      execute: async (work: () => Promise<void>) => {
        const memorySnapshot = new Set(memoryCharacterIds);
        try {
          await work();
        } catch (error: unknown) {
          memoryCharacterIds.clear();
          for (const id of memorySnapshot) {
            memoryCharacterIds.add(id);
          }
          throw error;
        }
      },
    };
    const repository = new IndexedDbCharacterMemoryDeletionRepository(
      transaction,
      characterTable,
      memoryTable,
    );

    await expect(
      repository.deleteCharacterAndMemories(character.id),
    ).rejects.toThrow("character write failed");
    expect(characterIds).toContain(character.id);
    expect(memoryCharacterIds).toContain(character.id);
  });

  it("deletes a conversation and its messages in one transaction", async () => {
    const conversationIds = new Set([conversation.id]);
    const messageConversationIds = new Set([message.conversationId]);
    let transactions = 0;
    const transaction = {
      execute: async (work: () => Promise<void>) => {
        transactions += 1;
        await work();
      },
    };
    const repository = new IndexedDbConversationMessageDeletionRepository(
      transaction,
      {
        delete: async (id: string) => {
          conversationIds.delete(id);
        },
      },
      {
        where: () => ({
          equals: (id: string) => ({
            delete: async () => {
              messageConversationIds.delete(id);
            },
          }),
        }),
      },
    );

    await repository.deleteConversationAndMessages(conversation.id);

    expect(transactions).toBe(1);
    expect(conversationIds).not.toContain(conversation.id);
    expect(messageConversationIds).not.toContain(conversation.id);
  });

  it("rolls back conversation and messages when atomic deletion fails", async () => {
    const conversationIds = new Set([conversation.id]);
    const messageConversationIds = new Set([message.conversationId]);
    const transaction = {
      execute: async (work: () => Promise<void>) => {
        const conversationSnapshot = new Set(conversationIds);
        const messageSnapshot = new Set(messageConversationIds);
        try {
          await work();
        } catch (error: unknown) {
          conversationIds.clear();
          messageConversationIds.clear();
          for (const id of conversationSnapshot) {
            conversationIds.add(id);
          }
          for (const id of messageSnapshot) {
            messageConversationIds.add(id);
          }
          throw error;
        }
      },
    };
    const repository = new IndexedDbConversationMessageDeletionRepository(
      transaction,
      {
        delete: async () => {
          throw new Error("conversation write failed");
        },
      },
      {
        where: () => ({
          equals: (id: string) => ({
            delete: async () => {
              messageConversationIds.delete(id);
            },
          }),
        }),
      },
    );

    await expect(
      repository.deleteConversationAndMessages(conversation.id),
    ).rejects.toThrow("conversation write failed");
    expect(conversationIds).toContain(conversation.id);
    expect(messageConversationIds).toContain(conversation.id);
  });

  it("checks a character and writes its memory in one transaction", async () => {
    const characterTable = new MemoryTable<StoredCharacter>();
    const memoryTable = new MemoryTable<StoredMemory>();
    await new IndexedDbCharacterRepository({ characters: characterTable }).save(
      character,
    );
    let transactions = 0;
    let isInTransaction = false;
    const transaction = {
      async execute<T>(work: () => Promise<T>): Promise<T> {
        transactions += 1;
        isInTransaction = true;
        try {
          return await work();
        } finally {
          isInTransaction = false;
        }
      },
    };
    const repository = new IndexedDbMemoryCharacterWriteRepository(
      transaction,
      {
        get: async (id: string) => {
          expect(isInTransaction).toBe(true);
          return characterTable.get(id);
        },
      },
      {
        put: async (record: StoredMemory) => {
          expect(isInTransaction).toBe(true);
          return memoryTable.put(record);
        },
      },
    );

    await expect(repository.saveForExistingCharacter(memory)).resolves.toEqual({
      kind: "saved",
    });

    expect(transactions).toBe(1);
    await expect(memoryTable.get(memory.id)).resolves.toMatchObject({
      id: memory.id,
      characterId: character.id,
    });

    const orphanMemory: Memory = {
      ...memory,
      id: "66666666-6666-4666-8666-666666666666",
      characterId: "77777777-7777-4777-8777-777777777777",
    };
    await expect(
      repository.saveForExistingCharacter(orphanMemory),
    ).resolves.toEqual({ kind: "character_not_found" });
    await expect(memoryTable.get(orphanMemory.id)).resolves.toBeUndefined();
    expect(transactions).toBe(2);
  });
  it("round-trips Character dates as persisted strings", async () => {
    const table = new MemoryTable<StoredCharacter>();
    const repository = new IndexedDbCharacterRepository({ characters: table });

    await repository.save(character);

    await expect(table.get(character.id)).resolves.toMatchObject({
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    });
    await expect(repository.getById(character.id)).resolves.toEqual(character);
  });

  it("persists imported card payloads and avatar bytes across repository reloads", async () => {
    const table = new MemoryTable<StoredCharacterCard>();
    const repository = new IndexedDbCharacterCardRepository({
      characterCards: table,
    });
    const card = {
      characterId: character.id,
      format: "v2" as const,
      rawPayload: '{"spec":"chara_card_v2","extensions":{"vendor/data":true}}',
      avatar: {
        mediaType: "image/png" as const,
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
    };

    await repository.save(card);
    card.avatar.bytes[0] = 0;

    await expect(repository.getByCharacterId(character.id)).resolves.toEqual({
      ...card,
      avatar: {
        mediaType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
    });
  });
  it("round-trips Persona, Conversation, and Message dates as persisted strings", async () => {
    const personaTable = new MemoryTable<StoredPersona>();
    const conversationTable = new MemoryTable<StoredConversation>();
    const messageTable = new MemoryTable<StoredMessage>();
    const personaRepository = new IndexedDbPersonaRepository({
      personas: personaTable,
    });
    const conversationRepository = new IndexedDbConversationRepository({
      conversations: conversationTable,
    });
    const messageRepository = new IndexedDbMessageRepository({
      messages: messageTable,
    });

    await personaRepository.save(persona);
    await conversationRepository.save(conversation);
    await messageRepository.save(message);

    await expect(personaTable.get(persona.id)).resolves.toMatchObject({
      createdAt: persona.createdAt.toISOString(),
      updatedAt: persona.updatedAt.toISOString(),
    });
    await expect(conversationTable.get(conversation.id)).resolves.toMatchObject(
      {
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
    );
    await expect(messageTable.get(message.id)).resolves.toMatchObject({
      createdAt: message.createdAt.toISOString(),
    });
    await expect(personaRepository.getById(persona.id)).resolves.toEqual(
      persona,
    );
    await expect(
      conversationRepository.getById(conversation.id),
    ).resolves.toEqual(conversation);
    await expect(messageRepository.getById(message.id)).resolves.toEqual(
      message,
    );
  });

  it("saves, lists, gets, and deletes complete memory records", async () => {
    const table = new MemoryTable<StoredMemory>();
    const repository = new IndexedDbMemoryRepository({ memories: table });

    await repository.save(memory);

    await expect(table.get(memory.id)).resolves.toMatchObject({
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    });
    await expect(repository.list()).resolves.toEqual([memory]);
    await expect(repository.getById(memory.id)).resolves.toEqual(memory);

    await repository.delete(memory.id);

    await expect(repository.getById(memory.id)).resolves.toBeNull();
  });

  it("rejects invalid persisted memory records at the read boundary", async () => {
    const table = new MemoryTable<StoredMemory>();
    const repository = new IndexedDbMemoryRepository({ memories: table });
    table.seedRaw(memory.id, {
      ...memory,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: "not-a-date",
    });

    await expect(repository.getById(memory.id)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("round-trips AppSettings through the singleton settings record", async () => {
    const table = new MemoryTable<StoredAppSettings>();
    const repository = new IndexedDbAppSettingsRepository({ settings: table });

    await expect(repository.get()).resolves.toBeNull();
    await repository.save(settings);

    await expect(table.get(SETTINGS_RECORD_ID)).resolves.toEqual({
      id: SETTINGS_RECORD_ID,
      ...settings,
    });
    await expect(repository.get()).resolves.toEqual(settings);
  });

  it("rejects invalid persisted dates at the read boundary", async () => {
    const table = new MemoryTable<StoredCharacter>();
    const repository = new IndexedDbCharacterRepository({ characters: table });
    table.seedRaw(character.id, {
      ...character,
      createdAt: "not-a-date",
      updatedAt: character.updatedAt.toISOString(),
    });

    await expect(repository.getById(character.id)).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("rejects invalid persisted settings at the read boundary", async () => {
    const table = new MemoryTable<StoredAppSettings>();
    const repository = new IndexedDbAppSettingsRepository({ settings: table });
    table.seedRaw(SETTINGS_RECORD_ID, {
      id: SETTINGS_RECORD_ID,
      theme: "invalid-theme",
      providers: [],
    });

    await expect(repository.get()).rejects.toBeInstanceOf(ZodError);
  });

  it("rejects invalid entities before writing them", async () => {
    const table = new MemoryTable<StoredMessage>();
    const repository = new IndexedDbMessageRepository({ messages: table });
    const invalidMessage = {
      ...message,
      role: "invalid",
    } as unknown as Message;

    await expect(repository.save(invalidMessage)).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(table.get(message.id)).resolves.toBeUndefined();
  });

  it("rejects invalid serialized records before writing them", async () => {
    type TestEntity = { id: string; name: string };
    type TestRecord = { id: string; value: unknown };
    const table = new MemoryTable<TestRecord>();
    const repository = new IndexedDbRepository<TestEntity, TestRecord>(
      table,
      z.object({ id: z.string(), name: z.string() }),
      z.object({ id: z.string(), value: z.number() }),
      () => ({ id: "test", value: "not-a-number" }),
      () => ({ id: "test", name: "test" }),
    );

    await expect(
      repository.save({ id: "test", name: "test" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(table.get("test")).resolves.toBeUndefined();
  });

  it("rejects unsafe URL schemes at the persistence boundary", async () => {
    const characterTable = new MemoryTable<StoredCharacter>();
    const settingsTable = new MemoryTable<StoredAppSettings>();
    const characterRepository = new IndexedDbCharacterRepository({
      characters: characterTable,
    });
    const settingsRepository = new IndexedDbAppSettingsRepository({
      settings: settingsTable,
    });

    const unsafeCharacter: Character = {
      ...character,
      avatar: "javascript:alert(1)",
    };
    const unsafeSettings: AppSettings = {
      ...settings,
      providers: [
        { ...settings.providers[0], baseUrl: "file:///tmp/provider" },
      ],
    };
    const credentialSettings: AppSettings = {
      ...settings,
      providers: [
        {
          ...settings.providers[0],
          baseUrl: "https://user:secret@example.com/v1",
        },
      ],
    };

    await expect(
      characterRepository.save(unsafeCharacter),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      settingsRepository.save(unsafeSettings),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      settingsRepository.save(credentialSettings),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(characterTable.get(character.id)).resolves.toBeUndefined();
    await expect(
      settingsTable.get(SETTINGS_RECORD_ID),
    ).resolves.toBeUndefined();
  });

  it("deletes records through the repository contract", async () => {
    const table = new MemoryTable<StoredCharacter>();
    const repository = new IndexedDbCharacterRepository({ characters: table });

    await repository.save(character);
    await repository.delete(character.id);

    await expect(repository.getById(character.id)).resolves.toBeNull();
  });

  it("exposes a memory repository from the repository factory", () => {
    const repositories = createIndexedDbRepositories();

    expect(repositories.memories).toBeInstanceOf(IndexedDbMemoryRepository);
  });
});
