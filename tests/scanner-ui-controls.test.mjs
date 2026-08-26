import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const terminal = await readFile(new URL("../components/research/ScannerTerminal.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../components/research/research.css", import.meta.url), "utf8");
const transpiled = ts.transpileModule(terminal, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "ScannerTerminal.tsx",
  reportDiagnostics: true,
});
assert.deepEqual(
  (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
  [],
);

test("scanner discloses the selected watchlist and honest options-source status", () => {
  assert.match(terminal, /interface ScannerWatchlistOption/);
  assert.match(terminal, /selectedWatchlistId/);
  assert.match(terminal, /onWatchlistChange/);
  assert.match(terminal, /OPTIONS SOURCE/);
  assert.match(terminal, /DELAYED OPTIONS DATA/);
  assert.match(terminal, /bid\/ask quotes are never scanner inputs/i);
  assert.match(terminal, /formatDateTime\(source\.asOf\)/);
});

test("research-priority weights are controlled and JSON-serializable", () => {
  for (const component of [
    "priceMovement",
    "relativeVolume",
    "technicalConfirmation",
    "newsRecency",
    "eventProximity",
    "optionsActivity",
  ]) {
    assert.match(terminal, new RegExp(component));
  }
  assert.match(terminal, /onScoreWeightsChange/);
  assert.match(terminal, /onChange\?\.\(\{ \.\.\.weights, \[component\]: value \}\)/);
  assert.match(terminal, /serialize as a plain numeric object/i);
  assert.match(terminal, /not a buy score, return forecast, or probability/i);
});

test("nested engine rule groups have bounded AND\/OR editing callbacks", () => {
  assert.match(terminal, /type ScannerRule/);
  assert.match(terminal, /rule\.kind !== "all" && rule\.kind !== "any"/);
  assert.match(terminal, /onRuleGroupLogicChange/);
  assert.match(terminal, /onRuleGroupAdd/);
  assert.match(terminal, /onAddConditionToGroup/);
  assert.match(terminal, /onRuleRemove/);
  assert.match(terminal, /Math\.min\(4, Math\.max\(1, value\)\)/);
  assert.match(terminal, /Missing fields continue to fail closed/);
});

test("scanner source, rule, and weight controls reflow with the workspace panel", () => {
  assert.match(styles, /\.research-scanner-context\s*\{/);
  assert.match(styles, /\.research-rule-tree\s*\{/);
  assert.match(styles, /\.research-score-weights\s*\{/);
  assert.match(styles, /@container workspace-panel \(max-width: 680px\)/);
  assert.match(styles, /\.research-scanner-context \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
