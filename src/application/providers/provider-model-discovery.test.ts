import { describe, expect, it } from "vitest";

import type {
  AiModel,
  AiProvider,
  ChatChunk,
  ChatRequest,
} from "@/domain/ports";
import { ProviderModelDiscoveryService } from "./provider-model-discovery";

class TestProviderError extends Error {
  public readonly code = "network" as const;
  public readonly retryable = true;
}

class ModelDiscoveryProvider implements AiProvider {
  public readonly id = "openrouter";

  public constructor(private readonly result: readonly AiModel[] | Error) {}

  public async listModels(): Promise<AiModel[]> {
    if (this.result instanceof Error) {
      throw this.result;
    }

    return [...this.result];
  }

  public async *streamChat(
    request: ChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    void request;
    void signal;
    yield { type: "done" };
  }
}

describe("ProviderModelDiscoveryService", () => {
  it("returns models in a stable accessible display-name order", async () => {
    const service = new ProviderModelDiscoveryService(
      new ModelDiscoveryProvider([
        { id: "model-z", displayName: "Zulu", providerId: "openrouter" },
        { id: "model-a", displayName: "Alpha", providerId: "openrouter" },
      ]),
    );

    await expect(service.discover()).resolves.toEqual({
      ok: true,
      data: [
        { id: "model-a", displayName: "Alpha", providerId: "openrouter" },
        { id: "model-z", displayName: "Zulu", providerId: "openrouter" },
      ],
    });
  });

  it("normalizes provider failures without exposing raw details", async () => {
    const service = new ProviderModelDiscoveryService(
      new ModelDiscoveryProvider(new TestProviderError()),
    );

    await expect(service.discover()).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "PROVIDER_NETWORK_ERROR",
        message: "The provider could not be reached.",
        retryable: true,
      }),
    });
  });
});
