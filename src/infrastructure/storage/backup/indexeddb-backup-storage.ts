import type { BackupData, BackupStorage } from "@/application/backup";
import { LivoaDatabase } from "@/infrastructure/storage/indexeddb/livoa-database";
import {
  SETTINGS_RECORD_ID,
  storedAppSettingsSchema,
  storedCharacterSchema,
  storedConversationSchema,
  storedMessageSchema,
  storedPersonaSchema,
} from "@/infrastructure/storage/indexeddb/record-schemas";

export class IndexedDbBackupStorage implements BackupStorage {
  public constructor(private readonly database = new LivoaDatabase()) {}

  public async readAll(): Promise<unknown> {
    return this.database.transaction(
      "r",
      this.database.characters,
      this.database.personas,
      this.database.conversations,
      this.database.messages,
      this.database.settings,
      async () => {
        const [characters, personas, conversations, messages, settings] =
          await Promise.all([
            this.database.characters.toArray(),
            this.database.personas.toArray(),
            this.database.conversations.toArray(),
            this.database.messages.toArray(),
            this.database.settings.get(SETTINGS_RECORD_ID),
          ]);

        return {
          characters,
          personas,
          conversations,
          messages,
          settings:
            settings === undefined
              ? null
              : {
                  theme: settings.theme,
                  providers: settings.providers,
                },
        };
      },
    );
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
    const settings =
      data.settings === null
        ? null
        : storedAppSettingsSchema.parse({
            id: SETTINGS_RECORD_ID,
            theme: data.settings.theme,
            providers: data.settings.providers,
          });

    await this.database.transaction(
      "rw",
      this.database.characters,
      this.database.personas,
      this.database.conversations,
      this.database.messages,
      this.database.settings,
      async () => {
        await Promise.all([
          this.database.characters.clear(),
          this.database.personas.clear(),
          this.database.conversations.clear(),
          this.database.messages.clear(),
          this.database.settings.clear(),
        ]);

        await Promise.all([
          this.database.characters.bulkPut(characters),
          this.database.personas.bulkPut(personas),
          this.database.conversations.bulkPut(conversations),
          this.database.messages.bulkPut(messages),
          settings === null
            ? Promise.resolve()
            : this.database.settings.put(settings),
        ]);
      },
    );
  }
}
