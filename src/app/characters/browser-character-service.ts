import {
  createCharacterApplicationService,
  type CharacterApplicationService,
} from "@/application/characters";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";

export function createBrowserCharacterService(): CharacterApplicationService {
  const repositories = createIndexedDbRepositories();

  return createCharacterApplicationService(
    repositories.characters,
    repositories.characterMemoryDeletion,
  );
}
