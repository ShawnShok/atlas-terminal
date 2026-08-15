export interface PriceBarInput {
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface VwapBarInput extends PriceBarInput {
  readonly volume: number;
}

export interface MacdPoint {
  readonly macd: number | null;
  readonly signal: number | null;
  readonly histogram: number | null;
}

export interface BollingerPoint {
  readonly middle: number | null;
  readonly upper: number | null;
  readonly lower: number | null;
  readonly standardDeviation: number | null;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(label + " must be a positive integer");
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(label + " must be finite");
  }
}

function assertSeries(values: readonly number[], label = "series"): void {
  values.forEach((value, index) => assertFinite(value, label + "[" + index + "]"));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Returns null when the comparison base is zero and a percentage is undefined. */
export function percentChange(current: number, previous: number): number | null {
  assertFinite(current, "current");
  assertFinite(previous, "previous");
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

/** Produces an input-aligned series. Values before the first complete window are null. */
export function simpleMovingAverage(
  values: readonly number[],
  period: number,
): readonly (number | null)[] {
  assertPositiveInteger(period, "period");
  assertSeries(values);

  const output: (number | null)[] = Array.from({ length: values.length }, () => null);
  let windowSum = 0;

  for (let index = 0; index < values.length; index += 1) {
    windowSum += values[index];
    if (index >= period) windowSum -= values[index - period];
    if (index >= period - 1) output[index] = windowSum / period;
  }

  return output;
}

/** Seeds the EMA with the first period's SMA, then uses the standard smoothing factor. */
export function exponentialMovingAverage(
  values: readonly number[],
  period: number,
): readonly (number | null)[] {
  assertPositiveInteger(period, "period");
  assertSeries(values);

  const output: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (values.length < period) return output;

  const multiplier = 2 / (period + 1);
  let previous = mean(values.slice(0, period));
  output[period - 1] = previous;

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

/** Cumulative session VWAP using typical price (high + low + close) / 3. */
export function cumulativeVwap(bars: readonly VwapBarInput[]): readonly (number | null)[] {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return bars.map((bar, index) => {
    assertFinite(bar.high, "bars[" + index + "].high");
    assertFinite(bar.low, "bars[" + index + "].low");
    assertFinite(bar.close, "bars[" + index + "].close");
    assertFinite(bar.volume, "bars[" + index + "].volume");
    if (bar.high < bar.low) throw new RangeError("bar high cannot be below bar low");
    if (bar.volume < 0) throw new RangeError("bar volume cannot be negative");

    cumulativePriceVolume += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    cumulativeVolume += bar.volume;
    return cumulativeVolume === 0 ? null : cumulativePriceVolume / cumulativeVolume;
  });
}

export function volumeWeightedAveragePrice(bars: readonly VwapBarInput[]): number | null {
  const series = cumulativeVwap(bars);
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== null) return series[index];
  }
  return null;
}

/** Wilder RSI with a neutral value of 50 for a completely flat initial window. */
export function relativeStrengthIndex(
  values: readonly number[],
  period = 14,
): readonly (number | null)[] {
  assertPositiveInteger(period, "period");
  assertSeries(values);

  const output: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (values.length <= period) return output;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  const toRsi = (): number => {
    if (averageGain === 0 && averageLoss === 0) return 50;
    if (averageLoss === 0) return 100;
    if (averageGain === 0) return 0;
    return 100 - 100 / (1 + averageGain / averageLoss);
  };

  output[period] = toRsi();
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] = toRsi();
  }

  return output;
}

export function movingAverageConvergenceDivergence(
  values: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): readonly MacdPoint[] {
  assertPositiveInteger(fastPeriod, "fastPeriod");
  assertPositiveInteger(slowPeriod, "slowPeriod");
  assertPositiveInteger(signalPeriod, "signalPeriod");
  if (fastPeriod >= slowPeriod) {
    throw new RangeError("fastPeriod must be smaller than slowPeriod");
  }
  assertSeries(values);

  const fast = exponentialMovingAverage(values, fastPeriod);
  const slow = exponentialMovingAverage(values, slowPeriod);
  const macdValues: (number | null)[] = values.map((_, index) => {
    const fastValue = fast[index];
    const slowValue = slow[index];
    return fastValue === null || slowValue === null ? null : fastValue - slowValue;
  });

  const firstMacdIndex = macdValues.findIndex((value) => value !== null);
  const signals: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (firstMacdIndex >= 0) {
    const compactMacd = macdValues.slice(firstMacdIndex) as number[];
    const compactSignal = exponentialMovingAverage(compactMacd, signalPeriod);
    compactSignal.forEach((value, index) => {
      signals[firstMacdIndex + index] = value;
    });
  }

  return macdValues.map((macd, index) => {
    const signal = signals[index];
    return {
      macd,
      signal,
      histogram: macd === null || signal === null ? null : macd - signal,
    };
  });
}

export function bollingerBands(
  values: readonly number[],
  period = 20,
  standardDeviationMultiplier = 2,
): readonly BollingerPoint[] {
  assertPositiveInteger(period, "period");
  assertFinite(standardDeviationMultiplier, "standardDeviationMultiplier");
  if (standardDeviationMultiplier < 0) {
    throw new RangeError("standardDeviationMultiplier cannot be negative");
  }
  assertSeries(values);

  return values.map((_, index) => {
    if (index < period - 1) {
      return { middle: null, upper: null, lower: null, standardDeviation: null };
    }
    const window = values.slice(index - period + 1, index + 1);
    const middle = mean(window);
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const standardDeviation = Math.sqrt(variance);
    return {
      middle,
      upper: middle + standardDeviationMultiplier * standardDeviation,
      lower: middle - standardDeviationMultiplier * standardDeviation,
      standardDeviation,
    };
  });
}

/** Wilder ATR. The first true range is high-low because no prior close exists. */
export function averageTrueRange(
  bars: readonly PriceBarInput[],
  period = 14,
): readonly (number | null)[] {
  assertPositiveInteger(period, "period");

  const trueRanges = bars.map((bar, index) => {
    assertFinite(bar.high, "bars[" + index + "].high");
    assertFinite(bar.low, "bars[" + index + "].low");
    assertFinite(bar.close, "bars[" + index + "].close");
    if (bar.high < bar.low) throw new RangeError("bar high cannot be below bar low");

    if (index === 0) return bar.high - bar.low;
    const previousClose = bars[index - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });

  const output: (number | null)[] = Array.from({ length: bars.length }, () => null);
  if (trueRanges.length < period) return output;

  let previousAtr = mean(trueRanges.slice(0, period));
  output[period - 1] = previousAtr;
  for (let index = period; index < trueRanges.length; index += 1) {
    previousAtr = (previousAtr * (period - 1) + trueRanges[index]) / period;
    output[index] = previousAtr;
  }
  return output;
}
