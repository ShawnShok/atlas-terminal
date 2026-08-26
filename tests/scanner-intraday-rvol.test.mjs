import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const marketTime = await loadTypeScriptModule(new URL("../lib/scanner/market-time.ts", import.meta.url));

function bar(timestamp, volume) {
  return {
    symbol: "TEST", interval: "5m", timestamp,
    open: 1, high: 1, low: 1, close: 1, volume, vwap: 1, transactionCount: 1,
    asOf: timestamp, quality: "historical", source: "massive",
  };
}

function session(date, utcHour, volume) {
  return Array.from({ length: 6 }, (_, index) => bar(
    `${date}T${String(utcHour).padStart(2, "0")}:${String(30 + index * 5).padStart(2, "0")}:00Z`,
    volume,
  ));
}

function signalBar(timestamp, volume, high, low) {
  return { ...bar(timestamp, volume), high, low, close: (high + low) / 2 };
}

test("time-adjusted intraday RVOL compares completed New York intervals across the DST boundary", () => {
  const history = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]
    .flatMap((date) => session(date, 14, 100)); // 09:30 EST
  const current = session("2026-03-09", 13, 200); // 09:30 EDT after the DST change
  const result = marketTime.calculateIntradayRelativeVolume(
    [...history, ...current],
    "2026-03-09T14:02:00Z", // 10:02 EDT; completed bars run through 09:55
  );
  assert.ok(result);
  assert.equal(result.value, 2);
  assert.equal(result.currentVolume, 1_200);
  assert.equal(result.averageComparableVolume, 600);
  assert.equal(result.baselineSessionCount, 5);
  assert.equal(result.throughMinuteEastern, 9 * 60 + 55);
});

test("New York calendar dates remain correct at UTC and daylight-saving boundaries", () => {
  assert.equal(marketTime.newYorkCalendarDate("2026-11-01T03:59:00Z"), "2026-10-31");
  assert.equal(marketTime.newYorkCalendarDate("2026-11-01T04:01:00Z"), "2026-11-01");
  assert.equal(marketTime.newYorkCalendarDate("not-a-date"), null);
});

test("intraday RVOL is unavailable when fewer than five comparable sessions exist", () => {
  const history = ["2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]
    .flatMap((date) => session(date, 14, 100));
  const current = session("2026-03-09", 13, 200);
  assert.equal(marketTime.calculateIntradayRelativeVolume([...history, ...current], "2026-03-09T14:02:00Z"), null);
});

test("intraday RVOL fails closed for materially incomplete comparable bars", () => {
  const history = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"]
    .flatMap((date) => session(date, 14, 100));
  const incompleteCurrent = session("2026-03-09", 13, 200).slice(0, 2);
  assert.equal(marketTime.calculateIntradayRelativeVolume([...history, ...incompleteCurrent], "2026-03-09T14:02:00Z"), null);
});

test("intraday scanner signals use completed current-session bars only", () => {
  const bars = [
    signalBar("2026-03-09T13:30:00Z", 100, 10, 8),
    signalBar("2026-03-09T13:35:00Z", 100, 11, 8),
    signalBar("2026-03-09T13:40:00Z", 100, 12, 8),
    signalBar("2026-03-09T13:45:00Z", 200, 13, 8),
    signalBar("2026-03-09T13:50:00Z", 200, 14, 8),
    signalBar("2026-03-09T13:55:00Z", 200, 15, 7),
    signalBar("2026-03-09T14:00:00Z", 9_999, 99, 1), // still forming at 10:02 EDT
  ];
  const result = marketTime.calculateIntradayScannerSignals(bars, "2026-03-09T14:02:00Z");
  assert.ok(result);
  assert.equal(result.volumeAccelerationRatio, 2);
  assert.equal(result.newIntradayHigh, true);
  assert.equal(result.newIntradayLow, true);
  assert.equal(result.completedBarCount, 6);
  assert.equal(result.latestCompletedAt, "2026-03-09T13:55:00Z");
});

test("volume acceleration is unavailable without two complete three-bar windows", () => {
  const bars = session("2026-03-09", 13, 100).slice(0, 5);
  const result = marketTime.calculateIntradayScannerSignals(bars, "2026-03-09T13:57:00Z");
  assert.ok(result);
  assert.equal(result.volumeAccelerationRatio, null);
});

test("intraday scanner signals reject a sparse or stale completed-bar sequence", () => {
  const complete = session("2026-03-09", 13, 100);
  const missingMiddleBar = complete.filter((_, index) => index !== 2);
  assert.equal(
    marketTime.calculateIntradayScannerSignals(missingMiddleBar, "2026-03-09T14:02:00Z"),
    null,
  );

  const missingLatestBar = complete.slice(0, -1);
  assert.equal(
    marketTime.calculateIntradayScannerSignals(missingLatestBar, "2026-03-09T14:02:00Z"),
    null,
  );

  const irregularTimestamp = complete.map((item, index) => index === 2
    ? { ...item, timestamp: "2026-03-09T13:40:30Z" }
    : item);
  assert.equal(
    marketTime.calculateIntradayScannerSignals(irregularTimestamp, "2026-03-09T14:02:00Z"),
    null,
  );
});

test("new intraday extremes require six continuous bars from the session open", () => {
  const earlyBars = [
    signalBar("2026-03-09T13:30:00Z", 100, 10, 8),
    signalBar("2026-03-09T13:35:00Z", 100, 11, 7),
  ];
  const result = marketTime.calculateIntradayScannerSignals(earlyBars, "2026-03-09T13:42:00Z");
  assert.ok(result);
  assert.equal(result.completedBarCount, 2);
  assert.equal(result.newIntradayHigh, null);
  assert.equal(result.newIntradayLow, null);
});

test("intraday scanner signals reject non-5-minute input", () => {
  const oneMinuteBars = Array.from({ length: 6 }, (_, index) => ({
    ...signalBar(`2026-03-09T13:${String(30 + index).padStart(2, "0")}:00Z`, 100, 10 + index, 8),
    interval: "1m",
  }));
  assert.equal(
    marketTime.calculateIntradayScannerSignals(oneMinuteBars, "2026-03-09T13:37:00Z"),
    null,
  );
});
