import { beforeEach, describe, expect, it } from "vitest";

import {
  CredentialStoreError,
  WebStorageCredentialStore,
} from "./web-storage-credential-store";

const providerId = "openai-compatible";
const credential = "test-provider-key";

describe("WebStorageCredentialStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves a credential and reports only whether it exists", async () => {
    const store = new WebStorageCredentialStore(localStorage);

    const saveResult = await store.save(providerId, credential);
    const hasResult = await store.has(providerId);

    expect(saveResult).toBeUndefined();
    expect(hasResult).toBe(true);
    expect(hasResult).not.toBe(credential);
  });

  it("removes a saved credential without returning it", async () => {
    const store = new WebStorageCredentialStore(localStorage);
    await store.save(providerId, credential);

    const removeResult = await store.remove(providerId);

    expect(removeResult).toBeUndefined();
    await expect(store.has(providerId)).resolves.toBe(false);
  });

  it("does not expose a credential-reading method", () => {
    const store = new WebStorageCredentialStore(localStorage);
    const publicMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(store) as object,
    );

    expect(publicMethods).toEqual(["constructor", "has", "save", "remove"]);
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
      .save(providerId, credential)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CredentialStoreError);
    expect(error).toMatchObject({ code: "storage_write_failed" });
    expect(String(error)).not.toContain(credential);
  });

  it("rejects invalid input without echoing it", async () => {
    const store = new WebStorageCredentialStore(localStorage);

    await expect(store.has("")).rejects.toMatchObject({
      code: "invalid_provider_id",
    });
    await expect(store.has("\uD800")).rejects.toMatchObject({
      code: "invalid_provider_id",
    });
    await expect(store.save(providerId, "")).rejects.toMatchObject({
      code: "invalid_credential",
    });
  });
});
