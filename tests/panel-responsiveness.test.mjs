import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [globals, stocks, research, charts, priceChart, stockTerminal, watchlist] = await Promise.all([
  readFile(new URL("app/globals.css", root), "utf8"),
  readFile(new URL("components/stocks/stocks.css", root), "utf8"),
  readFile(new URL("components/research/research.css", root), "utf8"),
  readFile(new URL("components/charts/charts.css", root), "utf8"),
  readFile(new URL("components/charts/PriceChart.tsx", root), "utf8"),
  readFile(new URL("components/stocks/StockTerminal.tsx", root), "utf8"),
  readFile(new URL("components/stocks/Watchlist.tsx", root), "utf8"),
]);

test("workspace panels establish independent size containers", () => {
  assert.match(globals, /\.workspace-panel\s*\{[\s\S]*?container:\s*workspace-panel\s*\/\s*size;/);
  assert.match(globals, /\.workspace-split\s*>\s*\*\s*\{\s*min-width:\s*0;\s*min-height:\s*0;/);
  assert.match(globals, /@container workspace-panel \(max-width:\s*520px\)/);
  assert.match(globals, /@container workspace-panel \(max-width:\s*360px\)/);
  assert.match(globals, /\.workspace-root\.is-maximized \.workspace-split \{ grid-template: minmax\(0, 1fr\) \/ minmax\(0, 1fr\) !important; \}/);
  assert.match(globals, /\.workspace-root\.is-maximized \.is-maximized-hidden \{ display: none; \}/);
});

test("stock and research modules reflow from panel width instead of viewport width", () => {
  for (const source of [stocks, research]) {
    assert.match(source, /@container workspace-panel \(max-width:/);
  }
  assert.match(stocks, /\.stock-overview,[\s\S]*?\.stock-home-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(stocks, /\.stock-watchlist-table\s*\{\s*min-width:\s*100%;\s*table-layout:\s*fixed;/);
  assert.match(stocks, /\.stock-watchlist-table :is\(col, th, td\)\[data-column\]\s*\{\s*width:\s*auto !important;/);
  assert.match(stocks, /\[data-column="latestNews"\]/);
  assert.match(stocks, /\[data-role="reorder"\]/);
  assert.match(watchlist, /"--watchlist-min-width": `\$\{tableMinimumWidth\}px`/);
  assert.doesNotMatch(watchlist, /minWidth:\s*tableMinimumWidth/);
  assert.match(watchlist, /<col key=\{column\.id\} data-column=\{column\.id\}/);
  assert.match(research, /\.research-master-detail,[\s\S]*?\.research-strategy-analysis\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(research, /\.research-news-table,[\s\S]*?\.research-news-markers\s*\{\s*min-width:\s*0;\s*table-layout:\s*fixed;/);
  assert.match(research, /\.research-option-chain\.quotes-unavailable\s*\{[\s\S]*?min-width:\s*100%;[\s\S]*?table-layout:\s*fixed;/);
  assert.match(research, /\.option-chain-midpoint,[\s\S]*?\.option-chain-vega\s*\{\s*display:\s*none;/);
});

test("the price chart has a bounded resize surface and keeps automatic resize enabled", () => {
  assert.match(charts, /\.stock-price-chart\s*\{[\s\S]*?height:\s*100%;[\s\S]*?grid-template-rows:/);
  assert.match(charts, /\.stock-price-chart\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(charts, /\.stock-chart-canvas\s*\{[\s\S]*?height:\s*100%;[\s\S]*?align-self:\s*stretch;[\s\S]*?overflow:\s*hidden;/);
  assert.match(stocks, /\.stock-terminal-chart \.stock-frame-body\s*\{[\s\S]*?display:\s*flex;[\s\S]*?overflow:\s*auto;/);
  assert.match(stocks, /\.stock-terminal-chart \.stock-price-chart\s*\{[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*1 0 260px;/);
  assert.match(stocks, /\.ticker-research-stack\s*\{[\s\S]*?height:\s*100%;[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(stocks, /\.ticker-research-panel-content\s*\{\s*grid-row:\s*2;[\s\S]*?height:\s*100%;/);
  assert.match(stockTerminal, /className=\{`stock-terminal stock-terminal-\$\{activeView\}`\}/);
  assert.match(charts, /@container workspace-panel \(max-height:\s*480px\)/);
  assert.match(priceChart, /autoSize:\s*true/);
  assert.doesNotMatch(priceChart, /className="stock-chart-canvas"[^>]*style=/);
});
