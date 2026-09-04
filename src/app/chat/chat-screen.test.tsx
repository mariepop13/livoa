import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  Character,
  Conversation,
  Message,
  Persona,
} from "@/domain/models";

import ChatScreen from "./chat-screen";
import type {
  BrowserChatSnapshot,
  PersonaAwareChatAdapter,
} from "./browser-chat-service";
import {
  ChatAdapterError,
  type ChatStreamInput,
  type ChatStreamOutcome,
} from "./chat-adapter";

const characterId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const userMessageId = "33333333-3333-4333-8333-333333333333";
const assistantMessageId = "44444444-4444-4444-8444-444444444444";
const personaId = "55555555-5555-4555-8555-555555555555";
const secondPersonaId = "66666666-6666-4666-8666-666666666666";
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
  personaId,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondConversation: Conversation = {
  ...conversation,
  id: "77777777-7777-4777-8777-777777777777",
  title: "A second conversation",
};

const persona: Persona = {
  id: personaId,
  name: "Ada Lovelace",
  description: "A precise analytical thinker.",
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondPersona: Persona = {
  id: secondPersonaId,
  name: "Grace Hopper",
  description: "A practical systems thinker.",
  createdAt: timestamp,
  updatedAt: timestamp,
};

class FakeChatAdapter implements PersonaAwareChatAdapter {
  readonly #mode: "complete" | "error";
  readonly #messages: Message[] = [];
  #conversations: Conversation[];
  public readonly createdConversationInputs: Array<{
    characterId: string;
    personaId: string | undefined;
  }> = [];
  public readonly deletedConversationIds: string[] = [];
  public deleteFailure: ChatAdapterError | undefined;

  public constructor(
    mode: "complete" | "error" = "complete",
    conversations: Conversation[] = [conversation],
  ) {
    this.#mode = mode;
    this.#conversations = conversations;
  }

  public async load(): Promise<BrowserChatSnapshot> {
    return {
      characters: [character],
      conversations: [...this.#conversations],
      personas: [persona, secondPersona],
      providerLabel: "Local test provider",
    };
  }

  public async createConversation(
    characterId: string,
    selectedPersonaId?: string,
  ): Promise<Conversation> {
    this.createdConversationInputs.push({
      characterId,
      personaId: selectedPersonaId,
    });
    return conversation;
  }

  public async retrieveConversation(id: string): Promise<{
    conversation: Conversation;
    messages: readonly Message[];
  }> {
    const selectedConversation = this.#conversations.find(
      (candidate) => candidate.id === id,
    );
    if (selectedConversation === undefined) {
      throw new ChatAdapterError(
        "The selected conversation could not be found.",
      );
    }

    return {
      conversation: selectedConversation,
      messages: this.#messages.filter(
        (message) => message.conversationId === id,
      ),
    };
  }

  public async deleteConversation(id: string): Promise<void> {
    if (this.deleteFailure !== undefined) {
      throw this.deleteFailure;
    }

    this.deletedConversationIds.push(id);
    this.#conversations = this.#conversations.filter(
      (conversation) => conversation.id !== id,
    );
    for (let index = this.#messages.length - 1; index >= 0; index -= 1) {
      if (this.#messages[index]?.conversationId === id) {
        this.#messages.splice(index, 1);
      }
    }
  }

  public async editUserMessage(input: {
    conversationId: string;
    messageId: string;
    content: string;
  }): Promise<void> {
    const index = this.#messages.findIndex(
      (message) =>
        message.id === input.messageId &&
        message.conversationId === input.conversationId,
    );
    if (index === -1) {
      throw new ChatAdapterError("The selected message could not be found.");
    }
    const message = this.#messages[index];
    if (message === undefined || message.role !== "user") {
      throw new ChatAdapterError("The selected message cannot be edited.");
    }
    this.#messages.splice(index, this.#messages.length - index, {
      ...message,
      content: input.content,
    });
  }

  public async deleteMessage(input: {
    conversationId: string;
    messageId: string;
    discardFollowing: boolean;
  }): Promise<void> {
    const index = this.#messages.findIndex(
      (message) =>
        message.id === input.messageId &&
        message.conversationId === input.conversationId,
    );
    if (index === -1) {
      throw new ChatAdapterError("The selected message could not be found.");
    }
    this.#messages.splice(
      index,
      input.discardFollowing ? this.#messages.length - index : 1,
    );
  }

  public async regenerateMessage(input: {
    onAssistantText: (content: string) => void;
  }): Promise<{
    status: "completed";
    content: string;
    model: string;
    provider: string;
  }> {
    input.onAssistantText("A regenerated response");
    return {
      status: "completed",
      content: "A regenerated response",
      model: "local-test-model",
      provider: "local-test-provider",
    };
  }

  public async replaceAssistantMessage(input: {
    conversationId: string;
    messageId: string;
    content: string;
    model: string;
    provider: string;
  }): Promise<void> {
    const index = this.#messages.findIndex(
      (message) =>
        message.id === input.messageId &&
        message.conversationId === input.conversationId,
    );
    if (index === -1) {
      throw new ChatAdapterError("The selected message could not be found.");
    }
    const message = this.#messages[index];
    if (message === undefined || message.role !== "assistant") {
      throw new ChatAdapterError("The selected message cannot be regenerated.");
    }
    this.#messages.splice(index, this.#messages.length - index, {
      ...message,
      content: input.content,
      model: input.model,
      provider: input.provider,
    });
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

  it("passes the selected persona when creating a conversation", async () => {
    const adapter = new FakeChatAdapter();
    render(<ChatScreen adapter={adapter} />);

    await screen.findByRole("heading", { name: "Chat with your character." });
    fireEvent.change(screen.getByLabelText("Persona"), {
      target: { value: secondPersonaId },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Start conversation with Mira Vale" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Conversation created.",
    );
    expect(adapter.createdConversationInputs).toEqual([
      { characterId, personaId: secondPersonaId },
    ]);
  });

  it("cancels accessible conversation deletion without changing local state", async () => {
    const adapter = new FakeChatAdapter();
    render(<ChatScreen adapter={adapter} />);

    await screen.findByRole("heading", { name: "Chat with your character." });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected conversation" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Permanently delete conversation?",
    });
    expect(dialog).toHaveTextContent("This action is irreversible");
    expect(screen.getByLabelText("Character")).toBeDisabled();
    expect(screen.getByLabelText("Conversation")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(adapter.deletedConversationIds).toEqual([]);
    expect(screen.getByLabelText("Conversation")).toHaveValue(conversationId);
  });

  it("deletes the active conversation and selects the remaining conversation", async () => {
    const adapter = new FakeChatAdapter("complete", [
      conversation,
      secondConversation,
    ]);
    render(<ChatScreen adapter={adapter} />);

    await screen.findByRole("heading", { name: "Chat with your character." });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected conversation" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Permanently delete" }),
    );

    expect(
      await screen.findByRole("status", { name: "Conversation deleted." }),
    ).toBeVisible();
    expect(adapter.deletedConversationIds).toEqual([conversationId]);
    expect(screen.getByLabelText("Conversation")).toHaveValue(
      secondConversation.id,
    );
  });

  it("shows a normalized deletion storage failure and keeps confirmation open", async () => {
    const adapter = new FakeChatAdapter();
    adapter.deleteFailure = new ChatAdapterError(
      "Local data could not be deleted.",
    );
    render(<ChatScreen adapter={adapter} />);

    await screen.findByRole("heading", { name: "Chat with your character." });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete selected conversation" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Permanently delete" }),
    );

    expect(
      await screen.findByRole("alert", {
        name: "Local data could not be deleted.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(adapter.deletedConversationIds).toEqual([]);
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
