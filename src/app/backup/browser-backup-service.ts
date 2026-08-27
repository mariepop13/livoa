import { LocalBackupService } from "@/application/backup";
import { WebStorageCredentialStore } from "@/infrastructure/credentials/web-storage-credential-store";

import { IndexedDbBackupStorage } from "@/infrastructure/storage/backup/indexeddb-backup-storage";

export function createBrowserBackupService(): LocalBackupService {
  return new LocalBackupService(
    new IndexedDbBackupStorage(),
    new WebStorageCredentialStore(window.localStorage),
  );
}
