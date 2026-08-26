import type {
  DataQuality,
  OptionChainBundle,
  OptionIvSurfaceBundle,
  OptionIvSurfacePoint,
  OptionIvSurfaceSide,
} from "@/types";

const DAY_MS = 86_400_000;
const SURFACE_DTE_TARGETS = [7, 14, 30, 45, 60, 90, 180, 365, 540, 730, 1_095, 1_460] as const;

function validExpirationDate(value: string): number | null {
  const timestamp = Date.parse(`${value}T20:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Selects representative maturities so the surface spans near- and longer-dated tenor. */
export function selectIvSurfaceExpirations(
  expirations: readonly string[],
  nowIso: string,
  limit = 8,
): readonly string[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > SURFACE_DTE_TARGETS.length) {
    throw new RangeError(`limit must be an integer from 1 to ${SURFACE_DTE_TARGETS.length}`);
  }
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new RangeError("nowIso must be a valid timestamp");
  const dated = [...new Set(expirations)].flatMap((expiration) => {
    const timestamp = validExpirationDate(expiration);
    return timestamp === null || timestamp < now
      ? []
      : [{ expiration, timestamp, dte: Math.max(0, (timestamp - now) / DAY_MS) }];
  }).sort((left, right) => left.timestamp - right.timestamp);
  if (dated.length <= limit) return dated.map(({ expiration }) => expiration);

  const selected = new Set<string>();
  for (const target of SURFACE_DTE_TARGETS.slice(0, limit)) {
    const candidate = dated
      .filter(({ expiration }) => !selected.has(expiration))
      .sort((left, right) => Math.abs(left.dte - target) - Math.abs(right.dte - target)
        || left.timestamp - right.timestamp)[0];
    if (candidate) selected.add(candidate.expiration);
  }
  return dated.filter(({ expiration }) => selected.has(expiration)).map(({ expiration }) => expiration);
}

function latestTimestamp(chains: readonly OptionChainBundle[]): string {
  const values = chains.map(({ asOf }) => Date.parse(asOf)).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : new Date().toISOString();
}

function surfaceQuality(chains: readonly OptionChainBundle[]): DataQuality {
  const qualities = chains.map(({ quality }) => quality);
  if (qualities.length === 0 || qualities.includes("unknown")) return "unknown";
  if (qualities.includes("delayed")) return "delayed";
  if (qualities.includes("indicative")) return "indicative";
  if (qualities.includes("historical")) return "historical";
  if (qualities.includes("end-of-day")) return "end-of-day";
  return qualities.every((quality) => quality === "live") ? "live" : "unknown";
}

/** Aggregates reported call/put IV at each listed strike without interpolation. */
export function buildOptionIvSurface(
  symbol: string,
  requestedExpirations: readonly string[],
  chains: readonly OptionChainBundle[],
): OptionIvSurfaceBundle {
  const underlyingSymbol = symbol.trim().toUpperCase();
  const underlyingPrice = chains
    .map(({ underlyingPrice: value }) => value)
    .find((value): value is number => value !== null && Number.isFinite(value) && value > 0) ?? null;
  const loadedExpirations = [...new Set(chains.flatMap(({ selectedExpiration }) =>
    selectedExpiration ? [selectedExpiration] : []))].sort();
  const grouped = new Map<string, {
    expirationDate: string;
    strikePrice: number;
    callImpliedVolatility: number | null;
    putImpliedVolatility: number | null;
    callContractSymbol: string | null;
    putContractSymbol: string | null;
  }>();

  for (const contract of chains.flatMap(({ contracts }) => contracts)) {
    if (
      contract.impliedVolatility === null
      || !Number.isFinite(contract.impliedVolatility)
      || contract.impliedVolatility < 0
    ) continue;
    const key = `${contract.expirationDate}:${contract.strikePrice}`;
    const current = grouped.get(key) ?? {
      expirationDate: contract.expirationDate,
      strikePrice: contract.strikePrice,
      callImpliedVolatility: null,
      putImpliedVolatility: null,
      callContractSymbol: null,
      putContractSymbol: null,
    };
    if (contract.type === "call") {
      current.callImpliedVolatility = contract.impliedVolatility;
      current.callContractSymbol = contract.symbol;
    } else {
      current.putImpliedVolatility = contract.impliedVolatility;
      current.putContractSymbol = contract.symbol;
    }
    grouped.set(key, current);
  }

  const points: OptionIvSurfacePoint[] = [...grouped.values()]
    .sort((left, right) => left.expirationDate.localeCompare(right.expirationDate)
      || left.strikePrice - right.strikePrice)
    .map((point) => {
      const reported = [point.callImpliedVolatility, point.putImpliedVolatility]
        .filter((value): value is number => value !== null);
      return {
        ...point,
        moneyness: underlyingPrice === null ? null : point.strikePrice / underlyingPrice - 1,
        blendedImpliedVolatility: reported.length
          ? reported.reduce((total, value) => total + value, 0) / reported.length
          : null,
        reportedSideCount: reported.length,
      };
    });
  const loadedAllRequested = requestedExpirations.every((expiration) => loadedExpirations.includes(expiration));
  const contractsComplete = loadedAllRequested && chains.every((chain) => chain.contractsComplete);
  const quality = surfaceQuality(chains);
  const note = points.length === 0
    ? "No provider-reported implied-volatility observations were returned for the selected maturities."
    : contractsComplete
      ? "Provider-reported IV at listed strikes; no interpolation or smoothing is applied."
      : "Partial provider coverage; missing expirations or paginated contracts remain unavailable.";
  return {
    underlyingSymbol,
    underlyingPrice,
    requestedExpirations: [...requestedExpirations],
    loadedExpirations,
    points,
    contractsComplete,
    asOf: latestTimestamp(chains),
    quality,
    note,
  };
}

export function optionIvSurfaceValue(
  point: OptionIvSurfacePoint,
  side: OptionIvSurfaceSide,
): number | null {
  if (side === "call") return point.callImpliedVolatility;
  if (side === "put") return point.putImpliedVolatility;
  return point.blendedImpliedVolatility;
}

/** Returns a contract whose reported IV actually contributes to the selected surface cell. */
export function optionIvSurfaceContractSymbol(
  point: OptionIvSurfacePoint,
  side: OptionIvSurfaceSide,
): string | null {
  if (side === "call") return point.callImpliedVolatility === null ? null : point.callContractSymbol;
  if (side === "put") return point.putImpliedVolatility === null ? null : point.putContractSymbol;
  if (point.callImpliedVolatility !== null && point.callContractSymbol) return point.callContractSymbol;
  if (point.putImpliedVolatility !== null && point.putContractSymbol) return point.putContractSymbol;
  return null;
}
