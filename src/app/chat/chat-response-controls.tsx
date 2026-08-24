type ChatResponseControlsProps = Readonly<{
  onCancel: () => void;
  streamStatus: "idle" | "loading" | "streaming" | "cancelling";
}>;

function streamStatusLabel(
  streamStatus: Exclude<ChatResponseControlsProps["streamStatus"], "idle">,
): string {
  return streamStatus === "loading"
    ? "Sending your message…"
    : streamStatus === "streaming"
      ? "Assistant is streaming a response."
      : "Stopping the response…";
}

export default function ChatResponseControls({
  onCancel,
  streamStatus,
}: ChatResponseControlsProps) {
  if (streamStatus === "idle") {
    return null;
  }

  const label = streamStatusLabel(streamStatus);

  return (
    <>
      <button
        type="button"
        className="rounded-xl bg-rose-400 px-4 py-2.5 text-sm font-bold text-rose-950 transition hover:bg-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-300/30 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onCancel}
        disabled={streamStatus === "cancelling"}
      >
        {streamStatus === "cancelling"
          ? "Cancelling response…"
          : "Cancel response"}
      </button>
      <p
        className="mt-5 basis-full rounded-xl border border-cyan-400/30 bg-cyan-950/40 p-4 text-cyan-100"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        {label}
      </p>
    </>
  );
}
