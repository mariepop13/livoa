import type { Character, Conversation } from "@/domain/models";

type ChatSetupProps = Readonly<{
  activeConversationId: string | undefined;
  availableConversations: readonly Conversation[];
  characters: readonly Character[];
  onCreateConversation: () => void;
  onSelectCharacter: (characterId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  providerLabel: string;
  selectedCharacter: Character | undefined;
  selectedCharacterId: string | undefined;
  selectedConversationId: string | undefined;
  streamStatus: "idle" | "loading" | "streaming" | "cancelling";
}>;

function formatConversationName(conversation: Conversation): string {
  return conversation.title ?? "New conversation";
}

export default function ChatSetup({
  activeConversationId,
  availableConversations,
  characters,
  onCreateConversation,
  onSelectCharacter,
  onSelectConversation,
  providerLabel,
  selectedCharacter,
  selectedCharacterId,
  selectedConversationId,
  streamStatus,
}: ChatSetupProps) {
  const isBusy = streamStatus !== "idle";

  return (
    <aside
      className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25"
      aria-label="Chat setup"
    >
      <div>
        <label
          className="text-sm font-bold text-slate-200"
          htmlFor="chat-character"
        >
          Character
        </label>
        {characters.length > 0 ? (
          <select
            id="chat-character"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
            value={selectedCharacterId ?? ""}
            onChange={(event) => onSelectCharacter(event.target.value)}
            disabled={isBusy}
          >
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-400">
            No saved characters yet. Create one before opening a chat.
          </p>
        )}
      </div>

      {selectedCharacter !== undefined ? (
        <div>
          <label
            className="text-sm font-bold text-slate-200"
            htmlFor="chat-conversation"
          >
            Conversation
          </label>
          <select
            id="chat-conversation"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
            value={selectedConversationId ?? activeConversationId ?? ""}
            onChange={(event) => onSelectConversation(event.target.value)}
            disabled={isBusy}
          >
            <option value="">Start a new conversation</option>
            {availableConversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {formatConversationName(conversation)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onCreateConversation}
            disabled={isBusy}
          >
            Start conversation with {selectedCharacter.name}
          </button>
        </div>
      ) : null}

      <div className="border-t border-slate-800 pt-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
          Response provider
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{providerLabel}</p>
      </div>

      <a
        className="inline-flex text-sm font-bold text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-200"
        href="/characters"
      >
        Manage characters
      </a>
    </aside>
  );
}
