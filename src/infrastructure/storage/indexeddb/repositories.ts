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
  CharacterMemoryDeletionRepository,
  CharacterRepository,
  ConversationRepository,
  MemoryCharacterWriteRepository,
  MemoryCharacterWriteResult,
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

interface CharacterTable {
  delete(id: string): Promise<void>;
}

interface CharacterMemoryTable {
  where(index: "characterId"): {
    equals(characterId: string): { delete(): Promise<unknown> };
  };
}

interface CharacterMemoryWriteTable {
  get(id: string): Promise<StoredCharacter | undefined>;
}

interface MemoryCharacterWriteTable {
  put(record: StoredMemory): Promise<unknown>;
}

interface CharacterMemoryDeletionTransaction {
  execute(work: () => Promise<void>): Promise<void>;
}

interface CharacterMemoryWriteTransaction {
  execute<T>(work: () => Promise<T>): Promise<T>;
}

export class IndexedDbCharacterMemoryDeletionRepository implements CharacterMemoryDeletionRepository {
  public constructor(
    private readonly transaction: CharacterMemoryDeletionTransaction,
    private readonly characters: CharacterTable,
    private readonly memories: CharacterMemoryTable,
  ) {}

  public async deleteCharacterAndMemories(characterId: string): Promise<void> {
    await this.transaction.execute(async () => {
      await this.memories.where("characterId").equals(characterId).delete();
      await this.characters.delete(characterId);
    });
  }
}

export class IndexedDbMemoryCharacterWriteRepository implements MemoryCharacterWriteRepository {
  public constructor(
    private readonly transaction: CharacterMemoryWriteTransaction,
    private readonly characters: CharacterMemoryWriteTable,
    private readonly memories: MemoryCharacterWriteTable,
  ) {}

  public async saveForExistingCharacter(
    memory: Memory,
  ): Promise<MemoryCharacterWriteResult> {
    const storedMemory = storedMemorySchema.parse(
      serializeMemory(memorySchema.parse(memory)),
    );

    return this.transaction.execute<MemoryCharacterWriteResult>(async () => {
      if ((await this.characters.get(memory.characterId)) === undefined) {
        return { kind: "character_not_found" };
      }

      await this.memories.put(storedMemory);
      return { kind: "saved" };
    });
  }
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
  characterMemoryDeletion: CharacterMemoryDeletionRepository;
  memoryCharacterWrite: MemoryCharacterWriteRepository;
  personas: PersonaRepository;
  conversations: ConversationRepository;
  messages: MessageRepository;
  memories: MemoryRepository;
  settings: SettingsRepository;
}

export function createIndexedDbRepositories(
  database: LivoaDatabase = new LivoaDatabase(),
): IndexedDbRepositories {
  const characterMemoryTransaction: CharacterMemoryWriteTransaction = {
    execute: (work) =>
      database.transaction(
        "rw",
        [database.characters, database.memories],
        work,
      ),
  };

  return {
    characters: new IndexedDbCharacterRepository(database),
    characterMemoryDeletion: new IndexedDbCharacterMemoryDeletionRepository(
      characterMemoryTransaction,
      database.characters,
      database.memories,
    ),
    memoryCharacterWrite: new IndexedDbMemoryCharacterWriteRepository(
      characterMemoryTransaction,
      database.characters,
      database.memories,
    ),
    personas: new IndexedDbPersonaRepository(database),
    conversations: new IndexedDbConversationRepository(database),
    messages: new IndexedDbMessageRepository(database),
    memories: new IndexedDbMemoryRepository(database),
    settings: new IndexedDbAppSettingsRepository(database),
  };
}
