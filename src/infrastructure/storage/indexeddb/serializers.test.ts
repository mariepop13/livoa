import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type {
  AppSettings,
  Character,
  Conversation,
  Message,
  Persona,
} from "../../../domain/models";
import {
  deserializeAppSettings,
  deserializeCharacter,
  deserializeConversation,
  deserializeMessage,
  deserializePersona,
  serializeAppSettings,
  serializeCharacter,
  serializeConversation,
  serializeMessage,
  serializePersona,
} from "./serializers";

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

const settings: AppSettings = {
  theme: "dark",
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

describe("IndexedDB serializers", () => {
  it("round-trips Character dates as canonical persisted strings", () => {
    const stored = serializeCharacter(character);

    expect(stored.createdAt).toBe(character.createdAt.toISOString());
    expect(stored.updatedAt).toBe(character.updatedAt.toISOString());
    expect(deserializeCharacter(stored)).toEqual(character);
  });

  it("round-trips Persona dates as canonical persisted strings", () => {
    const stored = serializePersona(persona);

    expect(stored.createdAt).toBe(persona.createdAt.toISOString());
    expect(stored.updatedAt).toBe(persona.updatedAt.toISOString());
    expect(deserializePersona(stored)).toEqual(persona);
  });

  it("round-trips Conversation dates as canonical persisted strings", () => {
    const stored = serializeConversation(conversation);

    expect(stored.createdAt).toBe(conversation.createdAt.toISOString());
    expect(stored.updatedAt).toBe(conversation.updatedAt.toISOString());
    expect(deserializeConversation(stored)).toEqual(conversation);
  });

  it("round-trips Message dates as canonical persisted strings", () => {
    const stored = serializeMessage(message);

    expect(stored.createdAt).toBe(message.createdAt.toISOString());
    expect(deserializeMessage(stored)).toEqual(message);
  });

  it("round-trips AppSettings through its persisted record shape", () => {
    const stored = serializeAppSettings(settings);

    expect(stored).toMatchObject({ id: "app-settings", ...settings });
    expect(deserializeAppSettings(stored)).toEqual(settings);
  });

  it("rejects invalid persisted dates before hydrating a domain entity", () => {
    const stored = serializeCharacter(character);

    expect(() =>
      deserializeCharacter({ ...stored, createdAt: "not-a-date" }),
    ).toThrow(ZodError);
    expect(() =>
      deserializeMessage({
        ...serializeMessage(message),
        createdAt: "2026-04-01T12:00:00Z",
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid persisted UUIDs and unsafe URLs", () => {
    expect(() =>
      deserializeConversation({
        ...serializeConversation(conversation),
        characterId: "invalid",
      }),
    ).toThrow(ZodError);
    expect(() =>
      deserializeCharacter({
        ...serializeCharacter(character),
        avatar: "javascript:alert(1)",
      }),
    ).toThrow(ZodError);
    expect(() =>
      deserializeAppSettings({
        ...serializeAppSettings(settings),
        providers: [
          {
            ...settings.providers[0],
            baseUrl: "file:///tmp/provider",
          },
        ],
      }),
    ).toThrow(ZodError);
  });
});
