export default function ChatLoadingState({
  error,
  onRetry,
}: Readonly<{
  error: string | undefined;
  onRetry: () => void;
}>) {
  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="chat-loading-title"
      aria-busy={error === undefined}
    >
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-10">
        <h1
          id="chat-loading-title"
          className="text-3xl font-bold tracking-tight"
        >
          Chat
        </h1>
        {error !== undefined ? (
          <div
            className="mt-4 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
            role="alert"
            aria-live="assertive"
          >
            <p>{error}</p>
            <button
              type="button"
              className="mt-4 min-h-11 rounded-xl border border-rose-300/60 px-4 py-2.5 text-sm font-bold text-rose-100 transition hover:bg-rose-900/50 focus:outline-none focus:ring-4 focus:ring-rose-300/30"
              onClick={onRetry}
            >
              Try loading chat again
            </button>
          </div>
        ) : (
          <p className="mt-4 text-slate-300" role="status" aria-live="polite">
            Loading your local chat…
          </p>
        )}
      </div>
    </main>
  );
}
