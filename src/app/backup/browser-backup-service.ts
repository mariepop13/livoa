import { LocalBackupService } from "@/application/backup";
import { IndexedDbBackupStorage } from "@/infrastructure/storage/backup/indexeddb-backup-storage";

export function createBrowserBackupService(): LocalBackupService {
  return new LocalBackupService(new IndexedDbBackupStorage());
}
