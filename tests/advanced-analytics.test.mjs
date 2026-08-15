import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

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
  assert.ok(doubleBottom.confidence > 0 && doubleBottom.confidence < 1);
  assert.equal(typeof doubleBottom.relevantPriceLevels.support, "number");
  assert.match(doubleBottom.reasoning, /two separated lows/i);
  assert.match(doubleBottom.disclaimer, /not an investment recommendation/i);
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
