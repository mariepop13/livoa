export default function ChatLoadingState({
  error,
}: Readonly<{ error: string | undefined }>) {
  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-busy="true"
    >
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
        {error !== undefined ? (
          <p
            className="mt-4 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
            role="alert"
            aria-label={error}
          >
            {error}
          </p>
        ) : (
          <p
            className="mt-4 text-slate-300"
            role="status"
            aria-label="Loading your local chat…"
          >
            Loading your local chat…
          </p>
        )}
      </div>
    </main>
  );
}
