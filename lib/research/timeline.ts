import type { AggregateBar, CatalystTimelineEntry, OptionChainBundle } from "@/types";

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function volumeSpikeTimelineEntries(
  symbol: string,
  bars: readonly AggregateBar[],
  options: { readonly lookback?: number; readonly threshold?: number } = {},
): readonly CatalystTimelineEntry[] {
  const lookback = options.lookback ?? 20;
  const threshold = options.threshold ?? 2;
  if (!Number.isInteger(lookback) || lookback < 2) throw new RangeError("Volume-spike lookback must be at least two bars.");
  if (!Number.isFinite(threshold) || threshold <= 1) throw new RangeError("Volume-spike threshold must be greater than one.");

  return bars.flatMap((bar, index) => {
    if (index < lookback || !Number.isFinite(bar.volume) || bar.volume < 0) return [];
    const baseline = average(bars.slice(index - lookback, index).map((item) => item.volume).filter((value) => Number.isFinite(value) && value >= 0));
    if (baseline === null || baseline <= 0) return [];
    const ratio = bar.volume / baseline;
    if (ratio < threshold) return [];
    return [{
      id: `volume-${symbol}-${bar.timestamp}`,
      at: bar.timestamp,
      symbol,
      kind: "volume-spike" as const,
      title: `Volume reached ${ratio.toFixed(1)}x its ${lookback}-bar baseline`,
      detail: `Reported volume ${Math.round(bar.volume).toLocaleString("en-US")}; threshold observation only, not attributed causation.`,
      url: null,
    }];
  });
}

export function optionsActivityTimelineEntries(
  symbol: string,
  chain: OptionChainBundle | null,
): readonly CatalystTimelineEntry[] {
  if (!chain) return [];
  const observations = chain.contracts.flatMap((contract) => {
    if (contract.volume === null || contract.openInterest === null || contract.openInterest <= 0) return [];
    const ratio = contract.volume / contract.openInterest;
    return contract.volume >= 100 && ratio >= 2 ? [{ contract, ratio }] : [];
  }).sort((left, right) => right.ratio - left.ratio || (right.contract.volume ?? 0) - (left.contract.volume ?? 0));
  const leader = observations[0];
  if (!leader) return [];
  return [{
    id: `options-${symbol}-${chain.asOf}`,
    at: chain.asOf,
    symbol,
    kind: "options-activity",
    title: `${observations.length} option contract${observations.length === 1 ? "" : "s"} met the volume / OI screen`,
    detail: `${leader.contract.symbol} led at ${leader.ratio.toFixed(2)}x volume/open interest. ${chain.quality.toUpperCase()} research data; direction, intent, and executable price are unknown.`,
    url: null,
  }];
}
