import type { FormEvent } from "react";

type ChatComposerProps = Readonly<{
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  value: string;
}>;

export default function ChatComposer({
  disabled,
  onChange,
  onSubmit,
  placeholder,
  value,
}: ChatComposerProps) {
  return (
    <form className="mt-8 border-t border-slate-800 pt-6" onSubmit={onSubmit}>
      <label
        className="text-sm font-bold text-slate-200"
        htmlFor="chat-message"
      >
        Message
      </label>
      <textarea
        id="chat-message"
        className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 leading-7 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby="chat-message-help"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <p id="chat-message-help" className="text-sm text-slate-400">
          Press send to save your message and begin a streamed response.
        </p>
        <button
          type="submit"
          className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
        >
          Send message
        </button>
      </div>
    </form>
  );
}
