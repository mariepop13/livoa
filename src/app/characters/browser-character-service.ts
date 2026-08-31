import {
  createCharacterApplicationService,
  createCharacterCardApplicationService,
  type CharacterApplicationService,
  type CharacterCardApplicationService,
} from "@/application/characters";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";

export type BrowserCharacterService = CharacterApplicationService &
  CharacterCardApplicationService;

export function createBrowserCharacterService(): BrowserCharacterService {
  const repositories = createIndexedDbRepositories();

  return {
    ...createCharacterApplicationService(
      repositories.characters,
      repositories.characterMemoryDeletion,
    ),
    ...createCharacterCardApplicationService(
      repositories.characters,
      repositories.characterCards,
      repositories.characterCardImports,
    ),
  };
}
