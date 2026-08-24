"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AiModel } from "@/domain/ports";
import type {
  ProviderModelDiscoveryResult,
  ProviderModelDiscoveryService,
} from "@/application/providers/provider-model-discovery";

export type ProviderModelDiscoveryState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly models: readonly AiModel[] }
  | {
      readonly status: "error";
      readonly message: string;
      readonly retryable: boolean;
    };

function stateFromResult(
  result: ProviderModelDiscoveryResult,
): ProviderModelDiscoveryState {
  return result.ok
    ? { status: "success", models: result.data }
    : {
        status: "error",
        message: result.error.message,
        retryable: result.error.retryable,
      };
}

export function useProviderModelDiscovery(
  service: ProviderModelDiscoveryService | undefined,
): Readonly<{
  state: ProviderModelDiscoveryState;
  refresh: () => Promise<void>;
}> {
  const requestId = useRef(0);
  const [state, setState] = useState<ProviderModelDiscoveryState>(() =>
    service === undefined ? { status: "idle" } : { status: "loading" },
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (service === undefined) {
      return;
    }

    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setState({ status: "loading" });

    const result = await service.discover();

    if (requestId.current !== currentRequestId) {
      return;
    }

    setState(stateFromResult(result));
  }, [service]);

  useEffect(() => {
    if (service === undefined) {
      return;
    }

    const activeService = service;
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    async function loadInitialModels(): Promise<void> {
      const result = await activeService.discover();

      if (requestId.current === currentRequestId) {
        setState(stateFromResult(result));
      }
    }

    void loadInitialModels();

    return () => {
      requestId.current += 1;
    };
  }, [service]);

  return { state, refresh };
}
