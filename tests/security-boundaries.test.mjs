import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Massive credentials are server-only and sent in the authorization header", async () => {
  const [client, env, factory] = await Promise.all([
    readFile(new URL("lib/massive/client.ts", root), "utf8"),
    readFile(new URL("lib/env.ts", root), "utf8"),
    readFile(new URL("lib/massive/factory.ts", root), "utf8"),
  ]);

  assert.match(client, /Authorization:\s*`Bearer \$\{this\.#apiKey\}`/);
  assert.doesNotMatch(client, /[?&](?:api_?key|token)=/i);
  assert.match(env, /^import "server-only";/);
  assert.match(factory, /^import "server-only";/);
  assert.match(env, /MASSIVE_API_KEY is required when USE_MOCK_DATA is false/);
  assert.match(env, /"API_KEY_MISSING"/);
});

test("client components do not reference server credentials or provider origins", async () => {
  const clientFiles = [
    "components/research/NewsTerminal.tsx",
    "components/terminal/LiveNewsPanel.tsx",
    "components/terminal/LiveStockPanels.tsx",
    "components/terminal/TopBar.tsx",
    "components/terminal/DataState.tsx",
    "hooks/useResearchData.ts",
  ];
  for (const file of clientFiles) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /MASSIVE_API_KEY|api\.massive\.com|Authorization:\s*[`'"]Bearer/i, file);
  }
});

test("local secret files remain ignored while the safe example stays tracked", async () => {
  const ignore = await readFile(new URL(".gitignore", root), "utf8");
  assert.match(ignore, /^\.env\*$/m);
  assert.match(ignore, /^!\.env\.example$/m);
});
