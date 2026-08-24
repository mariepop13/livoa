import type { AiModel, AiProvider } from "@/domain/ports";
import {
  failure,
  normalizeProviderError,
  success,
  type ApplicationResult,
} from "@/application/error";

export type ProviderModelDiscoveryResult = ApplicationResult<
  readonly AiModel[]
>;

function compareModelText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export class ProviderModelDiscoveryService {
  readonly #provider: AiProvider;

  public constructor(provider: AiProvider) {
    this.#provider = provider;
  }

  public async discover(): Promise<ProviderModelDiscoveryResult> {
    try {
      const models = await this.#provider.listModels();

      return success(
        [...models].sort(
          (left, right) =>
            compareModelText(left.displayName, right.displayName) ||
            compareModelText(left.id, right.id),
        ),
      );
    } catch (error: unknown) {
      return failure(normalizeProviderError(error));
    }
  }
}
