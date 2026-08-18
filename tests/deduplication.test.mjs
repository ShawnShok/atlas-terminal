import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const {
  dedupeCorporateEvents,
  dedupeNewsArticles,
  eventDedupeKey,
  newsDedupeKey,
} = await loadTypeScriptModule(
  new URL("../lib/research/deduplication.ts", import.meta.url),
);

function article(overrides = {}) {
  return {
    id: "benzinga-42",
    title: "Company raises guidance",
    summary: "Short summary",
    body: null,
    articleUrl: "https://example.com/story?utm_source=feed",
    imageUrl: null,
    publishedAt: "2026-08-17T15:30:00.000Z",
    updatedAt: null,
    tickers: ["NVDA"],
    categories: ["guidance"],
    keywords: ["guidance"],
    publisher: { name: "Benzinga", homepageUrl: null, logoUrl: null, faviconUrl: null },
    asOf: "2026-08-17T15:31:00.000Z",
    quality: "live",
    source: "benzinga",
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    id: "tmx-100",
    symbol: "NVDA",
    companyName: "NVIDIA Corporation",
    title: "Investor conference",
    type: "conference",
    status: "confirmed",
    startsAt: "2026-08-22T12:00:00.000Z",
    endsAt: null,
    allDay: true,
    description: null,
    eventUrl: null,
    asOf: "2026-08-17T15:00:00.000Z",
    quality: "delayed",
    source: "tmx",
    ...overrides,
  };
}

test("news deduplication canonicalizes tracked URLs and merges richer metadata", () => {
  const first = article();
  const duplicate = article({
    id: "different-provider-id",
    articleUrl: "https://EXAMPLE.com/story#top",
    summary: "A substantially longer normalized article summary.",
    body: "Available article body.",
    tickers: ["NVDA", "AMD"],
    categories: ["earnings"],
    keywords: ["outlook"],
    asOf: "2026-08-17T15:35:00.000Z",
  });
  assert.equal(newsDedupeKey(first), newsDedupeKey(duplicate));
  const result = dedupeNewsArticles([first, duplicate]);
  assert.equal(result.length, 1);
  assert.equal(result[0].body, "Available article body.");
  assert.deepEqual(result[0].tickers, ["NVDA", "AMD"]);
  assert.deepEqual(result[0].categories, ["guidance", "earnings"]);
  assert.equal(result[0].asOf, "2026-08-17T15:35:00.000Z");
});

test("news deduplication preserves distinct stories and sorts newest first", () => {
  const oldStory = article({ articleUrl: null, id: "old", publishedAt: "2026-08-17T14:00:00Z" });
  const newStory = article({ articleUrl: null, id: "new", publishedAt: "2026-08-17T16:00:00Z" });
  assert.notEqual(newsDedupeKey(oldStory), newsDedupeKey(newStory));
  assert.deepEqual(dedupeNewsArticles([oldStory, newStory]).map((item) => item.id), ["new", "old"]);
});

test("event deduplication uses stable provider IDs and keeps the latest status", () => {
  const pending = event({ status: "pending", description: "Short" });
  const confirmed = event({
    status: "confirmed",
    description: "Confirmed event with a webcast.",
    eventUrl: null,
    asOf: "2026-08-17T16:00:00.000Z",
  });
  assert.equal(eventDedupeKey(pending), eventDedupeKey(confirmed));
  const result = dedupeCorporateEvents([pending, confirmed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "confirmed");
  assert.equal(result[0].description, "Confirmed event with a webcast.");
});

test("event deduplication sorts by start timestamp", () => {
  const later = event({ id: "later", startsAt: "2026-08-24T12:00:00Z" });
  const sooner = event({ id: "sooner", startsAt: "2026-08-20T12:00:00Z" });
  assert.deepEqual(dedupeCorporateEvents([later, sooner]).map((item) => item.id), ["sooner", "later"]);
});
