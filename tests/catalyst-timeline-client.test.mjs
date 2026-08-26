import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const timeline = await loadTypeScriptModule(
  new URL("../lib/research/client-timeline.ts", import.meta.url),
);

const liveMeta = {
  mode: "live",
  source: "massive + benzinga + tmx + options developer",
  quality: "live",
  asOf: "2026-08-19T17:00:00Z",
  freshness: {},
};

test("client catalyst timeline merges owner notes with market observations chronologically", () => {
  const items = timeline.mergeCatalystTimeline({
    symbol: "nvda",
    meta: liveMeta,
    entries: [
      { id: "event", at: "2026-08-22T13:00:00Z", symbol: "NVDA", kind: "event", title: "Investor conference", detail: null, url: null },
      { id: "options", at: "2026-08-19T18:02:00Z", symbol: "NVDA", kind: "options-activity", title: "Options threshold", detail: null, url: null },
      { id: "news", at: "2026-08-19T17:31:00Z", symbol: "NVDA", kind: "news", title: "Article", detail: null, url: "https://example.test/article" },
      { id: "price", at: "2026-08-19T17:38:00Z", symbol: "NVDA", kind: "price-move", title: "Price move", detail: null, url: null },
      { id: "volume", at: "2026-08-19T17:34:00Z", symbol: "NVDA", kind: "volume-spike", title: "RVOL threshold", detail: null, url: null },
      { id: "market-note", at: "2026-08-19T17:35:00Z", symbol: "NVDA", kind: "note", title: "Must not render", detail: "Wrong source", url: null },
      { id: "wrong-symbol", at: "2026-08-19T17:32:00Z", symbol: "AMD", kind: "news", title: "Wrong ticker", detail: null, url: null },
      { id: "bad-time", at: "not-a-date", symbol: "NVDA", kind: "news", title: "Bad time", detail: null, url: null },
    ],
    notes: [
      {
        id: "private-1",
        symbol: "NVDA",
        title: null,
        body: `  # Thesis\n${"private detail ".repeat(40)}  `,
        updatedAt: "2026-08-19T17:36:00Z",
      },
      { id: "other-note", symbol: "AMD", title: "Other", body: "Do not merge", updatedAt: "2026-08-19T17:35:00Z" },
    ],
  });

  assert.deepEqual(items.map((item) => item.type), [
    "news",
    "volume-spike",
    "note",
    "price-move",
    "options-activity",
    "event",
  ]);
  const note = items.find((item) => item.type === "note");
  assert.ok(note);
  assert.equal(note.title, "PRIVATE RESEARCH NOTE");
  assert.equal(note.sourceLabel, "PRIVATE NOTE · POSTGRESQL");
  assert.equal(note.href, null);
  assert.ok(note.description.length <= 320);
  assert.doesNotMatch(note.description, /\n/);
  assert.equal(items.find((item) => item.type === "news").sourceLabel, "BENZINGA NEWS");
  assert.equal(items.find((item) => item.type === "event").sourceLabel, "TMX CORPORATE EVENTS");
  assert.equal(items.find((item) => item.type === "volume-spike").sourceLabel, "MASSIVE STOCK VOLUME");
  assert.equal(items.find((item) => item.type === "options-activity").sourceLabel, "MASSIVE OPTIONS DATA");
  assert.equal(items.some((item) => item.title === "Must not render"), false);
});

test("timeline source labels distinguish mock observations without claiming a live provider", () => {
  assert.equal(timeline.catalystSourceLabel("news", { ...liveMeta, mode: "mock", source: "mock" }), "MOCK · NEWS");
  assert.equal(timeline.catalystSourceLabel("options-activity", null), "OPTIONS SOURCE UNAVAILABLE");
});

test("private notes are requested only through the owner-scoped personal API after the database check", async () => {
  const hook = await readFile(new URL("../hooks/usePrivateTimelineNotes.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../components/terminal/LiveAnalyticsPanel.tsx", import.meta.url), "utf8");
  const statusRequest = hook.indexOf("/api/personal?resource=status");
  const notesRequest = hook.indexOf("/api/personal?resource=notes&symbol=");

  assert.ok(statusRequest >= 0 && notesRequest > statusRequest);
  assert.match(hook, /if \(!status\.configured\)/);
  assert.match(hook, /private notes were not requested/i);
  assert.doesNotMatch(hook, /\/api\/research|api\.massive\.com|benzinga|tmx/i);
  assert.match(panel, /usePrivateTimelineNotes\(ticker, activeView === "catalysts"\)/);
  assert.match(panel, /private note content is not sent to market-data providers/i);
});

test("timeline UI labels every supported observation and retains a causation disclaimer", async () => {
  const component = await readFile(new URL("../components/research/AnalyticsTerminal.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../components/research/research.css", import.meta.url), "utf8");

  for (const label of ["PRICE MOVE", "VOLUME SPIKE", "OPTIONS ACTIVITY", "PRIVATE NOTE"]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /chronology and possible correlation only/i);
  assert.match(component, /does not establish that any item caused a market move/i);
  assert.match(css, /\.research-catalyst-timeline li[\s\S]*content-visibility:\s*auto/);
  assert.match(css, /timeline-kind-note/);
});
