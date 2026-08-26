import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const adapterSource = await readFile(new URL("../lib/massive/research-adapters.ts", import.meta.url), "utf8");
const livePanelSource = await readFile(new URL("../components/terminal/LiveOptionsPanel.tsx", import.meta.url), "utf8");
const terminalSource = await readFile(new URL("../components/research/OptionsTerminal.tsx", import.meta.url), "utf8");

for (const [fileName, source] of [
  ["research-adapters.ts", adapterSource],
  ["LiveOptionsPanel.tsx", livePanelSource],
  ["OptionsTerminal.tsx", terminalSource],
]) {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
    reportDiagnostics: true,
  });
  const syntaxErrors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(syntaxErrors, [], `${fileName} should transpile without syntax errors`);
}

test("Massive option adapter never promotes quote midpoint into lastPrice", () => {
  assert.match(adapterSource, /const lastPrice = lastTrade \?\? dayClose/);
  assert.doesNotMatch(adapterSource, /lastPrice\s*=.*midpoint/);
  assert.match(adapterSource, /lastPriceSource/);
  assert.match(adapterSource, /quoteAvailability/);
});

test("strategy and break-even calculations require a manual premium", () => {
  assert.match(livePanelSource, /const premium = draft\.premium/);
  assert.doesNotMatch(livePanelSource, /draft\.premium\s*\?\?/);
  assert.doesNotMatch(livePanelSource, /optionMidpoint/);
  assert.match(terminalSource, /MANUAL PREMIUM REQUIRED/);
  assert.match(terminalSource, /BREAK-EVEN \(MANUAL\)/);
});

test("a loaded option chain remains visible when the supplemental security request fails", () => {
  assert.match(livePanelSource, /const chainQuote: Quote \| null = chain\.data \?/);
  assert.match(livePanelSource, /const quote = security\.data\?\.snapshot\.quote \?\? chainQuote/);
  assert.match(livePanelSource, /if \(!chain\.data \|\| !underlying\)/);
  assert.match(livePanelSource, /loading=\{chain\.loading\} error=\{chain\.error\}/);
  assert.match(livePanelSource, /Underlying stock context unavailable; using option-chain fields/);
});

test("options UI exposes quote availability, warnings, and supported filters", () => {
  assert.match(terminalSource, /BID \/ ASK QUOTES UNAVAILABLE — CHAIN DATA IS SHOWN/);
  assert.match(terminalSource, /NO LISTED OPTION CONTRACTS RETURNED/);
  assert.match(terminalSource, /NO EXPIRATIONS/);
  assert.match(terminalSource, /LIVE BID\/ASK QUOTES NOT INCLUDED/);
  assert.match(terminalSource, /hasContracts && quoteAvailability === "unavailable"/);
  assert.match(livePanelSource, /hasContracts=\{chain\.data\.contracts\.length > 0\}/);
  assert.match(terminalSource, /showQuoteColumns/);
  for (const field of [
    "contractType",
    "minimumVolumeToOpenInterest",
    "impliedVolatilityMin",
    "impliedVolatilityMax",
    "deltaMin",
    "deltaMax",
    "moneyness",
  ]) {
    assert.match(terminalSource, new RegExp(field));
  }
});
