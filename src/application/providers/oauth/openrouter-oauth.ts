import { z } from "zod";

import type { CredentialReference, CredentialStore } from "@/domain/ports";

const requiredTextSchema = z.string().trim().min(1);
const opaqueOAuthValueSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

const credentialReferenceSchema = z.object({
  configurationId: requiredTextSchema,
  providerId: requiredTextSchema,
});

const callbackValuesSchema = z
  .object({
    code: z.array(opaqueOAuthValueSchema).max(1),
    error: z.array(opaqueOAuthValueSchema).max(1),
    state: z.array(opaqueOAuthValueSchema).length(1),
  })
  .superRefine((callback, context) => {
    const outcomeCount = callback.code.length + callback.error.length;

    if (outcomeCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "The callback must contain exactly one outcome.",
      });
    }
  });

const secureAuthorizationUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" && url.username === "" && url.password === ""
  );
});

export type OpenRouterOAuthGatewayErrorCode =
  "crypto_unavailable" | "network" | "provider_rejected" | "invalid_response";

export type OpenRouterOAuthGatewayResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: Readonly<{ code: OpenRouterOAuthGatewayErrorCode }>;
    };

export type OpenRouterOAuthAuthorizationRequest = Readonly<{
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
}>;

export interface OpenRouterOAuthGateway {
  createAuthorizationRequest(): Promise<
    OpenRouterOAuthGatewayResult<OpenRouterOAuthAuthorizationRequest>
  >;
  exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<OpenRouterOAuthGatewayResult<string>>;
}

export type OpenRouterOAuthTransaction = Readonly<{
  codeVerifier: string;
  reference: CredentialReference;
  state: string;
}>;

export interface OpenRouterOAuthTransactionStore {
  clear(): void;
  load(): OpenRouterOAuthTransaction | null;
  save(transaction: OpenRouterOAuthTransaction): void;
}

export type OpenRouterOAuthErrorCode =
  | "invalid_request"
  | "authorization_unavailable"
  | "invalid_callback"
  | "cancelled"
  | "exchange_failed"
  | "credential_store_failed";

const errorMessages = {
  invalid_request: "Enter a configuration ID before connecting OpenRouter.",
  authorization_unavailable:
    "OpenRouter connection could not be started. Try again.",
  invalid_callback:
    "The OpenRouter callback was invalid. Start the connection again.",
  cancelled: "OpenRouter connection cancelled. No new credential was saved.",
  exchange_failed: "OpenRouter could not complete the connection. Start again.",
  credential_store_failed:
    "The OpenRouter credential could not be saved. Start again.",
} as const satisfies Record<OpenRouterOAuthErrorCode, string>;

export class OpenRouterOAuthError extends Error {
  public constructor(public readonly code: OpenRouterOAuthErrorCode) {
    super(errorMessages[code]);
    this.name = "OpenRouterOAuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type OpenRouterOAuthResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: OpenRouterOAuthError };

export type OpenRouterOAuthCallbackValues = Readonly<{
  code: readonly string[];
  error: readonly string[];
  state: readonly string[];
}>;

function success<T>(data: T): OpenRouterOAuthResult<T> {
  return { ok: true, data };
}

function failure(code: OpenRouterOAuthErrorCode): OpenRouterOAuthResult<never> {
  return { ok: false, error: new OpenRouterOAuthError(code) };
}

export class OpenRouterOAuthService {
  readonly #credentialStore: CredentialStore;
  readonly #gateway: OpenRouterOAuthGateway;
  readonly #transactionStore: OpenRouterOAuthTransactionStore;

  public constructor(
    gateway: OpenRouterOAuthGateway,
    transactionStore: OpenRouterOAuthTransactionStore,
    credentialStore: CredentialStore,
  ) {
    this.#gateway = gateway;
    this.#transactionStore = transactionStore;
    this.#credentialStore = credentialStore;
  }

  public async begin(
    reference: unknown,
  ): Promise<OpenRouterOAuthResult<{ readonly authorizationUrl: string }>> {
    const parsedReference = credentialReferenceSchema.safeParse(reference);

    if (!parsedReference.success) {
      return failure("invalid_request");
    }

    const request = await this.#gateway.createAuthorizationRequest();

    if (!request.ok) {
      return failure("authorization_unavailable");
    }

    const parsedAuthorizationUrl = secureAuthorizationUrlSchema.safeParse(
      request.data.authorizationUrl,
    );

    if (!parsedAuthorizationUrl.success) {
      return failure("authorization_unavailable");
    }

    try {
      this.#transactionStore.save({
        codeVerifier: request.data.codeVerifier,
        reference: parsedReference.data,
        state: request.data.state,
      });
    } catch {
      return failure("authorization_unavailable");
    }

    return success({ authorizationUrl: parsedAuthorizationUrl.data });
  }

  public async complete(
    callbackValues: unknown,
  ): Promise<OpenRouterOAuthResult<{ readonly configurationId: string }>> {
    const parsedCallback = callbackValuesSchema.safeParse(callbackValues);

    if (!parsedCallback.success) {
      this.#tryClearTransaction();
      return failure("invalid_callback");
    }

    let transaction: OpenRouterOAuthTransaction | null;

    try {
      transaction = this.#transactionStore.load();
    } catch {
      this.#tryClearTransaction();
      return failure("invalid_callback");
    }

    if (
      transaction === null ||
      parsedCallback.data.state[0] !== transaction.state
    ) {
      this.#tryClearTransaction();
      return failure("invalid_callback");
    }

    if (!this.#tryClearTransaction()) {
      return failure("invalid_callback");
    }

    if (parsedCallback.data.error[0] === "access_denied") {
      return failure("cancelled");
    }

    const code = parsedCallback.data.code[0];

    if (code === undefined) {
      return failure("invalid_callback");
    }

    const exchange = await this.#gateway.exchangeAuthorizationCode({
      code,
      codeVerifier: transaction.codeVerifier,
    });

    if (!exchange.ok) {
      return failure("exchange_failed");
    }

    try {
      await this.#credentialStore.save(transaction.reference, exchange.data);
    } catch {
      return failure("credential_store_failed");
    }

    return success({
      configurationId: transaction.reference.configurationId,
    });
  }

  #tryClearTransaction(): boolean {
    try {
      this.#transactionStore.clear();
      return true;
    } catch {
      return false;
    }
  }
}
