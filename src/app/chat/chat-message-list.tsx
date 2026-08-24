import type { Message } from "@/domain/models";

type ChatMessageListProps = Readonly<{
  activeConversationId: string | undefined;
  loadedConversationId: string | undefined;
  messages: readonly Message[];
  pendingUserMessage: string | undefined;
  streamingText: string;
}>;

function MessageBubble({ message }: Readonly<{ message: Message }>) {
  const isUser = message.role === "user";

  return (
    <li
      className={`rounded-2xl border p-4 ${isUser ? "ml-6 border-cyan-400/30 bg-cyan-950/50" : "mr-6 border-slate-700 bg-slate-900"}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        {isUser ? "You" : "Assistant"}
      </p>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-100">
        {message.content}
      </p>
    </li>
  );
}

function PendingMessage({
  role,
  content,
}: Readonly<{ role: "user" | "assistant"; content: string }>) {
  return (
    <li
      data-testid={role === "assistant" ? "assistant-streaming" : undefined}
      aria-live={role === "assistant" ? "polite" : undefined}
      aria-atomic={role === "assistant" ? "true" : undefined}
      className={`rounded-2xl border p-4 ${role === "user" ? "ml-6 border-cyan-400/30 bg-cyan-950/50" : "mr-6 border-slate-700 bg-slate-900"}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        {role === "user" ? "You" : "Assistant"}
      </p>
      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-100">
        {content}
      </p>
    </li>
  );
}

export default function ChatMessageList({
  activeConversationId,
  loadedConversationId,
  messages,
  pendingUserMessage,
  streamingText,
}: ChatMessageListProps) {
  const visibleMessages =
    loadedConversationId === activeConversationId ? messages : [];

  return (
    <ol className="mt-6 space-y-4" aria-label="Conversation messages">
      {visibleMessages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {pendingUserMessage !== undefined ? (
        <PendingMessage role="user" content={pendingUserMessage} />
      ) : null}
      {streamingText.length > 0 ? (
        <PendingMessage role="assistant" content={streamingText} />
      ) : null}
    </ol>
  );
}
