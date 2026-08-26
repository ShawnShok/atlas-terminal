import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const helperSource = await readFile(new URL("lib/stocks/chart-settings.ts", root), "utf8");
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "chart-settings.ts",
  reportDiagnostics: true,
});
assert.deepEqual(
  (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
  [],
);
const chartSettings = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);
const { getExtendedHoursAvailability, selectChartBars } = chartSettings;

const bar = (timestamp, session) => ({
  symbol: "NVDA",
  interval: "5m",
  timestamp,
  session,
  open: 100,
  high: 102,
  low: 99,
  close: 101,
  volume: 1_000,
  vwap: 100.5,
  transactionCount: 20,
  asOf: timestamp,
  quality: "historical",
  source: "massive",
});

test("extended-hours control stays unavailable when bars lack complete session tags", () => {
  const bars = [
    bar("2026-08-19T13:00:00Z", undefined),
    bar("2026-08-19T14:30:00Z", "regular"),
  ];
  const availability = getExtendedHoursAvailability(bars);
  assert.equal(availability.available, false);
  assert.equal(availability.state, "unclassified");
  assert.equal(availability.label, "NO SESSION TAGS");
  assert.equal(selectChartBars(bars, false, availability), bars);
});

test("classified bars can toggle extended sessions without mutating the input", () => {
  const bars = [
    bar("2026-08-19T13:00:00Z", "pre-market"),
    bar("2026-08-19T14:30:00Z", "regular"),
    bar("2026-08-19T20:30:00Z", "after-hours"),
  ];
  const availability = getExtendedHoursAvailability(bars);
  assert.equal(availability.available, true);
  assert.deepEqual(selectChartBars(bars, false, availability).map(({ session }) => session), ["regular"]);
  assert.equal(selectChartBars(bars, true, availability), bars);
  assert.equal(bars.length, 3);
});

test("regular-only data is labeled honestly instead of exposing a no-op toggle", () => {
  const availability = getExtendedHoursAvailability([
    bar("2026-08-19T14:30:00Z", "regular"),
    bar("2026-08-19T14:35:00Z", "regular"),
  ]);
  assert.deepEqual(
    { available: availability.available, state: availability.state, label: availability.label },
    { available: false, state: "regular-only", label: "REGULAR ONLY" },
  );
});

test("chart UI wires logarithmic mode and explicit extended-hours availability", async () => {
  const [controls, priceChart, types] = await Promise.all([
    readFile(new URL("components/charts/ChartControls.tsx", root), "utf8"),
    readFile(new URL("components/charts/PriceChart.tsx", root), "utf8"),
    readFile(new URL("lib/stocks/types.ts", root), "utf8"),
  ]);
  assert.match(types, /ChartPriceScaleMode = "linear" \| "logarithmic"/);
  assert.match(types, /priceScaleMode\?: ChartPriceScaleMode/);
  assert.match(types, /includeExtendedHours\?: boolean/);
  assert.match(controls, /disabled=\{!extendedHoursAvailability\.available\}/);
  assert.match(controls, /NO SESSION TAGS/);
  assert.match(priceChart, /PriceScaleMode\.Logarithmic/);
  assert.match(priceChart, /PriceScaleMode\.Normal/);
  assert.match(priceChart, /selectChartBars/);
});
