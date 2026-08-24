import type { Metadata } from "next";

import type { ChatTestDoubleMode } from "./chat-adapter";
import ChatScreen from "./chat-screen";

export const metadata: Metadata = {
  title: "Chat | Livoa",
  description: "Have local-first streaming conversations with your characters.",
};

type ChatPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function getTestDouble(
  value: string | string[] | undefined,
): ChatTestDoubleMode | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "stream" || candidate === "slow" || candidate === "error"
    ? candidate
    : undefined;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const params = await searchParams;

  return <ChatScreen testDouble={getTestDouble(params["test-double"])} />;
}
