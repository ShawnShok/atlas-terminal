import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [watchlist, liveStocks, panelContent, liveNews, liveEvents, stocksCss, shell] = await Promise.all([
  readFile(new URL("components/stocks/Watchlist.tsx", root), "utf8"),
  readFile(new URL("components/terminal/LiveStockPanels.tsx", root), "utf8"),
  readFile(new URL("components/terminal/PanelContent.tsx", root), "utf8"),
  readFile(new URL("components/terminal/LiveNewsPanel.tsx", root), "utf8"),
  readFile(new URL("components/terminal/LiveEventsPanel.tsx", root), "utf8"),
  readFile(new URL("components/stocks/stocks.css", root), "utf8"),
  readFile(new URL("components/terminal/TerminalShell.tsx", root), "utf8"),
]);

test("watchlist research indicators expose real, accessible terminal navigation targets", () => {
  assert.match(watchlist, /export type WatchlistResearchTarget =\s*\| \{ readonly view: "news"; readonly itemId: string \}/);
  assert.match(watchlist, /onResearchSelect\(row\.ticker, \{ view: "news", itemId: article\.id \}\)/);
  assert.match(watchlist, /onResearchSelect\(row\.ticker, \{ view: "events", itemId: event\.id, startsAt: event\.startsAt \}\)/);
  assert.match(watchlist, /onResearchSelect\(row\.ticker, \{ view: "options", itemId: null \}\)/);
  assert.match(watchlist, /aria-label=\{`Open \$\{row\.ticker\} news: \$\{article\.title\}`\}/);
  assert.match(watchlist, /aria-label=\{`Open \$\{row\.ticker\} events: \$\{event\.title\}`\}/);
  assert.match(watchlist, /aria-label=\{`Open \$\{row\.ticker\} options activity`\}/);
  assert.match(watchlist, /if \(event\.target !== event\.currentTarget\) return;/);
});

test("news retains its honest external-link fallback when terminal navigation is absent", () => {
  assert.match(watchlist, /if \(onResearchSelect\) \{[\s\S]*?view: "news"[\s\S]*?return article\.articleUrl/);
  assert.match(watchlist, /target="_blank" rel="noreferrer"/);
});

test("LiveWatchlistPanel and PanelContent route indicators to ticker research tabs", () => {
  assert.match(liveStocks, /onResearchSelect\?: WatchlistResearchSelect/);
  assert.match(liveStocks, /<Watchlist[\s\S]*?onResearchSelect=\{onResearchSelect \?/);
  assert.match(panelContent, /onResearchSelect=\{openWatchlistResearch\}/);
  assert.match(panelContent, /onTickerChange\(symbol\);\s*onViewChange\(target\.view\);/);
  assert.match(panelContent, /initialArticleId=\{activeWatchlistResearch\?\.view === "news" \? activeWatchlistResearch\.itemId : null\}/);
  assert.match(panelContent, /initialEventId=\{activeWatchlistResearch\?\.view === "events" \? activeWatchlistResearch\.itemId : null\}/);
  assert.match(panelContent, /initialEventStartsAt=\{activeWatchlistResearch\?\.view === "events" \? activeWatchlistResearch\.startsAt : null\}/);
});

test("linked news and events select the originating watchlist record when it is returned", () => {
  assert.match(liveNews, /useState<string \| null>\(initialArticleId\)/);
  assert.match(liveNews, /articles\.find\(\(article\) => article\.id === selectedId\)/);
  assert.match(liveEvents, /useState<string \| null>\(initialEventId\)/);
  assert.match(liveEvents, /events\.find\(\(event\) => event\.id === selectedId\)/);
  assert.match(liveEvents, /horizon: initialEventDate \? "custom"/);
});

test("watchlist research links remain dense and keyboard-visible", () => {
  assert.match(stocksCss, /\.stock-watchlist-research-button \{[^}]*width: 100%;[^}]*display: grid;[^}]*background: transparent;[^}]*font: inherit;/);
  assert.match(stocksCss, /\.stock-watchlist-research-button:focus-visible \{[^}]*outline: 2px solid var\(--blue\)/);
});

test("global news and events retain all-symbol scope while ticker research remains scoped", () => {
  assert.match(shell, /const \[panelResearchScopes, setPanelResearchScopes\]/);
  assert.match(shell, /intent\.kind === "news" \|\| intent\.kind === "events" \|\| intent\.kind === "earnings"/);
  assert.match(shell, /item\.id === "news" \|\| item\.id === "events" \? "all" : "ticker"/);
  assert.match(panelContent, /allSymbols=\{researchScope === "all"\}/);
  assert.match(panelContent, /researchScope === "all" && \(view === "news" \|\| view === "events"\)/);
});

test("watchlist loading does not masquerade as an empty list", () => {
  assert.match(liveStocks, /result\.data \?\? \(symbols\.length === 0 \? bundle : null\)/);
  assert.match(watchlist, /status\.state === "loading" \? "LOADING WATCHLIST"/);
  assert.match(watchlist, /status\.state === "error" \? "WATCHLIST UNAVAILABLE"/);
});
