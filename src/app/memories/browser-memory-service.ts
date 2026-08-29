import {
  createMemoryApplicationService,
  type MemoryApplicationService,
} from "@/application/memories";
import {
  createCharacterApplicationService,
  type CharacterApplicationService,
} from "@/application/characters";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";

export type BrowserMemoryServices = Readonly<{
  characters: CharacterApplicationService;
  memories: MemoryApplicationService;
}>;

export function createBrowserMemoryServices(): BrowserMemoryServices {
  const repositories = createIndexedDbRepositories();

  return {
    characters: createCharacterApplicationService(
      repositories.characters,
      repositories.characterMemoryDeletion,
    ),
    memories: createMemoryApplicationService(
      repositories.memories,
      repositories.memoryCharacterWrite,
    ),
  };
}
