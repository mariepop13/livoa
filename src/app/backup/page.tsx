import type { Metadata } from "next";

import BackupScreen from "./backup-screen";

export const metadata: Metadata = {
  title: "Backup | Livoa",
  description: "Export or restore the content stored locally in Livoa.",
};

export default function BackupPage() {
  return <BackupScreen />;
}
