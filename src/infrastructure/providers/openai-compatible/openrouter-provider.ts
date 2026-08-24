import type {
  AiModel,
  AiProvider,
  ChatChunk,
  ChatRequest,
} from "@/domain/ports";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider";

export const openRouterProviderId = "openrouter";
export const openRouterBaseUrl = "https://openrouter.ai/api/v1";

type Fetcher = typeof globalThis.fetch;

export type OpenRouterProviderOptions = Readonly<{
  credential?: string;
  fetcher?: Fetcher;
}>;

export class OpenRouterProvider implements AiProvider {
  public readonly id = openRouterProviderId;

  readonly #delegate: OpenAiCompatibleProvider;

  public constructor(options: OpenRouterProviderOptions = {}) {
    this.#delegate = new OpenAiCompatibleProvider({
      id: this.id,
      baseUrl: openRouterBaseUrl,
      credential: options.credential,
      fetcher: options.fetcher,
    });
  }

  public listModels(): Promise<AiModel[]> {
    return this.#delegate.listModels();
  }

  public streamChat(
    request: ChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk> {
    return this.#delegate.streamChat(request, signal);
  }
}
