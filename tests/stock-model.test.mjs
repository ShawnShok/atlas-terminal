import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/stocks/model.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "model.ts",
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, []);

const model = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

const { findNextRowIndex, normalizeChartBars, reorderSymbols, sortSnapshotRows } = model;

const bar = (timestamp, close, overrides = {}) => ({
  symbol: "NVDA",
  interval: "1D",
  timestamp,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: 1_000,
  vwap: close,
  transactionCount: 100,
  asOf: timestamp,
  quality: "historical",
  source: "massive",
  ...overrides,
});

const row = (symbol, lastPrice, changePercent, volume) => ({
  symbol,
  lastPrice,
  change: changePercent,
  changePercent,
  open: lastPrice,
  high: lastPrice,
  low: lastPrice,
  previousClose: lastPrice,
  volume,
  vwap: lastPrice,
  asOf: "2026-08-15T15:00:00Z",
  quality: "delayed",
});

test("normalizes chart bars into strictly ordered, unique timestamps", () => {
  const normalized = normalizeChartBars([
    bar("2026-08-15T15:02:00Z", 102),
    bar("not-a-date", 99),
    bar("2026-08-15T15:01:00Z", 101),
    bar("2026-08-15T15:02:00Z", 103),
    bar("2026-08-15T15:03:00Z", Number.NaN),
  ]);
  assert.deepEqual(normalized.map(({ close }) => close), [101, 103]);
  assert.ok(normalized[0].time < normalized[1].time);
});

test("reorders symbols without mutating the source list", () => {
  const sourceSymbols = ["AAPL", "MSFT", "NVDA", "AMD"];
  assert.deepEqual(reorderSymbols(sourceSymbols, "NVDA", "AAPL"), ["NVDA", "AAPL", "MSFT", "AMD"]);
  assert.deepEqual(sourceSymbols, ["AAPL", "MSFT", "NVDA", "AMD"]);
  assert.deepEqual(reorderSymbols(sourceSymbols, "UNKNOWN", "AAPL"), sourceSymbols);
});

test("sorts normalized snapshot rows and keeps missing values last", () => {
  const rows = [row("AAPL", 210, 1.2, 5_000), row("NVDA", 180, -2.1, 9_000), row("AMD", null, 0.4, null)];
  assert.deepEqual(
    sortSnapshotRows(rows, "lastPrice", "descending").map(({ symbol }) => symbol),
    ["AAPL", "NVDA", "AMD"],
  );
  assert.deepEqual(
    sortSnapshotRows(rows, "relativeVolume", "descending", {
      AAPL: { relativeVolume: 1.1, marketCap: 1 },
      NVDA: { relativeVolume: 2.3, marketCap: 3 },
      AMD: { relativeVolume: null, marketCap: 2 },
    }).map(({ symbol }) => symbol),
    ["NVDA", "AAPL", "AMD"],
  );
});

test("keyboard row navigation remains within table bounds", () => {
  assert.equal(findNextRowIndex(0, "previous", 4), 0);
  assert.equal(findNextRowIndex(0, "next", 4), 1);
  assert.equal(findNextRowIndex(3, "next", 4), 3);
  assert.equal(findNextRowIndex(0, "next", 0), -1);
});

