import type { Metadata } from "next";

import MemoryManagementScreen from "./memory-management-screen";

export const metadata: Metadata = {
  title: "Memories | Livoa",
  description: "Create and manage local notes for your saved characters.",
};

export default function MemoriesPage() {
  return <MemoryManagementScreen />;
}
