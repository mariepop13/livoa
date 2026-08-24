import type { Metadata } from "next";

import PersonaManagementScreen from "./persona-management-screen";

export const metadata: Metadata = {
  title: "Personas | Livoa",
  description: "Create and manage the personas saved locally in Livoa.",
};

export default function PersonasPage() {
  return <PersonaManagementScreen />;
}
