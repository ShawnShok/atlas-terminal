import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const cacheKey = await loadTypeScriptModule(
  new URL("../lib/cache/cache-key.ts", import.meta.url),
);
const config = await loadTypeScriptModule(
  new URL("../lib/cache/config.ts", import.meta.url),
);
const memory = await loadTypeScriptModule(
  new URL("../lib/cache/memory-cache.ts", import.meta.url),
);

test("cache keys are deterministic, namespaced, and safely encoded", () => {
  assert.equal(
    cacheKey.createCacheKey("intraday", "NVDA / USD", 5, true, null, undefined),
    "atlas:v1:intraday:NVDA%20%2F%20USD:5:true:null:undefined",
  );
  assert.equal(
    cacheKey.createCacheKey("option", "O:NVDA260918C00125000"),
    "atlas:v1:option:O%3ANVDA260918C00125000",
  );
});

test("cache TTL defaults include bounded intraday and option windows", () => {
  assert.deepEqual(config.DEFAULT_CACHE_TTLS, {
    quote: 5_000,
    snapshot: 5_000,
    intraday: 15_000,
    option: 30_000,
    news: 30_000,
    event: 900_000,
    reference: 86_400_000,
    financial: 21_600_000,
    historical: 86_400_000,
    generic: 30_000,
    staleIfError: 300_000,
  });
});

test("environment cache values map to every cache policy independently", () => {
  const ttls = config.cacheTtlsFromEnv({
    CACHE_TTL_QUOTE_MS: 1,
    CACHE_TTL_INTRADAY_MS: 2,
    CACHE_TTL_OPTIONS_MS: 3,
    CACHE_TTL_NEWS_MS: 4,
    CACHE_TTL_EVENTS_MS: 5,
    CACHE_TTL_REFERENCE_MS: 6,
    CACHE_TTL_FINANCIALS_MS: 7,
    CACHE_TTL_HISTORICAL_MS: 8,
    CACHE_STALE_IF_ERROR_MS: 9,
  });
  assert.deepEqual(ttls, {
    quote: 1,
    snapshot: 1,
    intraday: 2,
    option: 3,
    news: 4,
    event: 5,
    reference: 6,
    financial: 7,
    historical: 8,
    generic: 4,
    staleIfError: 9,
  });
});

test("memory cache transitions from fresh to stale to missing at exact boundaries", async () => {
  let now = 1_000;
  const store = new memory.MemoryCacheStore({ now: () => now });
  await store.set("quote", { price: 123.45 }, { ttlMs: 100, staleTtlMs: 50 });

  assert.deepEqual(await store.get("quote"), {
    status: "hit",
    value: { price: 123.45 },
    createdAt: 1_000,
    expiresAt: 1_100,
  });

  now = 1_100;
  assert.equal((await store.get("quote")).status, "stale");

  now = 1_149;
  assert.equal((await store.get("quote")).status, "stale");

  now = 1_150;
  assert.deepEqual(await store.get("quote"), { status: "miss" });
  assert.equal(store.size, 0);
});

test("memory cache uses LRU access order and supports deletion controls", async () => {
  const store = new memory.MemoryCacheStore({ maxEntries: 2, now: () => 5_000 });
  await store.set("a", 1, { ttlMs: 1_000 });
  await store.set("b", 2, { ttlMs: 1_000 });
  await store.get("a");
  await store.set("c", 3, { ttlMs: 1_000 });

  assert.equal((await store.get("a")).status, "hit");
  assert.deepEqual(await store.get("b"), { status: "miss" });
  assert.equal((await store.get("c")).status, "hit");
  assert.equal(await store.delete("a"), true);
  assert.equal(await store.delete("a"), false);

  await store.set("zero", 1, { ttlMs: 1_000 });
  await store.set("zero", 2, { ttlMs: 0 });
  assert.deepEqual(await store.get("zero"), { status: "miss" });

  await store.clear();
  assert.equal(store.size, 0);
});

test("memory cache rejects invalid capacity and lifetime values", async () => {
  assert.throws(() => new memory.MemoryCacheStore({ maxEntries: 0 }), RangeError);
  const store = new memory.MemoryCacheStore();
  await assert.rejects(store.set("negative", 1, { ttlMs: -1 }), RangeError);
  await assert.rejects(
    store.set("negative-stale", 1, { ttlMs: 1, staleTtlMs: -1 }),
    RangeError,
  );
  await assert.rejects(store.set("infinite", 1, { ttlMs: Infinity }), RangeError);
});
