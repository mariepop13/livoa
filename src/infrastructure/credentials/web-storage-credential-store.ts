import { z } from "zod";

import type { CredentialReference, CredentialStore } from "@/domain/ports";

const encodableIdSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      encodeURIComponent(value);
      return true;
    } catch {
      return false;
    }
  });

const credentialReferenceSchema = z.object({
  configurationId: encodableIdSchema,
  providerId: encodableIdSchema,
});
const credentialSchema = z.string().min(1);
const credentialStoragePrefix = "livoa:credentials:v2:configuration:";
const legacyCredentialStoragePrefix = "livoa:credentials:v1:";

type CredentialStoreErrorCode =
  | "invalid_provider_id"
  | "invalid_configuration_id"
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

  public async has(reference: CredentialReference): Promise<boolean> {
    const storageKey = credentialStorageKey(reference);

    try {
      return this.#storage.getItem(storageKey) !== null;
    } catch {
      throw new CredentialStoreError("storage_read_failed");
    }
  }

  public async save(
    reference: CredentialReference,
    credential: string,
  ): Promise<void> {
    const storageKey = credentialStorageKey(reference);
    const legacyStorageKey = legacyCredentialStorageKey(reference);
    const parsedCredential = credentialSchema.safeParse(credential);

    if (!parsedCredential.success) {
      throw new CredentialStoreError("invalid_credential");
    }

    try {
      this.#storage.setItem(storageKey, parsedCredential.data);
      this.#storage.removeItem(legacyStorageKey);
    } catch {
      throw new CredentialStoreError("storage_write_failed");
    }
  }

  public async remove(reference: CredentialReference): Promise<void> {
    const storageKey = credentialStorageKey(reference);

    try {
      this.#storage.removeItem(storageKey);
    } catch {
      throw new CredentialStoreError("storage_remove_failed");
    }
  }

  public async hasLegacy(reference: CredentialReference): Promise<boolean> {
    const storageKey = legacyCredentialStorageKey(reference);

    try {
      return this.#storage.getItem(storageKey) !== null;
    } catch {
      throw new CredentialStoreError("storage_read_failed");
    }
  }

  public async migrateLegacy(reference: CredentialReference): Promise<boolean> {
    const storageKey = credentialStorageKey(reference);
    const legacyStorageKey = legacyCredentialStorageKey(reference);

    try {
      if (this.#storage.getItem(storageKey) !== null) {
        this.#storage.removeItem(legacyStorageKey);
        return false;
      }

      const legacyCredential = this.#storage.getItem(legacyStorageKey);

      if (legacyCredential === null) {
        return false;
      }

      this.#storage.setItem(storageKey, legacyCredential);
      this.#storage.removeItem(legacyStorageKey);
      return true;
    } catch {
      throw new CredentialStoreError("storage_write_failed");
    }
  }
}

function parseCredentialReference(
  reference: CredentialReference,
): CredentialReference {
  const parsedReference = credentialReferenceSchema.safeParse(reference);

  if (!parsedReference.success) {
    const invalidField = parsedReference.error.issues[0]?.path[0];

    throw new CredentialStoreError(
      invalidField === "configurationId"
        ? "invalid_configuration_id"
        : "invalid_provider_id",
    );
  }

  return parsedReference.data;
}

export function credentialStorageKey(reference: CredentialReference): string {
  const parsedReference = parseCredentialReference(reference);

  try {
    return `${credentialStoragePrefix}${encodeURIComponent(parsedReference.configurationId)}`;
  } catch {
    throw new CredentialStoreError("invalid_configuration_id");
  }
}

function legacyCredentialStorageKey(reference: CredentialReference): string {
  const parsedReference = parseCredentialReference(reference);

  try {
    return `${legacyCredentialStoragePrefix}${encodeURIComponent(parsedReference.providerId)}`;
  } catch {
    throw new CredentialStoreError("invalid_provider_id");
  }
}
