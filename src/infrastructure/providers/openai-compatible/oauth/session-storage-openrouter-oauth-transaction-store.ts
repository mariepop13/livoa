import { z } from "zod";

import type {
  OpenRouterOAuthTransaction,
  OpenRouterOAuthTransactionStore,
} from "@/application/providers/oauth/openrouter-oauth";

const transactionSchema = z.object({
  codeVerifier: z.string().min(43).max(128),
  reference: z.object({
    configurationId: z.string().trim().min(1),
    providerId: z.string().trim().min(1),
  }),
  state: z.string().min(1),
});

const transactionStorageKey = "livoa:openrouter-oauth:v1:transaction";

export class OpenRouterOAuthTransactionStoreError extends Error {
  public constructor() {
    super("OpenRouter OAuth transaction storage failed.");
    this.name = "OpenRouterOAuthTransactionStoreError";
  }
}

export class SessionStorageOpenRouterOAuthTransactionStore implements OpenRouterOAuthTransactionStore {
  readonly #storage: Storage;

  public constructor(storage: Storage) {
    this.#storage = storage;
  }

  public clear(): void {
    try {
      this.#storage.removeItem(transactionStorageKey);
    } catch {
      throw new OpenRouterOAuthTransactionStoreError();
    }
  }

  public load(): OpenRouterOAuthTransaction | null {
    let serializedTransaction: string | null;

    try {
      serializedTransaction = this.#storage.getItem(transactionStorageKey);
    } catch {
      throw new OpenRouterOAuthTransactionStoreError();
    }

    if (serializedTransaction === null) {
      return null;
    }

    let rawTransaction: unknown;

    try {
      rawTransaction = JSON.parse(serializedTransaction);
    } catch {
      this.clear();
      return null;
    }

    const parsedTransaction = transactionSchema.safeParse(rawTransaction);

    if (!parsedTransaction.success) {
      this.clear();
      return null;
    }

    return parsedTransaction.data;
  }

  public save(transaction: OpenRouterOAuthTransaction): void {
    const parsedTransaction = transactionSchema.safeParse(transaction);

    if (!parsedTransaction.success) {
      throw new OpenRouterOAuthTransactionStoreError();
    }

    try {
      this.#storage.setItem(
        transactionStorageKey,
        JSON.stringify(parsedTransaction.data),
      );
    } catch {
      throw new OpenRouterOAuthTransactionStoreError();
    }
  }
}
