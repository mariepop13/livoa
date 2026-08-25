import { describe, expect, it, vi } from "vitest";

import {
  OpenRouterOAuthClient,
  openRouterOAuthAuthorizationEndpoint,
  openRouterOAuthCallbackUrl,
  openRouterOAuthExchangeEndpoint,
  type OpenRouterOAuthCrypto,
} from "./openrouter-oauth-client";

const deterministicVerifier = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const deterministicState = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8";
const deterministicChallenge = "6oZqdX5MOLq_qBJ8vppAnT4fk6AP8UiP9zX8-Rev_9A";

function deterministicCrypto(): OpenRouterOAuthCrypto {
  let randomCall = 0;

  return {
    async digestSha256(): Promise<ArrayBuffer> {
      return Uint8Array.from([
        234, 134, 106, 117, 126, 76, 56, 186, 191, 168, 18, 124, 190, 154, 64,
        157, 62, 31, 147, 160, 15, 241, 72, 143, 247, 53, 252, 249, 23, 175,
        255, 208,
      ]).buffer;
    },
    randomBytes(length): Uint8Array {
      const offset = randomCall * length;
      randomCall += 1;
      return Uint8Array.from({ length }, (_, index) => index + offset);
    },
  };
}

describe("OpenRouterOAuthClient", () => {
  it("creates a deterministic WebCrypto S256 authorization request", async () => {
    const client = new OpenRouterOAuthClient({
      crypto: deterministicCrypto(),
      fetcher: vi.fn(),
    });

    const result = await client.createAuthorizationRequest();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected authorization request creation to succeed.");
    }

    const authorizationUrl = new URL(result.data.authorizationUrl);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      openRouterOAuthAuthorizationEndpoint,
    );
    expect(authorizationUrl.searchParams.get("callback_url")).toBe(
      openRouterOAuthCallbackUrl,
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      deterministicChallenge,
    );
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(authorizationUrl.searchParams.get("state")).toBe(deterministicState);
    expect(result.data.codeVerifier).toBe(deterministicVerifier);
  });

  it("posts the authorization code and verifier to the fixed HTTPS exchange endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ key: "oauth-api-key", user_id: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new OpenRouterOAuthClient({
      crypto: deterministicCrypto(),
      fetcher,
    });

    const result = await client.exchangeAuthorizationCode({
      code: "authorization-code",
      codeVerifier: deterministicVerifier,
    });

    expect(result).toEqual({ ok: true, data: "oauth-api-key" });
    expect(fetcher).toHaveBeenCalledWith(openRouterOAuthExchangeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({
        code: "authorization-code",
        code_challenge_method: "S256",
        code_verifier: deterministicVerifier,
      }),
    });
  });

  it("rejects malformed successful responses and provider failures safely", async () => {
    const malformedClient = new OpenRouterOAuthClient({
      crypto: deterministicCrypto(),
      fetcher: async () =>
        new Response(JSON.stringify({ key: "" }), { status: 200 }),
    });
    const rejectedClient = new OpenRouterOAuthClient({
      crypto: deterministicCrypto(),
      fetcher: async () =>
        new Response("provider-secret-detail", { status: 403 }),
    });

    await expect(
      malformedClient.exchangeAuthorizationCode({
        code: "authorization-code",
        codeVerifier: deterministicVerifier,
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "invalid_response" },
    });
    await expect(
      rejectedClient.exchangeAuthorizationCode({
        code: "authorization-code",
        codeVerifier: deterministicVerifier,
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "provider_rejected" },
    });
  });
});
