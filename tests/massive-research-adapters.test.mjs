import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const adapters = await loadTypeScriptModule(new URL("../lib/massive/research-adapters.ts", import.meta.url));
const pagination = await loadTypeScriptModule(new URL("../lib/massive/pagination.ts", import.meta.url));

test("provider pagination follows cursors until normalized results are complete", async () => {
  const loaded = [];
  const responses = new Map([
    ["https://api.massive.test/page/2", {
      results: [{ id: "a" }, { id: "b" }],
      next_url: "https://api.massive.test/page/3",
    }],
    ["https://api.massive.test/page/3", { results: [{ id: "c" }] }],
  ]);
  const pages = await pagination.collectBoundedProviderPages({
    results: [{ id: "a" }],
    next_url: "https://api.massive.test/page/2",
  }, {
    maxPages: 5,
    isComplete: (collected) => new Set(collected.flatMap((page) =>
      (page.results ?? []).map((item) => item.id))).size >= 3,
    loadNext: async (nextUrl) => {
      loaded.push(nextUrl);
      return responses.get(nextUrl);
    },
  });

  assert.equal(pages.length, 3);
  assert.deepEqual(loaded, [
    "https://api.massive.test/page/2",
    "https://api.massive.test/page/3",
  ]);
});

test("provider pagination enforces its page bound and rejects cursor loops", async () => {
  let loadCount = 0;
  const bounded = await pagination.collectBoundedProviderPages({
    results: [{ id: 0 }],
    next_url: "https://api.massive.test/page/1",
  }, {
    maxPages: 3,
    loadNext: async () => {
      loadCount += 1;
      return {
        results: [{ id: loadCount }],
        next_url: `https://api.massive.test/page/${loadCount + 1}`,
      };
    },
  });
  assert.equal(bounded.length, 3);
  assert.equal(loadCount, 2);

  await assert.rejects(() => pagination.collectBoundedProviderPages({
    next_url: "https://api.massive.test/repeated",
  }, {
    maxPages: 3,
    loadNext: async () => ({ next_url: "https://api.massive.test/repeated" }),
  }), /repeated pagination URL/);
});

test("live news and TMX services deduplicate paged records before enforcing overall limits", async () => {
  const serviceSource = await readFile(new URL("../lib/massive/research-service.ts", import.meta.url), "utf8");
  assert.match(serviceSource, /MAX_BENZINGA_NEWS_PAGES/);
  assert.match(serviceSource, /MAX_TMX_EVENT_PAGES/);
  assert.match(serviceSource, /pageLimit = Math\.min\(BENZINGA_NEWS_PAGE_SIZE, limit\)/);
  assert.match(serviceSource, /pageLimit = Math\.min\(TMX_EVENT_PAGE_SIZE, limit\)/);
  assert.match(serviceSource, /dedupeNewsArticles\(adaptBenzingaNews\(combined\)\)/);
  assert.match(serviceSource, /"published\.lte": input\.publishedBefore/);
  assert.match(serviceSource, /articlesFromPages\(pages\)\.slice\(0, limit\)/);
  assert.match(serviceSource, /dedupeCorporateEvents\(adaptTmxEvents\(combined\)\)/);
  assert.match(serviceSource, /eventsFromPages\(pages\)\.slice\(0, limit\)/);
  assert.match(serviceSource, /#safeNextRequest\(nextUrl\)/);
  assert.match(serviceSource, /staleIfErrorMs: 0/);
});

test("option service forwards whether its bounded provider cursor was exhausted", async () => {
  const serviceSource = await readFile(new URL("../lib/massive/research-service.ts", import.meta.url), "utf8");
  assert.match(serviceSource, /const contractsComplete = !pages\.at\(-1\)\?\.next_url/);
  assert.match(serviceSource, /adaptOptionChain\(combined, symbol, expiration, contractsComplete\)/);
});

test("earnings route requests both TMX release and conference-call aliases", async () => {
  const routeSource = await readFile(new URL("../app/api/research/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /publishedBefore: isoTimestamp\(request\.nextUrl\.searchParams\.get\("before"\)\)/);
  assert.match(routeSource, /TMX_EVENT_TYPES\["earnings-release"\][\s\S]*TMX_EVENT_TYPES\["earnings-call"\]/);
  assert.match(routeSource, /"earnings-call": \["earnings_conference_call"\]/);
});

test("sanitizes Benzinga HTML before it reaches client components", () => {
  const body = adapters.sanitizeArticleBody("<p>Alpha &amp; beta</p><script>alert(1)</script><br>Gamma");
  assert.equal(body, "Alpha & beta\n\nGamma");
  assert.doesNotMatch(body, /script|alert|<|>/i);

  const articles = adapters.adaptBenzingaNews({
    results: [{
      benzinga_id: 42,
      title: "Company issues guidance",
      published: "2026-08-15T15:00:00Z",
      teaser: "<b>Raised</b> outlook",
      body: "<p>Revenue outlook increased.</p>",
      tickers: ["nvda"],
      channels: ["Guidance"],
      tags: [],
    }],
  });
  assert.equal(articles[0].tickers[0], "NVDA");
  assert.deepEqual(articles[0].categories, ["guidance"]);
  assert.equal(articles[0].body, "Revenue outlook increased.");
  assert.equal(articles[0].source, "benzinga");
});

test("decodes Benzinga headline entities as plain text", () => {
  const [article] = adapters.adaptBenzingaNews({
    results: [{
      benzinga_id: 44,
      title: "&#39;Chipmaker&#39; R&amp;D Update",
      published: "2026-08-19T16:00:00.000Z",
      channels: ["M&amp;A"],
      author: "A&amp;B Desk",
    }],
  });
  assert.equal(article.title, "'Chipmaker' R&D Update");
  assert.deepEqual(article.keywords, ["M&A"]);
  assert.equal(article.publisher.name, "Benzinga · A&B Desk");
});

test("normalizes TMX date-only events without inventing a market-session time", () => {
  const events = adapters.adaptTmxEvents({
    results: [
      {
        tmx_record_id: "abc",
        ticker: "NVDA",
        company_name: "NVIDIA Corporation",
        name: "Quarterly results",
        date: "2026-08-27",
        type: "earnings_announcement_date",
        status: "pending_approval",
      },
      {
        tmx_record_id: "rescheduled",
        ticker: "NVDA",
        company_name: "NVIDIA Corporation",
        name: "Investor day",
        date: "2026-09-10",
        type: "capital_markets_day",
        status: "rescheduled",
      },
    ],
  });
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].startsAt, "2026-08-27T12:00:00.000Z");
  assert.equal(events[0].status, "pending");
  assert.equal(events[0].type, "earnings-release");
  assert.equal(events[0].quality, "delayed");
  assert.equal(events[1].status, "rescheduled");
});

test("option-chain quality is conservative across mixed timeframe fields", () => {
  const contract = (ticker, timeframe) => ({
    details: {
      ticker,
      contract_type: ticker.includes("C") ? "call" : "put",
      expiration_date: "2026-09-18",
      strike_price: 150,
      shares_per_contract: 100,
    },
    day: { close: 4.2, volume: 500 },
    last_quote: { bid: 4.1, ask: 4.3, midpoint: 4.2, timeframe },
    underlying_asset: { price: 155 },
    open_interest: 1_200,
    implied_volatility: 0.42,
    greeks: { delta: 0.55 },
  });

  const mixed = adapters.adaptOptionChain({ results: [
    contract("O:NVDA260918C00150000", "real-time"),
    contract("O:NVDA260918P00150000", undefined),
  ] }, "NVDA", "2026-09-18");
  assert.equal(mixed.quality, "unknown");
  assert.equal(mixed.contracts[0].lastPrice, 4.2);
  assert.equal(mixed.contracts[0].lastPriceSource, "day-close");
  assert.equal(mixed.contracts[0].quoteAvailability, "available");
  assert.equal(mixed.contracts[0].sharesPerContractReported, true);
  assert.equal(mixed.contractsComplete, true);

  const delayed = adapters.adaptOptionChain({ results: [
    contract("O:NVDA260918C00150000", "real-time"),
    contract("O:NVDA260918P00150000", "delayed"),
  ] }, "NVDA", "2026-09-18");
  assert.equal(delayed.quality, "delayed");
});

test("option-chain prices preserve trade, close, and quote provenance", () => {
  const details = (ticker) => ({
    ticker,
    contract_type: "call",
    expiration_date: "2026-09-18",
    strike_price: 150,
    shares_per_contract: 100,
  });
  const chain = adapters.adaptOptionChain({ results: [
    {
      details: details("O:NVDA260918C00150000"),
      last_quote: { bid: 4, ask: 6, midpoint: 5, timeframe: "delayed" },
    },
    {
      details: details("O:NVDA260918C00155000"),
      day: { close: 3.25 },
    },
    {
      details: details("O:NVDA260918C00160000"),
      day: { close: 2.5 },
      last_trade: { price: 2.75 },
    },
  ] }, "NVDA", "2026-09-18");

  assert.equal(chain.contracts[0].lastPrice, null, "quote midpoint must never become lastPrice");
  assert.equal(chain.contracts[0].lastPriceSource, "unavailable");
  assert.equal(chain.contracts[0].quoteAvailability, "available");
  assert.equal(chain.contracts[1].lastPrice, 3.25);
  assert.equal(chain.contracts[1].lastPriceSource, "day-close");
  assert.equal(chain.contracts[1].quoteAvailability, "unavailable");
  assert.equal(chain.contracts[2].lastPrice, 2.75);
  assert.equal(chain.contracts[2].lastPriceSource, "last-trade");
  assert.equal(chain.quoteAvailability, "partial");
  assert.match(chain.quoteNote, /incomplete/i);
});

test("option chain explicitly reports when no bid or ask entitlement data exists", () => {
  const chain = adapters.adaptOptionChain({ results: [{
    details: {
      ticker: "O:NVDA260918P00150000",
      contract_type: "put",
      expiration_date: "2026-09-18",
      strike_price: 150,
    },
    day: { close: 4.5, volume: 10 },
  }] }, "NVDA", "2026-09-18");

  assert.equal(chain.quoteAvailability, "unavailable");
  assert.match(chain.quoteNote, /NO OPTION QUOTES AVAILABLE/);
  assert.equal(chain.contracts[0].bidPrice, null);
  assert.equal(chain.contracts[0].askPrice, null);
  assert.equal(chain.contracts[0].sharesPerContract, 100);
  assert.equal(chain.contracts[0].sharesPerContractReported, false);
});

test("option-chain normalization preserves provider pagination truncation", () => {
  const chain = adapters.adaptOptionChain({
    next_url: "https://api.massive.test/options?page=5",
    results: [],
  }, "NVDA", "2026-09-18");
  assert.equal(chain.contractsComplete, false);
});

test("empty option chains are reported as no listed contracts, not an entitlement failure", () => {
  const chain = adapters.adaptOptionChain({ results: [] }, "KOSS");
  assert.equal(chain.contracts.length, 0);
  assert.equal(chain.quoteAvailability, "unavailable");
  assert.match(chain.quoteNote, /NO LISTED OPTION CONTRACTS/);
  assert.doesNotMatch(chain.quoteNote, /entitlement/i);
});

test("option-chain header timestamp uses the latest returned contract timestamp", () => {
  const contract = (ticker, lastUpdated) => ({
    details: {
      ticker,
      contract_type: "call",
      expiration_date: "2026-09-18",
      strike_price: 150,
    },
    last_quote: { bid: 1, ask: 2, last_updated: lastUpdated, timeframe: "delayed" },
  });
  const latestSeconds = 1_723_741_200;
  const chain = adapters.adaptOptionChain({ results: [
    contract("O:NVDA260918C00150000", 1_723_737_600),
    contract("O:NVDA260918C00155000", latestSeconds),
  ] }, "NVDA", "2026-09-18");

  assert.equal(chain.asOf, new Date(latestSeconds * 1_000).toISOString());
});

test("snapshot timestamp normalization accepts Unix seconds", () => {
  const rows = adapters.adaptSnapshotList({
    tickers: [{ ticker: "NVDA", updated: 1_723_737_600 }],
  });
  assert.equal(rows[0].asOf, "2024-08-15T16:00:00.000Z");
});

test("snapshot adapters treat premarket zero day fields as unavailable", () => {
  const [row] = adapters.adaptSnapshotList({
    tickers: [{
      ticker: "NVDA",
      lastTrade: { p: 221 },
      day: { o: 0, h: 0, l: 0, c: 0, v: 0, vw: 0 },
      prevDay: { c: 219.74 },
      todaysChange: 0,
      todaysChangePerc: 0,
    }],
  });
  assert.equal(row.lastPrice, 221);
  assert.equal(row.previousClose, 219.74);
  assert.equal(row.open, null);
  assert.equal(row.high, null);
  assert.equal(row.low, null);
  assert.equal(row.volume, null);
  assert.equal(row.vwap, null);
  assert.equal(row.change, null);
  assert.equal(row.changePercent, null);
});

test("snapshot adapters preserve a real reported zero change once a current-day bar exists", () => {
  const [row] = adapters.adaptSnapshotList({
    tickers: [{
      ticker: "AAPL",
      lastTrade: { p: 310 },
      day: { o: 310, h: 311, l: 309, c: 310, v: 1_000, vw: 310 },
      prevDay: { c: 310 },
      todaysChange: 0,
      todaysChangePerc: 0,
    }],
  });
  assert.equal(row.change, 0);
  assert.equal(row.changePercent, 0);
});

test("financial adapters preserve missing values as missing instead of zero", () => {
  const periods = adapters.adaptFinancialPeriods({ results: [{
    tickers: ["NVDA"],
    period_end: "2026-07-31",
    fiscal_year: 2026,
    fiscal_quarter: 2,
    timeframe: "quarterly",
    revenue: 10_000,
    optional_metric: null,
  }] }, "NVDA", "income");
  assert.equal(periods.length, 1);
  assert.deepEqual(periods[0].metrics.map((metric) => metric.key), ["revenue"]);
  assert.equal(periods[0].timeframe, "quarterly");
});
