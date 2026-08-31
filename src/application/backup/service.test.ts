import { describe, expect, it, vi } from "vitest";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_COLLECTION_LENGTH,
  MAX_BACKUP_IMPORT_SIZE,
  MAX_BACKUP_PROVIDER_CONFIGURATION_COUNT,
  backupSnapshotSchema,
  type BackupData,
} from "./snapshot";
import { LocalBackupService, type BackupStorage } from "./service";

const timestamp = "2026-08-24T12:00:00.000Z";
const characterId = "11111111-1111-4111-8111-111111111111";
const personaId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";

const memoryId = "55555555-5555-4555-8555-555555555555";
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
  memories: [
    {
      id: memoryId,
      characterId,
      subject: "user",
      content: "Prefers concise answers.",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  settings: {
    theme: "dark",
    memoryExtractionEnabled: false,
    memoryContextEnabled: false,
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

  public constructor(
    private readonly data: unknown = backupData,
    private readonly operations: string[] = [],
  ) {}

  public async readAll(): Promise<unknown> {
    return this.data;
  }

  public async replaceAll(data: BackupData): Promise<void> {
    this.operations.push("replace");
    this.replacement = data;
  }
}

class MemoryCredentialInvalidator {
  public invalidationError: Error | undefined;

  public constructor(private readonly operations: string[] = []) {}

  public async invalidateAll(): Promise<void> {
    this.operations.push("invalidate");

    if (this.invalidationError !== undefined) {
      throw this.invalidationError;
    }
  }
}

const noOpCredentialInvalidator = {
  async invalidateAll(): Promise<void> {},
};

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
    const service = new LocalBackupService(
      new MemoryBackupStorage(),
      noOpCredentialInvalidator,
      { now: () => new Date(timestamp) },
    );

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
      noOpCredentialInvalidator,
      { now: () => new Date(timestamp) },
    );

    await expect(service.createExport()).rejects.toThrow();
  });

  it("preserves historical references after their local records were deleted", async () => {
    const historicalData = { ...backupData, personas: [] };
    const service = new LocalBackupService(
      new MemoryBackupStorage(historicalData),
      noOpCredentialInvalidator,
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
    const service = new LocalBackupService(storage, noOpCredentialInvalidator);
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

  it("rejects invalid memory records before replacing storage", async () => {
    const storage = new MemoryBackupStorage();
    const service = new LocalBackupService(storage, noOpCredentialInvalidator);
    const invalidData = {
      ...backupData,
      memories: [
        {
          ...backupData.memories[0],
          updatedAt: "not-an-iso-date",
        },
      ],
    };

    const result = await service.importBackup(backupContents(invalidData));

    expect(result).toMatchObject({ ok: false });
    expect(storage.replacement).toBeUndefined();
  });

  it("invalidates credentials before replacing a valid backup", async () => {
    const operations: string[] = [];
    const storage = new MemoryBackupStorage(backupData, operations);
    const credentialInvalidator = new MemoryCredentialInvalidator(operations);
    const service = new LocalBackupService(storage, credentialInvalidator);
    const contents = backupContents();

    expect(service.inspectImport(contents)).toEqual({
      ok: true,
      data: {
        characters: 1,
        personas: 1,
        conversations: 1,
        messages: 1,
        memories: 1,
        hasSettings: true,
      },
    });

    const result = await service.importBackup(contents);

    expect(result.ok).toBe(true);
    expect(operations).toEqual(["invalidate", "replace"]);
    expect(storage.replacement).toEqual(backupData);
  });

  it("imports version-1 backups without memories as an empty collection", async () => {
    const storage = new MemoryBackupStorage();
    const service = new LocalBackupService(storage, noOpCredentialInvalidator);
    const historicalData = {
      characters: backupData.characters,
      personas: backupData.personas,
      conversations: backupData.conversations,
      messages: backupData.messages,
      settings: backupData.settings,
    };
    const historicalContents = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: timestamp,
      data: historicalData,
    });

    const result = await service.importBackup(historicalContents);

    expect(result).toMatchObject({ ok: true });
    expect(storage.replacement).toEqual({
      ...historicalData,
      memories: [],
    });
  });

  it("does not replace data when credential invalidation fails", async () => {
    const operations: string[] = [];
    const storage = new MemoryBackupStorage(backupData, operations);
    const credentialInvalidator = new MemoryCredentialInvalidator(operations);
    credentialInvalidator.invalidationError = new Error("Storage unavailable.");
    const service = new LocalBackupService(storage, credentialInvalidator);

    const result = await service.importBackup(backupContents());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CREDENTIAL_INVALIDATION_FAILED",
        message:
          "Backup could not be imported because saved credentials could not be disconnected. Your current data was not changed.",
      },
    });
    expect(operations).toEqual(["invalidate"]);
    expect(storage.replacement).toBeUndefined();
  });

  it("rejects oversized imports before parsing them", () => {
    const jsonParse = vi.spyOn(JSON, "parse");
    const service = new LocalBackupService(
      new MemoryBackupStorage(),
      noOpCredentialInvalidator,
    );

    try {
      expect(
        service.inspectImport("x".repeat(MAX_BACKUP_IMPORT_SIZE + 1)),
      ).toMatchObject({ ok: false });
      expect(jsonParse).not.toHaveBeenCalled();
    } finally {
      jsonParse.mockRestore();
    }
  });

  it("enforces record and provider collection limits in backup schemas", () => {
    const tooManyCharacters = {
      ...backupData,
      characters: Array.from(
        { length: MAX_BACKUP_COLLECTION_LENGTH + 1 },
        (_, index) => ({
          ...backupData.characters[0],
          id: `11111111-1111-4111-8111-${index.toString().padStart(12, "0")}`,
        }),
      ),
    };
    const tooManyProviders = {
      ...backupData,
      settings: {
        theme: "dark",
        providers: Array.from(
          { length: MAX_BACKUP_PROVIDER_CONFIGURATION_COUNT + 1 },
          (_, index) => ({
            id: `provider-${index}`,
            providerId: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1",
            selectedModelId: "example/model",
            enabled: true,
          }),
        ),
      },
    };

    const characterResult = backupSnapshotSchema.safeParse({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: timestamp,
      data: tooManyCharacters,
    });
    const providerResult = backupSnapshotSchema.safeParse({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: timestamp,
      data: tooManyProviders,
    });

    expect(characterResult.success).toBe(false);
    expect(providerResult.success).toBe(false);
  });

  it("rejects malformed JSON and unknown snapshot fields without writing", async () => {
    const storage = new MemoryBackupStorage();
    const service = new LocalBackupService(storage, noOpCredentialInvalidator);

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
