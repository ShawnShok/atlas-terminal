import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const surface = await loadTypeScriptModule(
  new URL("../lib/options/iv-surface.ts", import.meta.url),
);

function contract(symbol, type, expirationDate, strikePrice, impliedVolatility) {
  return {
    symbol,
    underlyingSymbol: "XYZ",
    type,
    expirationDate,
    strikePrice,
    impliedVolatility,
  };
}

function chain(expirationDate, contracts, overrides = {}) {
  return {
    underlyingSymbol: "XYZ",
    underlyingPrice: 100,
    expirations: [expirationDate],
    selectedExpiration: expirationDate,
    contracts,
    contractsComplete: true,
    asOf: `${expirationDate}T16:00:00.000Z`,
    quality: "delayed",
    quoteAvailability: "unavailable",
    quoteNote: "Quotes unavailable",
    ...overrides,
  };
}

test("IV surface maturity selection spans representative tenors", () => {
  const expirations = [
    "2026-08-21", "2026-08-28", "2026-09-04", "2026-09-18",
    "2026-10-16", "2026-11-20", "2027-02-19", "2027-08-20", "2028-08-18",
  ];
  const selected = surface.selectIvSurfaceExpirations(expirations, "2026-08-15T12:00:00.000Z", 8);
  assert.equal(selected.length, 8);
  assert.deepEqual([...selected].sort(), [...selected]);
  assert.ok(selected.includes("2026-08-21"));
  assert.ok(selected.some((expiration) => expiration >= "2027-02-19"));
});

test("IV surface aggregates calls and puts without inventing missing sides", () => {
  const front = chain("2026-09-18", [
    contract("XYZ-C95", "call", "2026-09-18", 95, 0.31),
    contract("XYZ-P95", "put", "2026-09-18", 95, 0.37),
    contract("XYZ-C100", "call", "2026-09-18", 100, 0.29),
  ]);
  const back = chain("2026-12-18", [
    contract("XYZ-C100-B", "call", "2026-12-18", 100, 0.34),
    contract("XYZ-P100-B", "put", "2026-12-18", 100, null),
  ]);
  const result = surface.buildOptionIvSurface("xyz", ["2026-09-18", "2026-12-18"], [front, back]);
  assert.equal(result.underlyingSymbol, "XYZ");
  assert.equal(result.contractsComplete, true);
  assert.deepEqual(result.loadedExpirations, ["2026-09-18", "2026-12-18"]);
  const paired = result.points.find((point) => point.expirationDate === "2026-09-18" && point.strikePrice === 95);
  assert.equal(paired.callImpliedVolatility, 0.31);
  assert.equal(paired.putImpliedVolatility, 0.37);
  assert.equal(paired.blendedImpliedVolatility, 0.33999999999999997);
  assert.equal(paired.reportedSideCount, 2);
  assert.equal(paired.moneyness, -0.050000000000000044);
  const callOnly = result.points.find((point) => point.expirationDate === "2026-12-18");
  assert.equal(callOnly.putImpliedVolatility, null);
  assert.equal(callOnly.blendedImpliedVolatility, 0.34);
  assert.equal(surface.optionIvSurfaceValue(callOnly, "put"), null);
  assert.equal(surface.optionIvSurfaceValue(callOnly, "call"), 0.34);
});

test("IV surface discloses partial expiration coverage", () => {
  const result = surface.buildOptionIvSurface(
    "XYZ",
    ["2026-09-18", "2026-12-18"],
    [chain("2026-09-18", [contract("XYZ-C100", "call", "2026-09-18", 100, 0.3)])],
  );
  assert.equal(result.contractsComplete, false);
  assert.match(result.note, /Partial provider coverage/);
});

test("options terminal exposes the interactive IV surface and API source", async () => {
  const [terminal, component, livePanel, route, service] = await Promise.all([
    readFile(new URL("../components/research/OptionsTerminal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/research/ImpliedVolatilitySurface.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/terminal/LiveOptionsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/research/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/massive/research-service.ts", import.meta.url), "utf8"),
  ]);
  assert.match(terminal, /IV SURFACE/);
  assert.match(terminal, /role="tablist"/);
  assert.match(component, /BLENDED/);
  assert.match(component, /FRONT ATM IV/);
  assert.match(component, /TERM SLOPE/);
  assert.match(component, /NO INTERPOLATION/);
  assert.match(livePanel, /useResearchData<OptionIvSurfaceBundle>\("options-surface"/);
  assert.match(route, /case "options-surface"/);
  assert.match(service, /getOptionIvSurface/);
  assert.match(service, /mapWithProviderConcurrency\(requestedExpirations, 3/);
});
