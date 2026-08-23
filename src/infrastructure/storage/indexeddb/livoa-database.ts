import Dexie, { type EntityTable } from "dexie";
type StoredRecord = { id: string; updatedAt: string };
export class LivoaDatabase extends Dexie { characters!: EntityTable<StoredRecord, "id">; personas!: EntityTable<StoredRecord, "id">; conversations!: EntityTable<StoredRecord, "id">; messages!: EntityTable<StoredRecord, "id">; settings!: EntityTable<StoredRecord, "id">; public constructor() { super("livoa"); this.version(1).stores({ characters: "id, updatedAt", personas: "id, updatedAt", conversations: "id, characterId, updatedAt", messages: "id, conversationId", settings: "id" }); } }
