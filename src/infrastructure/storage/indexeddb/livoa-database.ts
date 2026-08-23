import Dexie, { type EntityTable } from "dexie";

import type {
  StoredAppSettings,
  StoredCharacter,
  StoredConversation,
  StoredMessage,
  StoredPersona,
} from "./record-schemas";

export class LivoaDatabase extends Dexie {
  public characters!: EntityTable<StoredCharacter, "id">;
  public personas!: EntityTable<StoredPersona, "id">;
  public conversations!: EntityTable<StoredConversation, "id">;
  public messages!: EntityTable<StoredMessage, "id">;
  public settings!: EntityTable<StoredAppSettings, "id">;

  public constructor() {
    super("livoa");

    this.version(1).stores({
      characters: "id, updatedAt",
      personas: "id, updatedAt",
      conversations: "id, characterId, updatedAt",
      messages: "id, conversationId",
      settings: "id",
    });
  }
}
