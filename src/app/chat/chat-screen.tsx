"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  Character,
  Conversation,
  Message,
  Persona,
} from "@/domain/models";

import {
  ChatAdapterError,
  type ChatSnapshot,
  type ChatTestDoubleMode,
} from "./chat-adapter";
import {
  createBrowserChatService,
  type BrowserChatSnapshot,
  type PersonaAwareChatAdapter,
} from "./browser-chat-service";
import ChatComposer from "./chat-composer";
import ChatFeedback from "./chat-feedback";
import ChatLoadingState from "./chat-loading-state";
import ChatMessageActionDialog, {
  type MessageActionDialogState,
} from "./chat-message-action-dialog";
import ChatMessageList from "./chat-message-list";
import ChatPageHeader from "./chat-page-header";
import ChatResponseControls from "./chat-response-controls";
import ChatSetup from "./chat-setup";

type ChatScreenProps = Readonly<{
  adapter?: PersonaAwareChatAdapter;
  testDouble?: ChatTestDoubleMode;
}>;

type StreamStatus = "idle" | "loading" | "streaming" | "cancelling";

function getErrorMessage(error: unknown): string {
  return error instanceof ChatAdapterError
    ? error.message
    : "The chat screen could not complete that action.";
}

function conversationsForCharacter(
  snapshot: ChatSnapshot,
  characterId: string | undefined,
): readonly Conversation[] {
  return characterId === undefined
    ? []
    : snapshot.conversations.filter(
        (conversation) => conversation.characterId === characterId,
      );
}

function characterById(
  characters: readonly Character[],
  characterId: string | undefined,
): Character | undefined {
  return characters.find((character) => character.id === characterId);
}

function personaById(
  personas: readonly Persona[],
  personaId: string | undefined,
): Persona | undefined {
  return personas.find((persona) => persona.id === personaId);
}

export default function ChatScreen({ adapter, testDouble }: ChatScreenProps) {
  const [activeAdapter] = useState<PersonaAwareChatAdapter | undefined>(() => {
    if (adapter !== undefined || typeof window === "undefined") {
      return adapter;
    }

    return createBrowserChatService({ testDouble });
  });
  const [snapshot, setSnapshot] = useState<BrowserChatSnapshot>();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>();
  const [selectedConversationId, setSelectedConversationId] =
    useState<string>();
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>();
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [pendingUserMessage, setPendingUserMessage] = useState<string>();
  const [streamingText, setStreamingText] = useState("");
  const [composerValue, setComposerValue] = useState("");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadedConversationId, setLoadedConversationId] = useState<string>();
  const [screenError, setScreenError] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [conversationPendingDeletion, setConversationPendingDeletion] =
    useState<Conversation>();
  const [deletionError, setDeletionError] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [messageAction, setMessageAction] =
    useState<MessageActionDialogState>();
  const [messageActionError, setMessageActionError] = useState<string>();
  const [isSavingMessageAction, setIsSavingMessageAction] = useState(false);
  const deletionDialogRef = useRef<HTMLDivElement | null>(null);
  const isDeletionPending = conversationPendingDeletion !== undefined;
  const isMessageActionPending = messageAction !== undefined;
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeAdapter === undefined) {
      return;
    }

    let isCurrent = true;

    void activeAdapter
      .load()
      .then((nextSnapshot) => {
        if (!isCurrent) {
          return;
        }

        setSnapshot(nextSnapshot);
        setSelectedCharacterId((current) =>
          current !== undefined &&
          nextSnapshot.characters.some((character) => character.id === current)
            ? current
            : nextSnapshot.characters[0]?.id,
        );
        const firstCharacterId = nextSnapshot.characters[0]?.id;
        const firstConversation = nextSnapshot.conversations.find(
          (conversation) => conversation.characterId === firstCharacterId,
        );
        setSelectedPersonaId(firstConversation?.personaId);
        setScreenError(undefined);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setScreenError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeAdapter, loadAttempt]);

  const selectedCharacter = characterById(
    snapshot?.characters ?? [],
    selectedCharacterId,
  );
  const selectedPersona = personaById(
    snapshot?.personas ?? [],
    selectedPersonaId,
  );
  const availableConversations =
    snapshot === undefined
      ? []
      : conversationsForCharacter(snapshot, selectedCharacterId);

  const activeConversationId =
    selectedConversationId === undefined
      ? availableConversations[0]?.id
      : selectedConversationId.length > 0
        ? selectedConversationId
        : undefined;

  useEffect(() => {
    if (activeAdapter === undefined || activeConversationId === undefined) {
      return;
    }

    let isCurrent = true;

    void activeAdapter
      .retrieveConversation(activeConversationId)
      .then((conversation) => {
        if (isCurrent) {
          setMessages(conversation.messages);
          setLoadedConversationId(activeConversationId);
          setScreenError(undefined);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setScreenError(getErrorMessage(error));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeAdapter, activeConversationId]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    deletionDialogRef.current?.focus();
  }, [conversationPendingDeletion]);

  function selectCharacter(characterId: string): void {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }

    setSelectedCharacterId(characterId);
    setSelectedConversationId(undefined);
    const firstConversation = snapshot?.conversations.find(
      (conversation) => conversation.characterId === characterId,
    );
    setSelectedPersonaId(firstConversation?.personaId);
    setMessages([]);
    setLoadedConversationId(undefined);
    setScreenError(undefined);
    setStatusMessage(undefined);
  }

  function selectConversation(conversationId: string): void {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }

    setSelectedConversationId(conversationId);
    const selectedConversation = snapshot?.conversations.find(
      (conversation) => conversation.id === conversationId,
    );
    setSelectedPersonaId(selectedConversation?.personaId);
    setMessages([]);
    setLoadedConversationId(undefined);
    setScreenError(undefined);
    setStatusMessage(undefined);
  }

  function selectPersona(personaId: string): void {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }

    setSelectedPersonaId(personaId.length > 0 ? personaId : undefined);
    setScreenError(undefined);
    setStatusMessage(undefined);
  }

  async function createConversation(): Promise<Conversation | undefined> {
    if (activeAdapter === undefined || selectedCharacter === undefined) {
      return undefined;
    }

    const conversation = await activeAdapter.createConversation(
      selectedCharacter.id,
      selectedPersonaId,
    );
    setSnapshot((current) =>
      current === undefined
        ? current
        : {
            ...current,
            conversations: [conversation, ...current.conversations],
          },
    );
    setSelectedConversationId(conversation.id);
    setMessages([]);
    setLoadedConversationId(conversation.id);
    setStatusMessage("Conversation created.");
    return conversation;
  }

  async function handleCreateConversation(): Promise<void> {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }

    setScreenError(undefined);
    setStatusMessage(undefined);

    try {
      await createConversation();
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error));
    }
  }

  function requestConversationDeletion(): void {
    if (
      streamStatus !== "idle" ||
      isDeleting ||
      isDeletionPending ||
      activeConversationId === undefined
    ) {
      return;
    }

    const conversation = snapshot?.conversations.find(
      (candidate) => candidate.id === activeConversationId,
    );
    if (conversation === undefined) {
      return;
    }

    setDeletionError(undefined);
    setConversationPendingDeletion(conversation);
  }

  function cancelConversationDeletion(): void {
    if (!isDeleting) {
      setConversationPendingDeletion(undefined);
      setDeletionError(undefined);
    }
  }

  async function confirmConversationDeletion(): Promise<void> {
    if (
      activeAdapter === undefined ||
      conversationPendingDeletion === undefined ||
      isDeleting
    ) {
      return;
    }

    setIsDeleting(true);
    setDeletionError(undefined);
    setScreenError(undefined);
    setStatusMessage(undefined);

    try {
      await activeAdapter.deleteConversation(conversationPendingDeletion.id);
      const remainingConversations = (snapshot?.conversations ?? []).filter(
        (conversation) => conversation.id !== conversationPendingDeletion.id,
      );
      const nextConversation = remainingConversations.find(
        (conversation) => conversation.characterId === selectedCharacterId,
      );

      setSnapshot((current) =>
        current === undefined
          ? current
          : { ...current, conversations: remainingConversations },
      );
      setSelectedConversationId(nextConversation?.id ?? "");
      setSelectedPersonaId(nextConversation?.personaId);
      setMessages([]);
      setLoadedConversationId(undefined);
      setPendingUserMessage(undefined);
      setStreamingText("");
      setConversationPendingDeletion(undefined);
      setStatusMessage("Conversation deleted.");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setDeletionError(message);
      setScreenError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function refreshConversation(conversationId: string): Promise<void> {
    if (activeAdapter === undefined) {
      return;
    }

    try {
      const conversation =
        await activeAdapter.retrieveConversation(conversationId);
      setMessages(conversation.messages);
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error));
    }
  }

  function followingMessageCount(message: Message): number {
    const index = messages.findIndex(
      (candidate) => candidate.id === message.id,
    );
    return index === -1 ? 0 : messages.length - index - 1;
  }

  function requestMessageEdit(message: Message): void {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }
    setMessageActionError(undefined);
    setMessageAction({
      kind: "edit",
      message,
      content: message.content,
      laterMessageCount: followingMessageCount(message),
    });
  }

  function requestMessageDeletion(message: Message): void {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }
    setMessageActionError(undefined);
    setMessageAction({
      kind: "delete",
      message,
      laterMessageCount: followingMessageCount(message),
    });
  }

  function requestRegeneration(message: Message): void {
    if (streamStatus !== "idle" || isDeleting || isDeletionPending) {
      return;
    }
    setMessageActionError(undefined);
    setMessageAction({
      kind: "regenerate",
      message,
      laterMessageCount: followingMessageCount(message),
      stage: "confirm",
    });
  }

  function cancelMessageAction(): void {
    if (streamStatus !== "idle") {
      cancelResponse();
      return;
    }
    if (!isSavingMessageAction) {
      setMessageAction(undefined);
      setMessageActionError(undefined);
    }
  }

  async function confirmMessageAction(): Promise<void> {
    if (
      activeAdapter === undefined ||
      activeConversationId === undefined ||
      messageAction === undefined ||
      isSavingMessageAction
    ) {
      return;
    }

    setMessageActionError(undefined);
    setScreenError(undefined);
    setStatusMessage(undefined);

    if (
      messageAction.kind === "edit" &&
      messageAction.content.trim().length === 0
    ) {
      setMessageActionError("Enter a message before saving the edit.");
      return;
    }

    if (
      messageAction.kind === "regenerate" &&
      messageAction.stage === "confirm"
    ) {
      if (selectedCharacter === undefined) {
        return;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      setStreamStatus("loading");
      setMessageAction({ ...messageAction, stage: "streaming" });

      try {
        const outcome = await activeAdapter.regenerateMessage({
          character: selectedCharacter,
          conversationId: activeConversationId,
          messageId: messageAction.message.id,
          signal: controller.signal,
          onAssistantText: () => setStreamStatus("streaming"),
        });
        if (outcome.status === "cancelled") {
          setMessageAction(undefined);
          setStatusMessage("Response cancelled.");
        } else if (outcome.status === "error") {
          setMessageActionError(outcome.message);
          setMessageAction({ ...messageAction, stage: "confirm" });
        } else {
          setMessageAction({
            ...messageAction,
            stage: "review",
            candidate: {
              content: outcome.content,
              model: outcome.model,
              provider: outcome.provider,
            },
          });
        }
      } catch (error: unknown) {
        setMessageActionError(getErrorMessage(error));
        setMessageAction({ ...messageAction, stage: "confirm" });
      } finally {
        controllerRef.current = null;
        setStreamStatus("idle");
      }
      return;
    }

    setIsSavingMessageAction(true);
    try {
      if (messageAction.kind === "edit") {
        await activeAdapter.editUserMessage({
          conversationId: activeConversationId,
          messageId: messageAction.message.id,
          content: messageAction.content,
        });
        await refreshConversation(activeConversationId);
        setStatusMessage("Message edited; following history discarded.");
      } else if (messageAction.kind === "delete") {
        await activeAdapter.deleteMessage({
          conversationId: activeConversationId,
          messageId: messageAction.message.id,
          discardFollowing: messageAction.laterMessageCount > 0,
        });
        await refreshConversation(activeConversationId);
        setStatusMessage(
          messageAction.laterMessageCount > 0
            ? "Message and following history deleted."
            : "Message deleted.",
        );
      } else if (messageAction.stage === "review") {
        await activeAdapter.replaceAssistantMessage({
          conversationId: activeConversationId,
          messageId: messageAction.message.id,
          ...messageAction.candidate,
        });
        await refreshConversation(activeConversationId);
        setStatusMessage(
          "Regenerated response saved; prior response discarded.",
        );
      }
      setMessageAction(undefined);
    } catch (error: unknown) {
      setMessageActionError(getErrorMessage(error));
    } finally {
      setIsSavingMessageAction(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      activeAdapter === undefined ||
      selectedCharacter === undefined ||
      streamStatus !== "idle" ||
      isDeleting ||
      isDeletionPending
    ) {
      return;
    }

    const content = composerValue.trim();
    if (content.length === 0) {
      setScreenError("Enter a message before sending.");
      return;
    }

    setScreenError(undefined);
    setStatusMessage(undefined);
    setComposerValue("");
    setPendingUserMessage(content);
    setStreamingText("");
    setStreamStatus("loading");

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      let conversationId = activeConversationId;
      if (conversationId === undefined) {
        const conversation = await createConversation();
        conversationId = conversation?.id;
      }

      if (conversationId === undefined) {
        throw new ChatAdapterError(
          "Create a conversation before sending a message.",
        );
      }

      const outcome = await activeAdapter.streamMessage({
        character: selectedCharacter,
        content,
        conversationId,
        onAssistantText: (nextText) => {
          setStreamStatus("streaming");
          setStreamingText(nextText);
        },
        signal: controller.signal,
      });

      await refreshConversation(conversationId);
      setPendingUserMessage(undefined);
      setStreamingText("");

      if (outcome.status === "cancelled") {
        setStatusMessage("Response cancelled.");
      } else if (outcome.status === "error") {
        setScreenError(outcome.message);
      } else {
        setStatusMessage("Response complete.");
      }
    } catch (error: unknown) {
      setScreenError(getErrorMessage(error));
    } finally {
      controllerRef.current = null;
      setStreamStatus("idle");
    }
  }

  function cancelResponse(): void {
    if (controllerRef.current === null) {
      return;
    }

    setStreamStatus("cancelling");
    controllerRef.current.abort();
  }

  function retryLoading(): void {
    setScreenError(undefined);
    setLoadAttempt((current) => current + 1);
  }

  if (isLoading || snapshot === undefined) {
    return <ChatLoadingState error={screenError} onRetry={retryLoading} />;
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="chat-title"
    >
      <div className="mx-auto min-w-0 max-w-6xl">
        <ChatPageHeader />

        <ChatFeedback error={screenError} status={statusMessage} />

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ChatSetup
            isDeletionPending={isDeletionPending || isMessageActionPending}
            activeConversationId={activeConversationId}
            availableConversations={availableConversations}
            characters={snapshot.characters}
            onSelectPersona={selectPersona}
            onCreateConversation={() => void handleCreateConversation()}
            onDeleteConversation={requestConversationDeletion}
            onSelectCharacter={selectCharacter}
            onSelectConversation={selectConversation}
            personas={snapshot.personas}
            providerLabel={snapshot.providerLabel}
            selectedCharacter={selectedCharacter}
            selectedCharacterId={selectedCharacterId}
            selectedConversationId={selectedConversationId}
            selectedPersonaId={selectedPersona?.id}
            streamStatus={streamStatus}
          />

          <section
            className="min-w-0 rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-8"
            aria-labelledby="messages-title"
            aria-busy={streamStatus !== "idle"}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Conversation
                </p>
                <h2
                  id="messages-title"
                  className="mt-2 text-2xl font-bold tracking-tight text-white"
                >
                  {selectedCharacter === undefined
                    ? "Choose a character"
                    : selectedCharacter.name}
                </h2>
              </div>
              <ChatResponseControls
                onCancel={cancelResponse}
                streamStatus={streamStatus}
              />
            </div>

            <ChatMessageList
              activeConversationId={activeConversationId}
              actionsDisabled={
                streamStatus !== "idle" ||
                isDeleting ||
                isDeletionPending ||
                isMessageActionPending
              }
              loadedConversationId={loadedConversationId}
              messages={messages}
              onDeleteMessage={requestMessageDeletion}
              onEditMessage={requestMessageEdit}
              onRegenerateMessage={requestRegeneration}
              pendingUserMessage={pendingUserMessage}
              streamingText={streamingText}
            />

            {selectedCharacter === undefined ? (
              <p
                className="mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-slate-300"
                role="status"
                aria-live="polite"
              >
                Create a character to start a conversation.
              </p>
            ) : activeConversationId === undefined &&
              pendingUserMessage === undefined ? (
              <p
                className="mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-slate-300"
                role="status"
                aria-live="polite"
              >
                Start a conversation above, then send a message.
              </p>
            ) : null}

            <ChatComposer
              disabled={
                selectedCharacter === undefined ||
                streamStatus !== "idle" ||
                isDeleting ||
                isDeletionPending ||
                isMessageActionPending
              }
              onChange={setComposerValue}
              onSubmit={handleSubmit}
              placeholder={
                selectedCharacter === undefined
                  ? "Choose a character first"
                  : "Write a message…"
              }
              value={composerValue}
            />
          </section>
        </div>
      </div>
      {messageAction === undefined ? null : (
        <ChatMessageActionDialog
          action={messageAction}
          error={messageActionError}
          isSaving={isSavingMessageAction}
          onCancel={cancelMessageAction}
          onChangeEdit={(content) =>
            setMessageAction((current) =>
              current?.kind === "edit" ? { ...current, content } : current,
            )
          }
          onConfirm={() => void confirmMessageAction()}
        />
      )}
      {conversationPendingDeletion === undefined ? null : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div
            ref={deletionDialogRef}
            aria-describedby="delete-conversation-description"
            aria-labelledby="delete-conversation-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-3xl border border-rose-500/50 bg-slate-900 p-6 shadow-2xl"
            role="dialog"
            tabIndex={-1}
          >
            <h2
              id="delete-conversation-title"
              className="text-xl font-bold text-white"
            >
              Permanently delete conversation?
            </h2>
            <p
              id="delete-conversation-description"
              className="mt-3 text-sm leading-6 text-slate-300"
            >
              You are permanently deleting{" "}
              <strong>
                {conversationPendingDeletion.title ??
                  `Conversation created ${conversationPendingDeletion.createdAt.toLocaleString()}`}
              </strong>
              . This action is irreversible and cannot be undone.
            </p>
            {deletionError === undefined ? null : (
              <p className="mt-4 text-sm text-rose-200" role="alert">
                {deletionError}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={cancelConversationDeletion}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-rose-400 px-4 py-2.5 text-sm font-bold text-rose-950 transition hover:bg-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-300/30 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void confirmConversationDeletion()}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting conversation…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
