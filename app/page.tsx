import { TerminalShell } from "@/components/terminal/TerminalShell";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export default async function Home() {
  if (process.env.NODE_ENV === "production" && !process.env.NODE_TEST_CONTEXT) {
    await requireChatGPTUser("/");
  }
  return <TerminalShell />;
}
