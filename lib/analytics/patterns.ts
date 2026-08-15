export type ResearchPattern =
  | "double-bottom"
  | "double-top"
  | "ascending-triangle"
  | "descending-triangle"
  | "symmetrical-triangle"
  | "bullish-pennant"
  | "bearish-pennant"
  | "consolidation-breakout"
  | "support-resistance-test";

export interface PatternBar {
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface PatternDetection {
  readonly pattern: ResearchPattern;
  readonly confidence: number;
  readonly relevantPriceLevels: Readonly<Record<string, number>>;
  readonly volumeConfirmation: boolean;
  readonly reasoning: string;
  readonly detectedAt: string;
  readonly disclaimer: string;
}

export interface PatternDetectionOptions {
  readonly window?: number;
  readonly priceTolerancePercent?: number;
  readonly volumeConfirmationMultiple?: number;
}

interface IndexedPrice {
  readonly index: number;
  readonly value: number;
}

const DISCLAIMER = "Experimental research observation only; the pattern is uncertain and is not an investment recommendation.";

function clamp(value: number): number {
  return Math.max(0.05, Math.min(0.95, value));
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slope(values: readonly number[]): number {
  const xMean = (values.length - 1) / 2;
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator === 0 ? 0 : numerator / denominator;
}

function localExtrema(bars: readonly PatternBar[], field: "high" | "low"): IndexedPrice[] {
  const extrema: IndexedPrice[] = [];
  for (let index = 2; index < bars.length - 2; index += 1) {
    const value = bars[index][field];
    const neighbors = [bars[index - 2][field], bars[index - 1][field], bars[index + 1][field], bars[index + 2][field]];
    const qualifies = field === "high"
      ? neighbors.every((neighbor) => value >= neighbor)
      : neighbors.every((neighbor) => value <= neighbor);
    if (qualifies) extrema.push({ index, value });
  }
  return extrema;
}

function validateBars(bars: readonly PatternBar[]): void {
  bars.forEach((bar, index) => {
    if (!Number.isFinite(Date.parse(bar.timestamp))) throw new TypeError("bars[" + index + "].timestamp must be valid");
    for (const field of ["open", "high", "low", "close", "volume"] as const) {
      if (!Number.isFinite(bar[field]) || bar[field] < 0) {
        throw new RangeError("bars[" + index + "]." + field + " must be non-negative and finite");
      }
    }
    if (bar.high < bar.low) throw new RangeError("bar high cannot be below bar low");
  });
}

function hasVolumeConfirmation(
  bars: readonly PatternBar[],
  multiple: number,
): boolean {
  if (bars.length < 2) return false;
  const baseline = average(bars.slice(0, -1).map((bar) => bar.volume));
  return baseline > 0 && bars[bars.length - 1].volume >= baseline * multiple;
}

function doublePattern(
  bars: readonly PatternBar[],
  field: "high" | "low",
  tolerance: number,
  volumeConfirmation: boolean,
): PatternDetection | null {
  const extrema = localExtrema(bars, field);
  for (let rightIndex = extrema.length - 1; rightIndex >= 1; rightIndex -= 1) {
    const right = extrema[rightIndex];
    for (let leftIndex = rightIndex - 1; leftIndex >= 0; leftIndex -= 1) {
      const left = extrema[leftIndex];
      if (right.index - left.index < 4) continue;
      const midpoint = (left.value + right.value) / 2;
      if (midpoint <= 0) continue;
      const similarity = Math.abs(left.value - right.value) / midpoint;
      if (similarity > tolerance) continue;
      const between = bars.slice(left.index + 1, right.index);
      const pivot = field === "high"
        ? Math.min(...between.map((bar) => bar.low))
        : Math.max(...between.map((bar) => bar.high));
      const retracement = field === "high"
        ? (midpoint - pivot) / midpoint
        : (pivot - midpoint) / midpoint;
      if (retracement < tolerance) continue;
      const confidence = clamp(0.52 + (1 - similarity / tolerance) * 0.2
        + Math.min(retracement, 0.15) + (volumeConfirmation ? 0.05 : 0));
      const isTop = field === "high";
      return {
        pattern: isTop ? "double-top" : "double-bottom",
        confidence,
        relevantPriceLevels: isTop
          ? { resistance: midpoint, interveningSupport: pivot }
          : { support: midpoint, interveningResistance: pivot },
        volumeConfirmation,
        reasoning: "Two separated " + (isTop ? "highs" : "lows")
          + " were within " + (similarity * 100).toFixed(2)
          + "% with an intervening retracement of " + (retracement * 100).toFixed(2) + "%.",
        detectedAt: bars[bars.length - 1].timestamp,
        disclaimer: DISCLAIMER,
      };
    }
  }
  return null;
}

function trianglePattern(
  bars: readonly PatternBar[],
  volumeConfirmation: boolean,
): PatternDetection | null {
  if (bars.length < 8) return null;
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const priceScale = average(bars.map((bar) => bar.close));
  if (priceScale === 0) return null;
  const highSlope = slope(highs) / priceScale;
  const lowSlope = slope(lows) / priceScale;
  const flatThreshold = 0.0015;
  const trendThreshold = 0.0005;
  const initialRange = highs[0] - lows[0];
  const finalRange = highs[highs.length - 1] - lows[lows.length - 1];
  const converging = finalRange < initialRange;
  if (!converging) return null;

  let pattern: ResearchPattern | null = null;
  if (Math.abs(highSlope) <= flatThreshold && lowSlope > trendThreshold) pattern = "ascending-triangle";
  else if (highSlope < -trendThreshold && Math.abs(lowSlope) <= flatThreshold) pattern = "descending-triangle";
  else if (highSlope < -trendThreshold && lowSlope > trendThreshold) pattern = "symmetrical-triangle";
  if (!pattern) return null;

  const convergence = initialRange === 0 ? 0 : 1 - finalRange / initialRange;
  return {
    pattern,
    confidence: clamp(0.5 + Math.min(Math.max(convergence, 0), 0.3) + (volumeConfirmation ? 0.05 : 0)),
    relevantPriceLevels: {
      upperBoundary: highs[highs.length - 1],
      lowerBoundary: lows[lows.length - 1],
    },
    volumeConfirmation,
    reasoning: "Recent high and low regressions converged; normalized slopes were "
      + highSlope.toFixed(4) + " and " + lowSlope.toFixed(4) + " per bar.",
    detectedAt: bars[bars.length - 1].timestamp,
    disclaimer: DISCLAIMER,
  };
}

function breakoutPattern(
  bars: readonly PatternBar[],
  volumeConfirmation: boolean,
): PatternDetection | null {
  if (bars.length < 11) return null;
  const latest = bars[bars.length - 1];
  const base = bars.slice(-11, -1);
  const resistance = Math.max(...base.map((bar) => bar.high));
  const support = Math.min(...base.map((bar) => bar.low));
  const meanClose = average(base.map((bar) => bar.close));
  const rangePercent = meanClose === 0 ? Number.POSITIVE_INFINITY : (resistance - support) / meanClose;
  if (rangePercent > 0.08 || (latest.close <= resistance && latest.close >= support)) return null;
  const direction = latest.close > resistance ? "above resistance" : "below support";
  const distance = latest.close > resistance
    ? (latest.close - resistance) / resistance
    : (support - latest.close) / support;
  return {
    pattern: "consolidation-breakout",
    confidence: clamp(0.5 + Math.min(distance * 4, 0.25) + (volumeConfirmation ? 0.1 : 0)),
    relevantPriceLevels: { resistance, support, observedClose: latest.close },
    volumeConfirmation,
    reasoning: "The prior 10-bar range was " + (rangePercent * 100).toFixed(2)
      + "% wide and the latest close moved " + direction + ".",
    detectedAt: latest.timestamp,
    disclaimer: DISCLAIMER,
  };
}

function levelTestPattern(
  bars: readonly PatternBar[],
  tolerance: number,
  volumeConfirmation: boolean,
): PatternDetection | null {
  if (bars.length < 8) return null;
  const latest = bars[bars.length - 1];
  const history = bars.slice(0, -1);
  const support = Math.min(...history.map((bar) => bar.low));
  const resistance = Math.max(...history.map((bar) => bar.high));
  const supportDistance = support === 0 ? Number.POSITIVE_INFINITY : Math.abs(latest.close - support) / support;
  const resistanceDistance = resistance === 0 ? Number.POSITIVE_INFINITY : Math.abs(latest.close - resistance) / resistance;
  const nearest = Math.min(supportDistance, resistanceDistance);
  if (nearest > tolerance) return null;
  const tested = supportDistance <= resistanceDistance ? "support" : "resistance";
  return {
    pattern: "support-resistance-test",
    confidence: clamp(0.45 + (1 - nearest / tolerance) * 0.25 + (volumeConfirmation ? 0.05 : 0)),
    relevantPriceLevels: { support, resistance, observedClose: latest.close },
    volumeConfirmation,
    reasoning: "The latest close was within " + (nearest * 100).toFixed(2)
      + "% of the recent " + tested + " level.",
    detectedAt: latest.timestamp,
    disclaimer: DISCLAIMER,
  };
}

export function detectResearchPatterns(
  inputBars: readonly PatternBar[],
  options: PatternDetectionOptions = {},
): readonly PatternDetection[] {
  validateBars(inputBars);
  const window = options.window ?? 30;
  const tolerance = (options.priceTolerancePercent ?? 2.5) / 100;
  const volumeMultiple = options.volumeConfirmationMultiple ?? 1.2;
  if (!Number.isInteger(window) || window < 8) throw new RangeError("window must be an integer of at least 8");
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError("priceTolerancePercent must be positive");
  if (!Number.isFinite(volumeMultiple) || volumeMultiple < 0) {
    throw new RangeError("volumeConfirmationMultiple cannot be negative");
  }
  if (inputBars.length < 8) return [];

  const bars = inputBars.slice(-window);
  const volumeConfirmation = hasVolumeConfirmation(bars, volumeMultiple);
  const triangleWindow = bars.slice(-Math.min(20, bars.length));
  const triangle = trianglePattern(triangleWindow, volumeConfirmation);
  const detections = [
    doublePattern(bars, "low", tolerance, volumeConfirmation),
    doublePattern(bars, "high", tolerance, volumeConfirmation),
    triangle,
    breakoutPattern(bars, volumeConfirmation),
    levelTestPattern(bars, tolerance, volumeConfirmation),
  ].filter((detection): detection is PatternDetection => detection !== null);

  if (triangle?.pattern === "symmetrical-triangle" && bars.length >= triangleWindow.length + 4) {
    const leadIn = bars.slice(0, bars.length - triangleWindow.length);
    if (leadIn.length >= 2 && leadIn[0].close !== 0) {
      const move = (leadIn[leadIn.length - 1].close - leadIn[0].close) / leadIn[0].close;
      if (Math.abs(move) >= 0.08) {
        detections.push({
          ...triangle,
          pattern: move > 0 ? "bullish-pennant" : "bearish-pennant",
          confidence: clamp(triangle.confidence - 0.05 + Math.min(Math.abs(move), 0.2)),
          reasoning: triangle.reasoning + " It followed a " + (move * 100).toFixed(2)
            + "% lead-in move, which is consistent with a possible pennant structure.",
        });
      }
    }
  }

  return detections.sort((left, right) => right.confidence - left.confidence
    || left.pattern.localeCompare(right.pattern));
}
