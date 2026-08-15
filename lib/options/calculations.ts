import type { OptionType } from "@/types";

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new TypeError(label + " must be finite");
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) throw new RangeError(label + " cannot be negative");
}

export function optionIntrinsicValue(
  type: OptionType,
  strikePrice: number,
  underlyingPrice: number,
): number {
  assertNonNegative(strikePrice, "strikePrice");
  assertNonNegative(underlyingPrice, "underlyingPrice");
  return type === "call"
    ? Math.max(underlyingPrice - strikePrice, 0)
    : Math.max(strikePrice - underlyingPrice, 0);
}

export function optionExtrinsicValue(premium: number, intrinsicValue: number): number {
  assertNonNegative(premium, "premium");
  assertNonNegative(intrinsicValue, "intrinsicValue");
  // Stale or crossed quotes can imply a negative value; zero is the defensible floor.
  return Math.max(premium - intrinsicValue, 0);
}

export function optionBreakEven(
  type: OptionType,
  strikePrice: number,
  premium: number,
): number {
  assertNonNegative(strikePrice, "strikePrice");
  assertNonNegative(premium, "premium");
  return type === "call" ? strikePrice + premium : Math.max(strikePrice - premium, 0);
}

export function optionMidpoint(
  bidPrice: number | null,
  askPrice: number | null,
): number | null {
  if (bidPrice === null || askPrice === null) return null;
  assertNonNegative(bidPrice, "bidPrice");
  assertNonNegative(askPrice, "askPrice");
  if (askPrice < bidPrice) return null;
  return (bidPrice + askPrice) / 2;
}

export function classifyMoneyness(
  type: OptionType,
  strikePrice: number,
  underlyingPrice: number,
  atTheMoneyTolerancePercent = 0.5,
): "in-the-money" | "at-the-money" | "out-of-the-money" {
  assertNonNegative(strikePrice, "strikePrice");
  assertNonNegative(underlyingPrice, "underlyingPrice");
  assertNonNegative(atTheMoneyTolerancePercent, "atTheMoneyTolerancePercent");

  if (underlyingPrice === 0) {
    return strikePrice === 0 ? "at-the-money" : type === "put" ? "in-the-money" : "out-of-the-money";
  }
  const distancePercent = Math.abs(strikePrice - underlyingPrice) / underlyingPrice * 100;
  if (distancePercent <= atTheMoneyTolerancePercent) return "at-the-money";
  const isInTheMoney = type === "call"
    ? underlyingPrice > strikePrice
    : underlyingPrice < strikePrice;
  return isInTheMoney ? "in-the-money" : "out-of-the-money";
}
