import type { OptionContract } from "@/types";

export type OptionRankingMetric = "volume" | "open-interest" | "implied-volatility";

export interface PutCallRatios {
  readonly volumeRatio: number | null;
  readonly openInterestRatio: number | null;
  readonly putVolume: number;
  readonly callVolume: number;
  readonly putOpenInterest: number;
  readonly callOpenInterest: number;
}

export interface OptionActivityObservation {
  readonly contract: OptionContract;
  readonly volumeToOpenInterest: number | null;
  readonly score: number;
  readonly observation: string;
  readonly disclaimer: string;
}

function sumPresent(
  contracts: readonly OptionContract[],
  type: "call" | "put",
  field: "volume" | "openInterest",
): number {
  return contracts.reduce((total, contract) => {
    if (contract.type !== type) return total;
    return total + Math.max(contract[field] ?? 0, 0);
  }, 0);
}

export function calculatePutCallRatios(contracts: readonly OptionContract[]): PutCallRatios {
  const putVolume = sumPresent(contracts, "put", "volume");
  const callVolume = sumPresent(contracts, "call", "volume");
  const putOpenInterest = sumPresent(contracts, "put", "openInterest");
  const callOpenInterest = sumPresent(contracts, "call", "openInterest");
  return {
    volumeRatio: callVolume === 0 ? null : putVolume / callVolume,
    openInterestRatio: callOpenInterest === 0 ? null : putOpenInterest / callOpenInterest,
    putVolume,
    callVolume,
    putOpenInterest,
    callOpenInterest,
  };
}

function metricValue(contract: OptionContract, metric: OptionRankingMetric): number | null {
  if (metric === "volume") return contract.volume;
  if (metric === "open-interest") return contract.openInterest;
  return contract.impliedVolatility;
}

export function rankOptionContracts(
  contracts: readonly OptionContract[],
  metric: OptionRankingMetric,
  limit = 10,
): readonly OptionContract[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("limit must be a non-negative integer");
  }
  return [...contracts]
    .filter((contract) => {
      const value = metricValue(contract, metric);
      return value !== null && Number.isFinite(value);
    })
    .sort((left, right) => {
      const difference = (metricValue(right, metric) as number) - (metricValue(left, metric) as number);
      return difference === 0 ? left.symbol.localeCompare(right.symbol) : difference;
    })
    .slice(0, limit);
}

export function findUnusualOptionActivity(
  contracts: readonly OptionContract[],
  thresholds: {
    readonly minimumVolume?: number;
    readonly minimumVolumeToOpenInterest?: number;
  } = {},
): readonly OptionActivityObservation[] {
  const minimumVolume = thresholds.minimumVolume ?? 100;
  const minimumRatio = thresholds.minimumVolumeToOpenInterest ?? 2;
  if (!Number.isFinite(minimumVolume) || minimumVolume < 0) {
    throw new RangeError("minimumVolume cannot be negative");
  }
  if (!Number.isFinite(minimumRatio) || minimumRatio < 0) {
    throw new RangeError("minimumVolumeToOpenInterest cannot be negative");
  }

  return contracts.flatMap((contract) => {
    const volume = contract.volume;
    if (volume === null || volume < minimumVolume) return [];
    const openInterest = contract.openInterest;
    const ratio = openInterest === null || openInterest <= 0 ? null : volume / openInterest;
    const elevated = ratio === null ? openInterest === 0 : ratio >= minimumRatio;
    if (!elevated) return [];
    const score = Math.log10(volume + 1) * (ratio ?? 1);
    return [{
      contract,
      volumeToOpenInterest: ratio,
      score,
      observation: "Detected: Elevated option volume relative to reported open interest",
      disclaimer: "Research observation only. Volume does not establish trader identity, intent, or direction.",
    }];
  }).sort((left, right) => right.score - left.score || left.contract.symbol.localeCompare(right.contract.symbol));
}
