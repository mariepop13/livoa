import type { CredentialStore } from "@/domain/ports";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_IMPORT_SIZE,
  backupSnapshotSchema,
  type BackupData,
  type BackupSnapshot,
} from "./snapshot";

export interface BackupStorage {
  readAll(): Promise<unknown>;
  replaceAll(data: BackupData): Promise<void>;
}

export type BackupPreview = Readonly<{
  characters: number;
  personas: number;
  conversations: number;
  messages: number;
  memories: number;
  hasSettings: boolean;
}>;

export type BackupFile = Readonly<{
  fileName: string;
  contents: string;
}>;

export type BackupError = Readonly<{
  code: "INVALID_BACKUP" | "CREDENTIAL_INVALIDATION_FAILED";
  message: string;
}>;

export type BackupResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: BackupError };

export interface BackupApplicationService {
  createExport(): Promise<BackupFile>;
  inspectImport(contents: string): BackupResult<BackupPreview>;
  importBackup(contents: string): Promise<BackupResult<BackupPreview>>;
}

type CredentialInvalidator = Pick<CredentialStore, "invalidateAll">;

type BackupServiceDependencies = Readonly<{
  now: () => Date;
}>;

const defaultDependencies: BackupServiceDependencies = {
  now: () => new Date(),
};

function success<T>(data: T): BackupResult<T> {
  return { ok: true, data };
}

function invalidBackup(): BackupResult<never> {
  return {
    ok: false,
    error: {
      code: "INVALID_BACKUP",
      message:
        "This file is not a valid Livoa backup. Choose an unmodified backup file.",
    },
  };
}

function credentialInvalidationFailed(): BackupResult<never> {
  return {
    ok: false,
    error: {
      code: "CREDENTIAL_INVALIDATION_FAILED",
      message:
        "Backup could not be imported because saved credentials could not be disconnected. Your current data was not changed.",
    },
  };
}

function parseBackup(contents: string): BackupResult<BackupSnapshot> {
  if (contents.length > MAX_BACKUP_IMPORT_SIZE) {
    return invalidBackup();
  }

  let candidate: unknown;

  try {
    candidate = JSON.parse(contents) as unknown;
  } catch {
    return invalidBackup();
  }

  const parsed = backupSnapshotSchema.safeParse(candidate);
  return parsed.success ? success(parsed.data) : invalidBackup();
}

function previewFromSnapshot(snapshot: BackupSnapshot): BackupPreview {
  return {
    characters: snapshot.data.characters.length,
    personas: snapshot.data.personas.length,
    conversations: snapshot.data.conversations.length,
    messages: snapshot.data.messages.length,
    memories: snapshot.data.memories.length,
    hasSettings: snapshot.data.settings !== null,
  };
}

function backupFileName(exportedAt: string): string {
  return `livoa-backup-${exportedAt.replaceAll(":", "-")}.json`;
}

export class LocalBackupService implements BackupApplicationService {
  public constructor(
    private readonly storage: BackupStorage,
    private readonly credentialStore: CredentialInvalidator,
    private readonly dependencies: BackupServiceDependencies = defaultDependencies,
  ) {}

  public async createExport(): Promise<BackupFile> {
    const data = await this.storage.readAll();
    const exportedAt = this.dependencies.now().toISOString();
    const snapshot = backupSnapshotSchema.parse({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt,
      data,
    });

    return {
      fileName: backupFileName(exportedAt),
      contents: JSON.stringify(snapshot, null, 2),
    };
  }

  public inspectImport(contents: string): BackupResult<BackupPreview> {
    const parsed = parseBackup(contents);
    return parsed.ok ? success(previewFromSnapshot(parsed.data)) : parsed;
  }

  public async importBackup(
    contents: string,
  ): Promise<BackupResult<BackupPreview>> {
    const parsed = parseBackup(contents);

    if (!parsed.ok) {
      return parsed;
    }

    try {
      await this.credentialStore.invalidateAll();
    } catch {
      return credentialInvalidationFailed();
    }
    await this.storage.replaceAll(parsed.data.data);
    return success(previewFromSnapshot(parsed.data));
  }
}
