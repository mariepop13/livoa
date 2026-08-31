import { describe, expect, it, vi } from "vitest";

import type { AppSettings, Conversation, Message } from "@/domain/models";
import type {
  ConversationRepository,
  MemoryExtractionProvider,
  MessageRepository,
  SettingsRepository,
} from "@/domain/ports";

import {
  MEMORY_EXTRACTION_LIMITS,
  MemoryExtractionService,
  selectExtractionMessages,
} from "./extraction";
import { MemorySettingsService } from "./settings";

const timestamp = new Date("2026-08-31T12:00:00.000Z");
const conversation: Conversation = {
  id: "11111111-1111-4111-8111-111111111111",
  characterId: "22222222-2222-4222-8222-222222222222",
  createdAt: timestamp,
  updatedAt: timestamp,
};

function message(index: number, content: string): Message {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    conversationId: conversation.id,
    role: index % 2 === 0 ? "user" : "assistant",
    content,
    createdAt: new Date(timestamp.getTime() + index),
  };
}

function createService(
  settings: AppSettings | null,
  output: unknown | Error,
  messages: readonly Message[] = [message(0, "User prefers direct answers.")],
): { service: MemoryExtractionService; provider: MemoryExtractionProvider } {
  const settingsRepository: SettingsRepository = {
    get: async () => settings,
    save: async () => undefined,
  };
  const conversations: ConversationRepository = {
    list: async () => [conversation],
    getById: async (id) => (id === conversation.id ? conversation : null),
    save: async () => undefined,
    delete: async () => undefined,
  };
  const messageRepository: MessageRepository = {
    list: async () => [...messages],
    getById: async () => null,
    save: async () => undefined,
    delete: async () => undefined,
  };
  const provider: MemoryExtractionProvider = {
    extractMemories: vi.fn(async () => {
      if (output instanceof Error) {
        throw output;
      }
      return output;
    }),
  };
  return {
    service: new MemoryExtractionService(
      conversations,
      messageRepository,
      new MemorySettingsService(settingsRepository),
      provider,
    ),
    provider,
  };
}

describe("memory extraction boundaries", () => {
  it("selects bounded recent messages while retaining chronological order", () => {
    const selected = selectExtractionMessages(
      Array.from({ length: 13 }, (_, index) =>
        message(index, `${String(index).padStart(3, "0")}${"x".repeat(597)}`),
      ),
    );

    expect(selected).toHaveLength(
      Math.floor(MEMORY_EXTRACTION_LIMITS.maxCharacters / 600),
    );
    expect(
      selected.reduce((total, item) => total + item.content.length, 0),
    ).toBeLessThanOrEqual(MEMORY_EXTRACTION_LIMITS.maxCharacters);
    expect(selected[0]?.content).toBe(`003${"x".repeat(597)}`);
  });

  it("requires extraction consent before it invokes a provider", async () => {
    const { service, provider } = createService(null, {
      candidates: ["ignored"],
    });

    await expect(
      service.extract({ conversationId: conversation.id, model: "model" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "consent_required" },
    });
    expect(provider.extractMemories).not.toHaveBeenCalled();
  });

  it("trims accepted candidates and exposes malformed output and provider failures", async () => {
    const enabled: AppSettings = {
      theme: "system",
      providers: [],
      memoryExtractionEnabled: true,
      memoryContextEnabled: false,
    };
    const accepted = createService(enabled, {
      candidates: ["  Prefers tea.  "],
    });
    await expect(
      accepted.service.extract({
        conversationId: conversation.id,
        model: "model",
      }),
    ).resolves.toEqual({
      ok: true,
      data: [{ subject: "user", content: "Prefers tea." }],
    });

    const malformed = createService(enabled, { candidates: ["", "valid"] });
    await expect(
      malformed.service.extract({
        conversationId: conversation.id,
        model: "model",
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: "provider" } });

    const failed = createService(enabled, new Error("offline"));
    await expect(
      failed.service.extract({
        conversationId: conversation.id,
        model: "model",
      }),
    ).resolves.toMatchObject({ ok: false, error: { kind: "application" } });
  });
});
