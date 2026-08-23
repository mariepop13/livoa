import { z } from "zod";

import type { CredentialStore } from "@/domain/ports";

const providerIdSchema = z.string().min(1);
const credentialSchema = z.string().min(1);
const credentialStoragePrefix = "livoa:credentials:v1:";

type CredentialStoreErrorCode =
  | "invalid_provider_id"
  | "invalid_credential"
  | "storage_read_failed"
  | "storage_write_failed"
  | "storage_remove_failed";

export class CredentialStoreError extends Error {
  public constructor(public readonly code: CredentialStoreErrorCode) {
    super("Credential storage operation failed.");
    this.name = "CredentialStoreError";
  }
}

/**
 * Keeps credentials in a dedicated browser Web Storage namespace, separate from
 * provider configuration. Web Storage does not protect credentials from XSS,
 * malicious extensions, or device compromise.
 */
export class WebStorageCredentialStore implements CredentialStore {
  readonly #storage: Storage;

  public constructor(storage: Storage) {
    this.#storage = storage;
  }

  public async has(providerId: string): Promise<boolean> {
    const storageKey = this.#toStorageKey(providerId);

    try {
      return this.#storage.getItem(storageKey) !== null;
    } catch {
      throw new CredentialStoreError("storage_read_failed");
    }
  }

  public async save(providerId: string, credential: string): Promise<void> {
    const storageKey = this.#toStorageKey(providerId);
    const parsedCredential = credentialSchema.safeParse(credential);

    if (!parsedCredential.success) {
      throw new CredentialStoreError("invalid_credential");
    }

    try {
      this.#storage.setItem(storageKey, parsedCredential.data);
    } catch {
      throw new CredentialStoreError("storage_write_failed");
    }
  }

  public async remove(providerId: string): Promise<void> {
    const storageKey = this.#toStorageKey(providerId);

    try {
      this.#storage.removeItem(storageKey);
    } catch {
      throw new CredentialStoreError("storage_remove_failed");
    }
  }

  #toStorageKey(providerId: string): string {
    const parsedProviderId = providerIdSchema.safeParse(providerId);

    if (!parsedProviderId.success) {
      throw new CredentialStoreError("invalid_provider_id");
    }

    try {
      return `${credentialStoragePrefix}${encodeURIComponent(parsedProviderId.data)}`;
    } catch {
      throw new CredentialStoreError("invalid_provider_id");
    }
  }
}
