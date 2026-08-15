import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const adapters = await loadTypeScriptModule(new URL("../lib/massive/research-adapters.ts", import.meta.url));

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

test("normalizes TMX date-only events without inventing a market-session time", () => {
  const events = adapters.adaptTmxEvents({
    results: [{
      tmx_record_id: "abc",
      ticker: "NVDA",
      company_name: "NVIDIA Corporation",
      name: "Quarterly results",
      date: "2026-08-27",
      type: "earnings_announcement_date",
      status: "pending_approval",
    }],
  });
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].startsAt, "2026-08-27T12:00:00.000Z");
  assert.equal(events[0].status, "pending");
  assert.equal(events[0].type, "earnings-release");
  assert.equal(events[0].quality, "delayed");
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

  const delayed = adapters.adaptOptionChain({ results: [
    contract("O:NVDA260918C00150000", "real-time"),
    contract("O:NVDA260918P00150000", "delayed"),
  ] }, "NVDA", "2026-09-18");
  assert.equal(delayed.quality, "delayed");
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
