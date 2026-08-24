import { WebStorageCredentialStore } from "@/infrastructure/credentials/web-storage-credential-store";
import {
  OpenRouterProvider,
  openRouterBaseUrl,
  openRouterProviderId,
} from "@/infrastructure/providers/openai-compatible/openrouter-provider";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";
import { ProviderModelDiscoveryService } from "@/application/providers/provider-model-discovery";
import { ProviderSettingsService } from "@/application/providers/provider-settings";

export const openRouterConfigurationDefaults = {
  providerId: openRouterProviderId,
  baseUrl: openRouterBaseUrl,
} as const;

export function createBrowserProviderSettingsService(): ProviderSettingsService {
  const repositories = createIndexedDbRepositories();

  return new ProviderSettingsService(
    repositories.settings,
    new WebStorageCredentialStore(window.localStorage),
  );
}

export function createBrowserProviderModelDiscoveryService(): ProviderModelDiscoveryService {
  return new ProviderModelDiscoveryService(new OpenRouterProvider());
}
