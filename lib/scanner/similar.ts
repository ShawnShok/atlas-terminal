import {
  scannerFieldValue,
  scannerMarketCapBucket,
  validateScannerRule,
  type ScannerRule,
  type ScannerSecurity,
} from "./engine";

function roundedThreshold(value: number): number {
  return Math.floor(value * 10) / 10;
}

/** Builds a small research screen solely from metrics actually present on the ticker. */
export function createSimilarTickerRule(security: ScannerSecurity): ScannerRule | null {
  const rules: ScannerRule[] = [];
  if (typeof security.marketCap === "number" && Number.isFinite(security.marketCap) && security.marketCap >= 0) {
    rules.push({ kind: "market-cap", buckets: [scannerMarketCapBucket(security.marketCap)] });
  }

  const dailyMove = scannerFieldValue(security, "dailyChangePercent");
  if (dailyMove !== null && Math.abs(dailyMove) >= 2) {
    const magnitude = Math.max(2, roundedThreshold(Math.abs(dailyMove)));
    rules.push({
      kind: "numeric",
      field: "dailyChangePercent",
      operator: dailyMove >= 0 ? "gte" : "lte",
      value: dailyMove >= 0 ? magnitude : -magnitude,
    });
  }

  const intradayRvol = scannerFieldValue(security, "intradayRelativeVolume");
  const dailyRvol = scannerFieldValue(security, "dailyRelativeVolume");
  const observedRvol = intradayRvol !== null
    ? { field: "intradayRelativeVolume" as const, value: intradayRvol }
    : dailyRvol !== null ? { field: "dailyRelativeVolume" as const, value: dailyRvol } : null;
  if (observedRvol && observedRvol.value >= 1.5) {
    rules.push({
      kind: "numeric",
      field: observedRvol.field,
      operator: "gte",
      value: Math.max(1.5, roundedThreshold(observedRvol.value)),
    });
  }

  const vwapDistance = scannerFieldValue(security, "distanceFromVwapPercent");
  if (vwapDistance !== null && security.vwap !== null && security.vwap !== undefined) {
    rules.push({
      kind: "price-relation",
      reference: "vwap",
      relation: vwapDistance >= 0 ? "at-or-above" : "at-or-below",
    });
  }

  if (rules.length === 0) return null;
  return validateScannerRule(rules.length === 1 ? rules[0] : { kind: "all", rules });
}
