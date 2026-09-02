import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const [liveAnalyticsSource, analyticsTerminalSource, researchCssSource] = await Promise.all([
  readFile(new URL("../components/terminal/LiveAnalyticsPanel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/research/AnalyticsTerminal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/research/research.css", import.meta.url), "utf8"),
]);

const breadth = await loadTypeScriptModule(
  new URL("../lib/analytics/breadth.ts", import.meta.url),
);
const performance = await loadTypeScriptModule(
  new URL("../lib/analytics/performance.ts", import.meta.url),
);
const patterns = await loadTypeScriptModule(
  new URL("../lib/analytics/patterns.ts", import.meta.url),
);
const newsPrice = await loadTypeScriptModule(
  new URL("../lib/analytics/news-price.ts", import.meta.url),
);

test("comparison view exposes a provider-backed add-ticker control", () => {
  assert.match(liveAnalyticsSource, /MAX_COMPARISON_SYMBOLS = 4/);
  assert.match(liveAnalyticsSource, /\[ticker, "AMD", "AVGO"\]/);
  assert.match(liveAnalyticsSource, /<TickerSearch/);
  assert.match(liveAnalyticsSource, /"search",\s*\n\s*\{ q: debouncedQuery \}/);
  assert.match(liveAnalyticsSource, /right\.symbol\.toUpperCase\(\) === normalizedQuery/);
  assert.match(liveAnalyticsSource, /aria-label=\{full \? "Remove a ticker before adding another" : "Add ticker to comparison"\}/);
  assert.match(liveAnalyticsSource, /setAdditionState/);
  assert.match(analyticsTerminalSource, /comparisonControls\?: ReactNode/);
  assert.match(analyticsTerminalSource, /research-comparison-view/);
  assert.match(researchCssSource, /\.research-comparison-add/);
});

test("news-price timeline supports pointer, keyboard, marker, and table interaction", () => {
  assert.match(analyticsTerminalSource, /tabIndex=\{0\}/);
  assert.match(analyticsTerminalSource, /onPointerMove=/);
  assert.match(analyticsTerminalSource, /event\.key === "ArrowLeft"/);
  assert.match(analyticsTerminalSource, /aria-pressed=\{marker\.id === selectedMarkerId\}/);
  assert.match(analyticsTerminalSource, /research-news-inspector/);
  assert.match(analyticsTerminalSource, /PREVIOUS NEWS/);
  assert.match(analyticsTerminalSource, /NEXT NEWS/);
  assert.match(researchCssSource, /\.research-price-columns > div\.is-active/);
  assert.match(researchCssSource, /\.research-news-markers tbody tr\.is-selected/);
});

test("pattern cards disclose developing versus confirmed phase", () => {
  assert.match(analyticsTerminalSource, /phase-\$\{candidate\.phase\}/);
  assert.match(liveAnalyticsSource, /Developing setups are separated from fresh patterns confirmed by a closing neckline break/);
});

test("market breadth reports directional counts, SMA coverage, and yearly extremes", () => {
  const result = breadth.calculateMarketBreadth([
    {
      symbol: "ADV",
      currentClose: 201,
      previousClose: 200,
      closes: Array.from({ length: 201 }, (_, index) => index + 1),
      high52Week: 201,
      low52Week: 1,
    },
    {
      symbol: "DEC",
      currentClose: 90,
      previousClose: 100,
      closes: Array.from({ length: 200 }, () => 110),
      high52Week: 150,
      low52Week: 90,
    },
    {
      symbol: "FLAT",
      currentClose: 50,
      previousClose: 50,
      closes: Array.from({ length: 50 }, () => 50),
    },
  ], "2026-08-15T20:00:00Z");
  assert.equal(result.advancing, 1);
  assert.equal(result.declining, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.advanceDeclineRatio, 1);
  assert.equal(result.above200DaySma.eligibleCount, 2);
  assert.equal(result.above200DaySma.aboveCount, 1);
  assert.equal(result.newHighs, 1);
  assert.equal(result.newLows, 1);
});

test("performance comparison normalizes every security to a shared timestamp", () => {
  const result = performance.compareNormalizedPerformance([
    { symbol: "AAA", points: [
      { timestamp: "2026-01-01", price: 100 },
      { timestamp: "2026-01-02", price: 110 },
    ] },
    { symbol: "BBB", points: [
      { timestamp: "2026-01-01", price: 50 },
      { timestamp: "2026-01-02", price: 45 },
    ] },
  ]);
  assert.equal(result.baselineTimestamp, "2026-01-01");
  assert.ok(Math.abs(result.series[0].points[1].percentReturn - 10) < 1e-12);
  assert.ok(Math.abs(result.series[1].points[1].percentReturn + 10) < 1e-12);
});

test("experimental pattern detection returns confidence, levels, reasoning, and safety language", () => {
  const lows = [10, 9.8, 9, 9.8, 10.5, 11, 10.5, 9.7, 9.1, 9.8, 10.5, 11];
  const bars = lows.map((low, index) => ({
    timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: low + 0.4,
    high: low + 1,
    low,
    close: low + 0.6,
    volume: index === lows.length - 1 ? 2_000 : 1_000,
  }));
  const detections = patterns.detectResearchPatterns(bars);
  const doubleBottom = detections.find(({ pattern }) => pattern === "double-bottom");
  assert.ok(doubleBottom);
  assert.equal(doubleBottom.phase, "developing");
  assert.ok(doubleBottom.confidence > 0 && doubleBottom.confidence < 1);
  assert.equal(typeof doubleBottom.relevantPriceLevels.support, "number");
  assert.match(doubleBottom.reasoning, /two separated lows/i);
  assert.match(doubleBottom.disclaimer, /not an investment recommendation/i);
});

test("pattern detection retires a stale double top and identifies a developing edge double bottom", () => {
  const lows = [66, 63, 58, 60, 65, 72, 78, 82, 80, 76, 79, 83, 81, 76, 72, 69, 66, 64, 63, 62, 61.5, 61];
  const bars = lows.map((low, index) => ({
    timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: low + 1.5,
    high: low + 4,
    low,
    close: low + 2,
    volume: 1_000,
  }));
  const detections = patterns.detectResearchPatterns(bars);
  assert.equal(detections.some(({ pattern }) => pattern === "double-top"), false);
  const doubleBottom = detections.find(({ pattern }) => pattern === "double-bottom");
  assert.ok(doubleBottom);
  assert.equal(doubleBottom.phase, "developing");
  assert.equal(doubleBottom.detectedAt, bars.at(-1).timestamp);
  assert.match(doubleBottom.reasoning, /active trough is still forming/i);
  assert.match(doubleBottom.reasoning, /confirmation is pending/i);
});

test("fresh double tops require a closing neckline break and keep the confirmation timestamp", () => {
  const highs = [10, 11, 15, 12, 10, 11, 14.9, 13, 11, 9, 8, 7];
  const bars = highs.map((high, index) => ({
    timestamp: new Date(Date.UTC(2026, 1, index + 1)).toISOString(),
    open: high - 1.2,
    high,
    low: high - 2,
    close: high - 1,
    volume: 1_000,
  }));
  const doubleTop = patterns.detectResearchPatterns(bars).find(({ pattern }) => pattern === "double-top");
  assert.ok(doubleTop);
  assert.equal(doubleTop.phase, "confirmed");
  assert.equal(doubleTop.detectedAt, bars[10].timestamp);
  assert.match(doubleTop.reasoning, /neckline was broken on a closing basis/i);
});

function article() {
  return {
    id: "news-1",
    title: "Company publishes an update",
    summary: null,
    body: null,
    articleUrl: null,
    imageUrl: null,
    publishedAt: "2026-08-15T16:00:00Z",
    updatedAt: null,
    tickers: ["XYZ"],
    categories: ["company"],
    keywords: [],
    publisher: { name: "Publisher", homepageUrl: null, logoUrl: null, faviconUrl: null },
    asOf: "2026-08-15T16:00:00Z",
    quality: "live",
    source: "benzinga",
  };
}

test("news-price association calculates timestamped moves without claiming causation", () => {
  const result = newsPrice.associateNewsWithPriceMovement("XYZ", [article()], [
    { timestamp: "2026-08-15T15:59:59Z", price: 100 },
    { timestamp: "2026-08-15T16:00:30Z", price: 101 },
    { timestamp: "2026-08-15T16:05:00Z", price: 102 },
  ], { horizonsSeconds: [30, 300] });
  assert.equal(result[0].label, "Price Movement Following News");
  assert.equal(result[0].moves[0].percentChange, 1);
  assert.equal(result[0].moves[1].percentChange, 2);
  assert.equal(result[0].dataSufficient, true);
  assert.match(result[0].disclaimer, /does not establish/i);
});
