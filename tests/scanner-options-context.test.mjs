import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const optionsContext = await loadTypeScriptModule(
  new URL("../lib/scanner/options-context.ts", import.meta.url),
);

function contract(symbol, type, expirationDate, volume, openInterest, impliedVolatility, multiplierReported = true) {
  return {
    symbol, type, expirationDate, volume, openInterest, impliedVolatility,
    sharesPerContract: 100,
    sharesPerContractReported: multiplierReported,
  };
}

test("scanner options context derives reported metrics from the selected expiration only", () => {
  const result = optionsContext.summarizeScannerOptions({
    selectedExpiration: "2026-08-22",
    contractsComplete: true,
    expirations: ["2026-08-22", "2026-09-19"],
    contracts: [
      contract("O:NVDA260822C00100000", "call", "2026-08-22", 200, 100, 0.5),
      contract("O:NVDA260919P00100000", "put", "2026-09-19", 100, 50, 0.7),
    ],
    asOf: "2026-08-19T16:00:00Z",
    quality: "delayed",
    quoteAvailability: "unavailable",
  }, "2026-08-19T17:00:00Z");

  assert.equal(result.available, true);
  assert.equal(result.selectedExpiration, "2026-08-22");
  assert.deepEqual(result.availableExpirations, ["2026-08-22", "2026-09-19"]);
  assert.equal(result.totalVolume, 200);
  assert.equal(result.contractCount, 1);
  assert.equal(result.volumeReportedContractCount, 1);
  assert.equal(result.volumeComplete, true);
  assert.equal(result.callVolumeReportedContractCount, 1);
  assert.equal(result.putVolumeReportedContractCount, 0);
  assert.equal(result.volumeToOpenInterest, 2);
  assert.equal(result.callToPutVolumeRatio, null);
  assert.equal(result.callToPutOpenInterestRatio, null);
  assert.equal(result.averageImpliedVolatility, 0.5);
  assert.equal(result.reportedIvContractCount, 1);
  assert.equal(result.dteContractCount, 1);
  assert.equal(result.minimumDte, 3);
  assert.equal(result.maximumDte, 3);
  assert.equal(result.highestVolumeContract, "O:NVDA260822C00100000");
  assert.equal(result.highestContractVolume, 200);
  assert.equal(result.highestOpenInterestContract, "O:NVDA260822C00100000");
  assert.equal(result.highestContractOpenInterest, 100);
  assert.equal(result.contractEquivalentShareVolume, 20_000);
  assert.equal(result.equivalentShareVolumeReportedContractCount, 1);
  assert.equal(result.equivalentShareVolumeComplete, true);
  assert.equal(result.quality, "delayed");
  assert.equal(result.quoteAvailability, "unavailable");
});

test("partial option fields aggregate reported values with explicit coverage and paired ratios", () => {
  const result = optionsContext.summarizeScannerOptions({
    selectedExpiration: "2026-08-22",
    contractsComplete: true,
    expirations: ["2026-08-22"],
    contracts: [
      contract("CALL", "call", "2026-08-22", 200, 100, 0.5),
      contract("PUT", "put", "2026-08-22", null, 50, null),
    ],
    asOf: "2026-08-19T16:00:00Z",
    quality: "delayed",
    quoteAvailability: "unavailable",
  }, "2026-08-19T17:00:00Z");
  assert.equal(result.totalVolume, 200);
  assert.equal(result.volumeReportedContractCount, 1);
  assert.equal(result.volumeComplete, false);
  assert.equal(result.openInterestReportedContractCount, 2);
  assert.equal(result.openInterestComplete, true);
  assert.equal(result.volumeOpenInterestPairedContractCount, 1);
  assert.equal(result.volumeToOpenInterest, 2);
  assert.equal(result.putVolume, null);
  assert.equal(result.callToPutVolumeRatio, null);
  assert.equal(result.callVolume, 200);
  assert.equal(result.averageImpliedVolatility, 0.5);
  assert.equal(result.reportedIvContractCount, 1);
});

test("call-to-put ratios use reported subtotals while disclosing partial side coverage", () => {
  const result = optionsContext.summarizeScannerOptions({
    selectedExpiration: "2026-08-22",
    contractsComplete: true,
    expirations: ["2026-08-22"],
    contracts: [
      contract("CALL-REPORTED", "call", "2026-08-22", 200, 100, 0.5),
      contract("CALL-MISSING", "call", "2026-08-22", null, null, null),
      contract("PUT-REPORTED", "put", "2026-08-22", 50, 25, 0.7),
      contract("PUT-MISSING", "put", "2026-08-22", null, null, null),
    ],
    asOf: "2026-08-19T16:00:00Z",
    quality: "delayed",
    quoteAvailability: "unavailable",
  }, "2026-08-19T17:00:00Z");
  assert.equal(result.callToPutVolumeRatio, 4);
  assert.equal(result.callToPutOpenInterestRatio, 4);
  assert.equal(result.callVolumeReportedContractCount, 1);
  assert.equal(result.callContractCount, 2);
  assert.equal(result.putVolumeReportedContractCount, 1);
  assert.equal(result.putContractCount, 2);
  assert.equal(result.callVolumeComplete, false);
  assert.equal(result.putVolumeComplete, false);
});

test("failed option-chain context is explicitly unavailable with no timestamp or quality claim", () => {
  const result = optionsContext.summarizeScannerOptions(null, "2026-08-19T17:00:00Z");
  assert.equal(result.available, false);
  assert.equal(result.selectedExpiration, null);
  assert.deepEqual(result.availableExpirations, []);
  assert.equal(result.asOf, null);
  assert.equal(result.quality, null);
  assert.equal(result.totalVolume, null);
});

test("option DTE follows the New York market calendar near the UTC date boundary", () => {
  const result = optionsContext.summarizeScannerOptions({
    selectedExpiration: "2026-08-20",
    contractsComplete: true,
    expirations: ["2026-08-20"],
    contracts: [contract("CALL", "call", "2026-08-20", 1, 1, null)],
    asOf: "2026-08-20T02:00:00Z",
    quality: "delayed",
    quoteAvailability: "unavailable",
  }, "2026-08-20T02:00:00Z");
  assert.equal(result.minimumDte, 1);
});

test("truncated selected-expiration pages never claim complete totals or a global highest contract", () => {
  const result = optionsContext.summarizeScannerOptions({
    selectedExpiration: "2026-08-22",
    contractsComplete: false,
    expirations: ["2026-08-22"],
    contracts: [contract("FETCHED-CALL", "call", "2026-08-22", 200, 100, 0.5)],
    asOf: "2026-08-19T16:00:00Z",
    quality: "delayed",
    quoteAvailability: "unavailable",
  }, "2026-08-19T17:00:00Z");

  assert.equal(result.contractsComplete, false);
  assert.equal(result.totalVolume, 200, "fetched subtotal remains observable");
  assert.equal(result.volumeComplete, false);
  assert.equal(result.openInterestComplete, false);
  assert.equal(result.highestVolumeContract, null);
  assert.equal(result.highestContractVolume, null);
  assert.equal(result.highestOpenInterestContract, null);
  assert.equal(result.highestContractOpenInterest, null);
  assert.equal(result.equivalentShareVolumeComplete, false);
});

test("equivalent-share coverage requires a provider-reported contract multiplier", () => {
  const result = optionsContext.summarizeScannerOptions({
    selectedExpiration: "2026-08-22",
    contractsComplete: true,
    expirations: ["2026-08-22"],
    contracts: [
      contract("REPORTED", "call", "2026-08-22", 10, 10, 0.5, true),
      contract("DEFAULTED", "put", "2026-08-22", 20, 20, 0.5, false),
    ],
    asOf: "2026-08-19T16:00:00Z",
    quality: "delayed",
    quoteAvailability: "unavailable",
  }, "2026-08-19T17:00:00Z");

  assert.equal(result.contractEquivalentShareVolume, 1_000);
  assert.equal(result.equivalentShareVolumeReportedContractCount, 1);
  assert.equal(result.equivalentShareVolumeComplete, false);
});
