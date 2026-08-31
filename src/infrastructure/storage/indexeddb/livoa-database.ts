import Dexie, { type EntityTable } from "dexie";

import type {
  StoredAppSettings,
  StoredCharacter,
  StoredCharacterCard,
  StoredConversation,
  StoredMemory,
  StoredMessage,
  StoredPersona,
} from "./record-schemas";

export class LivoaDatabase extends Dexie {
  public characters!: EntityTable<StoredCharacter, "id">;
  public characterCards!: EntityTable<StoredCharacterCard, "characterId">;
  public personas!: EntityTable<StoredPersona, "id">;
  public conversations!: EntityTable<StoredConversation, "id">;
  public messages!: EntityTable<StoredMessage, "id">;
  public memories!: EntityTable<StoredMemory, "id">;
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

    this.version(2).stores({
      memories: "id, characterId, updatedAt",
    });

    this.version(3).stores({
      characterCards: "characterId",
    });
  }

}
