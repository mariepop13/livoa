type ChatFeedbackProps = Readonly<{
  error: string | undefined;
  status: string | undefined;
}>;

export default function ChatFeedback({ error, status }: ChatFeedbackProps) {
  return (
    <>
      {error !== undefined ? (
        <div
          className="mt-6 rounded-xl border border-rose-400/40 bg-rose-950/40 p-4 text-rose-100"
          role="alert"
          aria-label={error}
        >
          {error}
        </div>
      ) : null}
      {status !== undefined ? (
        <p
          className="mt-6 rounded-xl border border-emerald-400/35 bg-emerald-950/45 p-4 text-emerald-100"
          role="status"
          aria-live="polite"
          aria-label={status}
        >
          {status}
        </p>
      ) : null}
    </>
  );
}
