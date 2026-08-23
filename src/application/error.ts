import type { ProviderError } from "../domain/ports";

const providerErrorCodes = [
  "authentication",
  "network",
  "rate_limit",
  "invalid_response",
  "unknown",
] as const;

type ProviderErrorCode = (typeof providerErrorCodes)[number];

export type ApplicationErrorCode =
  | "STORAGE_ERROR"
  | "CREDENTIALS_ERROR"
  | "PROVIDER_AUTHENTICATION_ERROR"
  | "PROVIDER_NETWORK_ERROR"
  | "PROVIDER_RATE_LIMIT_ERROR"
  | "PROVIDER_INVALID_RESPONSE_ERROR"
  | "PROVIDER_ERROR";

export type StorageOperation = "read" | "write" | "delete";
export type CredentialOperation = "has" | "save" | "remove";

export type ApplicationErrorBoundary =
  | { readonly kind: "storage"; readonly operation: StorageOperation }
  | { readonly kind: "credentials"; readonly operation: CredentialOperation }
  | { readonly kind: "provider" };

export type ApplicationErrorOptions = Readonly<{
  retryable?: boolean;
}>;

export class ApplicationError extends Error {
  public readonly retryable: boolean;

  public constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    options: ApplicationErrorOptions = {},
  ) {
    super(message);
    this.name = "ApplicationError";
    this.retryable = options.retryable ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type ApplicationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApplicationError };

export function success<T>(data: T): ApplicationResult<T> {
  return { ok: true, data };
}

export function failure(error: ApplicationError): ApplicationResult<never> {
  return { ok: false, error };
}

const providerErrorDefinitions = {
  authentication: {
    code: "PROVIDER_AUTHENTICATION_ERROR",
    message: "The provider rejected the configured credentials.",
    retryable: false,
  },
  network: {
    code: "PROVIDER_NETWORK_ERROR",
    message: "The provider could not be reached.",
    retryable: true,
  },
  rate_limit: {
    code: "PROVIDER_RATE_LIMIT_ERROR",
    message: "The provider rate limit was reached.",
    retryable: true,
  },
  invalid_response: {
    code: "PROVIDER_INVALID_RESPONSE_ERROR",
    message: "The provider returned an invalid response.",
    retryable: false,
  },
  unknown: {
    code: "PROVIDER_ERROR",
    message: "The provider request failed.",
    retryable: false,
  },
} as const satisfies Record<
  ProviderErrorCode,
  { code: ApplicationErrorCode; message: string; retryable: boolean }
>;

const storageMessages = {
  read: "Local data could not be read.",
  write: "Local data could not be saved.",
  delete: "Local data could not be deleted.",
} as const satisfies Record<StorageOperation, string>;

const credentialMessages = {
  has: "The credential state could not be checked.",
  save: "The credential could not be saved.",
  remove: "The credential could not be removed.",
} as const satisfies Record<CredentialOperation, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProviderErrorCode(value: unknown): value is ProviderErrorCode {
  return providerErrorCodes.some((code) => code === value);
}

function isProviderError(value: unknown): value is ProviderError {
  return (
    isRecord(value) &&
    isProviderErrorCode(value.code) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean"
  );
}

export function normalizeStorageError(
  error: unknown,
  operation: StorageOperation,
): ApplicationError {
  void error;
  return new ApplicationError("STORAGE_ERROR", storageMessages[operation]);
}

export function normalizeCredentialError(
  error: unknown,
  operation: CredentialOperation,
): ApplicationError {
  void error;
  return new ApplicationError(
    "CREDENTIALS_ERROR",
    credentialMessages[operation],
  );
}

export function normalizeProviderError(error: unknown): ApplicationError {
  const definition = isProviderError(error)
    ? providerErrorDefinitions[error.code]
    : providerErrorDefinitions.unknown;

  return new ApplicationError(definition.code, definition.message, {
    retryable: definition.retryable,
  });
}

export function normalizeApplicationError(
  error: unknown,
  boundary: ApplicationErrorBoundary,
): ApplicationError {
  switch (boundary.kind) {
    case "storage":
      return normalizeStorageError(error, boundary.operation);
    case "credentials":
      return normalizeCredentialError(error, boundary.operation);
    case "provider":
      return normalizeProviderError(error);
  }
}
