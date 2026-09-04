import type { Message } from "@/domain/models";

export type MessageActionDialogState =
  | Readonly<{
      kind: "edit";
      message: Message;
      laterMessageCount: number;
      content: string;
    }>
  | Readonly<{
      kind: "delete";
      message: Message;
      laterMessageCount: number;
    }>
  | Readonly<{
      kind: "regenerate";
      message: Message;
      laterMessageCount: number;
      stage: "confirm" | "streaming";
    }>
  | Readonly<{
      kind: "regenerate";
      message: Message;
      laterMessageCount: number;
      stage: "review";
      candidate: Readonly<{ content: string; model: string; provider: string }>;
    }>;

type ChatMessageActionDialogProps = Readonly<{
  action: MessageActionDialogState;
  error: string | undefined;
  isSaving: boolean;
  onCancel: () => void;
  onChangeEdit: (content: string) => void;
  onConfirm: () => void;
}>;

function followingHistoryDescription(count: number): string {
  return count === 1 ? "1 later message" : `${count} later messages`;
}

export default function ChatMessageActionDialog({
  action,
  error,
  isSaving,
  onCancel,
  onChangeEdit,
  onConfirm,
}: ChatMessageActionDialogProps) {
  const hasFollowingMessages = action.laterMessageCount > 0;
  const isReview = action.kind === "regenerate" && action.stage === "review";
  const isStreaming =
    action.kind === "regenerate" && action.stage === "streaming";
  const title =
    action.kind === "edit"
      ? "Edit message and keep a coherent history?"
      : action.kind === "delete"
        ? hasFollowingMessages
          ? "Delete message and following history?"
          : "Delete message?"
        : isReview
          ? "Use regenerated response?"
          : "Regenerate response?";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div
        aria-describedby="message-action-description"
        aria-labelledby="message-action-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="message-action-title" className="text-xl font-bold text-white">
          {title}
        </h2>
        {action.kind === "edit" ? (
          <label
            className="mt-4 block text-sm font-bold text-slate-200"
            htmlFor="edited-message-content"
          >
            Message
            <textarea
              id="edited-message-content"
              className="mt-2 min-h-32 w-full rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 font-normal leading-7 text-slate-100 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
              value={action.content}
              onChange={(event) => onChangeEdit(event.target.value)}
              disabled={isSaving}
            />
          </label>
        ) : null}
        <p
          id="message-action-description"
          className="mt-3 text-sm leading-6 text-slate-300"
        >
          {action.kind === "edit"
            ? `Saving this edit will discard ${followingHistoryDescription(action.laterMessageCount)} so the saved conversation remains a single coherent sequence.`
            : action.kind === "delete"
              ? hasFollowingMessages
                ? `This will permanently discard this message and ${followingHistoryDescription(action.laterMessageCount)}.`
                : "This will permanently discard this message."
              : isReview
                ? `The existing response is still saved. Replacing it will permanently discard it${hasFollowingMessages ? ` and ${followingHistoryDescription(action.laterMessageCount)}` : ""}.`
                : "The existing response remains saved until you explicitly choose whether to replace it."}
        </p>
        {isReview ? (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              Regenerated response preview
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">
              {action.candidate.content}
            </p>
          </div>
        ) : null}
        {isStreaming ? (
          <p
            className="mt-4 text-sm text-cyan-200"
            role="status"
            aria-live="polite"
          >
            Generating a replacement preview…
          </p>
        ) : null}
        {error === undefined ? null : (
          <p className="mt-4 text-sm text-rose-200" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onCancel}
            disabled={isSaving}
          >
            {isStreaming
              ? "Cancel generation"
              : isReview
                ? "Keep existing response"
                : "Cancel"}
          </button>
          {isStreaming ? null : (
            <button
              type="button"
              className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onConfirm}
              disabled={isSaving}
            >
              {isSaving
                ? "Saving…"
                : action.kind === "edit"
                  ? "Save edit and discard following messages"
                  : action.kind === "delete"
                    ? hasFollowingMessages
                      ? "Delete message and following history"
                      : "Delete message"
                    : isReview
                      ? "Replace saved response"
                      : "Generate replacement preview"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
