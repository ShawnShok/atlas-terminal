import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [navigation, panelContent, stockTerminal, workspace, workspacePanel, researchRoute] = await Promise.all([
  readFile(new URL("../components/stocks/TickerResearchNav.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/terminal/PanelContent.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/stocks/StockTerminal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/terminal/Workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/terminal/WorkspacePanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/research/route.ts", import.meta.url), "utf8"),
]);

test("ticker research exposes every connected research tab", () => {
  for (const label of ["OVERVIEW", "CHART", "NEWS", "EVENTS", "FINANCIALS", "OPTIONS", "TIMELINE", "NOTES"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(panelContent, /case "timeline"/);
  assert.match(panelContent, /initialView="catalysts"/);
  assert.match(panelContent, /TickerResearchNav/);
});

test("ticker header hides unavailable quote fields instead of presenting placeholders", () => {
  assert.match(stockTerminal, /quote\.bidPrice !== null \? <QuoteMetric label="BID"/);
  assert.match(stockTerminal, /quote\.askPrice !== null \? <QuoteMetric label="ASK"/);
  assert.match(stockTerminal, /spread !== null \? <QuoteMetric label="SPREAD"/);
  assert.match(stockTerminal, /52-WEEK HIGH/);
  assert.match(stockTerminal, /DAILY RVOL/);
});

test("ticker changes preserve panel navigation state while syncing the ticker editor", () => {
  assert.doesNotMatch(workspace, /key=\{`\$\{(?:maximized|node)\.id\}:\$\{(?:maximized|node)\.ticker\}`\}/);
  assert.match(workspace, /key=\{node\.id\}/);
  assert.match(workspacePanel, /const \[tickerDraft, setTickerDraft\] = useState<string \| null>\(null\)/);
  assert.match(workspacePanel, /value=\{tickerDraft \?\? panel\.ticker\}/);
  assert.doesNotMatch(workspace, /if \(maximized\) \{/);
  assert.match(workspace, /function containsPanel\(node: WorkspaceNode, panelId: string\)/);
  assert.match(workspace, /hiddenByMaximize=\{firstHidden\}/);
  assert.match(workspacePanel, /is-maximized-hidden/);
});

test("symbol-specific research routes reject a missing ticker instead of silently returning NVDA", () => {
  assert.match(researchRoute, /A ticker query parameter is required/);
  assert.match(researchRoute, /const tickerRequired = \["security", "chart", "options", "options-surface", "financials", "timeline"\]/);
  assert.match(researchRoute, /ticker\(tickerParameter, tickerRequired \? undefined : "NVDA"\)/);
});

test("watchlist keeps a valid quote when optional enrichment calls fail", () => {
  assert.match(researchRoute, /const snapshot = await market\.getSnapshot\(symbol\)/);
  assert.match(researchRoute, /getTickerDetails\(symbol\)\.catch\(\(\) => null\)/);
  assert.match(researchRoute, /getAggregateBars\([\s\S]*?\)\.catch\(\(\) => \[\]\)/);
  assert.match(researchRoute, /options && options\.contracts\.length > 0/);
  assert.match(researchRoute, /return mapWithConcurrency\(requested, SCANNER_CONTEXT_CONCURRENCY, async \(symbol\) =>/);
});
