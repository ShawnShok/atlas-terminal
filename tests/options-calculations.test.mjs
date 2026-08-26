import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const calculations = await loadTypeScriptModule(
  new URL("../lib/options/calculations.ts", import.meta.url),
);
const strategy = await loadTypeScriptModule(
  new URL("../lib/options/strategy.ts", import.meta.url),
);
const chain = await loadTypeScriptModule(
  new URL("../lib/options/chain-analytics.ts", import.meta.url),
);

test("option values and break-even levels respect call and put mechanics", () => {
  assert.equal(calculations.optionIntrinsicValue("call", 100, 112), 12);
  assert.equal(calculations.optionIntrinsicValue("put", 100, 88), 12);
  assert.equal(calculations.optionExtrinsicValue(15, 12), 3);
  assert.equal(calculations.optionExtrinsicValue(10, 12), 0);
  assert.equal(calculations.optionBreakEven("call", 100, 5), 105);
  assert.equal(calculations.optionBreakEven("put", 100, 5), 95);
});

test("long-call payoff analysis reports finite loss, break-even, and unlimited gain", () => {
  const legs = [{
    kind: "option",
    id: "call",
    type: "call",
    side: "long",
    strikePrice: 100,
    premiumPerShare: 5,
    quantity: 1,
  }];
  assert.equal(strategy.strategyPayoffAtExpiration(legs, 90), -500);
  assert.equal(strategy.strategyPayoffAtExpiration(legs, 120), 1_500);
  const result = strategy.analyzeStrategyPayoff(legs);
  assert.equal(result.maxGainUnlimited, true);
  assert.equal(result.maxGain, null);
  assert.equal(result.maxLoss, 500);
  assert.deepEqual(result.breakEvenPrices, [105]);
});

test("covered-call payoff identifies capped gain and downside break-even", () => {
  const legs = [
    { kind: "stock", id: "shares", quantityShares: 100, entryPrice: 100 },
    {
      kind: "option",
      id: "short-call",
      type: "call",
      side: "short",
      strikePrice: 110,
      premiumPerShare: 3,
      quantity: 1,
    },
  ];
  const result = strategy.analyzeStrategyPayoff(legs);
  assert.equal(result.netOptionPremium, -300);
  assert.equal(result.maxGain, 1_300);
  assert.equal(result.maxLoss, 9_700);
  assert.equal(result.maxGainUnlimited, false);
  assert.deepEqual(result.breakEvenPrices, [97]);
});

test("combined Greeks scale by direction, contracts, and shares per contract", () => {
  const result = strategy.combineStrategyGreeks([
    { kind: "stock", id: "shares", quantityShares: 100, entryPrice: 90 },
    {
      kind: "option",
      id: "calls",
      type: "call",
      side: "long",
      strikePrice: 100,
      premiumPerShare: 4,
      quantity: 2,
      greeks: { delta: 0.5, gamma: 0.02, theta: -0.03, vega: 0.1, rho: 0.04 },
    },
  ]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.values, { delta: 200, gamma: 4, theta: -6, vega: 20, rho: 8 });
});

function contract(symbol, type, volume, openInterest, impliedVolatility) {
  return {
    symbol,
    underlyingSymbol: "XYZ",
    type,
    expirationDate: "2026-09-18",
    strikePrice: 100,
    exerciseStyle: "american",
    sharesPerContract: 100,
    lastPrice: 1,
    lastPriceSource: "last-trade",
    bidPrice: 0.9,
    askPrice: 1.1,
    quoteAvailability: "available",
    volume,
    openInterest,
    impliedVolatility,
    intrinsicValue: 0,
    extrinsicValue: 1,
    greeks: { delta: null, gamma: null, theta: null, vega: null, rho: null },
    asOf: "2026-08-15T16:00:00Z",
    quality: "delayed",
    source: "massive",
  };
}

test("option chain analytics calculate ratios and rank deterministically", () => {
  const contracts = [
    contract("XYZ-C1", "call", 100, 200, 0.3),
    contract("XYZ-P1", "put", 250, 100, 0.5),
    contract("XYZ-C2", "call", 50, 50, 0.4),
  ];
  const ratios = chain.calculatePutCallRatios(contracts);
  assert.equal(ratios.volumeRatio, 250 / 150);
  assert.equal(ratios.openInterestRatio, 100 / 250);
  assert.deepEqual(chain.rankOptionContracts(contracts, "implied-volatility", 2).map(({ symbol }) => symbol), ["XYZ-P1", "XYZ-C2"]);
  assert.deepEqual(chain.rankOptionContracts(contracts, "volume-open-interest-ratio", 2).map(({ symbol }) => symbol), ["XYZ-P1", "XYZ-C2"]);
  const unusual = chain.findUnusualOptionActivity(contracts);
  assert.deepEqual(unusual.map(({ contract: item }) => item.symbol), ["XYZ-P1"]);
  assert.match(unusual[0].observation, /volume 250.*open interest 100.*2\.50×/i);
  assert.match(unusual[0].disclaimer, /does not establish/i);
});

test("option distributions and ratios preserve unavailable reported fields", () => {
  const missing = {
    ...contract("XYZ-P-MISSING", "put", null, null, null),
    strikePrice: 105,
    expirationDate: "2026-10-16",
  };
  const reported = {
    ...contract("XYZ-C-REPORTED", "call", 40, 80, 0.25),
    strikePrice: 100,
  };
  const ratios = chain.calculatePutCallRatios([missing, reported]);
  assert.equal(ratios.putVolume, null);
  assert.equal(ratios.volumeRatio, null);

  const strikes = chain.summarizeOptionDistribution([missing, reported], "strike");
  assert.deepEqual(strikes.map(({ label, volume, openInterest }) => ({ label, volume, openInterest })), [
    { label: "$100.00", volume: 40, openInterest: 80 },
    { label: "$105.00", volume: null, openInterest: null },
  ]);
  const expirations = chain.summarizeOptionDistribution([missing, reported], "expiration");
  assert.deepEqual(expirations.map(({ key }) => key), ["2026-09-18", "2026-10-16"]);
});
