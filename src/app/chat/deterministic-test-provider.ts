import type {
  AiModel,
  AiProvider,
  ChatChunk,
  ChatRequest,
} from "@/domain/ports";
import { OpenAiCompatibleProviderError } from "@/infrastructure/providers/openai-compatible/openai-compatible-provider";

import type { ChatTestDoubleMode } from "./chat-adapter";

export function createDeterministicTestProvider(
  mode: ChatTestDoubleMode,
): AiProvider {
  return new DeterministicStreamingProvider(mode);
}

class DeterministicStreamingProvider implements AiProvider {
  public readonly id = "local-test-provider";

  readonly #mode: ChatTestDoubleMode;

  public constructor(mode: ChatTestDoubleMode) {
    this.#mode = mode;
  }

  public async listModels(): Promise<AiModel[]> {
    return [
      {
        id: "local-test-model",
        displayName: "Local test model",
        providerId: this.id,
      },
    ];
  }

  public async *streamChat(
    request: ChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    void request;

    if (this.#mode === "error") {
      throw new OpenAiCompatibleProviderError("network");
    }

    const chunks = ["A local response", " is arriving in safe chunks."];
    const delay = this.#mode === "slow" ? 900 : 140;

    for (const chunk of chunks) {
      await wait(delay, signal);
      signal?.throwIfAborted();
      yield { type: "text", content: chunk };
    }

    yield { type: "done" };
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    return Promise.reject(signal.reason);
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      reject(signal?.reason);
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
