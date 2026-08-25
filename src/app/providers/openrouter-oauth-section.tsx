export type OpenRouterOAuthUiState =
  | { readonly status: "idle" }
  | { readonly status: "connecting" }
  | { readonly status: "exchanging" }
  | { readonly status: "success"; readonly message: string }
  | { readonly status: "cancelled"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

type OpenRouterOAuthSectionProps = Readonly<{
  onConnect: () => void;
  state: OpenRouterOAuthUiState;
}>;

const connectButtonClassName =
  "min-h-11 rounded-xl border border-cyan-300/60 bg-cyan-950/50 px-4 py-2.5 text-sm font-bold text-cyan-100 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-900/60 focus:outline-none focus:ring-4 focus:ring-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-60";

export default function OpenRouterOAuthSection({
  onConnect,
  state,
}: OpenRouterOAuthSectionProps) {
  const isBusy = state.status === "connecting" || state.status === "exchanging";

  return (
    <fieldset
      className="space-y-3 border-t border-slate-800 pt-6"
      aria-busy={isBusy}
    >
      <legend className="text-base font-bold text-white">
        Connect with OpenRouter
      </legend>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">
        Sign in to OpenRouter to create a user-controlled API key. Livoa saves
        it locally as a hidden credential, never in the callback URL.
      </p>
      <button
        type="button"
        className={connectButtonClassName}
        onClick={onConnect}
        disabled={isBusy}
      >
        {state.status === "connecting"
          ? "Opening OpenRouter…"
          : state.status === "exchanging"
            ? "Completing connection…"
            : "Connect OpenRouter account"}
      </button>

      {state.status === "connecting" ? (
        <p className="text-sm text-slate-300" role="status" aria-live="polite">
          Preparing a secure OpenRouter connection…
        </p>
      ) : null}
      {state.status === "exchanging" ? (
        <p className="text-sm text-slate-300" role="status" aria-live="polite">
          Exchanging the one-time OpenRouter authorization code…
        </p>
      ) : null}
      {state.status === "success" ? (
        <p
          className="text-sm font-medium text-emerald-200"
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "cancelled" ? (
        <p
          className="text-sm font-medium text-amber-200"
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm font-medium text-rose-300" role="alert">
          {state.message}
        </p>
      ) : null}
    </fieldset>
  );
}
