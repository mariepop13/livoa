import { z } from "zod";

import type {
  OpenRouterOAuthAuthorizationRequest,
  OpenRouterOAuthGateway,
  OpenRouterOAuthGatewayResult,
} from "@/application/providers/oauth/openrouter-oauth";

export const openRouterOAuthAuthorizationEndpoint =
  "https://openrouter.ai/auth";
export const openRouterOAuthCallbackUrl = "http://localhost:3000/providers";
export const openRouterOAuthExchangeEndpoint =
  "https://openrouter.ai/api/v1/auth/keys";

const exchangeResponseSchema = z.object({
  key: z.string().min(1),
  user_id: z.string().nullable().optional(),
});

const exchangeInputSchema = z.object({
  code: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
  codeVerifier: z.string().min(43).max(128),
});

type Fetcher = typeof globalThis.fetch;

export type OpenRouterOAuthCrypto = Readonly<{
  digestSha256(input: Uint8Array): Promise<ArrayBuffer>;
  randomBytes(length: number): Uint8Array;
}>;

export type OpenRouterOAuthClientOptions = Readonly<{
  crypto?: OpenRouterOAuthCrypto;
  fetcher?: Fetcher;
}>;

function browserCrypto(): OpenRouterOAuthCrypto {
  return {
    digestSha256(input) {
      return globalThis.crypto.subtle.digest(
        "SHA-256",
        Uint8Array.from(input).buffer,
      );
    },
    randomBytes(length) {
      return globalThis.crypto.getRandomValues(new Uint8Array(length));
    },
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function createCodeChallenge(
  codeVerifier: string,
  cryptoProvider: OpenRouterOAuthCrypto,
): Promise<string> {
  const digest = await cryptoProvider.digestSha256(
    new TextEncoder().encode(codeVerifier),
  );

  return base64UrlEncode(new Uint8Array(digest));
}

export class OpenRouterOAuthClient implements OpenRouterOAuthGateway {
  readonly #crypto: OpenRouterOAuthCrypto;
  readonly #fetcher: Fetcher;

  public constructor(options: OpenRouterOAuthClientOptions = {}) {
    this.#crypto = options.crypto ?? browserCrypto();
    this.#fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  public async createAuthorizationRequest(): Promise<
    OpenRouterOAuthGatewayResult<OpenRouterOAuthAuthorizationRequest>
  > {
    try {
      const codeVerifier = base64UrlEncode(this.#crypto.randomBytes(32));
      const state = base64UrlEncode(this.#crypto.randomBytes(32));
      const codeChallenge = await createCodeChallenge(
        codeVerifier,
        this.#crypto,
      );
      const authorizationUrl = new URL(openRouterOAuthAuthorizationEndpoint);
      authorizationUrl.searchParams.set(
        "callback_url",
        openRouterOAuthCallbackUrl,
      );
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      authorizationUrl.searchParams.set("state", state);

      return {
        ok: true,
        data: {
          authorizationUrl: authorizationUrl.toString(),
          codeVerifier,
          state,
        },
      };
    } catch {
      return { ok: false, error: { code: "crypto_unavailable" } };
    }
  }

  public async exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<OpenRouterOAuthGatewayResult<string>> {
    const parsedInput = exchangeInputSchema.safeParse(input);

    if (!parsedInput.success) {
      return { ok: false, error: { code: "invalid_response" } };
    }

    let response: Response;

    try {
      response = await this.#fetcher(openRouterOAuthExchangeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({
          code: parsedInput.data.code,
          code_challenge_method: "S256",
          code_verifier: parsedInput.data.codeVerifier,
        }),
      });
    } catch {
      return { ok: false, error: { code: "network" } };
    }

    if (!response.ok) {
      return { ok: false, error: { code: "provider_rejected" } };
    }

    let rawResponse: unknown;

    try {
      rawResponse = await response.json();
    } catch {
      return { ok: false, error: { code: "invalid_response" } };
    }

    const parsedResponse = exchangeResponseSchema.safeParse(rawResponse);

    return parsedResponse.success
      ? { ok: true, data: parsedResponse.data.key }
      : { ok: false, error: { code: "invalid_response" } };
  }
}
