import type {
  AppSettings,
  Character,
  Conversation,
  Memory,
  Message,
  Persona,
} from "./models";
export interface Repository<T> {
  list(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
  delete(id: string): Promise<void>;
}
export type CharacterRepository = Repository<Character>;

export interface CharacterMemoryDeletionRepository {
  deleteCharacterAndMemories(characterId: string): Promise<void>;
}

export type MemoryCharacterWriteResult =
  { kind: "saved" } | { kind: "character_not_found" };

export interface MemoryCharacterWriteRepository {
  saveForExistingCharacter(memory: Memory): Promise<MemoryCharacterWriteResult>;
}

export type PersonaRepository = Repository<Persona>;
export type ConversationRepository = Repository<Conversation>;
export type MessageRepository = Repository<Message>;
export type MemoryRepository = Repository<Memory>;
export interface SettingsRepository {
  get(): Promise<AppSettings | null>;
  save(settings: AppSettings): Promise<void>;
}
export type AiModel = { id: string; displayName: string; providerId: string };
export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
export type ChatRequest = { model: string; messages: ChatMessage[] };
export type ChatChunk = { type: "text" | "done"; content?: string };
export type ProviderError = {
  code:
    | "authentication"
    | "network"
    | "rate_limit"
    | "invalid_response"
    | "unknown";
  message: string;
  retryable: boolean;
};
export interface AiProvider {
  readonly id: string;
  listModels(): Promise<AiModel[]>;
  streamChat(
    request: ChatRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ChatChunk>;
}
export type CredentialReference = Readonly<{
  configurationId: string;
  providerId: string;
}>;
export interface CredentialStore {
  has(reference: CredentialReference): Promise<boolean>;
  save(reference: CredentialReference, credential: string): Promise<void>;
  remove(reference: CredentialReference): Promise<void>;
  invalidateAll(): Promise<void>;
  hasLegacy(reference: CredentialReference): Promise<boolean>;
  migrateLegacy(reference: CredentialReference): Promise<boolean>;
}
