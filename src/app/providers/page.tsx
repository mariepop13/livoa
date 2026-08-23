import type { Metadata } from "next";

import ProviderSettingsScreen from "./provider-settings-screen";

export const metadata: Metadata = {
  title: "Provider settings | Livoa",
  description: "Configure local provider settings for Livoa.",
};

export default function ProvidersPage() {
  return <ProviderSettingsScreen />;
}
