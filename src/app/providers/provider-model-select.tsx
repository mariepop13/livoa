import type { ProviderModelDiscoveryState } from "./use-provider-model-discovery";

type ProviderModelSelectProps = Readonly<{
  error?: string;
  onChange: (modelId: string) => void;
  onRefresh: () => void;
  selectedModelId: string;
  state: ProviderModelDiscoveryState;
}>;

const selectClassName =
  "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-slate-100 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/15 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/15 disabled:cursor-not-allowed disabled:opacity-70";

const refreshButtonClassName =
  "mt-3 min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/20";

export default function ProviderModelSelect({
  error,
  onChange,
  onRefresh,
  selectedModelId,
  state,
}: ProviderModelSelectProps) {
  const models = state.status === "success" ? state.models : [];
  const selectedModelIsUnavailable =
    selectedModelId !== "" &&
    state.status === "success" &&
    !models.some((model) => model.id === selectedModelId);
  const canSelectModel = state.status === "success" && models.length > 0;
  const descriptionIds = [
    "provider-model-help",
    state.status === "loading" ? "provider-model-loading" : undefined,
    state.status === "success" && models.length === 0
      ? "provider-model-empty"
      : undefined,
    state.status === "error" ? "provider-model-error" : undefined,
    selectedModelIsUnavailable ? "provider-model-unavailable" : undefined,
    error === undefined ? undefined : "provider-model-id-error",
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");

  return (
    <div aria-busy={state.status === "loading"}>
      <label
        className="block text-sm font-semibold text-slate-100"
        htmlFor="provider-model-id"
      >
        Selected OpenRouter model
      </label>
      <p id="provider-model-help" className="mt-1 text-sm text-slate-400">
        Choose a model returned by OpenRouter. The model ID is saved locally.
      </p>
      <select
        id="provider-model-id"
        name="selectedModelId"
        className={selectClassName}
        value={selectedModelId}
        onChange={(event) => onChange(event.target.value)}
        disabled={!canSelectModel}
        aria-describedby={descriptionIds}
        aria-invalid={error !== undefined}
      >
        <option value="">
          {state.status === "loading"
            ? "Loading OpenRouter models…"
            : models.length === 0
              ? "No model selected"
              : "Choose an OpenRouter model"}
        </option>
        {selectedModelId !== "" &&
        !models.some((model) => model.id === selectedModelId) ? (
          <option value={selectedModelId}>
            {selectedModelId} (
            {state.status === "success" ? "unavailable" : "saved selection"})
          </option>
        ) : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.displayName} ({model.id})
          </option>
        ))}
      </select>

      {state.status === "loading" ? (
        <p
          id="provider-model-loading"
          className="mt-2 text-sm text-slate-300"
          role="status"
          aria-live="polite"
        >
          Loading available OpenRouter models…
        </p>
      ) : null}
      {state.status === "success" && models.length === 0 ? (
        <p
          id="provider-model-empty"
          className="mt-2 text-sm text-amber-200"
          role="status"
          aria-live="polite"
        >
          OpenRouter returned no available models. Refresh to try again.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p
          id="provider-model-error"
          className="mt-2 text-sm text-rose-300"
          role="alert"
        >
          {state.message} {state.retryable ? "Try again." : "Refresh to retry."}
        </p>
      ) : null}
      {selectedModelIsUnavailable ? (
        <p
          id="provider-model-unavailable"
          className="mt-2 text-sm text-amber-200"
          role="status"
          aria-live="polite"
        >
          The saved model is no longer returned by OpenRouter. Choose another
          model and save this configuration.
        </p>
      ) : null}
      {error !== undefined ? (
        <p
          id="provider-model-id-error"
          className="mt-1 text-sm font-medium text-rose-300"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className={refreshButtonClassName}
        onClick={onRefresh}
      >
        {state.status === "error" ? "Retry model discovery" : "Refresh models"}
      </button>
    </div>
  );
}
