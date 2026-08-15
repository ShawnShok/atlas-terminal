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
  catalysts: [{ type: "earnings-release", occursAt: "2026-08-20T20:00:00Z" }],
};

test("derived RVOL and 52-week distance fields are calculated from raw inputs", () => {
  assert.equal(scanner.scannerFieldValue(candidate, "relativeVolume"), 3);
  assert.ok(Math.abs(scanner.scannerFieldValue(candidate, "percentBelow52WeekHigh") - 0.95238095238) < 1e-9);
  assert.equal(scanner.scannerFieldValue(candidate, "optionVolumeToOpenInterest"), 5);
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
    "breakout",
    "earnings-soon",
    "news-movers",
    "high-relative-volume",
    "unusual-options",
    "near-52-week-high",
    "gap-up",
    "gap-down",
  ]);
  const momentum = configured.find(({ id }) => id === "momentum");
  assert.equal(scanner.evaluateScannerRule(candidate, momentum.rule, now).passed, true);
});
