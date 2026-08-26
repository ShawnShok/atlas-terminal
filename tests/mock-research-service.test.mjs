import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const sourceUrl = new URL("../lib/mock/research-service.ts", import.meta.url);
const ivSurface = await loadTypeScriptModule(new URL("../lib/options/iv-surface.ts", import.meta.url));
const source = (await readFile(sourceUrl, "utf8"))
  .replace('import "server-only";', "")
  .replace(
    'import { buildOptionIvSurface, selectIvSurfaceExpirations } from "@/lib/options";',
    "const { buildOptionIvSurface, selectIvSurfaceExpirations } = globalThis.__atlasIvSurfaceTest;",
  );
globalThis.__atlasIvSurfaceTest = ivSurface;
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: true,
  },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(syntaxErrors, []);

const { MockResearchService } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);

test("mock corporate events honor ticker, inclusive date range, normalized type, and limit", async () => {
  const service = new MockResearchService();
  const ranged = await service.getCorporateEvents({
    from: "2026-08-16",
    to: "2026-08-19",
  });
  assert.deepEqual(ranged.events.map((event) => event.startsAt.slice(0, 10)), [
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
  ]);

  const ticker = await service.getCorporateEvents({
    ticker: " nvda ",
    from: "2026-08-16",
    to: "2026-08-16",
  });
  assert.equal(ticker.filterTicker, "NVDA");
  assert.deepEqual(ticker.events.map((event) => event.symbol), ["NVDA"]);

  const conferences = await service.getCorporateEvents({
    from: "2026-08-16",
    to: "2026-08-25",
    type: "conference",
    limit: 2,
  });
  assert.equal(conferences.events.length, 2);
  assert.ok(conferences.events.every((event) => event.type === "conference"));
});

test("mock corporate events accept provider event aliases and reject unknown types", async () => {
  const service = new MockResearchService();
  const earnings = await service.getCorporateEvents({
    from: "2026-08-16",
    to: "2026-08-25",
    type: "earnings_announcement_date",
  });
  assert.ok(earnings.events.length > 0);
  assert.ok(earnings.events.every((event) => event.type === "earnings-release"));

  const unknown = await service.getCorporateEvents({
    from: "2026-08-16",
    to: "2026-08-25",
    type: "not-a-real-event",
  });
  assert.deepEqual(unknown.events, []);
});

test("mock news honors publication bounds, category, keyword, ticker, and limit", async () => {
  const service = new MockResearchService();
  const filtered = await service.getBenzingaNews({
    publishedAfter: "2026-08-15T14:36:00.000Z",
    publishedBefore: "2026-08-15T14:40:00.000Z",
    category: "analyst",
    keyword: "fixture",
  });
  assert.deepEqual(filtered.articles.map((article) => article.tickers[0]), ["AMD"]);

  const ticker = await service.getBenzingaNews({ ticker: " amd ", keyword: "AMD" });
  assert.equal(ticker.filterTicker, "AMD");
  assert.deepEqual(ticker.articles.map((article) => article.tickers[0]), ["AMD"]);

  const limited = await service.getBenzingaNews({ limit: 2 });
  assert.equal(limited.articles.length, 2);
});

test("mock IV surface spans expirations with reported observations", async () => {
  const service = new MockResearchService();
  const result = await service.getOptionIvSurface({ symbol: " nvda ", expirationLimit: 4 });
  assert.equal(result.underlyingSymbol, "NVDA");
  assert.equal(result.loadedExpirations.length, 4);
  assert.ok(result.points.length > 40);
  assert.equal(result.contractsComplete, true);
});
