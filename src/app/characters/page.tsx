import type { Metadata } from "next";

import CharacterManagementScreen from "./character-management-screen";

export const metadata: Metadata = {
  title: "Characters | Livoa",
  description: "Create and manage the characters saved locally in Livoa.",
};

export default function CharactersPage() {
  return <CharacterManagementScreen />;
}
