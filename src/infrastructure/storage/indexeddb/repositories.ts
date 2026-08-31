import {
  appSettingsSchema,
  characterCardSchema,
  characterSchema,
  conversationSchema,
  memorySchema,
  messageSchema,
  personaSchema,
  type AppSettings,
  type Character,
  type CharacterCard,
  type Conversation,
  type Memory,
  type Message,
  type Persona,
} from "../../../domain/models";
import type {
  CharacterCardImportRepository,
  CharacterCardImportWriteResult,
  CharacterCardRepository,
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
  storedCharacterCardSchema,
  storedCharacterSchema,
  storedConversationSchema,
  storedMemorySchema,
  storedMessageSchema,
  storedPersonaSchema,
  type StoredAppSettings,
  type StoredCharacter,
  type StoredCharacterCard,
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

interface CharacterCardDatabase {
  characterCards: IndexedDbTable<StoredCharacterCard>;
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


interface CharacterCardDeletionTable {
  delete(id: string): Promise<void>;
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

interface CharacterCardImportCharacterTable {
  add(record: StoredCharacter): Promise<unknown>;
}

interface CharacterCardImportCardTable {
  add(record: StoredCharacterCard): Promise<unknown>;
}

interface CharacterCardImportTransaction {
  execute<T>(work: () => Promise<T>): Promise<T>;
}

export class IndexedDbCharacterMemoryDeletionRepository implements CharacterMemoryDeletionRepository {
  public constructor(
    private readonly transaction: CharacterMemoryDeletionTransaction,
    private readonly characters: CharacterTable,
    private readonly memories: CharacterMemoryTable,
    private readonly cards?: CharacterCardDeletionTable,
  ) {}

  public async deleteCharacterAndMemories(characterId: string): Promise<void> {
    await this.transaction.execute(async () => {
      await this.memories.where("characterId").equals(characterId).delete();
      if (this.cards !== undefined) {
        await this.cards.delete(characterId);
      }
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

export class IndexedDbCharacterCardRepository implements CharacterCardRepository {
  private readonly table: IndexedDbTable<StoredCharacterCard>;

  public constructor(database: CharacterCardDatabase = new LivoaDatabase()) {
    this.table = database.characterCards;
  }

  public async getByCharacterId(
    characterId: string,
  ): Promise<CharacterCard | null> {
    const record = await this.table.get(characterId);
    if (record === undefined) return null;
    const card = storedCharacterCardSchema.parse(record);
    return characterCardSchema.parse({
      ...card,
      avatar:
        card.avatar === undefined
          ? undefined
          : { ...card.avatar, bytes: card.avatar.bytes.slice() },
    });
  }
  public async save(card: CharacterCard): Promise<void> {
    const parsed = characterCardSchema.parse(card);
    await this.table.put(
      storedCharacterCardSchema.parse({
        ...parsed,
        id: parsed.characterId,
        avatar:
          parsed.avatar === undefined
            ? undefined
            : { ...parsed.avatar, bytes: parsed.avatar.bytes.slice() },
      }),
    );
  }

  public async deleteByCharacterId(characterId: string): Promise<void> {
    await this.table.delete(characterId);
  }
}

export class IndexedDbCharacterCardImportRepository
  implements CharacterCardImportRepository
{
  public constructor(
    private readonly transaction: CharacterCardImportTransaction,
    private readonly characters: CharacterCardImportCharacterTable,
    private readonly cards: CharacterCardImportCardTable,
  ) {}

  public async saveImportedCharacter(
    character: Character,
    card: CharacterCard,
  ): Promise<CharacterCardImportWriteResult> {
    const storedCharacter = storedCharacterSchema.parse(
      serializeCharacter(characterSchema.parse(character)),
    );
    const parsedCard = characterCardSchema.parse(card);
    const storedCard = storedCharacterCardSchema.parse({
      ...parsedCard,
      id: parsedCard.characterId,
      avatar:
        parsedCard.avatar === undefined
          ? undefined
          : { ...parsedCard.avatar, bytes: parsedCard.avatar.bytes.slice() },
    });
    try {
      await this.transaction.execute(async () => {
        await this.characters.add(storedCharacter);
        await this.cards.add(storedCard);
      });
      return { kind: "saved" };
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "ConstraintError") {
        return { kind: "character_exists" };
      }
      throw error;
    }
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

export interface CharacterCardIndexedDbRepositories
  extends IndexedDbRepositories {
  characterCards: CharacterCardRepository;
  characterCardImports: CharacterCardImportRepository;
}

export function createIndexedDbRepositories(
  database: LivoaDatabase = new LivoaDatabase(),
): CharacterCardIndexedDbRepositories {
  const characterMemoryTransaction: CharacterMemoryWriteTransaction = {
    execute: (work) =>
      database.transaction(
        "rw",
        [database.characters, database.memories, database.characterCards],
        work,
      ),
  };
  const characterCardImportTransaction: CharacterCardImportTransaction = {
    execute: (work) =>
      database.transaction(
        "rw",
        [database.characters, database.characterCards],
        work,
      ),
  };

  return {
    characters: new IndexedDbCharacterRepository(database),
    characterCards: new IndexedDbCharacterCardRepository(database),
    characterCardImports: new IndexedDbCharacterCardImportRepository(
      characterCardImportTransaction,
      database.characters,
      database.characterCards,
    ),
    characterMemoryDeletion: new IndexedDbCharacterMemoryDeletionRepository(
      characterMemoryTransaction,
      database.characters,
      database.memories,
      database.characterCards,
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
