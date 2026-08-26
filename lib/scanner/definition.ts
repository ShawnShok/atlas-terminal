import {
  SCANNER_RULE_LIMITS,
  validateScannerRule,
  type MarketCapBucket,
  type ScannerNumericField,
  type ScannerReferenceField,
  type ScannerRule,
} from "./engine";

export interface ScannerRuleDefinitionV2 {
  readonly version: 2;
  readonly rule: ScannerRule;
}

interface LegacyScannerCondition {
  readonly field: string;
  readonly operator: string;
  readonly value: number | string;
  readonly secondaryValue?: number | string;
  readonly unit?: string;
}

interface LegacyScannerDefinitionV1 {
  readonly version: 1;
  readonly logic: "all" | "any";
  readonly conditions: readonly LegacyScannerCondition[];
}

const LEGACY_NUMERIC_FIELDS: Readonly<Record<string, ScannerNumericField>> = {
  price: "price",
  "market-cap": "marketCap",
  volume: "volume",
  "average-volume": "averageVolume",
  "relative-volume": "relativeVolume",
  "daily-relative-volume": "dailyRelativeVolume",
  "intraday-relative-volume": "intradayRelativeVolume",
  "volume-acceleration": "volumeAccelerationRatio",
  "daily-change": "dailyChangePercent",
  "weekly-change": "weeklyChangePercent",
  "monthly-change": "monthlyChangePercent",
  "vwap-distance": "distanceFromVwapPercent",
  rsi: "rsi",
  "distance-day-high": "percentBelowDayHigh",
  "distance-day-low": "percentAboveDayLow",
  "distance-52w-high": "percentBelow52WeekHigh",
  "distance-52w-low": "percentAbove52WeekLow",
  "new-intraday-high": "newIntradayHigh",
  "new-intraday-low": "newIntradayLow",
  "gap-percent": "gapPercent",
  "option-volume-oi": "optionVolumeToOpenInterest",
  "option-highest-contract-volume": "optionHighestContractVolume",
  "option-highest-contract-open-interest": "optionHighestContractOpenInterest",
  "option-volume-relative-underlying": "optionVolumeRelativeToUnderlying",
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be numeric.`);
  return parsed;
}

function legacyOperator(value: string, unit?: string): "gt" | "gte" | "lt" | "lte" | "eq" | "between" | "absolute-gte" {
  if (unit?.toUpperCase() === "ABS" && value === "greater-than-or-equal") return "absolute-gte";
  if (value === "greater-than") return "gt";
  if (value === "greater-than-or-equal") return "gte";
  if (value === "less-than") return "lt";
  if (value === "less-than-or-equal") return "lte";
  if (value === "equal") return "eq";
  if (value === "between") return "between";
  throw new TypeError(`Legacy scanner operator ${value} is not supported for this field.`);
}

function relation(value: string): "above" | "at-or-above" | "below" | "at-or-below" {
  if (value === "greater-than") return "above";
  if (value === "greater-than-or-equal") return "at-or-above";
  if (value === "less-than") return "below";
  if (value === "less-than-or-equal") return "at-or-below";
  throw new TypeError("Legacy price relations require a greater-than or less-than operator.");
}

function legacyCondition(value: unknown, index: number): ScannerRule {
  const input = record(value, `conditions[${index}]`);
  if (typeof input.field !== "string" || typeof input.operator !== "string") {
    throw new TypeError(`conditions[${index}] requires a field and operator.`);
  }

  if (input.field === "market-cap" && input.operator === "in") {
    const allowed = new Set<MarketCapBucket>(["micro", "small", "mid", "large", "mega"]);
    const buckets = String(input.value).split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is MarketCapBucket => allowed.has(item as MarketCapBucket));
    if (buckets.length === 0) throw new TypeError("Legacy market-cap rule has no valid buckets.");
    return { kind: "market-cap", buckets: [...new Set(buckets)] };
  }
  if (input.field === "recent-news-minutes") {
    return { kind: "recent-news", withinMinutes: numberValue(input.value, "Recent-news window") };
  }
  if (input.field === "event-within-days" || input.field === "earnings-within-days") {
    return {
      kind: "catalyst-window",
      withinDays: numberValue(input.value, "Catalyst window"),
      catalystTypes: input.field === "earnings-within-days" ? ["earnings", "earnings-release", "earnings-call"] : undefined,
    };
  }
  if (input.field === "sma-distance" || input.field === "ema-distance") {
    if (numberValue(input.value, "Moving-average distance") !== 0) {
      throw new TypeError("Legacy moving-average distance rules only support a zero threshold.");
    }
    return {
      kind: "price-relation",
      reference: input.field === "sma-distance" ? "sma20" : "ema20",
      relation: relation(input.operator),
    };
  }
  if (input.field === "price" && typeof input.value === "string") {
    const normalized = input.value.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
    const references: Readonly<Record<string, ScannerReferenceField>> = {
      sma20: "sma20", sma50: "sma50", sma200: "sma200", ema20: "ema20", ema50: "ema50",
      vwap: "vwap", recenthigh20: "recentHigh20", recentlow20: "recentLow20",
    };
    const reference = references[normalized];
    if (reference) return { kind: "price-relation", reference, relation: relation(input.operator) };
  }

  const field = LEGACY_NUMERIC_FIELDS[input.field];
  if (!field) throw new TypeError(`Legacy scanner field ${input.field} is not supported.`);
  const operator = legacyOperator(input.operator, typeof input.unit === "string" ? input.unit : undefined);
  return {
    kind: "numeric",
    field,
    operator,
    value: numberValue(input.value, input.field),
    upperValue: operator === "between" ? numberValue(input.secondaryValue, `${input.field} upper bound`) : undefined,
  };
}

function legacyDefinition(value: Record<string, unknown>): LegacyScannerDefinitionV1 {
  if ((value.logic !== "all" && value.logic !== "any") || !Array.isArray(value.conditions)
    || value.conditions.length > SCANNER_RULE_LIMITS.maxChildrenPerGroup) {
    throw new RangeError("Legacy scanner definition exceeds the bounded condition limit.");
  }
  return value as unknown as LegacyScannerDefinitionV1;
}

export function serializeScannerRule(rule: ScannerRule): ScannerRuleDefinitionV2 {
  const validated = validateScannerRule(rule);
  const cloned = JSON.parse(JSON.stringify(validated)) as unknown;
  return { version: 2, rule: validateScannerRule(cloned) };
}

/** Accepts the nested V2 AST, a raw historical rule, or the flat V1 format. */
export function parseScannerRuleDefinition(value: unknown): ScannerRuleDefinitionV2 {
  const input = record(value, "Scanner definition");
  if (input.version === 2) return serializeScannerRule(validateScannerRule(input.rule));
  if (input.version === 1) {
    const legacy = legacyDefinition(input);
    return serializeScannerRule({
      kind: legacy.logic,
      rules: legacy.conditions.map(legacyCondition),
    });
  }
  if (typeof input.kind === "string") return serializeScannerRule(validateScannerRule(input));
  throw new TypeError("Scanner definition version is not supported.");
}
