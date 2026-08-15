import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const { marketCapBand, researchSectorFromSic } = await loadTypeScriptModule(
  new URL("../lib/research/classification.ts", import.meta.url),
);

test("derives broad research sectors from SIC metadata", () => {
  assert.equal(researchSectorFromSic("3674", "Semiconductors and related devices"), "Information Technology");
  assert.equal(researchSectorFromSic("2834", "Pharmaceutical preparations"), "Health Care");
  assert.equal(researchSectorFromSic("6022", "State commercial banks"), "Financials");
  assert.equal(researchSectorFromSic(null, null), null);
});

test("classifies market capitalization bands at explicit boundaries", () => {
  assert.equal(marketCapBand(299_999_999), "micro");
  assert.equal(marketCapBand(300_000_000), "small");
  assert.equal(marketCapBand(2_000_000_000), "mid");
  assert.equal(marketCapBand(10_000_000_000), "large");
  assert.equal(marketCapBand(200_000_000_000), "mega");
  assert.equal(marketCapBand(null), null);
});
