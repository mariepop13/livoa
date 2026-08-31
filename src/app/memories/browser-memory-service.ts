import {
  createMemoryApplicationService,
  MemoryExtractionService,
  MemorySettingsService,
  type MemoryApplicationService,
  type MemoryExtractionResult,
} from "@/application/memories";
import {
  createCharacterApplicationService,
  type CharacterApplicationService,
} from "@/application/characters";
import {
  appSettingsSchema,
  type Conversation,
  type ProviderConfiguration,
} from "@/domain/models";
import type {
  MemoryExtractionProvider,
  SettingsRepository,
} from "@/domain/ports";
import { credentialStorageKey } from "@/infrastructure/credentials/web-storage-credential-store";
import { OpenAiCompatibleProvider } from "@/infrastructure/providers/openai-compatible/openai-compatible-provider";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";

export type BrowserMemoryServices = Readonly<{
  characters: CharacterApplicationService;
  memories: MemoryApplicationService;
  settings: MemorySettingsService;
  listConversations(): Promise<readonly Conversation[]>;
  extract(conversationId: string): Promise<MemoryExtractionResult>;
}>;

export function createBrowserMemoryServices(): BrowserMemoryServices {
  const repositories = createIndexedDbRepositories();
  const storage = window.localStorage;
  const settings = new MemorySettingsService(repositories.settings);

  return {
    characters: createCharacterApplicationService(
      repositories.characters,
      repositories.characterMemoryDeletion,
    ),
    memories: createMemoryApplicationService(
      repositories.memories,
      repositories.memoryCharacterWrite,
    ),
    settings,
    listConversations: () => repositories.conversations.list(),
    extract: async (conversationId) => {
      const provider = await selectExtractionProvider(
        repositories.settings,
        storage,
      );
      return new MemoryExtractionService(
        repositories.conversations,
        repositories.messages,
        settings,
        provider,
      ).extract({ conversationId, model: provider.model });
    },
  };
}

type SelectedExtractionProvider = MemoryExtractionProvider &
  Readonly<{ model: string }>;

async function selectExtractionProvider(
  repository: SettingsRepository,
  storage: Storage,
): Promise<SelectedExtractionProvider> {
  const settings = appSettingsSchema.parse(
    (await repository.get()) ?? { theme: "system", providers: [] },
  );
  const configuration = settings.providers.find(
    (candidate) =>
      candidate.enabled &&
      candidate.baseUrl !== undefined &&
      candidate.selectedModelId !== undefined &&
      storage.getItem(
        credentialStorageKey({
          configurationId: candidate.id,
          providerId: candidate.providerId,
        }),
      ) !== null,
  );
  if (configuration === undefined) {
    throw new Error(
      "Configure an enabled provider with a model and saved credential before extracting memories.",
    );
  }
  return createExtractionProvider(configuration, storage);
}

function createExtractionProvider(
  configuration: ProviderConfiguration,
  storage: Storage,
): SelectedExtractionProvider {
  const credential = storage.getItem(
    credentialStorageKey({
      configurationId: configuration.id,
      providerId: configuration.providerId,
    }),
  );
  if (
    credential === null ||
    configuration.baseUrl === undefined ||
    configuration.selectedModelId === undefined
  ) {
    throw new Error(
      "Configure an enabled provider with a model and saved credential before extracting memories.",
    );
  }
  const provider = new OpenAiCompatibleProvider({
    id: configuration.providerId,
    baseUrl: configuration.baseUrl,
    credential,
  });
  return {
    model: configuration.selectedModelId,
    extractMemories: (request) => provider.extractMemories(request),
  };
}
