export type ScannerNumericField =
  | "price"
  | "marketCap"
  | "volume"
  | "averageVolume"
  | "relativeVolume"
  | "dailyChangePercent"
  | "weeklyChangePercent"
  | "monthlyChangePercent"
  | "rsi"
  | "gapPercent"
  | "percentBelow52WeekHigh"
  | "percentAbove52WeekLow"
  | "distanceFromVwapPercent"
  | "optionVolume"
  | "optionOpenInterest"
  | "optionVolumeToOpenInterest";

export type ScannerReferenceField =
  | "sma20"
  | "sma50"
  | "sma200"
  | "ema20"
  | "ema50"
  | "vwap"
  | "recentHigh20"
  | "recentLow20";

export type MarketCapBucket = "micro" | "small" | "mid" | "large" | "mega";

export interface ScannerCatalyst {
  readonly type: string;
  readonly occursAt: string;
}

export interface ScannerSecurity {
  readonly symbol: string;
  readonly price: number | null;
  readonly marketCap?: number | null;
  readonly volume?: number | null;
  readonly averageVolume?: number | null;
  readonly relativeVolume?: number | null;
  readonly dailyChangePercent?: number | null;
  readonly weeklyChangePercent?: number | null;
  readonly monthlyChangePercent?: number | null;
  readonly rsi?: number | null;
  readonly gapPercent?: number | null;
  readonly high52Week?: number | null;
  readonly low52Week?: number | null;
  readonly sma20?: number | null;
  readonly sma50?: number | null;
  readonly sma200?: number | null;
  readonly ema20?: number | null;
  readonly ema50?: number | null;
  readonly vwap?: number | null;
  readonly recentHigh20?: number | null;
  readonly recentLow20?: number | null;
  readonly optionVolume?: number | null;
  readonly optionOpenInterest?: number | null;
  readonly newsPublishedAt?: readonly string[];
  readonly catalysts?: readonly ScannerCatalyst[];
}

export interface NumericScannerRule {
  readonly kind: "numeric";
  readonly field: ScannerNumericField;
  readonly operator: "gt" | "gte" | "lt" | "lte" | "eq" | "between" | "absolute-gte";
  readonly value: number;
  readonly upperValue?: number;
}

export interface PriceRelationScannerRule {
  readonly kind: "price-relation";
  readonly reference: ScannerReferenceField;
  readonly relation: "above" | "at-or-above" | "below" | "at-or-below";
}

export interface MarketCapScannerRule {
  readonly kind: "market-cap";
  readonly buckets: readonly MarketCapBucket[];
}

export interface RecentNewsScannerRule {
  readonly kind: "recent-news";
  readonly withinMinutes: number;
}

export interface CatalystScannerRule {
  readonly kind: "catalyst-window";
  readonly withinDays: number;
  readonly catalystTypes?: readonly string[];
}

export interface CompositeScannerRule {
  readonly kind: "all" | "any";
  readonly rules: readonly ScannerRule[];
}

export interface NotScannerRule {
  readonly kind: "not";
  readonly rule: ScannerRule;
}

export type ScannerRule =
  | NumericScannerRule
  | PriceRelationScannerRule
  | MarketCapScannerRule
  | RecentNewsScannerRule
  | CatalystScannerRule
  | CompositeScannerRule
  | NotScannerRule;

export interface ScannerEvaluation {
  readonly passed: boolean;
  readonly observations: readonly string[];
  readonly missingFields: readonly string[];
}

export interface ScannerMatch {
  readonly security: ScannerSecurity;
  readonly evaluation: ScannerEvaluation;
}

export interface ScannerRunResult {
  readonly asOf: string;
  readonly evaluatedCount: number;
  readonly matches: readonly ScannerMatch[];
  readonly disclaimer: string;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(label + " must be a valid ISO timestamp");
  return timestamp;
}

function marketCapBucket(value: number): MarketCapBucket {
  if (value < 300_000_000) return "micro";
  if (value < 2_000_000_000) return "small";
  if (value < 10_000_000_000) return "mid";
  if (value < 200_000_000_000) return "large";
  return "mega";
}

function derivedPercent(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) {
    return null;
  }
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator * 100;
}

export function scannerFieldValue(
  security: ScannerSecurity,
  field: ScannerNumericField,
): number | null {
  if (field === "relativeVolume") {
    if (security.relativeVolume !== null && security.relativeVolume !== undefined) {
      return Number.isFinite(security.relativeVolume) && security.relativeVolume >= 0
        ? security.relativeVolume
        : null;
    }
    return derivedPercent(security.volume, security.averageVolume) === null
      ? null
      : (derivedPercent(security.volume, security.averageVolume) as number) / 100;
  }
  if (field === "percentBelow52WeekHigh") {
    const ratio = derivedPercent(security.price, security.high52Week);
    return ratio === null ? null : Math.max(0, 100 - ratio);
  }
  if (field === "percentAbove52WeekLow") {
    const ratio = derivedPercent(security.price, security.low52Week);
    return ratio === null ? null : ratio - 100;
  }
  if (field === "distanceFromVwapPercent") {
    if (
      security.price === null || !Number.isFinite(security.price)
      || security.vwap === null || security.vwap === undefined
      || !Number.isFinite(security.vwap) || security.vwap === 0
    ) {
      return null;
    }
    return (security.price - security.vwap) / Math.abs(security.vwap) * 100;
  }
  if (field === "optionVolumeToOpenInterest") {
    if (
      security.optionVolume === null || security.optionVolume === undefined
      || security.optionOpenInterest === null || security.optionOpenInterest === undefined
      || security.optionOpenInterest <= 0
    ) return null;
    return security.optionVolume / security.optionOpenInterest;
  }
  const value = security[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numericPasses(rule: NumericScannerRule, actual: number): boolean {
  if (!Number.isFinite(rule.value)) throw new TypeError("numeric rule value must be finite");
  if (rule.operator === "gt") return actual > rule.value;
  if (rule.operator === "gte") return actual >= rule.value;
  if (rule.operator === "lt") return actual < rule.value;
  if (rule.operator === "lte") return actual <= rule.value;
  if (rule.operator === "eq") return actual === rule.value;
  if (rule.operator === "absolute-gte") return Math.abs(actual) >= rule.value;
  if (rule.upperValue === undefined || !Number.isFinite(rule.upperValue)) {
    throw new TypeError("between rule requires a finite upperValue");
  }
  if (rule.upperValue < rule.value) throw new RangeError("upperValue cannot be below value");
  return actual >= rule.value && actual <= rule.upperValue;
}

function result(
  passed: boolean,
  observation: string,
  missingFields: readonly string[] = [],
): ScannerEvaluation {
  return { passed, observations: [observation], missingFields };
}

export function evaluateScannerRule(
  security: ScannerSecurity,
  rule: ScannerRule,
  now: string,
): ScannerEvaluation {
  const nowTimestamp = parseTimestamp(now, "now");

  if (rule.kind === "numeric") {
    const actual = scannerFieldValue(security, rule.field);
    if (actual === null) return result(false, "Unavailable: " + rule.field, [rule.field]);
    const passed = numericPasses(rule, actual);
    return result(passed, "Observed " + rule.field + " = " + actual);
  }

  if (rule.kind === "price-relation") {
    const reference = security[rule.reference];
    if (security.price === null || !Number.isFinite(security.price)
      || reference === null || reference === undefined || !Number.isFinite(reference)) {
      const missing = [
        security.price === null || !Number.isFinite(security.price) ? "price" : null,
        reference === null || reference === undefined || !Number.isFinite(reference) ? rule.reference : null,
      ]
        .filter((value): value is string => value !== null);
      return result(false, "Unavailable: price relation to " + rule.reference, missing);
    }
    const passed = rule.relation === "above"
      ? security.price > reference
      : rule.relation === "at-or-above"
        ? security.price >= reference
        : rule.relation === "below"
          ? security.price < reference
          : security.price <= reference;
    return result(passed, "Observed price " + rule.relation + " " + rule.reference);
  }

  if (rule.kind === "market-cap") {
    if (security.marketCap === null || security.marketCap === undefined
      || !Number.isFinite(security.marketCap) || security.marketCap < 0) {
      return result(false, "Unavailable: marketCap", ["marketCap"]);
    }
    const bucket = marketCapBucket(security.marketCap);
    return result(rule.buckets.includes(bucket), "Observed market-cap bucket: " + bucket);
  }

  if (rule.kind === "recent-news") {
    if (!Number.isFinite(rule.withinMinutes) || rule.withinMinutes < 0) {
      throw new RangeError("withinMinutes must be non-negative");
    }
    if (!security.newsPublishedAt) return result(false, "Unavailable: news timestamps", ["newsPublishedAt"]);
    const windowStart = nowTimestamp - rule.withinMinutes * 60_000;
    const count = security.newsPublishedAt.filter((timestamp, index) => {
      const parsed = parseTimestamp(timestamp, "newsPublishedAt[" + index + "]");
      return parsed >= windowStart && parsed <= nowTimestamp;
    }).length;
    return result(count > 0, "Observed recent news items: " + count);
  }

  if (rule.kind === "catalyst-window") {
    if (!Number.isFinite(rule.withinDays) || rule.withinDays < 0) {
      throw new RangeError("withinDays must be non-negative");
    }
    if (!security.catalysts) return result(false, "Unavailable: catalysts", ["catalysts"]);
    const windowEnd = nowTimestamp + rule.withinDays * 86_400_000;
    const count = security.catalysts.filter((catalyst, index) => {
      const timestamp = parseTimestamp(catalyst.occursAt, "catalysts[" + index + "].occursAt");
      const typeMatches = !rule.catalystTypes
        || rule.catalystTypes.some((type) => type.toLowerCase() === catalyst.type.toLowerCase());
      return typeMatches && timestamp >= nowTimestamp && timestamp <= windowEnd;
    }).length;
    return result(count > 0, "Observed upcoming matching catalysts: " + count);
  }

  if (rule.kind === "not") {
    const evaluation = evaluateScannerRule(security, rule.rule, now);
    return {
      passed: !evaluation.passed,
      observations: evaluation.observations.map((observation) => "Negated: " + observation),
      missingFields: evaluation.missingFields,
    };
  }

  if (rule.rules.length === 0) {
    return result(rule.kind === "all", "No scanner conditions configured");
  }
  const evaluations = rule.rules.map((child) => evaluateScannerRule(security, child, now));
  return {
    passed: rule.kind === "all"
      ? evaluations.every((evaluation) => evaluation.passed)
      : evaluations.some((evaluation) => evaluation.passed),
    observations: evaluations.flatMap((evaluation) => evaluation.observations),
    missingFields: [...new Set(evaluations.flatMap((evaluation) => evaluation.missingFields))],
  };
}

export function runScanner(
  securities: readonly ScannerSecurity[],
  rule: ScannerRule,
  now: string,
): ScannerRunResult {
  parseTimestamp(now, "now");
  const matches = securities.flatMap((security) => {
    const evaluation = evaluateScannerRule(security, rule, now);
    return evaluation.passed ? [{ security, evaluation }] : [];
  }).sort((left, right) => left.security.symbol.localeCompare(right.security.symbol));

  return {
    asOf: now,
    evaluatedCount: securities.length,
    matches,
    disclaimer: "Scanner matches are research observations, not investment recommendations.",
  };
}
