import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const engineSource = await readFile(new URL("../lib/scanner/engine.ts", import.meta.url), "utf8");
const scoringSource = await readFile(new URL("../lib/scanner/scoring.ts", import.meta.url), "utf8");
const source = `${engineSource}\n${scoringSource.replace('import { scannerFieldValue, type ScannerSecurity } from "./engine";\n', "")}`;
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "scanner-scoring.ts",
  reportDiagnostics: true,
});
assert.deepEqual((transpiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error), []);
const scoring = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);

const base = {
  symbol: "NVDA",
  price: 110,
  dailyChangePercent: 4,
  volume: 2_000_000,
  averageVolume: 1_000_000,
  vwap: 105,
  newsPublishedAt: ["2026-08-19T15:45:00.000Z"],
  catalysts: [{ type: "earnings-release", occursAt: "2026-08-24T20:00:00.000Z" }],
  optionVolume: 4_000,
  optionOpenInterest: 2_000,
};

test("research-priority score is bounded, transparent, and deterministic", () => {
  const result = scoring.calculateResearchPriority(base, "2026-08-19T16:00:00.000Z");
  assert.equal(result.label, "RESEARCH PRIORITY");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.coveragePercent, 100);
  assert.equal(result.contributions.length, 6);
  assert.match(result.disclaimer, /not a buy score/i);
  assert.deepEqual(result, scoring.calculateResearchPriority(base, "2026-08-19T16:00:00.000Z"));
});

test("missing source fields contribute zero and reduce disclosed coverage", () => {
  const result = scoring.calculateResearchPriority({ symbol: "VOID", price: null }, "2026-08-19T16:00:00.000Z");
  assert.equal(result.score, 0);
  assert.equal(result.coveragePercent, 0);
  assert.ok(result.contributions.every((item) => item.available === false && item.points === 0));
});

test("research priority prefers a reported time-adjusted intraday RVOL and labels it honestly", () => {
  const result = scoring.calculateResearchPriority({
    ...base,
    intradayRelativeVolume: 3,
  }, "2026-08-19T16:00:00.000Z");
  const contribution = result.contributions.find((item) => item.component === "relativeVolume");
  assert.match(contribution.explanation, /Intraday relative volume is 3\.00x/);
});

test("custom weights are validated and preserve the zero-to-one-hundred contract", () => {
  const weights = {
    priceMovement: 1,
    relativeVolume: 0,
    technicalConfirmation: 0,
    newsRecency: 0,
    eventProximity: 0,
    optionsActivity: 0,
  };
  const result = scoring.calculateResearchPriority({ ...base, dailyChangePercent: 20 }, "2026-08-19T16:00:00.000Z", weights);
  assert.equal(result.score, 100);
  assert.throws(() => scoring.calculateResearchPriority(base, "2026-08-19T16:00:00.000Z", { ...weights, priceMovement: -1 }), /non-negative/);
});
