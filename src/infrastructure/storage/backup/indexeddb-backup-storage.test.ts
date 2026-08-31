import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type { BackupData } from "@/application/backup";
import type {
  StoredAppSettings,
  StoredCharacter,
  StoredConversation,
  StoredMemory,
  StoredMessage,
  StoredPersona,
} from "@/infrastructure/storage/indexeddb/record-schemas";

import { IndexedDbBackupStorage } from "./indexeddb-backup-storage";

interface TransactionTable<Record extends { id: string }> {
  toArray(): Promise<Record[]>;
  get(id: string): Promise<Record | undefined>;
  clear(): Promise<void>;
  bulkPut(records: readonly Record[]): Promise<unknown>;
  put(record: Record): Promise<unknown>;
}

class MemoryTable<
  Record extends { id: string },
> implements TransactionTable<Record> {
  readonly #records = new Map<string, Record>();

  public async toArray(): Promise<Record[]> {
    return [...this.#records.values()];
  }

  public async get(id: string): Promise<Record | undefined> {
    return this.#records.get(id);
  }

  public async clear(): Promise<void> {
    this.#records.clear();
  }

  public async bulkPut(records: readonly Record[]): Promise<unknown> {
    records.forEach((record) => this.#records.set(record.id, record));
    return undefined;
  }

  public async put(record: Record): Promise<unknown> {
    this.#records.set(record.id, record);
    return undefined;
  }
}

class MemoryBackupDatabase {
  public readonly characters = new MemoryTable<StoredCharacter>();
  public readonly personas = new MemoryTable<StoredPersona>();
  public readonly conversations = new MemoryTable<StoredConversation>();
  public readonly messages = new MemoryTable<StoredMessage>();
  public readonly memories = new MemoryTable<StoredMemory>();
  public readonly settings = new MemoryTable<StoredAppSettings>();
  public readonly transactionModes: Array<"r" | "rw"> = [];

  public async transaction<Result>(
    mode: "r" | "rw",
    operation: () => Promise<Result>,
  ): Promise<Result> {
    this.transactionModes.push(mode);
    return operation();
  }
}

const timestamp = "2026-08-24T12:00:00.000Z";
const memory = {
  id: "55555555-5555-4555-8555-555555555555",
  characterId: "11111111-1111-4111-8111-111111111111",
  subject: "user",
  content: "Prefers concise answers.",
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies BackupData["memories"][number];

const backupData: BackupData = {
  characters: [],
  personas: [],
  conversations: [],
  messages: [],
  memories: [memory],
  settings: null,
};

describe("IndexedDbBackupStorage", () => {
  it("includes memory records when reading and replacing backup data", async () => {
    const database = new MemoryBackupDatabase();
    const storage = new IndexedDbBackupStorage(database);

    await storage.replaceAll(backupData);

    await expect(storage.readAll()).resolves.toEqual(backupData);
    expect(database.transactionModes).toEqual(["rw", "r"]);
  });

  it("validates memories before beginning a replacement transaction", async () => {
    const database = new MemoryBackupDatabase();
    const storage = new IndexedDbBackupStorage(database);
    const invalidData: BackupData = {
      ...backupData,
      memories: [{ ...memory, updatedAt: "not-an-iso-date" }],
    };

    await storage.replaceAll(backupData);
    await expect(storage.replaceAll(invalidData)).rejects.toBeInstanceOf(
      ZodError,
    );

    await expect(storage.readAll()).resolves.toEqual(backupData);
    expect(database.transactionModes).toEqual(["rw", "r"]);
  });
});
