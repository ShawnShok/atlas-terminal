import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const scanner = await loadTypeScriptModule(
  new URL("../lib/scanner/engine.ts", import.meta.url),
);
const presets = await loadTypeScriptModule(
  new URL("../lib/scanner/presets.ts", import.meta.url),
);

const now = "2026-08-15T16:00:00Z";
const candidate = {
  symbol: "XYZ",
  price: 104,
  marketCap: 15_000_000_000,
  volume: 3_000_000,
  averageVolume: 1_000_000,
  dailyChangePercent: 4.5,
  high52Week: 105,
  low52Week: 50,
  recentHigh20: 103,
  optionVolume: 500,
  optionOpenInterest: 100,
  newsPublishedAt: ["2026-08-15T15:45:00Z"],
  catalysts: [{ type: "earnings-release", occursAt: "2026-08-20T20:00:00Z", status: "confirmed" }],
};

test("derived RVOL and 52-week distance fields are calculated from raw inputs", () => {
  assert.equal(scanner.scannerFieldValue(candidate, "relativeVolume"), 3);
  assert.ok(Math.abs(scanner.scannerFieldValue(candidate, "percentBelow52WeekHigh") - 0.95238095238) < 1e-9);
  assert.equal(scanner.scannerFieldValue(candidate, "optionVolumeToOpenInterest"), 5);
});

test("distance above the day low cannot become negative", () => {
  assert.equal(scanner.scannerFieldValue({ ...candidate, price: 99, dayLow: 100 }, "percentAboveDayLow"), 0);
});

test("day-extreme, acceleration, intraday-break, and contract metrics are screenable", () => {
  const observed = {
    ...candidate,
    dayHigh: 105,
    dayLow: 100,
    volumeAccelerationRatio: 2.25,
    newIntradayHigh: 1,
    newIntradayLow: 0,
    optionsAvailable: true,
    optionHighestContractVolume: 900,
    optionHighestContractOpenInterest: 1_200,
    optionHighestVolumeContract: "O:XYZ260821C00100000",
    optionHighestOpenInterestContract: "O:XYZ260821P00100000",
    optionVolumeRelativeToUnderlying: 0.35,
  };
  assert.ok(Math.abs(scanner.scannerFieldValue(observed, "percentBelowDayHigh") - 0.95238095238) < 1e-9);
  assert.equal(scanner.scannerFieldValue(observed, "percentAboveDayLow"), 4);
  for (const [field, value] of [
    ["volumeAccelerationRatio", 2],
    ["newIntradayHigh", 1],
    ["optionHighestContractVolume", 800],
    ["optionHighestContractOpenInterest", 1_000],
    ["optionVolumeRelativeToUnderlying", 0.3],
  ]) {
    assert.equal(scanner.evaluateScannerRule(observed, { kind: "numeric", field, operator: "gte", value }, now).passed, true);
  }
  assert.match(scanner.evaluateScannerRule(observed, {
    kind: "numeric", field: "optionHighestContractVolume", operator: "gte", value: 800,
  }, now).reasons[0], /O:XYZ260821C00100000/);
});

test("truncated option pagination suppresses global-highest scanner qualification", () => {
  const observed = {
    ...candidate,
    optionsAvailable: true,
    optionContractsComplete: false,
    optionHighestContractVolume: null,
  };
  const evaluation = scanner.evaluateScannerRule(observed, {
    kind: "numeric", field: "optionHighestContractVolume", operator: "gte", value: 1,
  }, now);
  assert.equal(evaluation.passed, false);
  assert.match(evaluation.observations[0], /pagination truncated/);
});

test("all rules require every condition and preserve research observations", () => {
  const rule = { kind: "all", rules: [
    { kind: "numeric", field: "relativeVolume", operator: "gte", value: 2 },
    { kind: "numeric", field: "dailyChangePercent", operator: "gte", value: 3 },
    { kind: "price-relation", reference: "recentHigh20", relation: "at-or-above" },
  ] };
  const evaluation = scanner.evaluateScannerRule(candidate, rule, now);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.observations.length, 3);
  assert.deepEqual(evaluation.missingFields, []);
});

test("missing data fails explicitly instead of being treated as zero", () => {
  const evaluation = scanner.evaluateScannerRule(
    { symbol: "MISSING", price: 10 },
    { kind: "numeric", field: "marketCap", operator: "gte", value: 1 },
    now,
  );
  assert.equal(evaluation.passed, false);
  assert.deepEqual(evaluation.missingFields, ["marketCap"]);
});

test("news and catalyst windows are deterministic from the supplied evaluation time", () => {
  assert.equal(scanner.evaluateScannerRule(candidate, { kind: "recent-news", withinMinutes: 30 }, now).passed, true);
  assert.equal(scanner.evaluateScannerRule(candidate, {
    kind: "catalyst-window",
    withinDays: 7,
    catalystTypes: ["earnings-release"],
  }, now).passed, true);
  assert.equal(scanner.evaluateScannerRule(candidate, { kind: "recent-news", withinMinutes: 10 }, now).passed, false);
});

test("today news rules use the America/New_York calendar instead of a rolling 24-hour window", () => {
  const evaluationTime = "2026-08-15T04:30:00Z"; // 00:30 EDT
  const rule = { kind: "recent-news", withinMinutes: 1_440, calendarDay: "today" };
  assert.equal(scanner.evaluateScannerRule({
    symbol: "PRIOR-DAY",
    price: 10,
    newsPublishedAt: ["2026-08-15T03:45:00Z"], // 23:45 EDT on Aug 14
  }, rule, evaluationTime).passed, false);
  const sameDay = scanner.evaluateScannerRule({
    symbol: "TODAY",
    price: 10,
    newsPublishedAt: ["2026-08-15T04:15:00Z"],
  }, rule, evaluationTime);
  assert.equal(sameDay.passed, true);
  assert.match(sameDay.reasons[0], /America\/New_York calendar/);
});

test("scanner runs return only matches with a research-only disclaimer", () => {
  const result = scanner.runScanner(
    [candidate, { ...candidate, symbol: "LOW", volume: 100_000 }],
    { kind: "numeric", field: "relativeVolume", operator: "gte", value: 2 },
    now,
  );
  assert.deepEqual(result.matches.map(({ security }) => security.symbol), ["XYZ"]);
  assert.match(result.disclaimer, /not investment recommendations/i);
});

test("all requested scanner presets are present and executable", () => {
  const configured = presets.createScannerPresets();
  assert.deepEqual(configured.map(({ id }) => id), [
    "momentum",
    "catalyst-momentum",
    "breakout-watch",
    "earnings-soon",
    "news-movers",
    "high-relative-volume",
    "unusual-options-research",
    "watchlist-catalyst-feed",
    "near-52-week-high",
    "gap-up",
    "gap-down",
  ]);
  const momentum = configured.find(({ id }) => id === "momentum");
  assert.equal(scanner.evaluateScannerRule(candidate, momentum.rule, now).passed, true);
});

test("requested presets retain their documented AND/OR and confirmation semantics", () => {
  const configured = presets.createScannerPresets();
  const byId = (id) => configured.find((preset) => preset.id === id).rule;

  assert.equal(scanner.evaluateScannerRule(candidate, byId("news-movers"), now).passed, true);
  assert.equal(scanner.evaluateScannerRule({ ...candidate, volume: 1_000_000 }, byId("news-movers"), now).passed, false);

  assert.equal(scanner.evaluateScannerRule({
    symbol: "OPTIONS-VOLUME",
    price: 10,
    optionsAvailable: true,
    optionVolume: 200,
    optionOpenInterest: null,
  }, byId("unusual-options-research"), now).passed, true);
  assert.equal(scanner.evaluateScannerRule({
    symbol: "OPTIONS-RATIO",
    price: 10,
    optionsAvailable: true,
    optionVolume: 90,
    optionOpenInterest: 30,
  }, byId("unusual-options-research"), now).passed, true);

  assert.equal(scanner.evaluateScannerRule(candidate, byId("earnings-soon"), now).passed, true);
  assert.equal(scanner.evaluateScannerRule({
    ...candidate,
    catalysts: [{ type: "earnings-call", occursAt: "2026-08-20T20:00:00Z", status: "confirmed" }],
  }, byId("earnings-soon"), now).passed, true);
  assert.equal(scanner.evaluateScannerRule({
    ...candidate,
    catalysts: [{ type: "earnings-release", occursAt: "2026-08-20T20:00:00Z", status: "pending" }],
  }, byId("earnings-soon"), now).passed, false);
});

test("default today-news presets carry explicit Eastern calendar semantics", () => {
  const byId = (id) => presets.createScannerPresets().find((preset) => preset.id === id).rule;
  const newsMovers = byId("news-movers").rules.find((rule) => rule.kind === "recent-news");
  const catalystFeed = byId("watchlist-catalyst-feed").rules.find((rule) => rule.kind === "recent-news");
  assert.equal(newsMovers.calendarDay, "today");
  assert.equal(catalystFeed.calendarDay, "today");
});

test("high RVOL accepts honestly available daily or intraday measurements", () => {
  const rule = presets.createScannerPresets().find(({ id }) => id === "high-relative-volume").rule;
  assert.equal(scanner.evaluateScannerRule({ symbol: "DAILY", price: 10, dailyRelativeVolume: 2.2 }, rule, now).passed, true);
  assert.equal(scanner.evaluateScannerRule({ symbol: "INTRADAY", price: 10, intradayRelativeVolume: 2.2 }, rule, now).passed, true);
  const missing = scanner.evaluateScannerRule({ symbol: "MISSING", price: 10 }, rule, now);
  assert.equal(missing.passed, false);
  assert.deepEqual(missing.missingFields.sort(), ["dailyRelativeVolume", "intradayRelativeVolume"]);
});

test("breakout watch accepts a near or above recent high but rejects a distant price", () => {
  const rule = presets.createScannerPresets({ breakoutNearPercent: 1 }).find(({ id }) => id === "breakout-watch").rule;
  const base = { symbol: "BREAK", dailyRelativeVolume: 2.5, recentHigh20: 100 };
  assert.equal(scanner.evaluateScannerRule({ ...base, price: 99.5 }, rule, now).passed, true);
  assert.equal(scanner.evaluateScannerRule({ ...base, price: 101 }, rule, now).passed, true);
  assert.equal(scanner.evaluateScannerRule({ ...base, price: 97 }, rule, now).passed, false);
});

test("recent-news rules can screen reported headlines, categories, and keywords", () => {
  const security = {
    symbol: "NEWS",
    price: 10,
    newsAvailable: true,
    news: [{
      publishedAt: "2026-08-15T15:45:00Z",
      headline: "Company raises revenue guidance",
      categories: ["earnings"],
      keywords: ["guidance", "revenue"],
    }],
  };
  const rule = {
    kind: "recent-news",
    withinMinutes: 30,
    headlineIncludes: "revenue",
    categories: ["EARNINGS"],
    keywords: ["guid"],
  };
  const matchingEvaluation = scanner.evaluateScannerRule(security, rule, now);
  assert.equal(matchingEvaluation.passed, true);
  assert.match(matchingEvaluation.reasons[0], /Company raises revenue guidance/);
  assert.match(matchingEvaluation.reasons[0], /2026-08-15T15:45:00Z/);
  assert.equal(scanner.evaluateScannerRule(security, { ...rule, categories: ["mergers"] }, now).passed, false);
  assert.deepEqual(scanner.evaluateScannerRule({ symbol: "LEGACY", price: 10, newsPublishedAt: security.news.map((item) => item.publishedAt) }, rule, now).missingFields, ["news"]);
});

test("catalyst reasons name the exact next matching event, status, and time", () => {
  const evaluation = scanner.evaluateScannerRule(candidate, {
    kind: "catalyst-window",
    withinDays: 7,
    catalystTypes: ["earnings-release"],
    statuses: ["confirmed"],
  }, now);
  assert.equal(evaluation.passed, true);
  assert.match(evaluation.reasons[0], /earnings-release \(confirmed\)/);
  assert.match(evaluation.reasons[0], /2026-08-20T20:00:00Z/);
});

test("NOT cannot turn unavailable source data into a match", () => {
  const evaluation = scanner.evaluateScannerRule(
    { symbol: "NO-DATA", price: 10 },
    { kind: "not", rule: { kind: "numeric", field: "marketCap", operator: "gte", value: 1 } },
    now,
  );
  assert.equal(evaluation.passed, false);
  assert.deepEqual(evaluation.missingFields, ["marketCap"]);
});
