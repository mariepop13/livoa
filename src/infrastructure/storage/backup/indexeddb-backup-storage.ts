import type { BackupData, BackupStorage } from "@/application/backup";
import { LivoaDatabase } from "@/infrastructure/storage/indexeddb/livoa-database";
import {
  SETTINGS_RECORD_ID,
  storedAppSettingsSchema,
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
} from "@/infrastructure/storage/indexeddb/record-schemas";

interface BackupTable<Record> {
  toArray(): Promise<Record[]>;
  get(id: string): Promise<Record | undefined>;
  clear(): Promise<void>;
  bulkPut(records: readonly Record[]): Promise<unknown>;
  put(record: Record): Promise<unknown>;
}

interface BackupDatabase {
  readonly characters: BackupTable<StoredCharacter>;
  readonly personas: BackupTable<StoredPersona>;
  readonly conversations: BackupTable<StoredConversation>;
  readonly messages: BackupTable<StoredMessage>;
  readonly memories: BackupTable<StoredMemory>;
  readonly settings: BackupTable<StoredAppSettings>;
  transaction<Result>(
    mode: "r" | "rw",
    operation: () => Promise<Result>,
  ): Promise<Result>;
}

function createBackupDatabase(database: LivoaDatabase): BackupDatabase {
  const tables = [
    database.characters,
    database.personas,
    database.conversations,
    database.messages,
    database.memories,
    database.settings,
  ];

  return {
    characters: database.characters,
    personas: database.personas,
    conversations: database.conversations,
    messages: database.messages,
    memories: database.memories,
    settings: database.settings,
    transaction<Result>(
      mode: "r" | "rw",
      operation: () => Promise<Result>,
    ): Promise<Result> {
      return database.transaction(mode, tables, operation);
    },
  };
}

export class IndexedDbBackupStorage implements BackupStorage {
  private readonly database: BackupDatabase;

  public constructor(database: LivoaDatabase | BackupDatabase = new LivoaDatabase()) {
    this.database =
      database instanceof LivoaDatabase ? createBackupDatabase(database) : database;
  }

  public async readAll(): Promise<unknown> {
    return this.database.transaction("r", async () => {
      const [
        characters,
        personas,
        conversations,
        messages,
        memories,
        settings,
      ] = await Promise.all([
        this.database.characters.toArray(),
        this.database.personas.toArray(),
        this.database.conversations.toArray(),
        this.database.messages.toArray(),
        this.database.memories.toArray(),
        this.database.settings.get(SETTINGS_RECORD_ID),
      ]);

      return {
        characters,
        personas,
        conversations,
        messages,
        memories,
        settings:
          settings === undefined
            ? null
            : {
                theme: settings.theme,
                providers: settings.providers,
              },
      };
    });
  }

  public async replaceAll(data: BackupData): Promise<void> {
    const characters = data.characters.map((record) =>
      storedCharacterSchema.parse(record),
    );
    const personas = data.personas.map((record) =>
      storedPersonaSchema.parse(record),
    );
    const conversations = data.conversations.map((record) =>
      storedConversationSchema.parse(record),
    );
    const messages = data.messages.map((record) =>
      storedMessageSchema.parse(record),
    );
    const memories = data.memories.map((record) =>
      storedMemorySchema.parse(record),
    );
    const settings =
      data.settings === null
        ? null
        : storedAppSettingsSchema.parse({
            id: SETTINGS_RECORD_ID,
            theme: data.settings.theme,
            providers: data.settings.providers,
          });

    await this.database.transaction("rw", async () => {
      await Promise.all([
        this.database.characters.clear(),
        this.database.personas.clear(),
        this.database.conversations.clear(),
        this.database.messages.clear(),
        this.database.memories.clear(),
        this.database.settings.clear(),
      ]);

      await Promise.all([
        this.database.characters.bulkPut(characters),
        this.database.personas.bulkPut(personas),
        this.database.conversations.bulkPut(conversations),
        this.database.messages.bulkPut(messages),
        this.database.memories.bulkPut(memories),
        settings === null
          ? Promise.resolve()
          : this.database.settings.put(settings),
      ]);
    });
  }
}
