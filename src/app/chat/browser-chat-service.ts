import {
  createCharacterApplicationService,
  type CharacterApplicationService,
} from "@/application/characters";
import {
  createPersonaApplicationService,
  type PersonaApplicationService,
} from "@/application/personas";
import {
  createMemoryContextMessage,
  MemorySettingsService,
} from "@/application/memories";
import {
  createConversationApplicationService,
  type ConversationApplicationService,
  type ConversationUseCaseResult,
} from "@/application/conversations";
import { createConversationContextAssembler } from "@/application/conversations/context";
import { normalizeApplicationError } from "@/application/error";
import {
  ProviderSettingsService,
  type ProviderSettingsSnapshot,
} from "@/application/providers/provider-settings";
import type {
  AiProvider,
  ChatMessage,
  ChatRequest,
  CredentialReference,
} from "@/domain/ports";
import type {
  Character,
  Conversation,
  Message,
  Persona,
  ProviderConfiguration,
} from "@/domain/models";
import {
  credentialStorageKey,
  WebStorageCredentialStore,
} from "@/infrastructure/credentials/web-storage-credential-store";
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

export type BrowserChatSnapshot = ChatSnapshot &
  Readonly<{
    personas: readonly Persona[];
  }>;

export type PersonaAwareChatAdapter = Omit<
  ChatAdapter,
  "load" | "createConversation"
> &
  Readonly<{
    load(): Promise<BrowserChatSnapshot>;
    createConversation(
      characterId: string,
      personaId?: string,
    ): Promise<Conversation>;
  }>;

const contextLimits = {
  maxMessages: 50,
  maxCharacters: 12000,
} as const;

type BrowserChatServiceOptions = Readonly<{
  testDouble?: ChatTestDoubleMode;
  repositories?: IndexedDbRepositories;
  storage?: Storage;
}>;

type ConfiguredProvider = Readonly<{
  configuration: ProviderConfiguration;
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

function readCredential(
  storage: Storage,
  reference: CredentialReference,
): string | null {
  try {
    return storage.getItem(credentialStorageKey(reference));
  } catch {
    return null;
  }
}

function providerLabel(configuredProvider: ConfiguredProvider): string {
  return `${configuredProvider.configuration.providerId} · ${configuredProvider.model}`;
}

function selectSendableProvider(
  snapshot: ProviderSettingsSnapshot,
  storage: Storage,
): ConfiguredProvider | undefined {
  for (const configuration of snapshot.settings.providers) {
    if (
      !configuration.enabled ||
      configuration.selectedModelId === undefined ||
      configuration.baseUrl === undefined ||
      snapshot.credentialStatus[configuration.id] !== true
    ) {
      continue;
    }

    const credential = readCredential(storage, {
      configurationId: configuration.id,
      providerId: configuration.providerId,
    });

    if (credential === null) {
      continue;
    }

    try {
      return {
        configuration,
        model: configuration.selectedModelId,
        provider: new OpenAiCompatibleProvider({
          id: configuration.providerId,
          baseUrl: configuration.baseUrl,
          credential,
        }),
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

function chatMessages(
  character: Character,
  messages: readonly Message[],
  memoryContext: ChatMessage | undefined,
): ChatMessage[] {
  return [
    { role: "system", content: character.systemPrompt },
    ...(memoryContext === undefined ? [] : [memoryContext]),
    ...messages.map(({ role, content }) => ({ role, content })),
  ];
}

export class BrowserChatService implements PersonaAwareChatAdapter {
  readonly #characterService: CharacterApplicationService;
  readonly #personaService: PersonaApplicationService;
  readonly #conversationService: ConversationApplicationService;
  readonly #contextAssembler = createConversationContextAssembler();
  readonly #providerSettings: ProviderSettingsService;
  readonly #memorySettings: MemorySettingsService;
  readonly #memories: IndexedDbRepositories["memories"];
  readonly #conversations: IndexedDbRepositories["conversations"];
  readonly #storage: Storage;
  readonly #testDouble: ChatTestDoubleMode | undefined;

  public constructor(options: BrowserChatServiceOptions = {}) {
    const repositories = options.repositories ?? createIndexedDbRepositories();
    this.#characterService = createCharacterApplicationService(
      repositories.characters,
      repositories.characterMemoryDeletion,
    );
    this.#personaService = createPersonaApplicationService(
      repositories.personas,
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
    this.#memorySettings = new MemorySettingsService(repositories.settings);
    this.#memories = repositories.memories;
    this.#storage = options.storage ?? window.localStorage;
    this.#testDouble = options.testDouble;
  }

  public async load(): Promise<BrowserChatSnapshot> {
    const [charactersResult, personasResult, conversations, providerLabel] =
      await Promise.all([
        this.#characterService.list(),
        this.#personaService.list(),
        this.#conversations.list(),
        this.#loadProviderLabel(),
      ]);

    if (!charactersResult.ok) {
      throw getCharacterLoadError();
    }

    if (!personasResult.ok) {
      throw getPersonaLoadError();
    }

    return {
      characters: charactersResult.data,
      conversations: sortConversations(conversations),
      personas: personasResult.data,
      providerLabel,
    };
  }

  public async createConversation(
    characterId: string,
    personaId?: string,
  ): Promise<Conversation> {
    const result = await this.#conversationService.create({
      characterId,
      personaId,
    });
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
      const memoryContext = await this.#memoryContext(input.character.id);
      const request: ChatRequest = {
        model: configuredProvider.model,
        messages: chatMessages(
          input.character,
          contextResult.data.messages,
          memoryContext,
        ),
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

    const configuredProvider = selectSendableProvider(
      result.data,
      this.#storage,
    );

    return configuredProvider === undefined
      ? "Provider unavailable"
      : providerLabel(configuredProvider);
  }

  async #providerForMessage(): Promise<ConfiguredProvider> {
    if (this.#testDouble !== undefined) {
      return {
        configuration: {
          id: "local-test",
          providerId: "local-test-provider",
          enabled: true,
        },
        model: "local-test-model",
        provider: createDeterministicTestProvider(this.#testDouble),
      };
    }

    const result = await this.#providerSettings.load();
    if (!result.ok) {
      throw new ChatAdapterError(result.error.message);
    }

    const configuredProvider = selectSendableProvider(
      result.data,
      this.#storage,
    );

    if (configuredProvider === undefined) {
      throw new ChatAdapterError(
        "Configure an enabled provider with a base URL, selected model, and saved credential before sending a message.",
      );
    }

    return configuredProvider;
  }

  async #memoryContext(characterId: string): Promise<ChatMessage | undefined> {
    const settings = await this.#memorySettings.load();
    if (!settings.ok) {
      throw new ChatAdapterError(settings.error.message);
    }
    if (!settings.data.memoryContextEnabled) {
      return undefined;
    }

    return createMemoryContextMessage(await this.#memories.list(), characterId);
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

function getPersonaLoadError(): ChatAdapterError {
  return new ChatAdapterError("Saved personas could not be loaded.");
}

export function createBrowserChatService(
  options: BrowserChatServiceOptions = {},
): BrowserChatService {
  return new BrowserChatService(options);
}
