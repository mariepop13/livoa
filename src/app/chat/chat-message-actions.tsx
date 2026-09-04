import type { Message } from "@/domain/models";

type ChatMessageActionsProps = Readonly<{
  disabled: boolean;
  message: Message;
  onDelete: (message: Message) => void;
  onEdit: (message: Message) => void;
  onRegenerate: (message: Message) => void;
}>;

export default function ChatMessageActions({
  disabled,
  message,
  onDelete,
  onEdit,
  onRegenerate,
}: ChatMessageActionsProps) {
  if (message.role === "system") {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {message.role === "user" ? (
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onEdit(message)}
          disabled={disabled}
        >
          Edit message
        </button>
      ) : (
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onRegenerate(message)}
          disabled={disabled}
        >
          Regenerate response
        </button>
      )}
      <button
        type="button"
        className="rounded-lg border border-rose-700 px-3 py-1.5 text-xs font-bold text-rose-200 transition hover:border-rose-500 hover:bg-rose-950/50 focus:outline-none focus:ring-4 focus:ring-rose-300/30 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => onDelete(message)}
        disabled={disabled}
      >
        Delete message
      </button>
    </div>
  );
}
