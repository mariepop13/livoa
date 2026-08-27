import { describe, expect, it } from "vitest";

import type { CredentialReference, CredentialStore } from "@/domain/ports";
import {
  OpenRouterOAuthService,
  type OpenRouterOAuthAuthorizationRequest,
  type OpenRouterOAuthGateway,
  type OpenRouterOAuthGatewayResult,
  type OpenRouterOAuthTransaction,
  type OpenRouterOAuthTransactionStore,
} from "./openrouter-oauth";

class MemoryCredentialStore implements CredentialStore {
  public readonly saved: Array<readonly [CredentialReference, string]> = [];

  public async has(): Promise<boolean> {
    return false;
  }

  public async save(
    reference: CredentialReference,
    credential: string,
  ): Promise<void> {
    this.saved.push([reference, credential]);
  }

  public async remove(): Promise<void> {}

  public async invalidateAll(): Promise<void> {}

  public async hasLegacy(): Promise<boolean> {
    return false;
  }

  public async migrateLegacy(): Promise<boolean> {
    return false;
  }
}

class MemoryTransactionStore implements OpenRouterOAuthTransactionStore {
  public transaction: OpenRouterOAuthTransaction | null = null;

  public clear(): void {
    this.transaction = null;
  }

  public load(): OpenRouterOAuthTransaction | null {
    return this.transaction;
  }

  public save(transaction: OpenRouterOAuthTransaction): void {
    this.transaction = transaction;
  }
}

class TestGateway implements OpenRouterOAuthGateway {
  public exchangeResult: OpenRouterOAuthGatewayResult<string> = {
    ok: true,
    data: "oauth-api-key",
  };
  public exchangedInput:
    Readonly<{ code: string; codeVerifier: string }> | undefined;

  public async createAuthorizationRequest(): Promise<
    OpenRouterOAuthGatewayResult<OpenRouterOAuthAuthorizationRequest>
  > {
    return {
      ok: true,
      data: {
        authorizationUrl:
          "https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A3000%2Fproviders",
        codeVerifier: "deterministic-verifier",
        state: "deterministic-state",
      },
    };
  }

  public async exchangeAuthorizationCode(input: {
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<OpenRouterOAuthGatewayResult<string>> {
    this.exchangedInput = input;
    return this.exchangeResult;
  }
}

function createFixture() {
  const credentialStore = new MemoryCredentialStore();
  const gateway = new TestGateway();
  const transactionStore = new MemoryTransactionStore();
  const service = new OpenRouterOAuthService(
    gateway,
    transactionStore,
    credentialStore,
  );

  return { credentialStore, gateway, service, transactionStore };
}

const reference = {
  configurationId: "openrouter-local",
  providerId: "openrouter",
};

describe("OpenRouterOAuthService", () => {
  it("stores a transaction, validates the callback, and saves only through CredentialStore", async () => {
    const { credentialStore, gateway, service, transactionStore } =
      createFixture();

    const beginResult = await service.begin(reference);
    expect(beginResult.ok).toBe(true);
    expect(transactionStore.transaction).toEqual({
      codeVerifier: "deterministic-verifier",
      reference,
      state: "deterministic-state",
    });

    const completeResult = await service.complete({
      code: ["authorization-code"],
      error: [],
      state: ["deterministic-state"],
    });

    expect(completeResult).toEqual({
      ok: true,
      data: { configurationId: "openrouter-local" },
    });
    expect(gateway.exchangedInput).toEqual({
      code: "authorization-code",
      codeVerifier: "deterministic-verifier",
    });
    expect(credentialStore.saved).toEqual([[reference, "oauth-api-key"]]);
    expect(transactionStore.transaction).toBeNull();
  });

  it("treats a matching access-denied callback as cancellation", async () => {
    const { credentialStore, gateway, service } = createFixture();
    await service.begin(reference);

    const result = await service.complete({
      code: [],
      error: ["access_denied"],
      state: ["deterministic-state"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(gateway.exchangedInput).toBeUndefined();
    expect(credentialStore.saved).toHaveLength(0);
  });

  it("rejects missing, duplicate, and mismatched callback values", async () => {
    const invalidCallbacks = [
      { code: ["code"], error: [], state: [] },
      { code: ["code", "duplicate"], error: [], state: ["state"] },
      { code: ["code"], error: [], state: ["wrong-state"] },
      { code: ["code"], error: [], state: [" deterministic-state "] },
    ];

    for (const callback of invalidCallbacks) {
      const { credentialStore, gateway, service } = createFixture();
      await service.begin(reference);

      const result = await service.complete(callback);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_callback" },
      });
      expect(gateway.exchangedInput).toBeUndefined();
      expect(credentialStore.saved).toHaveLength(0);
    }
  });

  it("returns a safe exchange failure without saving provider details", async () => {
    const { credentialStore, gateway, service } = createFixture();
    gateway.exchangeResult = {
      ok: false,
      error: { code: "provider_rejected" },
    };
    await service.begin(reference);

    const result = await service.complete({
      code: ["authorization-code"],
      error: [],
      state: ["deterministic-state"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "exchange_failed",
        message: "OpenRouter could not complete the connection. Start again.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider_rejected");
    expect(credentialStore.saved).toHaveLength(0);
  });
});
