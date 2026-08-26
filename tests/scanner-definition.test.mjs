import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [engineSource, definitionSource, similarSource] = await Promise.all([
  readFile(new URL("../lib/scanner/engine.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/scanner/definition.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/scanner/similar.ts", import.meta.url), "utf8"),
]);
const withoutEngineImport = (source) => source.replace(/import[\s\S]*?from "\.\/engine";\n/, "");
const source = `${engineSource}\n${withoutEngineImport(definitionSource)}\n${withoutEngineImport(similarSource)}`;
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "scanner-definition.ts",
  reportDiagnostics: true,
});
assert.deepEqual((transpiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error), []);
const scannerModule = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);

test("nested scanner AST round-trips without flattening or changing rule semantics", () => {
  const rule = {
    kind: "all",
    rules: [
      { kind: "recent-news", withinMinutes: 30, headlineIncludes: "guidance", categories: ["earnings"] },
      { kind: "any", rules: [
        { kind: "numeric", field: "dailyRelativeVolume", operator: "gte", value: 2 },
        { kind: "not", rule: { kind: "market-cap", buckets: ["mega"] } },
      ] },
    ],
  };
  const serialized = scannerModule.serializeScannerRule(rule);
  const parsed = scannerModule.parseScannerRuleDefinition(JSON.parse(JSON.stringify(serialized)));
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.rule, rule);
  assert.equal(parsed.rule.rules[1].kind, "any");
  assert.equal(parsed.rule.rules[1].rules[1].kind, "not");
});

test("flat V1 scanner definitions remain readable through the V2 AST boundary", () => {
  const parsed = scannerModule.parseScannerRuleDefinition({
    version: 1,
    logic: "any",
    conditions: [
      { id: "move", field: "daily-change", operator: "greater-than-or-equal", value: 3, unit: "ABS" },
      { id: "news", field: "recent-news-minutes", operator: "less-than-or-equal", value: 30 },
    ],
  });
  assert.equal(parsed.version, 2);
  assert.equal(parsed.rule.kind, "any");
  assert.equal(parsed.rule.rules[0].operator, "absolute-gte");
  assert.equal(parsed.rule.rules[1].kind, "recent-news");
});

test("legacy custom earnings rules include both earnings releases and earnings calls", () => {
  const parsed = scannerModule.parseScannerRuleDefinition({
    version: 1,
    logic: "all",
    conditions: [{ id: "earnings", field: "earnings-within-days", operator: "less-than-or-equal", value: 14 }],
  });
  assert.deepEqual(parsed.rule.rules[0].catalystTypes, ["earnings", "earnings-release", "earnings-call"]);
});

test("scanner AST validation enforces bounded nesting and group complexity", () => {
  let nested = { kind: "numeric", field: "price", operator: "gte", value: 1 };
  for (let index = 0; index < scannerModule.SCANNER_RULE_LIMITS.maxDepth; index += 1) {
    nested = { kind: "not", rule: nested };
  }
  assert.throws(() => scannerModule.serializeScannerRule(nested), /nesting exceeds/i);
  assert.throws(() => scannerModule.serializeScannerRule({
    kind: "all",
    rules: Array.from({ length: scannerModule.SCANNER_RULE_LIMITS.maxChildrenPerGroup + 1 }, () => ({
      kind: "numeric", field: "price", operator: "gte", value: 1,
    })),
  }), /children/i);
  assert.throws(() => scannerModule.serializeScannerRule({
    kind: "numeric", field: "price", operator: "gte", value: 1, providerSecret: "nope",
  }), /unexpected field/i);
  assert.throws(() => scannerModule.serializeScannerRule({ kind: "all", rules: [] }), /1–12 children/i);
});

test("similar-ticker rules use only available observed metrics and remain bounded", () => {
  const rule = scannerModule.createSimilarTickerRule({
    symbol: "NVDA",
    price: 95,
    marketCap: 2_000_000_000_000,
    dailyChangePercent: -4.7,
    dailyRelativeVolume: 2.34,
    intradayRelativeVolume: null,
    vwap: 100,
  });
  assert.ok(rule);
  assert.equal(rule.kind, "all");
  assert.deepEqual(rule.rules.map((item) => item.kind), ["market-cap", "numeric", "numeric", "price-relation"]);
  assert.equal(rule.rules[1].operator, "lte");
  assert.equal(rule.rules[2].field, "dailyRelativeVolume");
  assert.equal(rule.rules[3].relation, "at-or-below");
  assert.equal(scannerModule.createSimilarTickerRule({ symbol: "EMPTY", price: null }), null);
});
