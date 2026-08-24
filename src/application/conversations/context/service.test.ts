import { describe, expect, it } from "vitest";

import type { Conversation, Message } from "../../../domain/models";
import {
  assembleConversationContext,
  createConversationContextAssembler,
} from "./service";

const conversationId = "11111111-1111-4111-8111-111111111111";
const otherConversationId = "22222222-2222-4222-8222-222222222222";
const conversation: Conversation = {
  id: conversationId,
  characterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  personaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "Context test",
  createdAt: new Date("2026-01-01T12:00:00.000Z"),
  updatedAt: new Date("2026-01-01T12:00:00.000Z"),
};

function message(
  id: string,
  content: string,
  createdAt: string,
  role: Message["role"] = "user",
  messageConversationId = conversationId,
): Message {
  return {
    id,
    conversationId: messageConversationId,
    role,
    content,
    createdAt: new Date(createdAt),
  };
}

describe("conversation context assembly", () => {
  it("orders selected messages chronologically with canonical ties", () => {
    const first = message(
      "33333333-3333-4333-8333-333333333333",
      "first",
      "2026-01-01T12:00:00.000Z",
    );
    const second = message(
      "44444444-4444-4444-8444-444444444444",
      "second",
      "2026-01-01T12:00:00.000Z",
      "assistant",
    );
    const third = message(
      "55555555-5555-4555-8555-555555555555",
      "third",
      "2026-01-01T12:01:00.000Z",
    );

    const result = assembleConversationContext({
      conversation,
      messages: [third, second, first],
      limits: { maxMessages: 3, maxCharacters: 100 },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        conversationId,
        messages: [first, second, third],
        charactersUsed: 16,
        omittedMessageCount: 0,
        truncatedMessageIds: [],
      },
    });
  });

  it("honors exact message and character boundaries", () => {
    const oldMessage = message(
      "33333333-3333-4333-8333-333333333333",
      "old",
      "2026-01-01T12:00:00.000Z",
    );
    const middleMessage = message(
      "44444444-4444-4444-8444-444444444444",
      "middle",
      "2026-01-01T12:01:00.000Z",
    );
    const latestMessage = message(
      "55555555-5555-4555-8555-555555555555",
      "latest",
      "2026-01-01T12:02:00.000Z",
      "assistant",
    );

    const result = assembleConversationContext({
      conversation,
      messages: [latestMessage, oldMessage, middleMessage],
      limits: { maxMessages: 2, maxCharacters: 12 },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        conversationId,
        messages: [middleMessage, latestMessage],
        charactersUsed: 12,
        omittedMessageCount: 1,
        truncatedMessageIds: [],
      },
    });
  });

  it("selects the same tied messages regardless of input order", () => {
    const first = message(
      "33333333-3333-4333-8333-333333333333",
      "first",
      "2026-01-01T12:00:00.000Z",
    );
    const second = message(
      "44444444-4444-4444-8444-444444444444",
      "second",
      "2026-01-01T12:00:00.000Z",
    );
    const latest = message(
      "55555555-5555-4555-8555-555555555555",
      "latest",
      "2026-01-01T12:01:00.000Z",
    );
    const limits = { maxMessages: 2, maxCharacters: 100 };

    const firstOrder = assembleConversationContext({
      conversation,
      messages: [first, second, latest],
      limits,
    });
    const secondOrder = assembleConversationContext({
      conversation,
      messages: [second, first, latest],
      limits,
    });

    expect(firstOrder).toEqual(secondOrder);
    expect(firstOrder).toMatchObject({
      ok: true,
      data: { messages: [second, latest] },
    });
  });

  it("selects the newest messages and truncates the oldest selected content", () => {
    const oldMessage = message(
      "33333333-3333-4333-8333-333333333333",
      "old",
      "2026-01-01T12:00:00.000Z",
    );
    const middleMessage = message(
      "44444444-4444-4444-8444-444444444444",
      "middle",
      "2026-01-01T12:01:00.000Z",
    );
    const latestMessage = message(
      "55555555-5555-4555-8555-555555555555",
      "latest",
      "2026-01-01T12:02:00.000Z",
      "assistant",
    );

    const result = assembleConversationContext({
      conversation,
      messages: [oldMessage, latestMessage, middleMessage],
      limits: { maxMessages: 2, maxCharacters: 9 },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        conversationId,
        messages: [{ ...middleMessage, content: "mid" }, latestMessage],
        charactersUsed: 9,
        omittedMessageCount: 1,
        truncatedMessageIds: [middleMessage.id],
      },
    });
  });

  it("returns an empty bounded context for zero budgets", () => {
    const result = assembleConversationContext({
      conversation,
      messages: [
        message(
          "33333333-3333-4333-8333-333333333333",
          "message",
          "2026-01-01T12:00:00.000Z",
        ),
      ],
      limits: { maxMessages: 0, maxCharacters: 0 },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        conversationId,
        messages: [],
        charactersUsed: 0,
        omittedMessageCount: 1,
        truncatedMessageIds: [],
      },
    });
  });

  it("rejects missing, invalid, and cross-conversation input explicitly", () => {
    const invalidResult = assembleConversationContext({
      conversation,
      messages: [],
      limits: { maxMessages: -1, maxCharacters: 10 },
    });
    const mismatchedResult = assembleConversationContext({
      conversation,
      messages: [
        message(
          "33333333-3333-4333-8333-333333333333",
          "wrong conversation",
          "2026-01-01T12:00:00.000Z",
          "user",
          otherConversationId,
        ),
      ],
      limits: { maxMessages: 1, maxCharacters: 100 },
    });
    const missingResult = assembleConversationContext(undefined);
    const unboundedResult = assembleConversationContext({
      conversation,
      messages: [],
      limits: { maxMessages: Number.POSITIVE_INFINITY, maxCharacters: 10 },
    });
    const duplicateIdResult = assembleConversationContext({
      conversation,
      messages: [
        message(
          "33333333-3333-4333-8333-333333333333",
          "first",
          "2026-01-01T12:00:00.000Z",
        ),
        message(
          "33333333-3333-4333-8333-333333333333",
          "duplicate",
          "2026-01-01T12:01:00.000Z",
        ),
      ],
      limits: { maxMessages: 2, maxCharacters: 100 },
    });

    expect(invalidResult).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(mismatchedResult).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(missingResult).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(unboundedResult).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
    expect(duplicateIdResult).toMatchObject({
      ok: false,
      error: { kind: "validation", code: "VALIDATION_ERROR" },
    });
  });

  it("exposes the same deterministic assembly through the interface", () => {
    const assembler = createConversationContextAssembler();

    expect(
      assembler.assemble({
        conversation,
        messages: [],
        limits: { maxMessages: 1, maxCharacters: 1 },
      }),
    ).toEqual({
      ok: true,
      data: {
        conversationId,
        messages: [],
        charactersUsed: 0,
        omittedMessageCount: 0,
        truncatedMessageIds: [],
      },
    });
  });
});
