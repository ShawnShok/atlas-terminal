import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, panel, terminal, savedHook, context, watchlistHook] = await Promise.all([
  readFile(new URL("../app/api/research/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/terminal/LiveScannerPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/research/ScannerTerminal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../hooks/useSavedScanners.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/scanner/context.ts", import.meta.url), "utf8"),
  readFile(new URL("../hooks/useWatchlists.ts", import.meta.url), "utf8"),
]);

test("scanner uses a bounded-concurrency server-side cross-source context endpoint with explicit coverage", () => {
  assert.match(route, /case "scanner-context"/);
  assert.match(route, /SCANNER_CONTEXT_SAFETY_LIMIT = 100/);
  assert.match(route, /mapWithConcurrency\(requested, SCANNER_CONTEXT_CONCURRENCY/);
  assert.match(route, /universeCoverage/);
  assert.match(route, /requestedCount: selectedUniverse\.length/);
  assert.doesNotMatch(panel, /slice\(0, 12\)/);
  assert.match(route, /getLiveNewsWithFallback/);
  assert.match(route, /getCorporateEvents/);
  assert.match(route, /scannerContextResults\(requested, mode, research, market, 366\)/);
  assert.match(route, /missingNewsSymbols[\s\S]*ticker: item,[\s\S]*limit: 20/);
  assert.match(route, /missingEventSymbols[\s\S]*ticker: item,[\s\S]*limit: 50/);
  assert.match(route, /ticker-specific corporate-event fill unavailable/);
  assert.match(route, /optionsAvailable \? "options developer" : null/);
  assert.match(route, /asOf: evaluationTime/);
  assert.match(route, /result\.failures/);
  assert.match(context, /optionChain/);
  assert.match(context, /optionsAvailable: options\.available/);
  assert.match(context, /status: event\.status/);
  assert.match(context, /headline: article\.title/);
  assert.match(context, /calculateIntradayRelativeVolume/);
  assert.match(context, /optionSelectedExpiration: options\.selectedExpiration/);
  assert.doesNotMatch(panel, /MASSIVE_API_KEY|api\.massive\.com/i);
});

test("scanner builder exposes bounded AND\/OR logic, presets, refresh, CSV, and explanations", () => {
  assert.match(panel, /useResearchData<ScannerContextBundle>\("scanner-context"/);
  assert.match(panel, /useWatchlists\(\)/);
  assert.match(panel, /ruleLeafCount\(ruleTree\) >= 12/);
  assert.match(panel, /calculateResearchPriority/);
  assert.match(panel, /text\/csv/);
  assert.match(terminal, /MATCH ALL \(AND\)/);
  assert.match(terminal, /MATCH ANY \(OR\)/);
  assert.match(terminal, /AUTO 60S/);
  assert.match(terminal, /RESEARCH PRIORITY/);
  assert.match(terminal, /research-scanner-reasons/);
});

test("saved scanners use the owner-scoped personal API with a session fallback", () => {
  assert.match(savedHook, /resource=scanners/);
  assert.match(savedHook, /resource=status/);
  assert.match(savedHook, /connect PostgreSQL for durability/i);
  assert.match(panel, /onDeleteSavedPreset/);
  assert.match(panel, /onDuplicate/);
});

test("session watchlists are shared across research modules and survive view remounts", () => {
  assert.match(watchlistHook, /useSyncExternalStore\(subscribeSessionStore/);
  assert.match(watchlistHook, /WATCHLIST_SESSION_STORAGE_KEY/);
  assert.match(watchlistHook, /window\.sessionStorage\.setItem\(WATCHLIST_SESSION_STORAGE_KEY/);
  assert.match(watchlistHook, /updateSessionStore\(\(current\) =>/);
  assert.doesNotMatch(watchlistHook, /const \[lists, setLists\] = useState/);
});
