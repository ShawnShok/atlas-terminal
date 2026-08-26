import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../lib/research/timeline.ts", import.meta.url), "utf8"))
  .replace('import type { AggregateBar, CatalystTimelineEntry, OptionChainBundle } from "@/types";\n', "");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "timeline.ts",
  reportDiagnostics: true,
});
assert.deepEqual((transpiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error), []);
const timeline = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);

const bars = Array.from({ length: 21 }, (_, index) => ({
  symbol: "NVDA",
  timestamp: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
  volume: index === 20 ? 300 : 100,
}));

test("volume timeline entries require a real comparable baseline", () => {
  const entries = timeline.volumeSpikeTimelineEntries("NVDA", bars, { lookback: 20, threshold: 2 });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "volume-spike");
  assert.match(entries[0].detail, /not attributed causation/i);
  assert.equal(timeline.volumeSpikeTimelineEntries("NVDA", bars.slice(0, 10)).length, 0);
});

test("options timeline is descriptive and never infers direction or execution", () => {
  const entries = timeline.optionsActivityTimelineEntries("NVDA", {
    asOf: "2026-08-19T20:00:00.000Z",
    quality: "delayed",
    contracts: [
      { symbol: "O:NVDA", volume: 500, openInterest: 100 },
      { symbol: "O:LOW", volume: 10, openInterest: 100 },
    ],
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "options-activity");
  assert.match(entries[0].detail, /direction, intent, and executable price are unknown/i);
});
