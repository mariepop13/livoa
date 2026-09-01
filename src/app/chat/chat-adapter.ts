import type { Character, Conversation, Message } from "@/domain/models";
import type {
  ConversationUseCaseResult,
  ConversationWithMessages,
} from "@/application/conversations";

export type ChatTestDoubleMode = "stream" | "slow" | "error";

export type ChatSnapshot = Readonly<{
  characters: readonly Character[];
  conversations: readonly Conversation[];
  providerLabel: string;
}>;

export type ChatStreamInput = Readonly<{
  conversationId: string;
  character: Character;
  content: string;
  signal: AbortSignal;
  onAssistantText: (content: string) => void;
}>;

export type ChatStreamOutcome =
  | Readonly<{ status: "completed"; message: Message }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "error"; message: string }>;

export interface ChatAdapter {
  load(): Promise<ChatSnapshot>;
  createConversation(characterId: string): Promise<Conversation>;
  retrieveConversation(id: string): Promise<ConversationWithMessages>;
  deleteConversation(id: string): Promise<void>;
  streamMessage(input: ChatStreamInput): Promise<ChatStreamOutcome>;
}

export class ChatAdapterError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ChatAdapterError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function unwrapConversationResult<T>(
  result: ConversationUseCaseResult<T>,
  fallbackMessage: string,
): T {
  if (result.ok) {
    return result.data;
  }

  if (result.error.kind === "application") {
    throw new ChatAdapterError(result.error.error.message);
  }

  if (result.error.kind === "not_found") {
    throw new ChatAdapterError("The selected conversation could not be found.");
  }

  throw new ChatAdapterError(fallbackMessage);
}
