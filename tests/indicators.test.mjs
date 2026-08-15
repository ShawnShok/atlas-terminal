import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const indicators = await loadTypeScriptModule(
  new URL("../lib/indicators/calculations.ts", import.meta.url),
);
const rvol = await loadTypeScriptModule(
  new URL("../lib/indicators/relative-volume.ts", import.meta.url),
);

test("percent change handles gains, losses, and a zero base", () => {
  assert.equal(indicators.percentChange(110, 100), 10);
  assert.equal(indicators.percentChange(90, 100), -10);
  assert.equal(indicators.percentChange(5, 0), null);
});

test("SMA and EMA return input-aligned deterministic series", () => {
  assert.deepEqual(indicators.simpleMovingAverage([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(indicators.exponentialMovingAverage([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test("VWAP weights typical price by volume", () => {
  const bars = [
    { high: 11, low: 9, close: 10, volume: 100 },
    { high: 21, low: 19, close: 20, volume: 300 },
  ];
  assert.deepEqual(indicators.cumulativeVwap(bars), [10, 17.5]);
  assert.equal(indicators.volumeWeightedAveragePrice(bars), 17.5);
});

test("Wilder RSI covers rising and flat price histories", () => {
  const rising = indicators.relativeStrengthIndex([1, 2, 3, 4, 5, 6], 3);
  assert.equal(rising[3], 100);
  assert.equal(rising[5], 100);
  const flat = indicators.relativeStrengthIndex([5, 5, 5, 5], 3);
  assert.equal(flat[3], 50);
});

test("MACD aligns signal and histogram after their warm-up windows", () => {
  const result = indicators.movingAverageConvergenceDivergence([1, 2, 3, 4, 5, 6], 2, 3, 2);
  assert.equal(result[2].macd, 0.5);
  assert.equal(result[2].signal, null);
  assert.equal(result[3].signal, 0.5);
  assert.equal(result[5].histogram, 0);
});

test("Bollinger Bands use population standard deviation", () => {
  const result = indicators.bollingerBands([1, 2, 3], 3, 2);
  assert.equal(result[1].middle, null);
  assert.equal(result[2].middle, 2);
  assert.ok(Math.abs(result[2].standardDeviation - Math.sqrt(2 / 3)) < 1e-12);
  assert.ok(Math.abs(result[2].upper - (2 + 2 * Math.sqrt(2 / 3))) < 1e-12);
});

test("ATR includes overnight gaps and applies Wilder smoothing", () => {
  const bars = [
    { high: 11, low: 9, close: 10 },
    { high: 13, low: 10, close: 12 },
    { high: 14, low: 12, close: 13 },
  ];
  assert.deepEqual(indicators.averageTrueRange(bars, 2), [null, 2.5, 2.25]);
});

test("RVOL prefers comparable intraday cumulative profiles", () => {
  const sessions = ["2026-08-10", "2026-08-11", "2026-08-12"].map((sessionDate) => ({
    sessionDate,
    points: [
      { elapsedMinutes: 60, cumulativeVolume: 100 },
      { elapsedMinutes: 120, cumulativeVolume: 300 },
    ],
    totalVolume: 1_000,
  }));
  const result = rvol.calculateRelativeVolume({
    currentCumulativeVolume: 400,
    elapsedMinutes: 90,
    historicalSessions: sessions,
  });
  assert.equal(result.method, "time-adjusted");
  assert.equal(result.expectedVolume, 200);
  assert.equal(result.value, 2);
  assert.equal(result.comparableSessions, 3);
});

test("RVOL identifies completed-session fallback and unavailable states", () => {
  const fallback = rvol.calculateRelativeVolume({
    currentCumulativeVolume: 500,
    elapsedMinutes: 30,
    historicalSessions: [
      { sessionDate: "a", totalVolume: 1_000 },
      { sessionDate: "b", totalVolume: 1_000 },
      { sessionDate: "c", totalVolume: 1_000 },
    ],
  });
  assert.equal(fallback.method, "full-session");
  assert.equal(fallback.value, 0.5);
  assert.equal(rvol.calculateRelativeVolume({
    currentCumulativeVolume: 100,
    historicalSessions: [],
  }).method, "unavailable");
});
