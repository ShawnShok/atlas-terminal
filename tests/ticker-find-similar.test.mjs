import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [overview, livePanels, stocksCss] = await Promise.all([
  readFile(new URL("components/stocks/TickerOverviewIntelligence.tsx", root), "utf8"),
  readFile(new URL("components/terminal/LiveStockPanels.tsx", root), "utf8"),
  readFile(new URL("components/stocks/stocks.css", root), "utf8"),
]);

test("ticker overview exposes an optional accessible Find Similar action", () => {
  assert.match(overview, /readonly onFindSimilar\?: \(ticker: string\) => void/);
  assert.match(overview, /\{onFindSimilar \? \([\s\S]*?<button[\s\S]*?type="button"[\s\S]*?className="stock-find-similar-button"/);
  assert.match(overview, /aria-label=\{`Find scanner results similar to \$\{model\.symbol\}`\}/);
  assert.match(overview, /onClick=\{\(\) => onFindSimilar\(model\.symbol\)\}/);
  assert.match(overview, />\s*FIND SIMILAR\s*<\/button>/);
});

test("live stock overview forwards the optional callback without owning scanner navigation", () => {
  assert.match(livePanels, /export function LiveStockPanel\(\{[\s\S]*?onFindSimilar,/);
  assert.match(livePanels, /onFindSimilar\?: \(ticker: string\) => void/);
  assert.match(livePanels, /<TickerOverviewIntelligence[\s\S]*?onFindSimilar=\{onFindSimilar\}/);
  assert.doesNotMatch(livePanels, /createSimilarTickerRule|onViewChange\("scanner"\)/);
});

test("Find Similar stays compact, focus-visible, and responsive to panel width", () => {
  assert.match(stocksCss, /\.stock-intelligence-actions \{[^}]*grid-column: 1 \/ -1;[^}]*display: flex;/);
  assert.match(stocksCss, /\.stock-find-similar-button \{[^}]*min-height: 27px;[^}]*white-space: nowrap;/);
  assert.match(stocksCss, /\.stock-find-similar-button:focus-visible \{[^}]*outline: 2px solid var\(--blue\)/);
  assert.match(stocksCss, /@container workspace-panel \(max-width: 350px\) \{[\s\S]*?\.stock-intelligence-actions \{[^}]*flex-direction: column;[\s\S]*?\.stock-find-similar-button \{ width: 100%; \}/);
});
