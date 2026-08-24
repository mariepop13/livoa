import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Character, Conversation, Message } from "@/domain/models";

import ChatScreen from "./chat-screen";
import type {
  ChatAdapter,
  ChatSnapshot,
  ChatStreamInput,
  ChatStreamOutcome,
} from "./chat-adapter";

const characterId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const userMessageId = "33333333-3333-4333-8333-333333333333";
const assistantMessageId = "44444444-4444-4444-8444-444444444444";
const timestamp = new Date("2026-01-01T00:00:00.000Z");

const character: Character = {
  id: characterId,
  name: "Mira Vale",
  description: "A calm guide.",
  personality: "Thoughtful and clear.",
  systemPrompt: "You are Mira Vale.",
  greeting: "Where should we begin?",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const conversation: Conversation = {
  id: conversationId,
  characterId,
  createdAt: timestamp,
  updatedAt: timestamp,
};

class FakeChatAdapter implements ChatAdapter {
  readonly #mode: "complete" | "error";
  readonly #messages: Message[] = [];

  public constructor(mode: "complete" | "error" = "complete") {
    this.#mode = mode;
  }

  public async load(): Promise<ChatSnapshot> {
    return {
      characters: [character],
      conversations: [conversation],
      providerLabel: "Local test provider",
    };
  }

  public async createConversation(): Promise<Conversation> {
    return conversation;
  }

  public async retrieveConversation(): Promise<{
    conversation: Conversation;
    messages: readonly Message[];
  }> {
    return { conversation, messages: [...this.#messages] };
  }

  public async streamMessage(
    input: ChatStreamInput,
  ): Promise<ChatStreamOutcome> {
    this.#messages.push({
      id: userMessageId,
      conversationId,
      content: input.content,
      role: "user",
      createdAt: timestamp,
    });

    if (this.#mode === "error") {
      return { status: "error", message: "The provider could not be reached." };
    }

    input.onAssistantText("A local response");
    const message: Message = {
      id: assistantMessageId,
      conversationId,
      content: "A local response",
      role: "assistant",
      model: "local-test-model",
      provider: "local-test-provider",
      createdAt: timestamp,
    };
    this.#messages.push(message);
    return { status: "completed", message };
  }
}

describe("ChatScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a character conversation and displays a streamed reply", async () => {
    render(<ChatScreen adapter={new FakeChatAdapter()} />);

    expect(
      await screen.findByRole("heading", { name: "Chat with your character." }),
    ).toBeVisible();
    expect(screen.getByLabelText("Character")).toHaveValue(characterId);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Help me choose a direction." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByRole("status", { name: "Response complete." });
    expect(screen.getByText("A local response")).toBeVisible();
    expect(screen.getByText("Response complete.")).toBeVisible();
  });

  it("renders a safe provider error without exposing raw details", async () => {
    render(<ChatScreen adapter={new FakeChatAdapter("error")} />);

    await screen.findByRole("heading", { name: "Chat with your character." });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "This should fail safely." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByRole("alert", {
        name: "The provider could not be reached.",
      }),
    ).toBeVisible();
  });
});
