import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const { describeFreshness, freshnessLabel } = await loadTypeScriptModule(
  new URL("../lib/freshness/model.ts", import.meta.url),
);

const NOW = "2026-08-17T16:00:00.000Z";

test("labels live, delayed, closed, historical, and unavailable data", () => {
  const live = describeFreshness({
    quality: "live",
    asOf: "2026-08-17T15:59:45.000Z",
    source: "massive",
    now: NOW,
  });
  assert.equal(live.status, "live");
  assert.equal(freshnessLabel(live), "LIVE");

  const delayed = describeFreshness({
    quality: "delayed",
    asOf: "2026-08-17T15:45:00.000Z",
    source: "benzinga",
    now: NOW,
  });
  assert.equal(delayed.delayMinutes, 15);
  assert.equal(freshnessLabel(delayed), "15 MIN DELAYED");

  const closed = describeFreshness({
    quality: "live",
    asOf: "2026-08-17T15:59:00.000Z",
    source: "massive",
    marketSession: "closed",
    now: NOW,
  });
  assert.equal(closed.status, "closed");
  assert.equal(freshnessLabel(closed), "MARKET CLOSED");

  assert.equal(freshnessLabel(describeFreshness({
    quality: "historical",
    asOf: "2026-08-15T20:00:00.000Z",
    source: "massive",
    now: NOW,
  })), "HISTORICAL");

  const unavailable = describeFreshness({ quality: "unknown", source: "massive", now: NOW });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.lastUpdatedAt, null);
});

test("staleness takes precedence over provider quality", () => {
  const stale = describeFreshness({
    quality: "live",
    asOf: "2026-08-17T15:57:59.999Z",
    source: "massive",
    staleAfterMs: 120_000,
    now: NOW,
  });
  assert.equal(stale.status, "stale");
  assert.equal(freshnessLabel(stale), "STALE DATA");

  const boundary = describeFreshness({
    quality: "live",
    asOf: "2026-08-17T15:58:00.000Z",
    source: "massive",
    staleAfterMs: 120_000,
    now: NOW,
  });
  assert.equal(boundary.status, "live");
});

test("normalizes timestamps and rejects invalid freshness configuration", () => {
  const result = describeFreshness({
    quality: "end-of-day",
    asOf: "2026-08-16T20:00:00-04:00",
    source: "massive",
    delayMinutes: 0.4,
    now: NOW,
  });
  assert.equal(result.status, "end-of-day");
  assert.equal(result.delayMinutes, 0);
  assert.equal(result.lastUpdatedAt, "2026-08-17T00:00:00.000Z");

  assert.throws(() => describeFreshness({
    quality: "live",
    asOf: NOW,
    source: "massive",
    delayMinutes: -1,
    now: NOW,
  }), RangeError);
  assert.throws(() => describeFreshness({
    quality: "live",
    asOf: NOW,
    source: "massive",
    staleAfterMs: Number.NaN,
    now: NOW,
  }), RangeError);
});
