import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const {
  buildTickerOverviewIntelligence,
  marketCalendarDaysBetween,
} = await loadTypeScriptModule(new URL("../lib/stocks/intelligence.ts", import.meta.url));

function securityFixture() {
  const bars = Array.from({ length: 366 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 7, 19 + index, 20));
    const close = 100 + index;
    return {
      timestamp: date.toISOString(),
      close,
      high: close + 2,
      low: close - 2,
    };
  });
  return {
    details: { symbol: "NVDA" },
    snapshot: {
      asOf: "2026-08-19T16:00:00.000Z",
      quote: {
        lastPrice: 465,
        changePercent: 2,
        vwap: 450,
        volume: 2_000,
        averageVolume: 1_000,
      },
    },
    bars,
  };
}

test("derives performance, technical position, and daily RVOL only from normalized inputs", () => {
  const model = buildTickerOverviewIntelligence({ security: securityFixture() });
  assert.equal(model.performance[0].changePercent, 2);
  assert.equal(model.performance[0].basis, "provider quote");
  assert.equal(model.performance.find(({ label }) => label === "1Y").changePercent, 365);
  assert.equal(model.technical.movingAverages[0].average, 455.5);
  assert.equal(model.technical.rangeLabel, "52W RANGE");
  assert.equal(model.relativeVolume.dailyRvol, 2);
  assert.equal(model.relativeVolume.intradayRvol, null);
});

test("counts New York calendar days across the daylight-saving boundary", () => {
  assert.equal(
    marketCalendarDaysBetween("2026-03-07T17:00:00.000Z", "2026-03-09T16:00:00.000Z"),
    2,
  );
  assert.equal(marketCalendarDaysBetween("invalid", "2026-03-09T16:00:00.000Z"), null);
});

test("filters ticker context and reports option-chain observations without an unusualness claim", () => {
  const news = [
    { id: "old", tickers: ["NVDA"], publishedAt: "2026-08-18T14:00:00.000Z" },
    { id: "other", tickers: ["AAPL"], publishedAt: "2026-08-19T15:00:00.000Z" },
    { id: "new", tickers: ["nvda"], publishedAt: "2026-08-19T14:00:00.000Z" },
  ];
  const events = [
    { id: "past", symbol: "NVDA", status: "confirmed", startsAt: "2026-08-18T14:00:00.000Z" },
    { id: "canceled", symbol: "NVDA", status: "canceled", startsAt: "2026-08-20T14:00:00.000Z" },
    { id: "future", symbol: "nvda", status: "pending", startsAt: "2026-08-21T14:00:00.000Z" },
  ];
  const contract = (symbol, type, expirationDate, strikePrice, volume, openInterest) => ({
    symbol,
    underlyingSymbol: "NVDA",
    type,
    expirationDate,
    strikePrice,
    volume,
    openInterest,
  });
  const optionChain = {
    underlyingSymbol: "NVDA",
    contracts: [
      contract("O:NVDA260821C00450000", "call", "2026-08-21", 450, 100, 1_000),
      contract("O:NVDA260821C00460000", "call", "2026-08-21", 460, null, 200),
      contract("O:NVDA260918P00440000", "put", "2026-09-18", 440, 50, 300),
    ],
  };
  const model = buildTickerOverviewIntelligence({
    security: securityFixture(),
    news,
    events,
    optionChain,
    referenceTime: "2026-08-19T16:00:00.000Z",
  });

  assert.deepEqual(model.recentNews.map(({ id }) => id), ["new", "old"]);
  assert.deepEqual(model.upcomingEvents.map(({ event, daysUntil }) => [event.id, daysUntil]), [["future", 2]]);
  assert.equal(model.options.state, "available");
  assert.equal(model.options.reportedVolume, 150);
  assert.equal(model.options.callVolume, 100);
  assert.equal(model.options.putVolume, 50);
  assert.equal(model.options.putCallVolumeRatio, 0.5);
  assert.equal(model.options.reportedOpenInterest, 1_500);
  assert.equal(model.options.volumeToOpenInterestRatio, 0.1);
  assert.equal(model.options.topVolumeContract.symbol, "O:NVDA260821C00450000");
});
