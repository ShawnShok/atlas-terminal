import type { OptionContract } from "@/types";

export type OptionRankingMetric =
  | "volume"
  | "open-interest"
  | "volume-open-interest-ratio"
  | "implied-volatility";

export interface PutCallRatios {
  readonly volumeRatio: number | null;
  readonly openInterestRatio: number | null;
  readonly putVolume: number | null;
  readonly callVolume: number | null;
  readonly putOpenInterest: number | null;
  readonly callOpenInterest: number | null;
}

export interface OptionDistributionBucket {
  readonly key: string;
  readonly label: string;
  readonly contractCount: number;
  readonly volume: number | null;
  readonly openInterest: number | null;
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
): number | null {
  const values = contracts.flatMap((contract) =>
    contract.type === type && contract[field] !== null
      ? [Math.max(contract[field] as number, 0)]
      : [],
  );
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

export function calculatePutCallRatios(contracts: readonly OptionContract[]): PutCallRatios {
  const putVolume = sumPresent(contracts, "put", "volume");
  const callVolume = sumPresent(contracts, "call", "volume");
  const putOpenInterest = sumPresent(contracts, "put", "openInterest");
  const callOpenInterest = sumPresent(contracts, "call", "openInterest");
  return {
    volumeRatio: putVolume === null || callVolume === null || callVolume === 0 ? null : putVolume / callVolume,
    openInterestRatio: putOpenInterest === null || callOpenInterest === null || callOpenInterest === 0 ? null : putOpenInterest / callOpenInterest,
    putVolume,
    callVolume,
    putOpenInterest,
    callOpenInterest,
  };
}

export function optionVolumeToOpenInterest(contract: OptionContract): number | null {
  if (
    contract.volume === null
    || contract.openInterest === null
    || contract.openInterest <= 0
  ) return null;
  return contract.volume / contract.openInterest;
}

function metricValue(contract: OptionContract, metric: OptionRankingMetric): number | null {
  if (metric === "volume") return contract.volume;
  if (metric === "open-interest") return contract.openInterest;
  if (metric === "volume-open-interest-ratio") return optionVolumeToOpenInterest(contract);
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

function sumReported(
  contracts: readonly OptionContract[],
  field: "volume" | "openInterest",
): number | null {
  const values = contracts.flatMap((contract) => contract[field] === null ? [] : [contract[field] as number]);
  return values.length ? values.reduce((total, value) => total + Math.max(value, 0), 0) : null;
}

/** Descriptive aggregation of reported fields; unavailable totals stay null. */
export function summarizeOptionDistribution(
  contracts: readonly OptionContract[],
  groupBy: "strike" | "expiration",
): readonly OptionDistributionBucket[] {
  const groups = new Map<string, OptionContract[]>();
  for (const contract of contracts) {
    const key = groupBy === "strike"
      ? String(contract.strikePrice)
      : contract.expirationDate;
    groups.set(key, [...(groups.get(key) ?? []), contract]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => groupBy === "strike"
      ? Number(left) - Number(right)
      : left.localeCompare(right))
    .map(([key, grouped]) => ({
      key,
      label: groupBy === "strike" ? `$${Number(key).toFixed(2)}` : key,
      contractCount: grouped.length,
      volume: sumReported(grouped, "volume"),
      openInterest: sumReported(grouped, "openInterest"),
    }));
}

export function findUnusualOptionActivity(
  contracts: readonly OptionContract[],
  thresholds: {
    readonly minimumVolume?: number;
    readonly minimumOpenInterest?: number;
    readonly minimumVolumeToOpenInterest?: number;
  } = {},
): readonly OptionActivityObservation[] {
  const minimumVolume = thresholds.minimumVolume ?? 100;
  const minimumOpenInterest = thresholds.minimumOpenInterest ?? 100;
  const minimumRatio = thresholds.minimumVolumeToOpenInterest ?? 2;
  if (!Number.isFinite(minimumVolume) || minimumVolume < 0) {
    throw new RangeError("minimumVolume cannot be negative");
  }
  if (!Number.isFinite(minimumRatio) || minimumRatio < 0) {
    throw new RangeError("minimumVolumeToOpenInterest cannot be negative");
  }
  if (!Number.isFinite(minimumOpenInterest) || minimumOpenInterest < 0) {
    throw new RangeError("minimumOpenInterest cannot be negative");
  }

  return contracts.flatMap((contract) => {
    const volume = contract.volume;
    if (volume === null || volume < minimumVolume) return [];
    const openInterest = contract.openInterest;
    if (openInterest === null || openInterest < minimumOpenInterest) return [];
    const ratio = optionVolumeToOpenInterest(contract);
    if (ratio === null || ratio < minimumRatio) return [];
    const score = Math.log10(volume + 1) * ratio;
    return [{
      contract,
      volumeToOpenInterest: ratio,
      score,
      observation: `Detected: volume ${volume.toLocaleString()}, open interest ${openInterest.toLocaleString()}, volume/open interest ${ratio.toFixed(2)}×`,
      disclaimer: "Research observation only. Volume does not establish trader identity, intent, or direction.",
    }];
  }).sort((left, right) => right.score - left.score || left.contract.symbol.localeCompare(right.contract.symbol));
}
