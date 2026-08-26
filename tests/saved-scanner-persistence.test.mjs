import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [hookSource, personalRoute] = await Promise.all([
  readFile(new URL("../hooks/useSavedScanners.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/personal/route.ts", import.meta.url), "utf8"),
]);

const transpiled = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "useSavedScanners.ts",
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, []);

const executableHook = transpiled.outputText.replace(
  /import \{ useCallback, useEffect, useState, useSyncExternalStore \} from "react";/,
  "const useCallback = () => {}; const useEffect = () => {}; const useState = () => {}; const useSyncExternalStore = () => [];",
);
const savedScanners = await import(
  `data:text/javascript;base64,${Buffer.from(executableHook).toString("base64")}`
);

const validCondition = {
  id: "relative-volume",
  field: "relative-volume",
  operator: "greater-than-or-equal",
  value: 2,
  unit: "X",
};

test("saved scanner parser accepts bounded v1 definitions and provider-neutral rule JSON", () => {
  const definition = {
    version: 1,
    logic: "all",
    conditions: [validCondition],
    rule: {
      kind: "all",
      rules: [
        { kind: "numeric", field: "relativeVolume", operator: "gte", value: 2 },
        { kind: "recent-news", withinMinutes: 30 },
        { kind: "catalyst-window", withinDays: 14, catalystTypes: ["earnings"] },
      ],
    },
  };
  assert.deepEqual(savedScanners.parseSavedScannerDefinition(definition), definition);
});

test("saved scanner parser rejects oversized, non-finite, unknown, and deeply nested definitions", () => {
  assert.equal(savedScanners.parseSavedScannerDefinition({ version: 1, logic: "all", conditions: [] }), null);
  assert.equal(savedScanners.parseSavedScannerDefinition({
    version: 1,
    logic: "all",
    conditions: Array.from({ length: 13 }, (_, index) => ({ ...validCondition, id: `condition-${index}` })),
  }), null);
  assert.equal(savedScanners.parseSavedScannerDefinition({
    version: 1,
    logic: "all",
    conditions: [{ ...validCondition, value: Number.NaN }],
  }), null);
  assert.equal(savedScanners.parseSavedScannerDefinition({
    version: 1,
    logic: "all",
    conditions: [validCondition],
    extra: true,
  }), null);
  assert.equal(savedScanners.parseSavedScannerDefinition({
    version: 1,
    logic: "all",
    conditions: [validCondition],
    rule: { kind: "numeric", field: "providerSpecificScore", operator: "gte", value: 1 },
  }), null);

  let rule = { kind: "numeric", field: "price", operator: "gte", value: 5 };
  for (let depth = 0; depth < 5; depth += 1) rule = { kind: "not", rule };
  assert.equal(savedScanners.parseSavedScannerDefinition({
    version: 1,
    logic: "all",
    conditions: [validCondition],
    rule,
  }), null);
});

test("personal scanner writes validate definitions and upsert within the authenticated owner", () => {
  assert.match(personalRoute, /const scannerDefinitionSchema = z\.object\(\{[\s\S]*?version: z\.literal\(1\)/);
  assert.match(personalRoute, /conditions: z\.array\(scannerConditionSchema\)\.min\(1\)\.max\(12\)/);
  assert.match(personalRoute, /rule: scannerRuleSchema\.optional\(\)/);
  assert.match(personalRoute, /isValidSerializedScannerRule\(rule\)/);
  assert.match(personalRoute, /db\.savedScanner\.upsert\(\{\s*where: \{ ownerId_name: \{ ownerId, name: input\.name \} \}/);
  assert.match(personalRoute, /update: \{ description: input\.description, definition: jsonValue\(input\.definition\) \}/);
});

test("scanner PATCH and DELETE remain owner scoped", () => {
  assert.match(personalRoute, /const input = scannerPatchSchema\.parse\(body\)/);
  assert.match(personalRoute, /const ownedScanner = await db\.savedScanner\.findFirst\(\{\s*where: \{ id, ownerId \}/);
  assert.match(personalRoute, /db\.savedScanner\.update\(\{\s*where: \{ id, ownerId \}/);
  assert.match(personalRoute, /db\.savedScanner\.delete\(\{ where: \{ id, ownerId \} \}\)/);
});

test("hook permits session mutation only after an explicit configured=false status", () => {
  assert.match(hookSource, /status\.configured === false/);
  assert.match(hookSource, /setPersistenceState\("session"\)/);
  assert.match(hookSource, /catch \(cause\) \{\s*setConfigured\(null\);\s*setPersistenceState\("unavailable"\)/);
  assert.match(hookSource, /if \(persistenceState === "session"\)/);
  assert.match(hookSource, /useSyncExternalStore\(/);
  assert.match(hookSource, /window\.sessionStorage\.setItem\(SCANNER_SESSION_STORAGE_KEY/);
  assert.match(hookSource, /updateSessionScanners\(\(current\) => putFirst\(current, next\)\)/);
  assert.doesNotMatch(hookSource, /const \[records, setRecords\] = useState/);
  assert.match(hookSource, /if \(persistenceState !== "durable"\) throw new Error\(mutationUnavailableMessage\(persistenceState\)\)/);
  assert.doesNotMatch(hookSource, /if \(!configured\)/);
  assert.match(hookSource, /update,\s*remove,\s*reload: load,\s*clearError,\s*clearMessage/);
});
