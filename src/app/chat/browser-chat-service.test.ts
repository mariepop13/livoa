import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AppSettings,
  Character,
  Conversation,
  Memory,
  Message,
  Persona,
} from "@/domain/models";
import type { Repository, SettingsRepository } from "@/domain/ports";
import { credentialStorageKey } from "@/infrastructure/credentials/web-storage-credential-store";
import type { IndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";

import { BrowserChatService } from "./browser-chat-service";

class MemoryRepository<T extends { id: string }> implements Repository<T> {
  readonly #entities: Map<string, T>;

  public constructor(entities: readonly T[] = []) {
    this.#entities = new Map(entities.map((entity) => [entity.id, entity]));
  }

  public async list(): Promise<T[]> {
    return [...this.#entities.values()];
  }

  public async getById(id: string): Promise<T | null> {
    return this.#entities.get(id) ?? null;
  }

  public async save(entity: T): Promise<void> {
    this.#entities.set(entity.id, entity);
  }

  public async delete(id: string): Promise<void> {
    this.#entities.delete(id);
  }
}

class MemorySettingsRepository implements SettingsRepository {
  public constructor(private settings: AppSettings) {}

  public async get(): Promise<AppSettings> {
    return this.settings;
  }

  public async save(settings: AppSettings): Promise<void> {
    this.settings = settings;
  }
}

const timestamp = new Date("2026-08-24T00:00:00.000Z");
const character: Character = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Mira",
  description: "A concise guide.",
  personality: "Helpful",
  systemPrompt: "Be helpful.",
  greeting: "Hello",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const conversation: Conversation = {
  id: "22222222-2222-4222-8222-222222222222",
  characterId: character.id,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function createRepositories(settings: AppSettings): IndexedDbRepositories {
  return {
    characters: new MemoryRepository<Character>([character]),
    personas: new MemoryRepository<Persona>(),
    conversations: new MemoryRepository<Conversation>([conversation]),
    messages: new MemoryRepository<Message>(),
    memories: new MemoryRepository<Memory>(),
    settings: new MemorySettingsRepository(settings),
  };
}

function eventStreamResponse(): Response {
  const payload = [
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    "data: [DONE]\n\n",
  ].join("");

  return new Response(payload, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

describe("BrowserChatService provider credentials", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("labels and sends through the same sendable configuration", async () => {
    const selectedConfiguration = {
      id: "Test 1",
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      selectedModelId: "openai/gpt-5",
      enabled: true,
    } as const;
    const settings: AppSettings = {
      theme: "system",
      providers: [
        {
          id: "incomplete-openrouter",
          providerId: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          selectedModelId: "openai/gpt-4.1-mini",
          enabled: true,
        },
        selectedConfiguration,
      ],
    };
    localStorage.setItem(
      credentialStorageKey({
        configurationId: selectedConfiguration.id,
        providerId: selectedConfiguration.providerId,
      }),
      "selected-configuration-secret",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(eventStreamResponse());
    vi.stubGlobal("fetch", fetcher);
    const service = new BrowserChatService({
      repositories: createRepositories(settings),
      storage: localStorage,
    });

    const snapshot = await service.load();
    const result = await service.streamMessage({
      character,
      content: "Hi",
      conversationId: conversation.id,
      onAssistantText: vi.fn(),
      signal: new AbortController().signal,
    });

    expect(snapshot.providerLabel).toBe("openrouter · openai/gpt-5");
    expect(result.status).toBe("completed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe(
      "Bearer selected-configuration-secret",
    );
  });

  it("labels the provider as unavailable when no configuration can send", async () => {
    const settings: AppSettings = {
      theme: "system",
      providers: [
        {
          id: "missing-model",
          providerId: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          enabled: true,
        },
        {
          id: "disabled-provider",
          providerId: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          selectedModelId: "openai/gpt-5",
          enabled: false,
        },
      ],
    };
    const service = new BrowserChatService({
      repositories: createRepositories(settings),
      storage: localStorage,
    });

    await expect(service.load()).resolves.toMatchObject({
      providerLabel: "Provider unavailable",
    });
  });
});
