import { WebStorageCredentialStore } from "@/infrastructure/credentials/web-storage-credential-store";
import { OpenRouterOAuthClient } from "@/infrastructure/providers/openai-compatible/oauth/openrouter-oauth-client";
import { SessionStorageOpenRouterOAuthTransactionStore } from "@/infrastructure/providers/openai-compatible/oauth/session-storage-openrouter-oauth-transaction-store";
import {
  OpenRouterProvider,
  openRouterBaseUrl,
  openRouterProviderId,
} from "@/infrastructure/providers/openai-compatible/openrouter-provider";
import { createIndexedDbRepositories } from "@/infrastructure/storage/indexeddb/repositories";
import { ProviderModelDiscoveryService } from "@/application/providers/provider-model-discovery";
import { ProviderSettingsService } from "@/application/providers/provider-settings";
import { OpenRouterOAuthService } from "@/application/providers/oauth/openrouter-oauth";

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

export function createBrowserOpenRouterOAuthService(): OpenRouterOAuthService {
  return new OpenRouterOAuthService(
    new OpenRouterOAuthClient(),
    new SessionStorageOpenRouterOAuthTransactionStore(window.sessionStorage),
    new WebStorageCredentialStore(window.localStorage),
  );
}
