import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  MAX_MESSAGE_CONTENT_LENGTH,
  appSettingsSchema,
  characterSchema,
  conversationSchema,
  messageSchema,
  personaSchema,
  providerConfigurationSchema,
} from "./models";

const validDates = {
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
  updatedAt: new Date("2026-01-02T12:00:00.000Z"),
};

const validCharacter = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Astra",
  description: "A patient guide.",
  personality: "Thoughtful and curious.",
  systemPrompt: "Be helpful.",
  greeting: "Hello.",
  avatar: "https://example.com/astra.png",
  ...validDates,
};

const validPersona = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Marie",
  description: "A curious user.",
  ...validDates,
};

const validConversation = {
  id: "33333333-3333-4333-8333-333333333333",
  characterId: validCharacter.id,
  personaId: validPersona.id,
  title: "A first conversation",
  ...validDates,
};

const validMessage = {
  id: "44444444-4444-4444-8444-444444444444",
  conversationId: validConversation.id,
  role: "assistant" as const,
  content: "Welcome.",
  model: "test-model",
  provider: "test-provider",
  createdAt: validDates.createdAt,
};

const validProviderConfiguration = {
  id: "provider-1",
  providerId: "openai-compatible",
  baseUrl: "https://example.com/v1",
  selectedModelId: "test-model",
  enabled: true,
};

describe("domain models", () => {
  it("accepts valid values for every exported domain schema", () => {
    expect(characterSchema.parse(validCharacter)).toEqual(validCharacter);
    expect(personaSchema.parse(validPersona)).toEqual(validPersona);
    expect(conversationSchema.parse(validConversation)).toEqual(
      validConversation,
    );
    expect(messageSchema.parse(validMessage)).toEqual(validMessage);
    expect(
      providerConfigurationSchema.parse(validProviderConfiguration),
    ).toEqual(validProviderConfiguration);
    expect(
      appSettingsSchema.parse({
        theme: "dark",
        providers: [validProviderConfiguration],
      }),
    ).toEqual({
      theme: "dark",
      providers: [validProviderConfiguration],
    });
  });

  it("trims names while rejecting empty names", () => {
    expect(
      personaSchema.parse({ ...validPersona, name: "  Marie  " }).name,
    ).toBe("Marie");
    expect(() => personaSchema.parse({ ...validPersona, name: "   " })).toThrow(
      ZodError,
    );
  });

  it("rejects invalid UUIDs at identity and relationship boundaries", () => {
    expect(() =>
      characterSchema.parse({ ...validCharacter, id: "invalid" }),
    ).toThrow(ZodError);
    expect(() =>
      personaSchema.parse({ ...validPersona, id: "invalid" }),
    ).toThrow(ZodError);
    expect(() =>
      conversationSchema.parse({ ...validConversation, id: "invalid" }),
    ).toThrow(ZodError);
    expect(() =>
      conversationSchema.parse({
        ...validConversation,
        characterId: "invalid",
      }),
    ).toThrow(ZodError);
    expect(() =>
      conversationSchema.parse({ ...validConversation, personaId: "invalid" }),
    ).toThrow(ZodError);
    expect(() =>
      messageSchema.parse({ ...validMessage, id: "invalid" }),
    ).toThrow(ZodError);
    expect(() =>
      messageSchema.parse({ ...validMessage, conversationId: "invalid" }),
    ).toThrow(ZodError);
  });

  it("rejects non-Date values and invalid Date instances", () => {
    expect(() =>
      characterSchema.parse({ ...validCharacter, createdAt: "2026-01-01" }),
    ).toThrow(ZodError);
    expect(() =>
      messageSchema.parse({ ...validMessage, createdAt: new Date(Number.NaN) }),
    ).toThrow(ZodError);
  });

  it("rejects invalid enum values and malformed provider settings", () => {
    expect(() =>
      messageSchema.parse({ ...validMessage, role: "invalid" }),
    ).toThrow(ZodError);
    expect(() =>
      appSettingsSchema.parse({ theme: "invalid", providers: [] }),
    ).toThrow(ZodError);
    expect(() =>
      providerConfigurationSchema.parse({
        ...validProviderConfiguration,
        enabled: "true",
      }),
    ).toThrow(ZodError);
  });

  it("bounds persisted message content", () => {
    expect(() =>
      messageSchema.parse({
        ...validMessage,
        content: "x".repeat(MAX_MESSAGE_CONTENT_LENGTH + 1),
      }),
    ).toThrow(ZodError);
  });
});
