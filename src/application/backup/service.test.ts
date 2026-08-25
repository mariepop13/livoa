import { describe, expect, it } from "vitest";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupSnapshotSchema,
  type BackupData,
} from "./snapshot";
import { LocalBackupService, type BackupStorage } from "./service";

const timestamp = "2026-08-24T12:00:00.000Z";
const characterId = "11111111-1111-4111-8111-111111111111";
const personaId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";

const backupData: BackupData = {
  characters: [
    {
      id: characterId,
      name: "Mira Vale",
      description: "A calm cartographer.",
      personality: "Observant and grounded.",
      systemPrompt: "Guide the conversation clearly.",
      greeting: "Where should we begin?",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  personas: [
    {
      id: personaId,
      name: "Avery",
      description: "A curious traveler.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  conversations: [
    {
      id: conversationId,
      characterId,
      personaId,
      title: "Mapping a route",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  messages: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      conversationId,
      role: "user",
      content: "Help me plan a route.",
      createdAt: timestamp,
    },
  ],
  settings: {
    theme: "dark",
    providers: [
      {
        id: "openrouter-local",
        providerId: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        selectedModelId: "example/model",
        enabled: true,
      },
    ],
  },
};

class MemoryBackupStorage implements BackupStorage {
  public replacement: BackupData | undefined;

  public constructor(private readonly data: unknown = backupData) {}

  public async readAll(): Promise<unknown> {
    return this.data;
  }

  public async replaceAll(data: BackupData): Promise<void> {
    this.replacement = data;
  }
}

function backupContents(data: unknown = backupData): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: timestamp,
    data,
  });
}

describe("LocalBackupService", () => {
  it("exports a validated, versioned snapshot with every supported collection", async () => {
    const service = new LocalBackupService(new MemoryBackupStorage(), {
      now: () => new Date(timestamp),
    });

    const file = await service.createExport();
    const snapshot = backupSnapshotSchema.parse(
      JSON.parse(file.contents) as unknown,
    );

    expect(file.fileName).toBe("livoa-backup-2026-08-24T12-00-00.000Z.json");
    expect(snapshot.data).toEqual(backupData);
  });

  it("refuses to export unexpected credential fields", async () => {
    const unsafeData = {
      ...backupData,
      settings: {
        ...backupData.settings,
        providers: [
          {
            ...backupData.settings?.providers[0],
            credential: "must-never-leave-this-device",
          },
        ],
      },
    };
    const service = new LocalBackupService(
      new MemoryBackupStorage(unsafeData),
      { now: () => new Date(timestamp) },
    );

    await expect(service.createExport()).rejects.toThrow();
  });

  it("preserves historical references after their local records were deleted", async () => {
    const historicalData = { ...backupData, personas: [] };
    const service = new LocalBackupService(
      new MemoryBackupStorage(historicalData),
      { now: () => new Date(timestamp) },
    );

    const file = await service.createExport();
    const snapshot = backupSnapshotSchema.parse(
      JSON.parse(file.contents) as unknown,
    );

    expect(snapshot.data.conversations[0]?.personaId).toBe(personaId);
  });

  it("validates the whole snapshot before replacing storage", async () => {
    const storage = new MemoryBackupStorage();
    const service = new LocalBackupService(storage);
    const invalidData = {
      ...backupData,
      messages: [
        {
          ...backupData.messages[0],
          createdAt: "not-an-iso-date",
        },
      ],
    };

    const result = await service.importBackup(backupContents(invalidData));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_BACKUP",
        message:
          "This file is not a valid Livoa backup. Choose an unmodified backup file.",
      },
    });
    expect(storage.replacement).toBeUndefined();
  });

  it("previews and imports a valid snapshot only after validation", async () => {
    const storage = new MemoryBackupStorage();
    const service = new LocalBackupService(storage);
    const contents = backupContents();

    expect(service.inspectImport(contents)).toEqual({
      ok: true,
      data: {
        characters: 1,
        personas: 1,
        conversations: 1,
        messages: 1,
        hasSettings: true,
      },
    });

    const result = await service.importBackup(contents);

    expect(result.ok).toBe(true);
    expect(storage.replacement).toEqual(backupData);
  });

  it("rejects malformed JSON and unknown snapshot fields without writing", async () => {
    const storage = new MemoryBackupStorage();
    const service = new LocalBackupService(storage);

    expect(await service.importBackup("not json")).toMatchObject({ ok: false });
    expect(
      await service.importBackup(
        JSON.stringify({
          ...JSON.parse(backupContents()),
          credential: "not-allowed",
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(storage.replacement).toBeUndefined();
  });
});
