import { describe, expect, it } from "vitest";

import type { AppSettings } from "@/domain/models";
import type {
  CredentialReference,
  CredentialStore,
  SettingsRepository,
} from "@/domain/ports";
import {
  ProviderSettingsService,
  isProviderSettingsValidationError,
} from "./provider-settings";

class MemorySettingsRepository implements SettingsRepository {
  public settings: AppSettings | null;
  public readonly savedSettings: AppSettings[] = [];

  public constructor(settings: AppSettings | null = null) {
    this.settings = settings;
  }

  public async get(): Promise<AppSettings | null> {
    return this.settings;
  }

  public async save(settings: AppSettings): Promise<void> {
    this.savedSettings.push(settings);
    this.settings = settings;
  }
}

class MemoryCredentialStore implements CredentialStore {
  public readonly credentials = new Map<string, string>();
  public readonly legacyCredentials = new Map<string, string>();
  public readonly savedCredentials: Array<
    readonly [CredentialReference, string]
  > = [];
  public readonly removedReferences: CredentialReference[] = [];
  public saveError: Error | undefined;

  public async has(reference: CredentialReference): Promise<boolean> {
    return this.credentials.has(reference.configurationId);
  }

  public async save(
    reference: CredentialReference,
    credential: string,
  ): Promise<void> {
    if (this.saveError !== undefined) {
      throw this.saveError;
    }

    this.savedCredentials.push([reference, credential]);
    this.credentials.set(reference.configurationId, credential);
    this.legacyCredentials.delete(reference.providerId);
  }

  public async remove(reference: CredentialReference): Promise<void> {
    this.removedReferences.push(reference);
    this.credentials.delete(reference.configurationId);
  }

  public async hasLegacy(reference: CredentialReference): Promise<boolean> {
    return this.legacyCredentials.has(reference.providerId);
  }

  public async migrateLegacy(reference: CredentialReference): Promise<boolean> {
    if (this.credentials.has(reference.configurationId)) {
      this.legacyCredentials.delete(reference.providerId);
      return false;
    }

    const credential = this.legacyCredentials.get(reference.providerId);

    if (credential === undefined) {
      return false;
    }

    this.credentials.set(reference.configurationId, credential);
    this.legacyCredentials.delete(reference.providerId);
    return true;
  }
}

const providerInput = {
  id: "openrouter-local",
  providerId: "openrouter-compatible",
  baseUrl: "https://openrouter.ai/api/v1",
  selectedModelId: "openai/gpt-4.1-mini",
  enabled: true,
  credential: "provider-secret-123",
};

describe("ProviderSettingsService", () => {
  it("validates configuration before touching either port and does not echo a secret", async () => {
    const settingsRepository = new MemorySettingsRepository();
    const credentialStore = new MemoryCredentialStore();
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );
    const secret = "secret-that-must-not-appear";

    const result = await service.save({
      ...providerInput,
      id: "",
      baseUrl: "file:///unsafe",
      credential: secret,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected validation to fail.");
    }

    expect(isProviderSettingsValidationError(result.error)).toBe(true);
    expect(result.error.message).not.toContain(secret);
    expect(settingsRepository.savedSettings).toHaveLength(0);
    expect(credentialStore.savedCredentials).toHaveLength(0);
  });

  it("persists provider settings through SettingsRepository and stores a credential separately", async () => {
    const settingsRepository = new MemorySettingsRepository();
    const credentialStore = new MemoryCredentialStore();
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.save(providerInput);

    expect(result.ok).toBe(true);
    expect(settingsRepository.settings).toEqual({
      theme: "system",
      providers: [
        {
          id: providerInput.id,
          providerId: providerInput.providerId,
          baseUrl: providerInput.baseUrl,
          selectedModelId: providerInput.selectedModelId,
          enabled: true,
        },
      ],
    });
    expect(JSON.stringify(settingsRepository.settings)).not.toContain(
      providerInput.credential,
    );
    expect(credentialStore.savedCredentials).toEqual([
      [
        {
          configurationId: providerInput.id,
          providerId: providerInput.providerId,
        },
        providerInput.credential,
      ],
    ]);
    if (!result.ok) {
      throw new Error("Expected provider settings to save.");
    }

    expect(result.data.credentialStatus).toEqual({
      [providerInput.id]: true,
    });
  });

  it("normalizes credential-store failures without exposing the submitted credential", async () => {
    const settingsRepository = new MemorySettingsRepository();
    const credentialStore = new MemoryCredentialStore();
    const secret = "credential-error-secret";
    credentialStore.saveError = new Error(`Storage rejected ${secret}`);
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.save({
      ...providerInput,
      credential: secret,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected credential storage to fail.");
    }

    expect(result.error.message).toBe("The credential could not be saved.");
    expect(result.error.message).not.toContain(secret);
  });

  it("does not read back a credential when editing an existing provider", async () => {
    const settingsRepository = new MemorySettingsRepository({
      theme: "system",
      providers: [
        {
          id: providerInput.id,
          providerId: providerInput.providerId,
          baseUrl: providerInput.baseUrl,
          selectedModelId: providerInput.selectedModelId,
          enabled: true,
        },
      ],
    });
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set(providerInput.id, providerInput.credential);
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.save({
      ...providerInput,
      selectedModelId: "openai/gpt-4.1-nano",
      credential: "",
    });

    expect(result.ok).toBe(true);
    expect(credentialStore.savedCredentials).toHaveLength(0);
    expect(credentialStore.credentials.get(providerInput.id)).toBe(
      providerInput.credential,
    );
    if (!result.ok) {
      throw new Error("Expected provider settings to save.");
    }

    expect(result.data.credentialStatus).toEqual({
      [providerInput.id]: true,
    });
  });

  it("removes a credential through the write-only credential port", async () => {
    const settingsRepository = new MemorySettingsRepository({
      theme: "system",
      providers: [
        {
          id: providerInput.id,
          providerId: providerInput.providerId,
          enabled: true,
        },
      ],
    });
    const credentialStore = new MemoryCredentialStore();
    credentialStore.credentials.set(providerInput.id, providerInput.credential);
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.removeCredential({
      configurationId: providerInput.id,
      providerId: providerInput.providerId,
    });

    expect(result.ok).toBe(true);
    expect(credentialStore.removedReferences).toEqual([
      {
        configurationId: providerInput.id,
        providerId: providerInput.providerId,
      },
    ]);
    expect(credentialStore.credentials.has(providerInput.id)).toBe(false);
    if (!result.ok) {
      throw new Error("Expected credential removal to succeed.");
    }

    expect(result.data.credentialStatus).toEqual({
      [providerInput.id]: false,
    });
  });

  it("migrates a legacy credential when only one configuration uses the provider", async () => {
    const settingsRepository = new MemorySettingsRepository({
      theme: "system",
      providers: [
        {
          id: providerInput.id,
          providerId: providerInput.providerId,
          enabled: true,
        },
      ],
    });
    const credentialStore = new MemoryCredentialStore();
    credentialStore.legacyCredentials.set(
      providerInput.providerId,
      providerInput.credential,
    );
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.load();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected credential migration to succeed.");
    }
    expect(result.data.credentialStatus).toEqual({
      [providerInput.id]: true,
    });
    expect(result.data.legacyCredentialProviderIds).toEqual([]);
  });

  it("does not assign a shared legacy credential across configurations", async () => {
    const secondConfigurationId = "openrouter-secondary";
    const settingsRepository = new MemorySettingsRepository({
      theme: "system",
      providers: [
        {
          id: providerInput.id,
          providerId: providerInput.providerId,
          enabled: true,
        },
        {
          id: secondConfigurationId,
          providerId: providerInput.providerId,
          enabled: true,
        },
      ],
    });
    const credentialStore = new MemoryCredentialStore();
    credentialStore.legacyCredentials.set(
      providerInput.providerId,
      providerInput.credential,
    );
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.load();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected credential state to load.");
    }
    expect(result.data.credentialStatus).toEqual({
      [providerInput.id]: false,
      [secondConfigurationId]: false,
    });
    expect(result.data.legacyCredentialProviderIds).toEqual([
      providerInput.providerId,
    ]);
  });

  it("reassigns a shared legacy credential only when one configuration is saved", async () => {
    const secondConfigurationId = "openrouter-secondary";
    const settingsRepository = new MemorySettingsRepository({
      theme: "system",
      providers: [
        {
          id: providerInput.id,
          providerId: providerInput.providerId,
          enabled: true,
        },
        {
          id: secondConfigurationId,
          providerId: providerInput.providerId,
          enabled: true,
        },
      ],
    });
    const credentialStore = new MemoryCredentialStore();
    credentialStore.legacyCredentials.set(
      providerInput.providerId,
      "legacy-secret",
    );
    const service = new ProviderSettingsService(
      settingsRepository,
      credentialStore,
    );

    const result = await service.save({
      ...providerInput,
      id: secondConfigurationId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected credential reassignment to succeed.");
    }
    expect(result.data.credentialStatus).toEqual({
      [providerInput.id]: false,
      [secondConfigurationId]: true,
    });
    expect(result.data.legacyCredentialProviderIds).toEqual([]);
    expect(
      credentialStore.legacyCredentials.has(providerInput.providerId),
    ).toBe(false);
  });
});
