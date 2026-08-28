import {
  appSettingsSchema,
  characterSchema,
  conversationSchema,
  memorySchema,
  messageSchema,
  personaSchema,
  type AppSettings,
  type Character,
  type Conversation,
  type Memory,
  type Message,
  type Persona,
} from "../../../domain/models";
import type {
  CharacterRepository,
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  PersonaRepository,
  SettingsRepository,
} from "../../../domain/ports";
import {
  IndexedDbRepository,
  type IndexedDbTable,
} from "./indexeddb-repository";
import { LivoaDatabase } from "./livoa-database";
import {
  SETTINGS_RECORD_ID,
  storedCharacterSchema,
  storedConversationSchema,
  storedMemorySchema,
  storedMessageSchema,
  storedPersonaSchema,
  type StoredAppSettings,
  type StoredCharacter,
  type StoredConversation,
  type StoredMemory,
  type StoredMessage,
  type StoredPersona,
} from "./record-schemas";
import {
  deserializeAppSettings,
  deserializeCharacter,
  deserializeConversation,
  deserializeMemory,
  deserializeMessage,
  deserializePersona,
  serializeAppSettings,
  serializeCharacter,
  serializeConversation,
  serializeMemory,
  serializeMessage,
  serializePersona,
} from "./serializers";

interface CharacterDatabase {
  characters: IndexedDbTable<StoredCharacter>;
}

interface PersonaDatabase {
  personas: IndexedDbTable<StoredPersona>;
}

interface ConversationDatabase {
  conversations: IndexedDbTable<StoredConversation>;
}

interface MessageDatabase {
  messages: IndexedDbTable<StoredMessage>;
}

interface MemoryDatabase {
  memories: IndexedDbTable<StoredMemory>;
}

interface SettingsDatabase {
  settings: IndexedDbTable<StoredAppSettings>;
}

export class IndexedDbCharacterRepository
  extends IndexedDbRepository<Character, StoredCharacter>
  implements CharacterRepository
{
  public constructor(database: CharacterDatabase = new LivoaDatabase()) {
    super(
      database.characters,
      characterSchema,
      storedCharacterSchema,
      serializeCharacter,
      deserializeCharacter,
    );
  }
}

export class IndexedDbPersonaRepository
  extends IndexedDbRepository<Persona, StoredPersona>
  implements PersonaRepository
{
  public constructor(database: PersonaDatabase = new LivoaDatabase()) {
    super(
      database.personas,
      personaSchema,
      storedPersonaSchema,
      serializePersona,
      deserializePersona,
    );
  }
}

export class IndexedDbConversationRepository
  extends IndexedDbRepository<Conversation, StoredConversation>
  implements ConversationRepository
{
  public constructor(database: ConversationDatabase = new LivoaDatabase()) {
    super(
      database.conversations,
      conversationSchema,
      storedConversationSchema,
      serializeConversation,
      deserializeConversation,
    );
  }
}

export class IndexedDbMessageRepository
  extends IndexedDbRepository<Message, StoredMessage>
  implements MessageRepository
{
  public constructor(database: MessageDatabase = new LivoaDatabase()) {
    super(
      database.messages,
      messageSchema,
      storedMessageSchema,
      serializeMessage,
      deserializeMessage,
    );
  }
}

export class IndexedDbMemoryRepository
  extends IndexedDbRepository<Memory, StoredMemory>
  implements MemoryRepository
{
  public constructor(database: MemoryDatabase = new LivoaDatabase()) {
    super(
      database.memories,
      memorySchema,
      storedMemorySchema,
      serializeMemory,
      deserializeMemory,
    );
  }
}

export class IndexedDbAppSettingsRepository implements SettingsRepository {
  private readonly table: IndexedDbTable<StoredAppSettings>;

  public constructor(database: SettingsDatabase = new LivoaDatabase()) {
    this.table = database.settings;
  }

  public async get(): Promise<AppSettings | null> {
    const record = await this.table.get(SETTINGS_RECORD_ID);
    return record === undefined ? null : deserializeAppSettings(record);
  }

  public async save(settings: AppSettings): Promise<void> {
    const validated = appSettingsSchema.parse(settings);
    await this.table.put(serializeAppSettings(validated));
  }
}

export interface IndexedDbRepositories {
  characters: CharacterRepository;
  personas: PersonaRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  memories: MemoryRepository;
  settings: SettingsRepository;
}

export function createIndexedDbRepositories(
  database: LivoaDatabase = new LivoaDatabase(),
): IndexedDbRepositories {
  return {
    characters: new IndexedDbCharacterRepository(database),
    personas: new IndexedDbPersonaRepository(database),
    conversations: new IndexedDbConversationRepository(database),
    messages: new IndexedDbMessageRepository(database),
    memories: new IndexedDbMemoryRepository(database),
    settings: new IndexedDbAppSettingsRepository(database),
  };
}
