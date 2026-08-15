export interface BreadthSecurityInput {
  readonly symbol: string;
  readonly currentClose: number;
  readonly previousClose: number;
  /** Chronological closes, normally including currentClose as the last value. */
  readonly closes: readonly number[];
  readonly high52Week?: number | null;
  readonly low52Week?: number | null;
}

export interface BreadthHorizonResult {
  readonly aboveCount: number;
  readonly eligibleCount: number;
  readonly percentAbove: number | null;
}

export interface MarketBreadthResult {
  readonly asOf: string;
  readonly universeSize: number;
  readonly advancing: number;
  readonly declining: number;
  readonly unchanged: number;
  readonly advanceDeclineDifference: number;
  readonly advanceDeclineRatio: number | null;
  readonly above20DaySma: BreadthHorizonResult;
  readonly above50DaySma: BreadthHorizonResult;
  readonly above200DaySma: BreadthHorizonResult;
  readonly newHighs: number;
  readonly newLows: number;
  readonly highLowEligibleCount: number;
}

function assertPrice(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(label + " must be a non-negative finite number");
  }
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aboveSma(
  securities: readonly BreadthSecurityInput[],
  period: number,
): BreadthHorizonResult {
  let aboveCount = 0;
  let eligibleCount = 0;
  for (const security of securities) {
    if (security.closes.length < period) continue;
    const movingAverage = average(security.closes.slice(-period));
    eligibleCount += 1;
    if (security.currentClose > movingAverage) aboveCount += 1;
  }
  return {
    aboveCount,
    eligibleCount,
    percentAbove: eligibleCount === 0 ? null : aboveCount / eligibleCount * 100,
  };
}

export function calculateMarketBreadth(
  securities: readonly BreadthSecurityInput[],
  asOf: string,
): MarketBreadthResult {
  if (!Number.isFinite(Date.parse(asOf))) throw new TypeError("asOf must be a valid ISO timestamp");

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let newHighs = 0;
  let newLows = 0;
  let highLowEligibleCount = 0;

  securities.forEach((security, securityIndex) => {
    assertPrice(security.currentClose, "securities[" + securityIndex + "].currentClose");
    assertPrice(security.previousClose, "securities[" + securityIndex + "].previousClose");
    security.closes.forEach((close, closeIndex) =>
      assertPrice(close, "securities[" + securityIndex + "].closes[" + closeIndex + "]"));

    if (security.currentClose > security.previousClose) advancing += 1;
    else if (security.currentClose < security.previousClose) declining += 1;
    else unchanged += 1;

    if (security.high52Week !== null && security.high52Week !== undefined
      && security.low52Week !== null && security.low52Week !== undefined) {
      assertPrice(security.high52Week, "high52Week");
      assertPrice(security.low52Week, "low52Week");
      highLowEligibleCount += 1;
      if (security.currentClose >= security.high52Week) newHighs += 1;
      if (security.currentClose <= security.low52Week) newLows += 1;
    }
  });

  return {
    asOf,
    universeSize: securities.length,
    advancing,
    declining,
    unchanged,
    advanceDeclineDifference: advancing - declining,
    advanceDeclineRatio: declining === 0 ? null : advancing / declining,
    above20DaySma: aboveSma(securities, 20),
    above50DaySma: aboveSma(securities, 50),
    above200DaySma: aboveSma(securities, 200),
    newHighs,
    newLows,
    highLowEligibleCount,
  };
}
