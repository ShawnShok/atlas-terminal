import type {
  DataFreshnessState,
  DataQuality,
  MarketSession,
} from "@/types";

const MINUTE_MS = 60_000;

export interface DescribeFreshnessInput {
  readonly quality: DataQuality;
  readonly asOf?: string | null;
  readonly source: string;
  readonly marketSession?: MarketSession | null;
  readonly delayMinutes?: number | null;
  readonly staleAfterMs?: number | null;
  readonly now?: string | number | Date;
}

function timestamp(value: string | number | Date): number {
  const parsed = value instanceof Date ? value.valueOf() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizedDelay(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("delayMinutes must be a non-negative finite number");
  }
  return Math.round(value);
}

/** Converts provider quality and age into one display-safe freshness contract. */
export function describeFreshness(input: DescribeFreshnessInput): DataFreshnessState {
  const asOf = input.asOf?.trim() || null;
  const asOfMs = asOf ? timestamp(asOf) : Number.NaN;
  const marketSession = input.marketSession ?? null;
  const explicitDelay = normalizedDelay(input.delayMinutes);

  if (!asOf || !Number.isFinite(asOfMs)) {
    return {
      status: "unavailable",
      delayMinutes: explicitDelay,
      lastUpdatedAt: null,
      source: input.source,
      marketSession,
    };
  }

  const nowMs = timestamp(input.now ?? Date.now());
  if (!Number.isFinite(nowMs)) throw new TypeError("now must be a valid timestamp");
  const observedAgeMinutes = Math.max(0, Math.floor((nowMs - asOfMs) / MINUTE_MS));
  const staleAfterMs = input.staleAfterMs ?? null;
  if (staleAfterMs !== null && (!Number.isFinite(staleAfterMs) || staleAfterMs < 0)) {
    throw new RangeError("staleAfterMs must be a non-negative finite number");
  }

  const stale = staleAfterMs !== null && nowMs - asOfMs > staleAfterMs;
  const status = stale
    ? "stale"
    : marketSession === "closed" && ["live", "delayed", "unknown"].includes(input.quality)
      ? "closed"
      : input.quality;

  return {
    status,
    delayMinutes: explicitDelay ?? (input.quality === "delayed" ? observedAgeMinutes : null),
    lastUpdatedAt: new Date(asOfMs).toISOString(),
    source: input.source,
    marketSession,
  };
}

export function freshnessLabel(freshness: DataFreshnessState): string {
  switch (freshness.status) {
    case "live":
      return "LIVE";
    case "delayed":
      return freshness.delayMinutes && freshness.delayMinutes > 0
        ? `${freshness.delayMinutes} MIN DELAYED`
        : "DELAYED";
    case "stale":
      return "STALE DATA";
    case "closed":
      return "MARKET CLOSED";
    case "historical":
      return "HISTORICAL";
    case "end-of-day":
      return "END OF DAY";
    case "indicative":
      return "INDICATIVE";
    case "unknown":
      return "TIMING UNVERIFIED";
    default:
      return "DATA UNAVAILABLE";
  }
}
