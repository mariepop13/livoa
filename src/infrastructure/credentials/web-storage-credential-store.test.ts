import { beforeEach, describe, expect, it } from "vitest";

import {
  CredentialStoreError,
  WebStorageCredentialStore,
} from "./web-storage-credential-store";

const providerId = "openai-compatible";
const reference = {
  configurationId: "primary-openrouter",
  providerId,
};
const credential = "test-provider-key";
const legacyStorageKey = `livoa:credentials:v1:${encodeURIComponent(providerId)}`;

describe("WebStorageCredentialStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves a credential and reports only whether it exists", async () => {
    const store = new WebStorageCredentialStore(localStorage);

    const saveResult = await store.save(reference, credential);
    const hasResult = await store.has(reference);

    expect(saveResult).toBeUndefined();
    expect(hasResult).toBe(true);
    expect(hasResult).not.toBe(credential);
  });

  it("removes a saved credential without returning it", async () => {
    const store = new WebStorageCredentialStore(localStorage);
    await store.save(reference, credential);

    const removeResult = await store.remove(reference);

    expect(removeResult).toBeUndefined();
    await expect(store.has(reference)).resolves.toBe(false);
  });

  it("isolates credentials for configurations using the same provider", async () => {
    const store = new WebStorageCredentialStore(localStorage);
    const secondReference = {
      configurationId: "secondary-openrouter",
      providerId,
    };

    await store.save(reference, credential);
    await store.save(secondReference, "second-test-provider-key");
    await store.remove(reference);

    await expect(store.has(reference)).resolves.toBe(false);
    await expect(store.has(secondReference)).resolves.toBe(true);
  });

  it("migrates a legacy provider credential without returning it", async () => {
    localStorage.setItem(legacyStorageKey, credential);
    const store = new WebStorageCredentialStore(localStorage);

    const migrationResult = await store.migrateLegacy(reference);

    expect(migrationResult).toBe(true);
    await expect(store.has(reference)).resolves.toBe(true);
    await expect(store.hasLegacy(reference)).resolves.toBe(false);
  });

  it("invalidates all managed credential storage without clearing unrelated data", async () => {
    const store = new WebStorageCredentialStore(localStorage);
    const secondReference = {
      configurationId: "secondary-openrouter",
      providerId,
    };
    await store.save(reference, credential);
    await store.save(secondReference, "second-test-provider-key");
    localStorage.setItem(legacyStorageKey, "legacy-test-provider-key");
    localStorage.setItem("livoa:preferences:theme", "dark");

    await store.invalidateAll();

    await expect(store.has(reference)).resolves.toBe(false);
    await expect(store.has(secondReference)).resolves.toBe(false);
    await expect(store.hasLegacy(reference)).resolves.toBe(false);
    expect(localStorage.getItem("livoa:preferences:theme")).toBe("dark");
  });

  it("does not expose a credential-reading method", () => {
    const store = new WebStorageCredentialStore(localStorage);
    const publicMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(store) as object,
    );

    expect(publicMethods).toEqual([
      "constructor",
      "has",
      "save",
      "remove",
      "invalidateAll",
      "hasLegacy",
      "migrateLegacy",
    ]);
  });

  it("keeps storage failures from exposing the submitted credential", async () => {
    const failingStorage = {
      ...localStorage,
      setItem: (_key: string, value: string): never => {
        throw new Error(`Storage rejected ${value}`);
      },
    } as Storage;
    const store = new WebStorageCredentialStore(failingStorage);

    const error = await store
      .save(reference, credential)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CredentialStoreError);
    expect(error).toMatchObject({ code: "storage_write_failed" });
    expect(String(error)).not.toContain(credential);
  });

  it("rejects invalid input without echoing it", async () => {
    const store = new WebStorageCredentialStore(localStorage);

    await expect(
      store.has({ ...reference, configurationId: "" }),
    ).rejects.toMatchObject({
      code: "invalid_configuration_id",
    });
    await expect(
      store.has({ ...reference, providerId: "\uD800" }),
    ).rejects.toMatchObject({
      code: "invalid_provider_id",
    });
    await expect(store.save(reference, "")).rejects.toMatchObject({
      code: "invalid_credential",
    });
  });
});
