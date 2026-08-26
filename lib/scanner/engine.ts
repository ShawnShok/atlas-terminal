export type ScannerNumericField =
  | "price"
  | "marketCap"
  | "volume"
  | "averageVolume"
  | "relativeVolume"
  | "dailyRelativeVolume"
  | "intradayRelativeVolume"
  | "dailyChangePercent"
  | "weeklyChangePercent"
  | "monthlyChangePercent"
  | "rsi"
  | "gapPercent"
  | "percentBelowDayHigh"
  | "percentAboveDayLow"
  | "percentBelow52WeekHigh"
  | "percentAbove52WeekLow"
  | "percentBelowRecentHigh20"
  | "distanceFromVwapPercent"
  | "volumeAccelerationRatio"
  | "newIntradayHigh"
  | "newIntradayLow"
  | "optionVolume"
  | "optionOpenInterest"
  | "optionVolumeToOpenInterest"
  | "optionCallVolume"
  | "optionPutVolume"
  | "optionCallOpenInterest"
  | "optionPutOpenInterest"
  | "optionCallToPutVolumeRatio"
  | "optionCallToPutOpenInterestRatio"
  | "optionAverageImpliedVolatility"
  | "optionMinimumDte"
  | "optionMaximumDte"
  | "optionHighestContractVolume"
  | "optionHighestContractOpenInterest"
  | "optionVolumeRelativeToUnderlying";

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
  readonly status?: string;
}

export interface ScannerNewsObservation {
  readonly publishedAt: string;
  readonly headline: string;
  readonly categories: readonly string[];
  readonly keywords: readonly string[];
}

export interface ScannerSecurity {
  readonly symbol: string;
  readonly price: number | null;
  readonly marketCap?: number | null;
  readonly volume?: number | null;
  readonly averageVolume?: number | null;
  readonly relativeVolume?: number | null;
  readonly dailyRelativeVolume?: number | null;
  readonly intradayRelativeVolume?: number | null;
  readonly dailyChangePercent?: number | null;
  readonly weeklyChangePercent?: number | null;
  readonly monthlyChangePercent?: number | null;
  readonly rsi?: number | null;
  readonly gapPercent?: number | null;
  readonly dayHigh?: number | null;
  readonly dayLow?: number | null;
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
  readonly volumeAccelerationRatio?: number | null;
  readonly newIntradayHigh?: number | null;
  readonly newIntradayLow?: number | null;
  readonly optionVolume?: number | null;
  readonly optionOpenInterest?: number | null;
  readonly optionVolumeToOpenInterest?: number | null;
  readonly optionCallVolume?: number | null;
  readonly optionPutVolume?: number | null;
  readonly optionCallOpenInterest?: number | null;
  readonly optionPutOpenInterest?: number | null;
  readonly optionCallToPutVolumeRatio?: number | null;
  readonly optionCallToPutOpenInterestRatio?: number | null;
  readonly optionAverageImpliedVolatility?: number | null;
  readonly optionMinimumDte?: number | null;
  readonly optionMaximumDte?: number | null;
  readonly optionHighestContractVolume?: number | null;
  readonly optionHighestContractOpenInterest?: number | null;
  readonly optionHighestVolumeContract?: string | null;
  readonly optionHighestOpenInterestContract?: string | null;
  readonly optionVolumeRelativeToUnderlying?: number | null;
  readonly optionContractCount?: number;
  readonly optionVolumeReportedContractCount?: number;
  readonly optionOpenInterestReportedContractCount?: number;
  readonly optionVolumeOpenInterestPairedContractCount?: number;
  readonly optionVolumeComplete?: boolean;
  readonly optionOpenInterestComplete?: boolean;
  readonly optionCallContractCount?: number;
  readonly optionPutContractCount?: number;
  readonly optionCallVolumeReportedContractCount?: number;
  readonly optionPutVolumeReportedContractCount?: number;
  readonly optionCallOpenInterestReportedContractCount?: number;
  readonly optionPutOpenInterestReportedContractCount?: number;
  readonly optionCallVolumeComplete?: boolean;
  readonly optionPutVolumeComplete?: boolean;
  readonly optionCallOpenInterestComplete?: boolean;
  readonly optionPutOpenInterestComplete?: boolean;
  readonly optionIvReportedContractCount?: number;
  readonly optionDteContractCount?: number;
  readonly optionSelectedExpiration?: string | null;
  readonly optionAvailableExpirationCount?: number;
  readonly optionContractsComplete?: boolean;
  readonly optionEquivalentShareVolumeReportedContractCount?: number;
  readonly optionEquivalentShareVolumeComplete?: boolean;
  readonly optionsAvailable?: boolean;
  readonly optionsQuality?: string | null;
  readonly optionsAsOf?: string | null;
  readonly newsAvailable?: boolean;
  readonly eventsAvailable?: boolean;
  readonly news?: readonly ScannerNewsObservation[];
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
  /** Uses the current America/New_York calendar day instead of a rolling window. */
  readonly calendarDay?: "today";
  readonly headlineIncludes?: string;
  readonly categories?: readonly string[];
  readonly keywords?: readonly string[];
}

export interface CatalystScannerRule {
  readonly kind: "catalyst-window";
  readonly withinDays: number;
  readonly catalystTypes?: readonly string[];
  readonly statuses?: readonly string[];
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
  /** Only conditions that actually contributed to a passing rule. */
  readonly reasons: readonly string[];
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

export const SCANNER_RULE_LIMITS = {
  maxDepth: 5,
  maxNodes: 48,
  maxChildrenPerGroup: 12,
  maxFilterValues: 20,
} as const;

const NUMERIC_FIELDS = new Set<string>([
  "price", "marketCap", "volume", "averageVolume", "relativeVolume",
  "dailyRelativeVolume", "intradayRelativeVolume", "dailyChangePercent",
  "weeklyChangePercent", "monthlyChangePercent", "rsi", "gapPercent",
  "percentBelowDayHigh", "percentAboveDayLow", "percentBelow52WeekHigh",
  "percentAbove52WeekLow", "percentBelowRecentHigh20", "distanceFromVwapPercent",
  "volumeAccelerationRatio", "newIntradayHigh", "newIntradayLow",
  "optionVolume", "optionOpenInterest",
  "optionVolumeToOpenInterest", "optionCallVolume", "optionPutVolume",
  "optionCallOpenInterest", "optionPutOpenInterest", "optionCallToPutVolumeRatio",
  "optionCallToPutOpenInterestRatio", "optionAverageImpliedVolatility",
  "optionMinimumDte", "optionMaximumDte", "optionHighestContractVolume",
  "optionHighestContractOpenInterest", "optionVolumeRelativeToUnderlying",
]);
const NUMERIC_OPERATORS = new Set<string>(["gt", "gte", "lt", "lte", "eq", "between", "absolute-gte"]);
const REFERENCE_FIELDS = new Set<string>(["sma20", "sma50", "sma200", "ema20", "ema50", "vwap", "recentHigh20", "recentLow20"]);
const RELATIONS = new Set<string>(["above", "at-or-above", "below", "at-or-below"]);
const MARKET_CAP_BUCKETS = new Set<string>(["micro", "small", "mid", "large", "mega"]);
const NEW_YORK_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function newYorkCalendarDate(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError("Timestamp must be valid");
  const parts = Object.fromEntries(NEW_YORK_DATE.formatToParts(timestamp)
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ruleRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be a scanner rule object.`);
  }
  return value as Record<string, unknown>;
}

function boundedStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length > SCANNER_RULE_LIMITS.maxFilterValues
    || value.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > 80)) {
    throw new TypeError(`${path} must be a bounded array of non-empty strings.`);
  }
}

function assertRuleKeys(rule: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(rule).filter((key) => !allowedKeys.has(key));
  if (unexpected.length) throw new TypeError(`${path} contains unexpected field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`);
}

/** Runtime boundary for saved or otherwise untrusted rule trees. */
export function validateScannerRule(value: unknown): ScannerRule {
  const state = { nodes: 0 };

  const visit = (candidate: unknown, depth: number, path: string): ScannerRule => {
    if (depth > SCANNER_RULE_LIMITS.maxDepth) {
      throw new RangeError(`Scanner rule nesting exceeds ${SCANNER_RULE_LIMITS.maxDepth} levels.`);
    }
    state.nodes += 1;
    if (state.nodes > SCANNER_RULE_LIMITS.maxNodes) {
      throw new RangeError(`Scanner rule complexity exceeds ${SCANNER_RULE_LIMITS.maxNodes} nodes.`);
    }
    const rule = ruleRecord(candidate, path);
    const kind = rule.kind;

    if (kind === "numeric") {
      assertRuleKeys(rule, ["kind", "field", "operator", "value", "upperValue"], path);
      if (typeof rule.field !== "string" || !NUMERIC_FIELDS.has(rule.field)
        || typeof rule.operator !== "string" || !NUMERIC_OPERATORS.has(rule.operator)
        || typeof rule.value !== "number" || !Number.isFinite(rule.value)) {
        throw new TypeError(`${path} contains an invalid numeric condition.`);
      }
      if (rule.operator === "absolute-gte" && rule.value < 0) {
        throw new RangeError(`${path}.value must be non-negative for absolute-gte.`);
      }
      if (rule.operator === "between"
        && (typeof rule.upperValue !== "number" || !Number.isFinite(rule.upperValue) || rule.upperValue < rule.value)) {
        throw new RangeError(`${path} requires an upperValue at or above value.`);
      }
      if (rule.operator !== "between" && rule.upperValue !== undefined) {
        throw new TypeError(`${path}.upperValue is only valid for a between condition.`);
      }
      return candidate as ScannerRule;
    }
    if (kind === "price-relation") {
      assertRuleKeys(rule, ["kind", "reference", "relation"], path);
      if (typeof rule.reference !== "string" || !REFERENCE_FIELDS.has(rule.reference)
        || typeof rule.relation !== "string" || !RELATIONS.has(rule.relation)) {
        throw new TypeError(`${path} contains an invalid price relation.`);
      }
      return candidate as ScannerRule;
    }
    if (kind === "market-cap") {
      assertRuleKeys(rule, ["kind", "buckets"], path);
      if (!Array.isArray(rule.buckets) || rule.buckets.length === 0 || rule.buckets.length > MARKET_CAP_BUCKETS.size
        || rule.buckets.some((bucket) => typeof bucket !== "string" || !MARKET_CAP_BUCKETS.has(bucket))) {
        throw new TypeError(`${path}.buckets contains an invalid market-cap selection.`);
      }
      return candidate as ScannerRule;
    }
    if (kind === "recent-news") {
      assertRuleKeys(rule, ["kind", "withinMinutes", "calendarDay", "headlineIncludes", "categories", "keywords"], path);
      if (typeof rule.withinMinutes !== "number" || !Number.isFinite(rule.withinMinutes) || rule.withinMinutes < 0) {
        throw new RangeError(`${path}.withinMinutes must be finite and non-negative.`);
      }
      if (rule.headlineIncludes !== undefined
        && (typeof rule.headlineIncludes !== "string" || !rule.headlineIncludes.trim() || rule.headlineIncludes.length > 120)) {
        throw new TypeError(`${path}.headlineIncludes must be a non-empty bounded string.`);
      }
      if (rule.categories !== undefined) boundedStringArray(rule.categories, `${path}.categories`);
      if (rule.keywords !== undefined) boundedStringArray(rule.keywords, `${path}.keywords`);
      if (rule.calendarDay !== undefined && rule.calendarDay !== "today") {
        throw new TypeError(`${path}.calendarDay must be today when supplied.`);
      }
      return candidate as ScannerRule;
    }
    if (kind === "catalyst-window") {
      assertRuleKeys(rule, ["kind", "withinDays", "catalystTypes", "statuses"], path);
      if (typeof rule.withinDays !== "number" || !Number.isFinite(rule.withinDays) || rule.withinDays < 0) {
        throw new RangeError(`${path}.withinDays must be finite and non-negative.`);
      }
      if (rule.catalystTypes !== undefined) boundedStringArray(rule.catalystTypes, `${path}.catalystTypes`);
      if (rule.statuses !== undefined) boundedStringArray(rule.statuses, `${path}.statuses`);
      return candidate as ScannerRule;
    }
    if (kind === "not") {
      assertRuleKeys(rule, ["kind", "rule"], path);
      visit(rule.rule, depth + 1, `${path}.rule`);
      return candidate as ScannerRule;
    }
    if (kind === "all" || kind === "any") {
      assertRuleKeys(rule, ["kind", "rules"], path);
      if (!Array.isArray(rule.rules) || rule.rules.length < 1
        || rule.rules.length > SCANNER_RULE_LIMITS.maxChildrenPerGroup) {
        throw new RangeError(`${path}.rules must contain 1–${SCANNER_RULE_LIMITS.maxChildrenPerGroup} children.`);
      }
      rule.rules.forEach((child, index) => visit(child, depth + 1, `${path}.rules[${index}]`));
      return candidate as ScannerRule;
    }
    throw new TypeError(`${path}.kind is not supported.`);
  };

  return visit(value, 1, "rule");
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(label + " must be a valid ISO timestamp");
  return timestamp;
}

export function scannerMarketCapBucket(value: number): MarketCapBucket {
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
  if (field.startsWith("option") && security.optionsAvailable === false) return null;
  if (field === "relativeVolume") {
    if (security.relativeVolume !== null && security.relativeVolume !== undefined) {
      return Number.isFinite(security.relativeVolume) && security.relativeVolume >= 0
        ? security.relativeVolume
        : null;
    }
    const preferred = security.intradayRelativeVolume ?? security.dailyRelativeVolume;
    if (preferred !== null && preferred !== undefined) {
      return Number.isFinite(preferred) && preferred >= 0 ? preferred : null;
    }
    const derived = derivedPercent(security.volume, security.averageVolume);
    return derived === null ? null : derived / 100;
  }
  if (field === "dailyRelativeVolume") {
    if (security.dailyRelativeVolume !== null && security.dailyRelativeVolume !== undefined) {
      return Number.isFinite(security.dailyRelativeVolume) && security.dailyRelativeVolume >= 0
        ? security.dailyRelativeVolume
        : null;
    }
    const derived = derivedPercent(security.volume, security.averageVolume);
    return derived === null ? null : derived / 100;
  }
  if (field === "intradayRelativeVolume") {
    return security.intradayRelativeVolume !== null && security.intradayRelativeVolume !== undefined
      && Number.isFinite(security.intradayRelativeVolume) && security.intradayRelativeVolume >= 0
      ? security.intradayRelativeVolume
      : null;
  }
  if (field === "percentBelow52WeekHigh") {
    const ratio = derivedPercent(security.price, security.high52Week);
    return ratio === null ? null : Math.max(0, 100 - ratio);
  }
  if (field === "percentBelowDayHigh") {
    const ratio = derivedPercent(security.price, security.dayHigh);
    return ratio === null ? null : Math.max(0, 100 - ratio);
  }
  if (field === "percentAboveDayLow") {
    const ratio = derivedPercent(security.price, security.dayLow);
    return ratio === null ? null : Math.max(0, ratio - 100);
  }
  if (field === "percentAbove52WeekLow") {
    const ratio = derivedPercent(security.price, security.low52Week);
    return ratio === null ? null : ratio - 100;
  }
  if (field === "percentBelowRecentHigh20") {
    const ratio = derivedPercent(security.price, security.recentHigh20);
    return ratio === null ? null : Math.max(0, 100 - ratio);
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
    if (security.optionVolumeToOpenInterest !== null && security.optionVolumeToOpenInterest !== undefined) {
      return Number.isFinite(security.optionVolumeToOpenInterest) && security.optionVolumeToOpenInterest >= 0
        ? security.optionVolumeToOpenInterest
        : null;
    }
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
  return { passed, observations: [observation], reasons: passed ? [observation] : [], missingFields };
}

function numericOperatorLabel(rule: NumericScannerRule): string {
  if (rule.operator === "gt") return ">";
  if (rule.operator === "gte") return "≥";
  if (rule.operator === "lt") return "<";
  if (rule.operator === "lte") return "≤";
  if (rule.operator === "eq") return "=";
  if (rule.operator === "absolute-gte") return "absolute value ≥";
  return `between ${rule.value} and ${rule.upperValue}`;
}

function optionCoverageDescription(security: ScannerSecurity, field: ScannerNumericField): string {
  if (!field.startsWith("option")) return "";
  const contractCount = security.optionContractCount;
  let coverage = "";
  if (field === "optionVolume" && contractCount !== undefined && security.optionVolumeReportedContractCount !== undefined) {
    coverage = ` Volume reported for ${security.optionVolumeReportedContractCount}/${contractCount} contracts${security.optionVolumeComplete ? " (complete)" : " (partial)"}.`;
  } else if (field === "optionOpenInterest" && contractCount !== undefined && security.optionOpenInterestReportedContractCount !== undefined) {
    coverage = ` Open interest reported for ${security.optionOpenInterestReportedContractCount}/${contractCount} contracts${security.optionOpenInterestComplete ? " (complete)" : " (partial)"}.`;
  } else if (field === "optionVolumeToOpenInterest" && contractCount !== undefined
    && security.optionVolumeOpenInterestPairedContractCount !== undefined) {
    coverage = ` Ratio uses ${security.optionVolumeOpenInterestPairedContractCount}/${contractCount} contracts reporting both fields.`;
  } else if (field === "optionCallToPutVolumeRatio"
    && security.optionCallContractCount !== undefined && security.optionPutContractCount !== undefined
    && security.optionCallVolumeReportedContractCount !== undefined && security.optionPutVolumeReportedContractCount !== undefined) {
    coverage = ` Ratio uses reported volume from ${security.optionCallVolumeReportedContractCount}/${security.optionCallContractCount} calls and ${security.optionPutVolumeReportedContractCount}/${security.optionPutContractCount} puts.`;
  } else if (field === "optionCallToPutOpenInterestRatio"
    && security.optionCallContractCount !== undefined && security.optionPutContractCount !== undefined
    && security.optionCallOpenInterestReportedContractCount !== undefined && security.optionPutOpenInterestReportedContractCount !== undefined) {
    coverage = ` Ratio uses reported open interest from ${security.optionCallOpenInterestReportedContractCount}/${security.optionCallContractCount} calls and ${security.optionPutOpenInterestReportedContractCount}/${security.optionPutContractCount} puts.`;
  } else if (field === "optionAverageImpliedVolatility" && contractCount !== undefined
    && security.optionIvReportedContractCount !== undefined) {
    coverage = ` Average uses ${security.optionIvReportedContractCount}/${contractCount} contracts reporting implied volatility.`;
  } else if ((field === "optionMinimumDte" || field === "optionMaximumDte") && contractCount !== undefined
    && security.optionDteContractCount !== undefined) {
    coverage = ` DTE range uses ${security.optionDteContractCount}/${contractCount} parseable expirations on the New York calendar.`;
  } else if (field === "optionHighestContractVolume") {
    coverage = ` Highest individual contract volume uses reported fields only${security.optionHighestVolumeContract ? `; contract ${security.optionHighestVolumeContract}` : ""}.`;
  } else if (field === "optionHighestContractOpenInterest") {
    coverage = ` Highest individual contract open interest uses reported fields only${security.optionHighestOpenInterestContract ? `; contract ${security.optionHighestOpenInterestContract}` : ""}.`;
  } else if (field === "optionVolumeRelativeToUnderlying" && contractCount !== undefined
    && security.optionEquivalentShareVolumeReportedContractCount !== undefined) {
    coverage = ` Equivalent-share volume uses ${security.optionEquivalentShareVolumeReportedContractCount}/${contractCount} contracts${security.optionEquivalentShareVolumeComplete ? " (complete)" : " (partial)"} and reported underlying share volume.`;
  }
  const provenance = [
    security.optionSelectedExpiration ? `selected expiration ${security.optionSelectedExpiration}` : null,
    security.optionContractsComplete === false ? "selected-expiration pagination truncated" : null,
    security.optionAvailableExpirationCount !== undefined
      ? `${security.optionAvailableExpirationCount} available expiration${security.optionAvailableExpirationCount === 1 ? "" : "s"}`
      : null,
    security.optionsQuality ? `quality ${security.optionsQuality}` : null,
    security.optionsAsOf ? `as of ${security.optionsAsOf}` : null,
  ].filter((value): value is string => value !== null);
  return `${coverage}${provenance.length ? ` Options ${provenance.join(", ")}.` : ""}`;
}

export function evaluateScannerRule(
  security: ScannerSecurity,
  rule: ScannerRule,
  now: string,
): ScannerEvaluation {
  validateScannerRule(rule);
  const nowTimestamp = parseTimestamp(now, "now");

  if (rule.kind === "numeric") {
    const actual = scannerFieldValue(security, rule.field);
    if (actual === null) {
      const paginationReason = rule.field.startsWith("option") && security.optionContractsComplete === false
        ? " (selected-expiration pagination truncated)"
        : "";
      return result(false, `Unavailable: ${rule.field}${paginationReason}`, [rule.field]);
    }
    const passed = numericPasses(rule, actual);
    const comparison = rule.operator === "between"
      ? `${numericOperatorLabel(rule)}`
      : `${numericOperatorLabel(rule)} ${rule.value}`;
    return result(passed, `${passed ? "Qualified" : "Did not qualify"}: ${rule.field} observed ${actual}, required ${comparison}.${optionCoverageDescription(security, rule.field)}`);
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
    return result(passed, `${passed ? "Qualified" : "Did not qualify"}: price ${security.price} is ${rule.relation} ${rule.reference} ${reference}.`);
  }

  if (rule.kind === "market-cap") {
    if (security.marketCap === null || security.marketCap === undefined
      || !Number.isFinite(security.marketCap) || security.marketCap < 0) {
      return result(false, "Unavailable: marketCap", ["marketCap"]);
    }
    const bucket = scannerMarketCapBucket(security.marketCap);
    const passed = rule.buckets.includes(bucket);
    return result(passed, `${passed ? "Qualified" : "Did not qualify"}: market-cap bucket is ${bucket}; allowed ${rule.buckets.join(", ")}.`);
  }

  if (rule.kind === "recent-news") {
    if (!Number.isFinite(rule.withinMinutes) || rule.withinMinutes < 0) {
      throw new RangeError("withinMinutes must be non-negative");
    }
    if (security.newsAvailable === false) return result(false, "Unavailable: news context", ["news"]);
    const metadataRequired = Boolean(rule.headlineIncludes || rule.categories?.length || rule.keywords?.length);
    if (metadataRequired && !security.news) {
      return result(false, "Unavailable: news headline/category/keyword metadata", ["news"]);
    }
    if (!security.news && !security.newsPublishedAt) {
      return result(false, "Unavailable: news timestamps", ["newsPublishedAt"]);
    }
    const windowStart = nowTimestamp - rule.withinMinutes * 60_000;
    const easternToday = rule.calendarDay === "today" ? newYorkCalendarDate(now) : null;
    const observations: readonly ScannerNewsObservation[] = security.news
      ?? (security.newsPublishedAt ?? []).map((publishedAt) => ({ publishedAt, headline: "", categories: [], keywords: [] }));
    const headlineNeedle = rule.headlineIncludes?.trim().toLowerCase();
    const requestedCategories = rule.categories?.map((value) => value.trim().toLowerCase());
    const requestedKeywords = rule.keywords?.map((value) => value.trim().toLowerCase());
    const matchingArticles = observations.filter((article, index) => {
      const parsed = parseTimestamp(article.publishedAt, "news[" + index + "].publishedAt");
      if (parsed > nowTimestamp) return false;
      if (easternToday !== null
        ? newYorkCalendarDate(article.publishedAt) !== easternToday
        : parsed < windowStart) return false;
      if (headlineNeedle && !article.headline.toLowerCase().includes(headlineNeedle)) return false;
      if (requestedCategories?.length && !requestedCategories.some((category) =>
        article.categories.some((value) => value.toLowerCase() === category))) return false;
      if (requestedKeywords?.length && !requestedKeywords.some((keyword) =>
        article.keywords.some((value) => value.toLowerCase().includes(keyword)))) return false;
      return true;
    }).sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
    const count = matchingArticles.length;
    const filters = [
      headlineNeedle ? `headline containing “${rule.headlineIncludes?.trim()}”` : null,
      requestedCategories?.length ? `category ${rule.categories?.join("/")}` : null,
      requestedKeywords?.length ? `keyword ${rule.keywords?.join("/")}` : null,
    ].filter((value): value is string => value !== null);
    const windowDescription = easternToday === null
      ? `within ${rule.withinMinutes} minutes`
      : "published today on the America/New_York calendar";
    const newestMatch = matchingArticles[0];
    const matchDescription = newestMatch
      ? newestMatch.headline.trim()
        ? ` Most recent match: “${newestMatch.headline.trim().slice(0, 180)}” at ${newestMatch.publishedAt}.`
        : ` Most recent matching article was published at ${newestMatch.publishedAt}.`
      : "";
    return result(count > 0, `${count > 0 ? "Qualified" : "Did not qualify"}: ${count} article${count === 1 ? "" : "s"} ${windowDescription}${filters.length ? ` matching ${filters.join(", ")}` : ""}.${matchDescription}`);
  }

  if (rule.kind === "catalyst-window") {
    if (!Number.isFinite(rule.withinDays) || rule.withinDays < 0) {
      throw new RangeError("withinDays must be non-negative");
    }
    if (security.eventsAvailable === false) return result(false, "Unavailable: event context", ["catalysts"]);
    if (!security.catalysts) return result(false, "Unavailable: catalysts", ["catalysts"]);
    if (rule.statuses?.length && !security.catalysts.some((catalyst) => typeof catalyst.status === "string")) {
      return result(false, "Unavailable: catalyst status", ["catalysts.status"]);
    }
    const windowEnd = nowTimestamp + rule.withinDays * 86_400_000;
    const matchingCatalysts = security.catalysts.filter((catalyst, index) => {
      const timestamp = parseTimestamp(catalyst.occursAt, "catalysts[" + index + "].occursAt");
      const typeMatches = !rule.catalystTypes
        || rule.catalystTypes.some((type) => type.toLowerCase() === catalyst.type.toLowerCase());
      const statusMatches = !rule.statuses
        || rule.statuses.some((status) => status.toLowerCase() === catalyst.status?.toLowerCase());
      return typeMatches && statusMatches && timestamp >= nowTimestamp && timestamp <= windowEnd;
    }).sort((left, right) => Date.parse(left.occursAt) - Date.parse(right.occursAt));
    const count = matchingCatalysts.length;
    const nextMatch = matchingCatalysts[0];
    const matchDescription = nextMatch
      ? ` Next match: ${nextMatch.type}${nextMatch.status ? ` (${nextMatch.status})` : ""} at ${nextMatch.occursAt}.`
      : "";
    return result(count > 0, `${count > 0 ? "Qualified" : "Did not qualify"}: ${count} matching event${count === 1 ? "" : "s"} within ${rule.withinDays} days.${matchDescription}`);
  }

  if (rule.kind === "not") {
    const evaluation = evaluateScannerRule(security, rule.rule, now);
    if (evaluation.missingFields.length > 0) {
      return {
        passed: false,
        observations: evaluation.observations.map((observation) => "Cannot negate unavailable data: " + observation),
        reasons: [],
        missingFields: evaluation.missingFields,
      };
    }
    return {
      passed: !evaluation.passed,
      observations: evaluation.observations.map((observation) => "Negated: " + observation),
      reasons: evaluation.passed ? [] : evaluation.observations.map((observation) => "Qualified by NOT: " + observation),
      missingFields: evaluation.missingFields,
    };
  }

  if (rule.rules.length === 0) {
    return result(rule.kind === "all", "No scanner conditions configured");
  }
  const evaluations = rule.rules.map((child) => evaluateScannerRule(security, child, now));
  const passed = rule.kind === "all"
    ? evaluations.every((evaluation) => evaluation.passed)
    : evaluations.some((evaluation) => evaluation.passed);
  const relevantMissingEvaluations = rule.kind === "any" && passed
    ? evaluations.filter((evaluation) => evaluation.passed)
    : evaluations;
  return {
    passed,
    observations: evaluations.flatMap((evaluation) => evaluation.observations),
    reasons: evaluations.flatMap((evaluation) => evaluation.reasons),
    missingFields: [...new Set(relevantMissingEvaluations.flatMap((evaluation) => evaluation.missingFields))],
  };
}

export function runScanner(
  securities: readonly ScannerSecurity[],
  rule: ScannerRule,
  now: string,
): ScannerRunResult {
  parseTimestamp(now, "now");
  validateScannerRule(rule);
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
