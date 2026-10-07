import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [component, route, engine, shell, nav, css] = await Promise.all([
  readFile(new URL("components/terminal/AtlasAssistant.tsx", root), "utf8"),
  readFile(new URL("app/api/assistant/route.ts", root), "utf8"),
  readFile(new URL("lib/assistant/research.ts", root), "utf8"),
  readFile(new URL("components/terminal/TerminalShell.tsx", root), "utf8"),
  readFile(new URL("components/terminal/NavRail.tsx", root), "utf8"),
  readFile(new URL("app/globals.css", root), "utf8"),
]);

test("Copilot is reachable from terminal navigation and follows active context", () => {
  assert.match(nav, /id: "copilot", label: "AI Copilot"/);
  assert.match(shell, /<AtlasAssistant/);
  assert.match(shell, /ticker=\{activeTicker\}/);
  assert.match(shell, /activeView=\{activePanel\?\.view \?\? "dashboard"\}/);
  assert.match(component, /LIVE CONTEXT/);
  assert.match(component, /activeView/);
});

test("Copilot answers are grounded and every evidence card opens its terminal view", () => {
  assert.match(engine, /detectResearchPatterns/);
  assert.match(engine, /calculatePutCallRatios/);
  assert.match(engine, /findUnusualOptionActivity/);
  assert.match(engine, /Research assistance only/);
  assert.match(component, /message\.reply\.evidence\.map/);
  assert.match(component, /onNavigate\(item\.view\)/);
  assert.match(css, /\.assistant-evidence > button/);
});

test("assistant API validates input, requires hosted identity, and keeps responses private", () => {
  assert.match(route, /z\.string\(\)\.trim\(\)\.min\(2\)\.max\(600\)/);
  assert.match(route, /oai-authenticated-user-email/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.match(route, /Promise\.allSettled/);
  assert.doesNotMatch(component, /MASSIVE_API_KEY|Authorization:\s*[`'"]Bearer/i);
});

test("conversation history stays on the device and is bounded", () => {
  assert.match(component, /window\.localStorage/);
  assert.match(component, /slice\(-20\)/);
  assert.match(component, /history: nextMessages\.slice\(-8\)/);
  assert.match(component, /maxLength=\{600\}/);
});
