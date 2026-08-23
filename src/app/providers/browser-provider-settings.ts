import { WebStorageCredentialStore } from "@/infrastructure/credentials/web-storage-credential-store";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";
import { ProviderSettingsService } from "@/application/providers/provider-settings";

export function createBrowserProviderSettingsService(): ProviderSettingsService {
  const repositories = createIndexedDbRepositories();

  return new ProviderSettingsService(
    repositories.settings,
    new WebStorageCredentialStore(window.localStorage),
  );
}
