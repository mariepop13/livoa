import type { Message } from "@/domain/models";
import ChatMessageActions from "./chat-message-actions";
import MarkdownMessage from "./markdown-message";

type ChatMessageListProps = Readonly<{
  activeConversationId: string | undefined;
  loadedConversationId: string | undefined;
  messages: readonly Message[];
  pendingUserMessage: string | undefined;
  streamingText: string;
  actionsDisabled: boolean;
  onDeleteMessage: (message: Message) => void;
  onEditMessage: (message: Message) => void;
  onRegenerateMessage: (message: Message) => void;
}>;

function MessageBubble({
  actionsDisabled,
  message,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
}: Readonly<{
  actionsDisabled: boolean;
  message: Message;
  onDeleteMessage: (message: Message) => void;
  onEditMessage: (message: Message) => void;
  onRegenerateMessage: (message: Message) => void;
}>) {
  const isUser = message.role === "user";

  return (
    <li
      className={`rounded-2xl border p-4 ${isUser ? "ml-6 border-cyan-400/30 bg-cyan-950/50" : "mr-6 border-slate-700 bg-slate-900"}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        {isUser ? "You" : "Assistant"}
      </p>
      <MarkdownMessage content={message.content} />
      <ChatMessageActions
        disabled={actionsDisabled}
        message={message}
        onDelete={onDeleteMessage}
        onEdit={onEditMessage}
        onRegenerate={onRegenerateMessage}
      />
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
      <MarkdownMessage content={content} />
    </li>
  );
}

export default function ChatMessageList({
  activeConversationId,
  loadedConversationId,
  messages,
  pendingUserMessage,
  streamingText,
  actionsDisabled,
  onDeleteMessage,
  onEditMessage,
  onRegenerateMessage,
}: ChatMessageListProps) {
  const visibleMessages =
    loadedConversationId === activeConversationId ? messages : [];

  return (
    <ol className="mt-6 space-y-4" aria-label="Conversation messages">
      {visibleMessages.map((message) => (
        <MessageBubble
          key={message.id}
          actionsDisabled={actionsDisabled}
          message={message}
          onDeleteMessage={onDeleteMessage}
          onEditMessage={onEditMessage}
          onRegenerateMessage={onRegenerateMessage}
        />
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
