import { describe, expect, it } from "vitest";

import {
  ApplicationError,
  type ApplicationResult,
  failure,
  normalizeApplicationError,
  normalizeCredentialError,
  normalizeProviderError,
  normalizeStorageError,
  success,
} from "./error";

describe("ApplicationError", () => {
  it("represents typed success and expected failure outcomes", () => {
    const successfulResult: ApplicationResult<string> = success("saved");
    const failedResult = failure(
      new ApplicationError("STORAGE_ERROR", "Local data could not be saved."),
    );

    expect(successfulResult).toEqual({ ok: true, data: "saved" });
    expect(failedResult).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "STORAGE_ERROR",
        message: "Local data could not be saved.",
      }),
    });
  });

  it.each([
    ["authentication", "PROVIDER_AUTHENTICATION_ERROR", false],
    ["network", "PROVIDER_NETWORK_ERROR", true],
    ["rate_limit", "PROVIDER_RATE_LIMIT_ERROR", true],
    ["invalid_response", "PROVIDER_INVALID_RESPONSE_ERROR", false],
    ["unknown", "PROVIDER_ERROR", false],
  ] as const)(
    "normalizes provider %s failures with a safe message",
    (providerCode, applicationCode, retryable) => {
      const secret = "Bearer provider-secret-123";
      const error = normalizeProviderError({
        code: providerCode,
        message: `External response includes ${secret}`,
        retryable: true,
      });

      expect(error).toBeInstanceOf(ApplicationError);
      expect(error.code).toBe(applicationCode);
      expect(error.retryable).toBe(retryable);
      expect(error.message).not.toContain(secret);
      expect(error.message).not.toContain("External response");
    },
  );

  it("maps an unknown provider failure without exposing its details", () => {
    const rawError = new Error(
      "Bearer super-secret-token at C:\\private\\provider-response.json",
    );

    const error = normalizeProviderError(rawError);

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toBe("The provider request failed.");
    expect(error.message).not.toContain("super-secret-token");
    expect(error.message).not.toContain("C:\\private");
  });

  it("maps storage and credential failures to fixed safe messages", () => {
    const rawError = new Error(
      "IndexedDB path C:\\private\\livoa.db contains credential=top-secret",
    );

    const storageError = normalizeStorageError(rawError, "write");
    const credentialError = normalizeCredentialError(rawError, "save");

    expect(storageError).toMatchObject({
      code: "STORAGE_ERROR",
      message: "Local data could not be saved.",
    });
    expect(credentialError).toMatchObject({
      code: "CREDENTIALS_ERROR",
      message: "The credential could not be saved.",
    });
    expect(storageError.message).not.toContain("top-secret");
    expect(storageError.message).not.toContain("C:\\private");
    expect(credentialError.message).not.toContain("top-secret");
    expect(credentialError.message).not.toContain("C:\\private");
  });

  it("normalizes errors according to the declared boundary", () => {
    const providerError = normalizeApplicationError(
      {
        code: "network",
        message: "raw provider response",
        retryable: false,
      },
      { kind: "provider" },
    );
    const storageError = normalizeApplicationError(
      new Error("raw storage details"),
      { kind: "storage", operation: "read" },
    );

    expect(providerError.code).toBe("PROVIDER_NETWORK_ERROR");
    expect(storageError.code).toBe("STORAGE_ERROR");
    expect(providerError.message).toBe("The provider could not be reached.");
    expect(storageError.message).toBe("Local data could not be read.");
  });
});
