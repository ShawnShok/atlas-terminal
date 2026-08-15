import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/research/model.ts", import.meta.url), "utf8");
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

const {
  calculateBreadthPercentages,
  calculateDaysToExpiration,
  describeScannerCondition,
  formatCountdown,
  groupOptionsByStrike,
  isRecent,
  normalizeTicker,
} = model;

const option = (type, strikePrice, symbol) => ({
  symbol,
  underlyingSymbol: "NVDA",
  type,
  expirationDate: "2026-09-18",
  strikePrice,
  exerciseStyle: "american",
  sharesPerContract: 100,
  lastPrice: 3,
  bidPrice: 2.9,
  askPrice: 3.1,
  volume: 100,
  openInterest: 400,
  impliedVolatility: 0.42,
  intrinsicValue: 0,
  extrinsicValue: 3,
  greeks: { delta: 0.5, gamma: 0.02, theta: -0.1, vega: 0.2, rho: 0.05 },
  asOf: "2026-08-15T14:00:00Z",
  quality: "delayed",
  source: "massive",
});

test("normalizes research ticker input", () => {
  assert.equal(normalizeTicker("  brk.b! "), "BRK.B");
  assert.equal(normalizeTicker("$nvda-options"), "NVDA-OPTIO");
});

test("recent story detection is deterministic from the supplied clock", () => {
  assert.equal(isRecent("2026-08-15T14:57:00Z", "2026-08-15T15:00:00Z", 5), true);
  assert.equal(isRecent("2026-08-15T14:54:59Z", "2026-08-15T15:00:00Z", 5), false);
  assert.equal(isRecent("invalid", "2026-08-15T15:00:00Z", 5), false);
});

test("formats catalyst countdown boundaries", () => {
  assert.equal(formatCountdown("2026-08-16T15:00:00Z", "2026-08-15T15:00:00Z"), "TOMORROW");
  assert.equal(formatCountdown("2026-08-15T18:00:00Z", "2026-08-15T15:00:00Z"), "IN 3 HOURS");
  assert.equal(formatCountdown("2026-08-15T15:00:30Z", "2026-08-15T15:00:00Z"), "STARTING NOW");
});

test("pairs calls and puts by strike and labels moneyness", () => {
  const rows = groupOptionsByStrike([
    option("put", 105, "P105"),
    option("call", 100, "C100"),
    option("put", 100, "P100"),
    option("call", 95, "C95"),
  ], 100);

  assert.deepEqual(rows.map((row) => row.strikePrice), [95, 100, 105]);
  assert.equal(rows[0].call.symbol, "C95");
  assert.equal(rows[0].callMoneyness, "itm");
  assert.equal(rows[1].callMoneyness, "atm");
  assert.equal(rows[1].putMoneyness, "atm");
  assert.equal(rows[2].putMoneyness, "itm");
});

test("calculates DTE and breadth without divide-by-zero output", () => {
  assert.equal(calculateDaysToExpiration("2026-08-18", "2026-08-15T20:00:00Z"), 3);
  assert.deepEqual(
    calculateBreadthPercentages({ advancing: 0, declining: 0, unchanged: 0 }),
    { advancing: 0, declining: 0, unchanged: 0 },
  );
  assert.deepEqual(
    calculateBreadthPercentages({ advancing: 6, declining: 3, unchanged: 1 }),
    { advancing: 60, declining: 30, unchanged: 10 },
  );
});

test("describes scanner catalyst conditions for display and persistence", () => {
  assert.equal(
    describeScannerCondition({
      id: "event-window",
      field: "event-within-days",
      operator: "less-than-or-equal",
      value: 7,
      unit: "days",
    }),
    "EVENT WITHIN DAYS ≤ 7 days",
  );
  assert.equal(
    describeScannerCondition({
      id: "price-range",
      field: "price",
      operator: "between",
      value: 10,
      secondaryValue: 25,
      unit: "USD",
    }),
    "PRICE BETWEEN 10 USD AND 25 USD",
  );
});

