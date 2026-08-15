import type { OptionType } from "@/types";

export type GreekName = "delta" | "gamma" | "theta" | "vega" | "rho";

export interface StrategyGreeks {
  readonly delta: number | null;
  readonly gamma: number | null;
  readonly theta: number | null;
  readonly vega: number | null;
  readonly rho: number | null;
}

export interface StrategyOptionLeg {
  readonly kind: "option";
  readonly id: string;
  readonly type: OptionType;
  readonly side: "long" | "short";
  readonly strikePrice: number;
  readonly premiumPerShare: number;
  readonly quantity: number;
  readonly sharesPerContract?: number;
  /** Greeks are expected per underlying share and are scaled to the full position. */
  readonly greeks?: Partial<Record<GreekName, number | null>>;
}

export interface StrategyStockLeg {
  readonly kind: "stock";
  readonly id: string;
  /** Positive shares are long and negative shares are short. */
  readonly quantityShares: number;
  readonly entryPrice: number;
}

export type StrategyLeg = StrategyOptionLeg | StrategyStockLeg;

export interface PayoffPoint {
  readonly underlyingPrice: number;
  readonly profitLoss: number;
}

export interface CombinedGreeksResult {
  readonly values: StrategyGreeks;
  readonly complete: boolean;
  readonly missing: readonly { readonly legId: string; readonly greek: GreekName }[];
}

export interface StrategyPayoffAnalysis {
  readonly netOptionPremium: number;
  readonly maxGain: number | null;
  readonly maxGainUnlimited: boolean;
  readonly maxLoss: number | null;
  readonly maxLossUnlimited: boolean;
  readonly breakEvenPrices: readonly number[];
}

const GREEK_NAMES: readonly GreekName[] = ["delta", "gamma", "theta", "vega", "rho"];
const EPSILON = 1e-9;

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(label + " must be a non-negative finite number");
  }
}

function assertLegs(legs: readonly StrategyLeg[]): void {
  if (legs.length === 0) throw new RangeError("strategy requires at least one leg");
  const ids = new Set<string>();
  legs.forEach((leg) => {
    if (!leg.id.trim()) throw new RangeError("leg id cannot be empty");
    if (ids.has(leg.id)) throw new RangeError("leg ids must be unique");
    ids.add(leg.id);
    if (leg.kind === "stock") {
      if (!Number.isFinite(leg.quantityShares) || leg.quantityShares === 0) {
        throw new RangeError("stock quantityShares must be a non-zero finite number");
      }
      assertNonNegativeFinite(leg.entryPrice, "stock entryPrice");
      return;
    }
    assertNonNegativeFinite(leg.strikePrice, "option strikePrice");
    assertNonNegativeFinite(leg.premiumPerShare, "option premiumPerShare");
    if (!Number.isInteger(leg.quantity) || leg.quantity <= 0) {
      throw new RangeError("option quantity must be a positive integer");
    }
    const multiplier = leg.sharesPerContract ?? 100;
    if (!Number.isInteger(multiplier) || multiplier <= 0) {
      throw new RangeError("sharesPerContract must be a positive integer");
    }
  });
}

function optionDirection(leg: StrategyOptionLeg): number {
  return leg.side === "long" ? 1 : -1;
}

function optionMultiplier(leg: StrategyOptionLeg): number {
  return leg.sharesPerContract ?? 100;
}

export function strategyPayoffAtExpiration(
  legs: readonly StrategyLeg[],
  underlyingPrice: number,
): number {
  assertLegs(legs);
  assertNonNegativeFinite(underlyingPrice, "underlyingPrice");

  return legs.reduce((total, leg) => {
    if (leg.kind === "stock") {
      return total + (underlyingPrice - leg.entryPrice) * leg.quantityShares;
    }
    const intrinsic = leg.type === "call"
      ? Math.max(underlyingPrice - leg.strikePrice, 0)
      : Math.max(leg.strikePrice - underlyingPrice, 0);
    return total + optionDirection(leg) * leg.quantity * optionMultiplier(leg)
      * (intrinsic - leg.premiumPerShare);
  }, 0);
}

/** Positive means a debit paid; negative means a credit received. */
export function netOptionPremium(legs: readonly StrategyLeg[]): number {
  assertLegs(legs);
  return legs.reduce((total, leg) => {
    if (leg.kind === "stock") return total;
    return total + optionDirection(leg) * leg.quantity * optionMultiplier(leg)
      * leg.premiumPerShare;
  }, 0);
}

export function combineStrategyGreeks(legs: readonly StrategyLeg[]): CombinedGreeksResult {
  assertLegs(legs);
  const totals: Record<GreekName, number> = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  const missing: { legId: string; greek: GreekName }[] = [];

  for (const leg of legs) {
    if (leg.kind === "stock") {
      totals.delta += leg.quantityShares;
      continue;
    }
    for (const greek of GREEK_NAMES) {
      const value = leg.greeks?.[greek];
      if (value === undefined || value === null || !Number.isFinite(value)) {
        missing.push({ legId: leg.id, greek });
        continue;
      }
      totals[greek] += optionDirection(leg) * leg.quantity * optionMultiplier(leg) * value;
    }
  }

  const valueFor = (greek: GreekName): number | null =>
    missing.some((item) => item.greek === greek) ? null : totals[greek];

  return {
    values: {
      delta: valueFor("delta"),
      gamma: valueFor("gamma"),
      theta: valueFor("theta"),
      vega: valueFor("vega"),
      rho: valueFor("rho"),
    },
    complete: missing.length === 0,
    missing,
  };
}

function highTailSlope(legs: readonly StrategyLeg[]): number {
  return legs.reduce((slope, leg) => {
    if (leg.kind === "stock") return slope + leg.quantityShares;
    if (leg.type === "put") return slope;
    return slope + optionDirection(leg) * leg.quantity * optionMultiplier(leg);
  }, 0);
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function deduplicateRoots(values: readonly number[]): number[] {
  const sorted = [...values].filter((value) => value >= -EPSILON).sort((a, b) => a - b);
  return sorted.reduce<number[]>((result, value) => {
    const normalized = Math.max(0, value);
    if (result.length === 0 || Math.abs(result[result.length - 1] - normalized) > 1e-6) {
      result.push(normalized);
    }
    return result;
  }, []);
}

export function analyzeStrategyPayoff(legs: readonly StrategyLeg[]): StrategyPayoffAnalysis {
  assertLegs(legs);
  const breakpoints = uniqueSorted([
    0,
    ...legs.flatMap((leg) => leg.kind === "option" ? [leg.strikePrice] : []),
  ]);
  const payoffs = breakpoints.map((price) => strategyPayoffAtExpiration(legs, price));
  const roots: number[] = [];

  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const leftPrice = breakpoints[index];
    const rightPrice = breakpoints[index + 1];
    const leftPayoff = payoffs[index];
    const rightPayoff = payoffs[index + 1];
    if (Math.abs(leftPayoff) <= EPSILON) roots.push(leftPrice);
    if (leftPayoff * rightPayoff < 0) {
      roots.push(leftPrice + (rightPrice - leftPrice) * (-leftPayoff) / (rightPayoff - leftPayoff));
    }
  }

  const lastPrice = breakpoints[breakpoints.length - 1];
  const lastPayoff = payoffs[payoffs.length - 1];
  if (Math.abs(lastPayoff) <= EPSILON) roots.push(lastPrice);

  const tailSlope = highTailSlope(legs);
  if (Math.abs(tailSlope) > EPSILON) {
    const tailRoot = lastPrice - lastPayoff / tailSlope;
    if (tailRoot > lastPrice + EPSILON) roots.push(tailRoot);
  }

  const maxGainUnlimited = tailSlope > EPSILON;
  const maxLossUnlimited = tailSlope < -EPSILON;
  const finiteMaximum = Math.max(...payoffs);
  const finiteMinimum = Math.min(...payoffs);

  return {
    netOptionPremium: netOptionPremium(legs),
    maxGain: maxGainUnlimited ? null : Math.max(finiteMaximum, 0),
    maxGainUnlimited,
    maxLoss: maxLossUnlimited ? null : Math.max(-finiteMinimum, 0),
    maxLossUnlimited,
    breakEvenPrices: deduplicateRoots(roots),
  };
}

export function createPayoffCurve(
  legs: readonly StrategyLeg[],
  range: { readonly minimum: number; readonly maximum: number; readonly steps: number },
): readonly PayoffPoint[] {
  assertLegs(legs);
  assertNonNegativeFinite(range.minimum, "range.minimum");
  assertNonNegativeFinite(range.maximum, "range.maximum");
  if (range.maximum <= range.minimum) throw new RangeError("range.maximum must exceed range.minimum");
  if (!Number.isInteger(range.steps) || range.steps < 2) {
    throw new RangeError("range.steps must be an integer of at least 2");
  }

  const increment = (range.maximum - range.minimum) / (range.steps - 1);
  return Array.from({ length: range.steps }, (_, index) => {
    const underlyingPrice = index === range.steps - 1
      ? range.maximum
      : range.minimum + increment * index;
    return {
      underlyingPrice,
      profitLoss: strategyPayoffAtExpiration(legs, underlyingPrice),
    };
  });
}
