import {
  createCharacterApplicationService,
  type CharacterApplicationService,
} from "@/application/characters";
import {
  createConversationApplicationService,
  type ConversationApplicationService,
  type ConversationUseCaseResult,
} from "@/application/conversations";
import { createConversationContextAssembler } from "@/application/conversations/context";
import { normalizeApplicationError } from "@/application/error";
import { ProviderSettingsService } from "@/application/providers/provider-settings";
import type { AiProvider, ChatMessage, ChatRequest } from "@/domain/ports";
import type {
  Character,
  Conversation,
  Message,
  ProviderConfiguration,
} from "@/domain/models";
import { WebStorageCredentialStore } from "@/infrastructure/credentials/web-storage-credential-store";
import { OpenAiCompatibleProvider } from "@/infrastructure/providers/openai-compatible/openai-compatible-provider";
import {
  createIndexedDbRepositories,
  type IndexedDbRepositories,
} from "@/infrastructure/storage/indexeddb/repositories";

import {
  ChatAdapterError,
  type ChatAdapter,
  type ChatSnapshot,
  type ChatStreamInput,
  type ChatStreamOutcome,
  type ChatTestDoubleMode,
  unwrapConversationResult,
} from "./chat-adapter";
import { createDeterministicTestProvider } from "./deterministic-test-provider";

const contextLimits = {
  maxMessages: 50,
  maxCharacters: 12000,
} as const;

const credentialStoragePrefix = "livoa:credentials:v1:";

type BrowserChatServiceOptions = Readonly<{
  testDouble?: ChatTestDoubleMode;
  repositories?: IndexedDbRepositories;
  storage?: Storage;
}>;

type ConfiguredProvider = Readonly<{
  model: string;
  provider: AiProvider;
}>;

function sortConversations(
  conversations: readonly Conversation[],
): Conversation[] {
  return [...conversations].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
}

function getResultError<T>(
  result: ConversationUseCaseResult<T>,
  fallbackMessage: string,
): ChatAdapterError {
  if (result.ok) {
    return new ChatAdapterError(fallbackMessage);
  }

  if (result.error.kind === "application") {
    return new ChatAdapterError(result.error.error.message);
  }

  if (result.error.kind === "not_found") {
    return new ChatAdapterError(
      "The selected conversation could not be found.",
    );
  }

  return new ChatAdapterError(fallbackMessage);
}

function isCancelled(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function readCredential(storage: Storage, providerId: string): string | null {
  try {
    return storage.getItem(
      `${credentialStoragePrefix}${encodeURIComponent(providerId)}`,
    );
  } catch {
    return null;
  }
}

function providerLabel(configuration: ProviderConfiguration): string {
  return `${configuration.providerId} · ${configuration.selectedModelId ?? "No model selected"}`;
}

function chatMessages(
  character: Character,
  messages: readonly Message[],
): ChatMessage[] {
  return [
    { role: "system", content: character.systemPrompt },
    ...messages.map(({ role, content }) => ({ role, content })),
  ];
}

export class BrowserChatService implements ChatAdapter {
  readonly #characterService: CharacterApplicationService;
  readonly #conversationService: ConversationApplicationService;
  readonly #contextAssembler = createConversationContextAssembler();
  readonly #providerSettings: ProviderSettingsService;
  readonly #conversations: IndexedDbRepositories["conversations"];
  readonly #storage: Storage;
  readonly #testDouble: ChatTestDoubleMode | undefined;

  public constructor(options: BrowserChatServiceOptions = {}) {
    const repositories = options.repositories ?? createIndexedDbRepositories();
    this.#characterService = createCharacterApplicationService(
      repositories.characters,
    );
    this.#conversationService = createConversationApplicationService(
      repositories.conversations,
      repositories.messages,
    );
    this.#providerSettings = new ProviderSettingsService(
      repositories.settings,
      new WebStorageCredentialStore(options.storage ?? window.localStorage),
    );
    this.#conversations = repositories.conversations;
    this.#storage = options.storage ?? window.localStorage;
    this.#testDouble = options.testDouble;
  }

  public async load(): Promise<ChatSnapshot> {
    const [charactersResult, conversations, providerLabel] = await Promise.all([
      this.#characterService.list(),
      this.#conversations.list(),
      this.#loadProviderLabel(),
    ]);

    if (!charactersResult.ok) {
      throw getCharacterLoadError();
    }

    return {
      characters: charactersResult.data,
      conversations: sortConversations(conversations),
      providerLabel,
    };
  }

  public async createConversation(characterId: string): Promise<Conversation> {
    const result = await this.#conversationService.create({ characterId });
    return unwrapConversationResult(
      result,
      "The conversation could not be created.",
    );
  }

  public async retrieveConversation(id: string) {
    const result = await this.#conversationService.retrieve(id);
    return unwrapConversationResult(
      result,
      "The conversation could not be loaded.",
    );
  }

  public async streamMessage(
    input: ChatStreamInput,
  ): Promise<ChatStreamOutcome> {
    const userResult = await this.#conversationService.appendMessage({
      conversationId: input.conversationId,
      content: input.content,
      role: "user",
    });

    if (!userResult.ok) {
      return {
        status: "error",
        message: getResultError(userResult, "The message could not be saved.")
          .message,
      };
    }

    try {
      const conversationResult = await this.#conversationService.retrieve(
        input.conversationId,
      );
      const conversation = unwrapConversationResult(
        conversationResult,
        "The conversation context could not be loaded.",
      );
      const contextResult = this.#contextAssembler.assemble({
        conversation: conversation.conversation,
        messages: conversation.messages,
        limits: contextLimits,
      });

      if (!contextResult.ok) {
        return {
          status: "error",
          message: "The conversation context is unavailable.",
        };
      }

      const configuredProvider = await this.#providerForMessage();
      const request: ChatRequest = {
        model: configuredProvider.model,
        messages: chatMessages(input.character, contextResult.data.messages),
      };
      const assistantContent = await this.#readAssistantResponse(
        configuredProvider.provider,
        request,
        input,
      );

      if (assistantContent === null) {
        return { status: "cancelled" };
      }

      if (assistantContent.length === 0) {
        return {
          status: "error",
          message: "The provider returned an empty response.",
        };
      }

      const assistantResult = await this.#conversationService.appendMessage({
        conversationId: input.conversationId,
        content: assistantContent,
        model: configuredProvider.model,
        provider: configuredProvider.provider.id,
        role: "assistant",
      });

      if (!assistantResult.ok) {
        return {
          status: "error",
          message: getResultError(
            assistantResult,
            "The response could not be saved.",
          ).message,
        };
      }

      return { status: "completed", message: assistantResult.data };
    } catch (error: unknown) {
      if (isCancelled(error, input.signal)) {
        return { status: "cancelled" };
      }

      if (error instanceof ChatAdapterError) {
        return { status: "error", message: error.message };
      }

      return {
        status: "error",
        message: normalizeApplicationError(error, { kind: "provider" }).message,
      };
    }
  }

  async #loadProviderLabel(): Promise<string> {
    if (this.#testDouble !== undefined) {
      return "Local deterministic test provider";
    }

    const result = await this.#providerSettings.load();
    if (!result.ok) {
      throw new ChatAdapterError(result.error.message);
    }

    const configuration = result.data.settings.providers.find(
      (provider) => provider.enabled,
    );

    return configuration === undefined
      ? "No enabled provider configured"
      : providerLabel(configuration);
  }

  async #providerForMessage(): Promise<ConfiguredProvider> {
    if (this.#testDouble !== undefined) {
      return {
        model: "local-test-model",
        provider: createDeterministicTestProvider(this.#testDouble),
      };
    }

    const result = await this.#providerSettings.load();
    if (!result.ok) {
      throw new ChatAdapterError(result.error.message);
    }

    const configuration = result.data.settings.providers.find(
      (provider) => provider.enabled && provider.selectedModelId !== undefined,
    );

    if (configuration === undefined) {
      throw new ChatAdapterError(
        "Configure an enabled provider and selected model before sending a message.",
      );
    }

    if (configuration.baseUrl === undefined) {
      throw new ChatAdapterError(
        "Add a base URL to the selected provider before sending a message.",
      );
    }

    if (result.data.credentialStatus[configuration.id] !== true) {
      throw new ChatAdapterError(
        "Save a credential for the selected provider before sending a message.",
      );
    }

    const credential = readCredential(this.#storage, configuration.providerId);
    if (credential === null) {
      throw new ChatAdapterError(
        "The saved credential is unavailable for the selected provider.",
      );
    }

    const model = configuration.selectedModelId;
    if (model === undefined) {
      throw new ChatAdapterError(
        "Configure a selected model before sending a message.",
      );
    }

    return {
      model,
      provider: new OpenAiCompatibleProvider({
        id: configuration.providerId,
        baseUrl: configuration.baseUrl,
        credential,
      }),
    };
  }

  async #readAssistantResponse(
    provider: AiProvider,
    request: ChatRequest,
    input: ChatStreamInput,
  ): Promise<string | null> {
    let content = "";

    for await (const chunk of provider.streamChat(request, input.signal)) {
      if (input.signal.aborted) {
        return null;
      }

      if (chunk.type === "text" && chunk.content !== undefined) {
        content += chunk.content;
        input.onAssistantText(content);
      }
    }

    return input.signal.aborted ? null : content;
  }
}

function getCharacterLoadError(): ChatAdapterError {
  return new ChatAdapterError("Saved characters could not be loaded.");
}

export function createBrowserChatService(
  options: BrowserChatServiceOptions = {},
): BrowserChatService {
  return new BrowserChatService(options);
}
