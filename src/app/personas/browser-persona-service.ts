import {
  createPersonaApplicationService,
  type PersonaApplicationService,
} from "@/application/personas";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";

export function createBrowserPersonaService(): PersonaApplicationService {
  const repositories = createIndexedDbRepositories();

  return createPersonaApplicationService(repositories.personas);
}
