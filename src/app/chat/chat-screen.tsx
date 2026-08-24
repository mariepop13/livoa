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
  const [loadedConversationId, setLoadedConversationId] = useState<string>();
  const [screenError, setScreenError] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
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
  }, [activeAdapter]);

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

  function selectCharacter(characterId: string): void {
    if (streamStatus !== "idle") {
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
    if (streamStatus !== "idle") {
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
    if (streamStatus !== "idle") {
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
    if (streamStatus !== "idle") {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      activeAdapter === undefined ||
      selectedCharacter === undefined ||
      streamStatus !== "idle"
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

  if (isLoading || snapshot === undefined) {
    return <ChatLoadingState error={screenError} />;
  }

  return (
    <main
      className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-labelledby="chat-title"
    >
      <div className="mx-auto max-w-6xl">
        <ChatPageHeader />

        <ChatFeedback error={screenError} status={statusMessage} />

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ChatSetup
            activeConversationId={activeConversationId}
            availableConversations={availableConversations}
            characters={snapshot.characters}
            onSelectPersona={selectPersona}
            onCreateConversation={() => void handleCreateConversation()}
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
            className="rounded-3xl border border-slate-800 bg-slate-900/85 p-5 shadow-xl shadow-slate-950/25 sm:p-8"
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
              loadedConversationId={loadedConversationId}
              messages={messages}
              pendingUserMessage={pendingUserMessage}
              streamingText={streamingText}
            />

            {selectedCharacter === undefined ? (
              <p className="mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-slate-300">
                Create a character to start a conversation.
              </p>
            ) : activeConversationId === undefined &&
              pendingUserMessage === undefined ? (
              <p className="mt-8 rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-slate-300">
                Start a conversation above, then send a message.
              </p>
            ) : null}

            <ChatComposer
              disabled={
                selectedCharacter === undefined || streamStatus !== "idle"
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
    </main>
  );
}
