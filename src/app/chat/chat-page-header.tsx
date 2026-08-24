export default function ChatPageHeader() {
  return (
    <header className="rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 px-6 py-8 shadow-2xl shadow-slate-950/40 sm:px-10">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
        Local-first conversation
      </p>
      <h1
        id="chat-title"
        className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Chat with your character.
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-300">
        Messages stay on this device. Responses appear as they stream, and an
        in-flight response can be cancelled at any time.
      </p>
    </header>
  );
}
