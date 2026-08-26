"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ScannerTerminal,
  type ScannerOptionsSourceDisclosure,
  type ScannerRulePath,
  type ScannerSortKey,
} from "@/components/research";
import { useResearchData } from "@/hooks/useResearchData";
import { useSavedScanners } from "@/hooks/useSavedScanners";
import { useWatchlists } from "@/hooks/useWatchlists";
import type {
  ResearchDataStatus,
  ScannerCondition,
  ScannerField,
  ScannerOperator,
  ScannerPreset as ResearchScannerPreset,
  ScannerResult,
} from "@/lib/research";
import {
  createScannerPresets,
  createSimilarTickerRule,
  DEFAULT_RESEARCH_PRIORITY_WEIGHTS,
  calculateResearchPriority,
  evaluateScannerRule,
  runScanner,
  scannerFieldValue,
  validateScannerRule,
  type MarketCapBucket,
  type ResearchPriorityWeights,
  type ScannerNumericField,
  type ScannerReferenceField,
  type ScannerPreset as EngineScannerPreset,
  type ScannerRule,
  type ScannerContextBundle,
} from "@/lib/scanner";
import type { WorkspaceCommandTarget } from "@/lib/workspace/model";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

export interface LiveScannerPanelProps {
  readonly ticker: string;
  readonly similarSeed?: ScannerSimilarSeed | null;
  readonly commandTarget?: WorkspaceCommandTarget | null;
  readonly onTickerSelect: (ticker: string, context: ScannerNavigationContext) => void;
  readonly onResearchSelect?: (ticker: string, view: "news" | "events" | "options") => void;
}

export interface ScannerSimilarSeed {
  readonly sequence: number;
  readonly ticker: string;
}

export interface ScannerNavigationContext {
  readonly ticker: string;
  readonly scanName: string;
  readonly rule: ScannerRule;
  readonly evaluatedAt: string;
  readonly researchPriority: number | null;
  readonly reasons: readonly string[];
}

const DEFAULT_DRAFT: ScannerCondition = {
  id: "draft",
  field: "price",
  operator: "greater-than-or-equal",
  value: 5,
  unit: "USD",
};
const DEFAULT_LEAF_RULE: ScannerRule = {
  kind: "numeric",
  field: "price",
  operator: "gte",
  value: 5,
};
const DEFAULT_RULE: ScannerRule = { kind: "all", rules: [DEFAULT_LEAF_RULE] };
const DEFAULT_CONDITION: ScannerCondition = {
  id: "default-price",
  field: "price",
  operator: "greater-than-or-equal",
  value: 5,
  unit: "USD",
};

const NUMERIC_FIELDS: Readonly<Partial<Record<ScannerField, ScannerNumericField>>> = {
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
  "distance-recent-high": "percentBelowRecentHigh20",
  "new-intraday-high": "newIntradayHigh",
  "new-intraday-low": "newIntradayLow",
  "gap-percent": "gapPercent",
  "option-volume": "optionVolume",
  "option-open-interest": "optionOpenInterest",
  "option-volume-oi": "optionVolumeToOpenInterest",
  "option-call-volume": "optionCallVolume",
  "option-put-volume": "optionPutVolume",
  "option-call-open-interest": "optionCallOpenInterest",
  "option-put-open-interest": "optionPutOpenInterest",
  "option-call-put-volume": "optionCallToPutVolumeRatio",
  "option-call-put-open-interest": "optionCallToPutOpenInterestRatio",
  "option-average-iv": "optionAverageImpliedVolatility",
  "option-min-dte": "optionMinimumDte",
  "option-max-dte": "optionMaximumDte",
  "option-highest-contract-volume": "optionHighestContractVolume",
  "option-highest-contract-open-interest": "optionHighestContractOpenInterest",
  "option-volume-relative-underlying": "optionVolumeRelativeToUnderlying",
};

const RESEARCH_FIELDS: Readonly<Partial<Record<ScannerNumericField, ScannerField>>> = {
  price: "price",
  marketCap: "market-cap",
  volume: "volume",
  averageVolume: "average-volume",
  relativeVolume: "relative-volume",
  dailyRelativeVolume: "daily-relative-volume",
  intradayRelativeVolume: "intraday-relative-volume",
  volumeAccelerationRatio: "volume-acceleration",
  dailyChangePercent: "daily-change",
  weeklyChangePercent: "weekly-change",
  monthlyChangePercent: "monthly-change",
  rsi: "rsi",
  percentBelowDayHigh: "distance-day-high",
  percentAboveDayLow: "distance-day-low",
  gapPercent: "gap-percent",
  percentBelow52WeekHigh: "distance-52w-high",
  percentAbove52WeekLow: "distance-52w-low",
  percentBelowRecentHigh20: "distance-recent-high",
  newIntradayHigh: "new-intraday-high",
  newIntradayLow: "new-intraday-low",
  distanceFromVwapPercent: "vwap-distance",
  optionVolume: "option-volume",
  optionOpenInterest: "option-open-interest",
  optionVolumeToOpenInterest: "option-volume-oi",
  optionCallVolume: "option-call-volume",
  optionPutVolume: "option-put-volume",
  optionCallOpenInterest: "option-call-open-interest",
  optionPutOpenInterest: "option-put-open-interest",
  optionCallToPutVolumeRatio: "option-call-put-volume",
  optionCallToPutOpenInterestRatio: "option-call-put-open-interest",
  optionAverageImpliedVolatility: "option-average-iv",
  optionMinimumDte: "option-min-dte",
  optionMaximumDte: "option-max-dte",
  optionHighestContractVolume: "option-highest-contract-volume",
  optionHighestContractOpenInterest: "option-highest-contract-open-interest",
  optionVolumeRelativeToUnderlying: "option-volume-relative-underlying",
};

const PRICE_REFERENCE_FIELDS: Readonly<Partial<Record<ScannerField, ScannerReferenceField>>> = {
  "price-vs-vwap": "vwap",
  "price-vs-sma20": "sma20",
  "price-vs-sma50": "sma50",
  "price-vs-sma200": "sma200",
  "price-vs-ema20": "ema20",
  "price-vs-ema50": "ema50",
  "price-vs-recent-high": "recentHigh20",
  "price-vs-recent-low": "recentLow20",
};
const RESEARCH_PRICE_REFERENCE_FIELDS: Readonly<Record<ScannerReferenceField, ScannerField>> = {
  sma20: "price-vs-sma20",
  sma50: "price-vs-sma50",
  sma200: "price-vs-sma200",
  ema20: "price-vs-ema20",
  ema50: "price-vs-ema50",
  vwap: "price-vs-vwap",
  recentHigh20: "price-vs-recent-high",
  recentLow20: "price-vs-recent-low",
};

function operatorToEngine(operator: ScannerOperator): "gt" | "gte" | "lt" | "lte" | "eq" | "between" {
  if (operator === "greater-than") return "gt";
  if (operator === "greater-than-or-equal") return "gte";
  if (operator === "less-than") return "lt";
  if (operator === "less-than-or-equal") return "lte";
  if (operator === "equal") return "eq";
  if (operator === "between") return "between";
  throw new Error("IN is only supported for market-cap buckets.");
}

function numberValue(value: number | string, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed)) throw new Error(label + " requires a numeric value.");
  return parsed;
}

function nonNegativeValue(value: number | string, label: string): number {
  const parsed = numberValue(value, label);
  if (parsed < 0) throw new Error(label + " cannot be negative.");
  return parsed;
}

function conditionToRule(condition: ScannerCondition): ScannerRule {
  if (condition.field === "market-cap" && condition.operator === "in") {
    const allowed: readonly MarketCapBucket[] = ["micro", "small", "mid", "large", "mega"];
    const buckets = String(condition.value).split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is MarketCapBucket => allowed.includes(value as MarketCapBucket));
    if (buckets.length === 0) throw new Error("Market-cap IN requires micro, small, mid, large, or mega.");
    return { kind: "market-cap", buckets };
  }
  if (condition.field === "recent-news-minutes") {
    return { kind: "recent-news", withinMinutes: nonNegativeValue(condition.value, "Recent news") };
  }
  if (condition.field === "news-headline") {
    const headlineIncludes = String(condition.value).trim();
    if (!headlineIncludes) throw new Error("News headline filters require text.");
    return { kind: "recent-news", withinMinutes: 1_440, calendarDay: "today", headlineIncludes };
  }
  if (condition.field === "news-category" || condition.field === "news-keyword") {
    const values = String(condition.value).split(",").map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) throw new Error("News metadata filters require at least one value.");
    return {
      kind: "recent-news",
      withinMinutes: 1_440,
      calendarDay: "today",
      ...(condition.field === "news-category" ? { categories: values } : { keywords: values }),
    };
  }
  if (["event-within-days", "earnings-within-days", "confirmed-event-within-days", "investor-event-within-days"].includes(condition.field)) {
    return {
      kind: "catalyst-window",
      withinDays: nonNegativeValue(condition.value, "Catalyst window"),
      catalystTypes: condition.field === "earnings-within-days"
        ? ["earnings", "earnings-release", "earnings-call"]
        : condition.field === "investor-event-within-days"
          ? ["investor-day", "analyst-day"]
        : undefined,
      statuses: condition.field === "confirmed-event-within-days" ? ["confirmed"] : undefined,
    };
  }
  const explicitReference = PRICE_REFERENCE_FIELDS[condition.field];
  if (condition.field === "sma-distance" || condition.field === "ema-distance" || explicitReference) {
    const threshold = numberValue(condition.value, "Moving-average distance");
    if (threshold !== 0) {
      throw new Error("Price/reference relations use a zero threshold; choose above or below with the operator.");
    }
    const reference = explicitReference ?? (condition.field === "sma-distance" ? "sma20" as const : "ema20" as const);
    if (condition.operator === "greater-than") return { kind: "price-relation", reference, relation: "above" };
    if (condition.operator === "greater-than-or-equal") return { kind: "price-relation", reference, relation: "at-or-above" };
    if (condition.operator === "less-than") return { kind: "price-relation", reference, relation: "below" };
    if (condition.operator === "less-than-or-equal") return { kind: "price-relation", reference, relation: "at-or-below" };
    throw new Error("Moving-average filters require a greater-than or less-than operator.");
  }

  const field = NUMERIC_FIELDS[condition.field];
  if (!field) throw new Error("This scanner field is not supported by the local rule engine.");
  const operator = operatorToEngine(condition.operator);
  const value = numberValue(condition.value, condition.field);
  const upperValue = operator === "between"
    ? numberValue(condition.secondaryValue ?? "", condition.field + " upper bound")
    : undefined;
  if (upperValue !== undefined && upperValue < value) {
    throw new Error(condition.field + " upper bound cannot be below its lower bound.");
  }
  return {
    kind: "numeric",
    field,
    operator,
    value,
    upperValue,
  };
}

function conditionsToRule(conditions: readonly ScannerCondition[], logic: "all" | "any" = "all"): ScannerRule {
  return { kind: logic, rules: conditions.map(conditionToRule) };
}

function isRuleGroup(rule: ScannerRule): rule is Extract<ScannerRule, { kind: "all" | "any" }> {
  return rule.kind === "all" || rule.kind === "any";
}

function replaceRuleAt(
  root: ScannerRule,
  path: ScannerRulePath,
  update: (rule: ScannerRule) => ScannerRule,
): ScannerRule {
  if (path.length === 0) return update(root);
  if (!isRuleGroup(root)) throw new Error("The selected scanner rule path is not a group.");
  const [index, ...remaining] = path;
  const child = root.rules[index];
  if (!child) throw new Error("The selected scanner rule no longer exists.");
  return {
    ...root,
    rules: root.rules.map((candidate, candidateIndex) => candidateIndex === index
      ? replaceRuleAt(child, remaining, update)
      : candidate),
  };
}

function ruleAt(root: ScannerRule, path: ScannerRulePath): ScannerRule {
  return path.reduce<ScannerRule>((current, index) => {
    if (!isRuleGroup(current) || !current.rules[index]) {
      throw new Error("The selected scanner rule no longer exists.");
    }
    return current.rules[index];
  }, root);
}

function addRuleToGroup(root: ScannerRule, path: ScannerRulePath, rule: ScannerRule): ScannerRule {
  return replaceRuleAt(root, path, (group) => {
    if (!isRuleGroup(group)) throw new Error("Select an AND or OR group before adding a condition.");
    if (group.rules.length >= 12) throw new Error("A scanner group is limited to 12 child rules.");
    return { ...group, rules: [...group.rules, rule] };
  });
}

function removeRuleAt(root: ScannerRule, path: ScannerRulePath): ScannerRule {
  if (path.length === 0) throw new Error("The root scanner group cannot be removed.");
  const parentPath = path.slice(0, -1);
  const targetIndex = path.at(-1)!;
  return replaceRuleAt(root, parentPath, (group) => {
    if (!isRuleGroup(group) || !group.rules[targetIndex]) {
      throw new Error("The selected scanner rule no longer exists.");
    }
    return { ...group, rules: group.rules.filter((_, index) => index !== targetIndex) };
  });
}

function ruleLeafCount(rule: ScannerRule): number {
  if (isRuleGroup(rule)) return rule.rules.reduce((total, child) => total + ruleLeafCount(child), 0);
  if (rule.kind === "not") return ruleLeafCount(rule.rule);
  return 1;
}

function optionsSourceDisclosure(bundle: ScannerContextBundle | null): ScannerOptionsSourceDisclosure {
  const rows = bundle?.rows ?? [];
  const covered = rows.filter((row) => row.options.available);
  const qualities = covered.flatMap((row) => row.options.quality ? [row.options.quality] : []);
  const quality: ScannerOptionsSourceDisclosure["quality"] = qualities.length === 0
    ? "unknown"
    : qualities.every((candidate) => candidate === qualities[0])
      ? qualities[0]
      : qualities.includes("delayed") ? "delayed" : "unknown";
  const asOf = covered.flatMap((row) => row.options.asOf ? [row.options.asOf] : []).sort().at(-1) ?? null;
  const partialMetrics = covered.some((row) => !row.options.volumeComplete || !row.options.openInterestComplete);
  const availability: ScannerOptionsSourceDisclosure["availability"] = covered.length === 0
    ? "unavailable"
    : covered.length < rows.length || partialMetrics ? "partial" : "available";
  const contractCount = covered.reduce((sum, row) => sum + row.options.contractCount, 0);
  const reportedVolumeCount = covered.reduce((sum, row) => sum + row.options.volumeReportedContractCount, 0);
  const pairedCount = covered.reduce((sum, row) => sum + row.options.volumeOpenInterestPairedContractCount, 0);
  const expirationCoverage = [...covered.reduce((groups, row) => {
    const expiration = row.options.selectedExpiration ?? "UNSPECIFIED";
    const current = groups.get(expiration) ?? { expiration, symbolCount: 0, contractCount: 0 };
    groups.set(expiration, {
      expiration,
      symbolCount: current.symbolCount + 1,
      contractCount: current.contractCount + row.options.contractCount,
    });
    return groups;
  }, new Map<string, { expiration: string; symbolCount: number; contractCount: number }>()).values()]
    .sort((left, right) => left.expiration.localeCompare(right.expiration));
  const expirationDescription = expirationCoverage
    .map((item) => `${item.expiration}: ${item.symbolCount} symbol${item.symbolCount === 1 ? "" : "s"}, ${item.contractCount} contracts`)
    .join("; ");
  const totalSymbols = bundle?.universeCoverage.processedCount ?? rows.length;
  return {
    availability,
    quality,
    asOf,
    coveredSymbols: covered.length,
    totalSymbols,
    expirationCoverage,
    message: covered.length === 0
      ? "Options Developer context is unavailable; options rules fail closed."
      : `Options Developer ${quality.toUpperCase()} research data. Scanner metrics use only each chain's selected expiration (${expirationDescription}). Volume reported for ${reportedVolumeCount}/${contractCount} contracts; ${pairedCount}/${contractCount} have paired volume/OI. Bid/ask is not a scanner input.`,
  };
}

function researchOperator(operator: string): ScannerOperator {
  if (operator === "gt") return "greater-than";
  if (operator === "gte" || operator === "absolute-gte") return "greater-than-or-equal";
  if (operator === "lt") return "less-than";
  if (operator === "lte") return "less-than-or-equal";
  if (operator === "between") return "between";
  return "equal";
}

function ruleConditions(rule: ScannerRule, prefix: string): ScannerCondition[] {
  if (rule.kind === "all" || rule.kind === "any") {
    return rule.rules.flatMap((child, index) => ruleConditions(child, prefix + "-" + index));
  }
  if (rule.kind === "not") return ruleConditions(rule.rule, prefix + "-not");
  if (rule.kind === "numeric") {
    const researchField = RESEARCH_FIELDS[rule.field];
    if (!researchField) return [];
    return [{
      id: prefix,
      field: researchField,
      operator: researchOperator(rule.operator),
      value: rule.value,
      secondaryValue: rule.upperValue,
      unit: rule.operator === "absolute-gte" ? "ABS" : undefined,
    }];
  }
  if (rule.kind === "market-cap") {
    return [{ id: prefix, field: "market-cap", operator: "in", value: rule.buckets.join(", ") }];
  }
  if (rule.kind === "recent-news") {
    const windowUnit = rule.calendarDay === "today" ? "TODAY ET" : `${rule.withinMinutes}MIN`;
    if (rule.headlineIncludes) {
      return [{ id: prefix, field: "news-headline", operator: "equal", value: rule.headlineIncludes, unit: windowUnit }];
    }
    if (rule.categories?.length) {
      return [{ id: prefix, field: "news-category", operator: "in", value: rule.categories.join(", "), unit: windowUnit }];
    }
    if (rule.keywords?.length) {
      return [{ id: prefix, field: "news-keyword", operator: "in", value: rule.keywords.join(", "), unit: windowUnit }];
    }
    return [{ id: prefix, field: "recent-news-minutes", operator: "less-than-or-equal", value: rule.withinMinutes, unit: "MIN" }];
  }
  if (rule.kind === "catalyst-window") {
    const earnings = rule.catalystTypes?.some((type) => type.toLowerCase().includes("earning"));
    const investor = rule.catalystTypes?.some((type) => ["investor-day", "analyst-day"].includes(type.toLowerCase()));
    const confirmed = rule.statuses?.some((status) => status.toLowerCase() === "confirmed");
    return [{
      id: prefix,
      field: earnings ? "earnings-within-days" : investor ? "investor-event-within-days" : confirmed ? "confirmed-event-within-days" : "event-within-days",
      operator: "less-than-or-equal",
      value: rule.withinDays,
      unit: confirmed && earnings ? "DAYS · CONFIRMED" : "DAYS",
    }];
  }
  if (rule.kind !== "price-relation") return [];
  return [{
    id: prefix,
    field: RESEARCH_PRICE_REFERENCE_FIELDS[rule.reference],
    operator: rule.relation === "above" ? "greater-than" : rule.relation === "at-or-above"
      ? "greater-than-or-equal" : rule.relation === "below" ? "less-than" : "less-than-or-equal",
    value: 0,
    unit: rule.reference.toUpperCase(),
  }];
}

function toResearchPreset(preset: EngineScannerPreset): ResearchScannerPreset {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    conditions: ruleConditions(preset.rule, preset.id),
  };
}

function sortedResults(
  results: readonly ScannerResult[],
  key: ScannerSortKey,
  direction: "ascending" | "descending",
): readonly ScannerResult[] {
  const factor = direction === "ascending" ? 1 : -1;
  const value = (result: ScannerResult): string | number | null => {
    if (key === "symbol") return result.symbol;
    if (key === "changePercent") return result.changePercent;
    if (key === "latestNewsAt") return result.latestNewsAt ? Date.parse(result.latestNewsAt) : null;
    if (key === "nextEventAt") return result.nextEventAt ? Date.parse(result.nextEventAt) : null;
    return result[key] ?? null;
  };
  return [...results].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    if (leftValue === null && rightValue === null) return left.symbol.localeCompare(right.symbol);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === "string"
      ? leftValue.localeCompare(String(rightValue))
      : leftValue - Number(rightValue);
    return comparison * factor || left.symbol.localeCompare(right.symbol);
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportResults(rows: readonly ScannerResult[]): void {
  const header = ["TICKER", "COMPANY", "PRICE", "CHANGE_PERCENT", "RVOL", "VOLUME", "VWAP_DISTANCE_PERCENT", "LATEST_NEWS_AT", "NEXT_EVENT_AT", "OPTIONS_VOLUME_OI", "RESEARCH_PRIORITY", "REASONS", "LAST_UPDATED"];
  const lines = rows.map((row) => [
    row.symbol,
    row.companyName,
    row.price,
    row.changePercent,
    row.relativeVolume,
    row.volume,
    row.vwapDistancePercent,
    row.latestNewsAt,
    row.nextEventAt,
    row.optionActivityScore,
    row.researchPriority,
    row.matchedConditions.join(" | "),
    row.lastUpdatedAt,
  ].map(csvCell).join(","));
  const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `atlas-scanner-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function copyName(name: string, existing: readonly string[]): string {
  const base = (name.trim() || "Untitled scan").replace(/\s+COPY(?: \d+)?$/i, "");
  const used = new Set(existing.map((value) => value.toUpperCase()));
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const candidate = `${base} COPY${suffix === 1 ? "" : ` ${suffix}`}`.slice(0, 80);
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
  return `${base.slice(0, 66)} COPY ${Date.now().toString(36)}`;
}

export function LiveScannerPanel({ ticker, similarSeed, commandTarget, onTickerSelect, onResearchSelect }: LiveScannerPanelProps) {
  const watchlists = useWatchlists();
  const watchlistLists = watchlists.lists;
  const setSelectedWatchlistId = watchlists.setSelectedId;
  const enginePresets = useMemo(() => createScannerPresets(), []);
  const builtInPresets = useMemo(() => enginePresets.map(toResearchPreset), [enginePresets]);
  const savedScanners = useSavedScanners();
  const savedPresets = useMemo<readonly ResearchScannerPreset[]>(() => savedScanners.records.map((record) => ({
    id: record.id,
    name: record.name,
    description: record.description ?? "Saved custom research screen.",
    conditions: record.definition.conditions,
    isSaved: true,
  })), [savedScanners.records]);
  const savedRules = useMemo(() => new Map(savedScanners.records.map((record) => [
    record.id,
    record.definition.rule ?? conditionsToRule(record.definition.conditions, record.definition.logic),
  ])), [savedScanners.records]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<ScannerCondition[]>([DEFAULT_CONDITION]);
  const [logic, setLogic] = useState<"all" | "any">("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [appliedRule, setAppliedRule] = useState<ScannerRule>(DEFAULT_RULE);
  const [ruleTree, setRuleTree] = useState<ScannerRule>(DEFAULT_RULE);
  const [selectedRuleGroupPath, setSelectedRuleGroupPath] = useState<ScannerRulePath>([]);
  const [scoreWeights, setScoreWeights] = useState<ResearchPriorityWeights>(DEFAULT_RESEARCH_PRIORITY_WEIGHTS);
  const [draft, setDraft] = useState<ScannerCondition>(DEFAULT_DRAFT);
  const [scanName, setScanName] = useState("Price Screen");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ScannerSortKey>("changePercent");
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const handledSimilarSeed = useRef(0);

  useEffect(() => {
    if (!commandTarget?.scannerPresetId) return;
    const enginePreset = enginePresets.find((candidate) => candidate.id === commandTarget.scannerPresetId);
    const savedPreset = savedScanners.records.find((candidate) => candidate.id === commandTarget.scannerPresetId);
    if (!enginePreset && !savedPreset && savedScanners.persistenceState === "checking") return;
    const timer = window.setTimeout(() => {
      const selectedRule = enginePreset?.rule ?? savedRules.get(commandTarget.scannerPresetId!);
      if (!selectedRule) {
        setValidationMessage(`Scanner preset ${commandTarget.scannerPresetId} is unavailable.`);
        return;
      }
      setActivePresetId(commandTarget.scannerPresetId!);
      setConditions(ruleConditions(selectedRule, commandTarget.scannerPresetId!));
      setLogic(selectedRule.kind === "any" ? "any" : "all");
      setRuleTree(selectedRule);
      setSelectedRuleGroupPath([]);
      setScanName(enginePreset?.name ?? savedPreset?.name ?? "Saved screen");
      setScoreWeights(savedPreset?.definition.scoreWeights ?? DEFAULT_RESEARCH_PRIORITY_WEIGHTS);
      if (savedPreset?.definition.watchlistId
        && watchlistLists.some((list) => list.id === savedPreset.definition.watchlistId)) {
        setSelectedWatchlistId(savedPreset.definition.watchlistId);
      }
      setAppliedRule(selectedRule);
      setValidationMessage(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [commandTarget, enginePresets, savedRules, savedScanners.persistenceState, savedScanners.records, setSelectedWatchlistId, watchlistLists]);

  const requestedSymbols = useMemo(() => {
    const symbols = watchlists.selected?.tickers.map((item) => item.symbol) ?? [];
    return [...new Set([similarSeed?.ticker, ...(symbols.length ? symbols : [ticker])].filter((item): item is string => Boolean(item)))];
  }, [similarSeed?.ticker, ticker, watchlists.selected]);
  const universeParams = useMemo(() => ({ symbols: requestedSymbols.join(",") }), [requestedSymbols]);
  const universe = useResearchData<ScannerContextBundle>("scanner-context", universeParams, {
    refreshMs: autoRefresh ? 60_000 : undefined,
    retainMs: 20_000,
  });
  const scannerSecurities = useMemo(() => (universe.data?.rows ?? []).map((row) => row.security), [universe.data?.rows]);
  const evaluationTime = universe.data?.evaluationTime ?? universe.meta?.asOf ?? new Date().toISOString();
  useEffect(() => {
    if (!similarSeed || handledSimilarSeed.current === similarSeed.sequence) return;
    const security = scannerSecurities.find((item) => item.symbol === similarSeed.ticker);
    if (!security) return;
    const timer = window.setTimeout(() => {
      const similarRule = createSimilarTickerRule(security);
      handledSimilarSeed.current = similarSeed.sequence;
      if (!similarRule) {
        setValidationMessage(`Available ${similarSeed.ticker} metrics are insufficient to build a similar-ticker screen.`);
        return;
      }
      const editableRule: ScannerRule = isRuleGroup(similarRule)
        ? similarRule
        : { kind: "all", rules: [similarRule] };
      setActivePresetId(null);
      setRuleTree(editableRule);
      setConditions(ruleConditions(editableRule, `similar-${similarSeed.ticker}`));
      setLogic(editableRule.kind);
      setSelectedRuleGroupPath([]);
      setScanName(`Similar to ${similarSeed.ticker}`);
      setAppliedRule(editableRule);
      setValidationMessage(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scannerSecurities, similarSeed]);
  const scan = useMemo(() => runScanner(scannerSecurities, appliedRule, evaluationTime), [appliedRule, evaluationTime, scannerSecurities]);
  const unavailableFields = useMemo(() => [...new Set(scannerSecurities.flatMap((item) =>
    evaluateScannerRule(item, appliedRule, evaluationTime).missingFields))].sort(),
  [appliedRule, evaluationTime, scannerSecurities]);
  const contextBySymbol = useMemo(() => new Map((universe.data?.rows ?? []).map((row) => [row.security.symbol, row])), [universe.data?.rows]);
  const rows = useMemo(() => scan.matches.map(({ security: item, evaluation }): ScannerResult => {
    const context = contextBySymbol.get(item.symbol);
    const priority = calculateResearchPriority(item, evaluationTime, scoreWeights);
    const latestNewsAt = context?.latestNews?.publishedAt ?? null;
    return {
      symbol: item.symbol,
      companyName: context?.companyName ?? "Name unavailable",
      sector: context?.sector ?? null,
      price: item.price,
      changePercent: item.dailyChangePercent ?? null,
      volume: item.volume ?? null,
      relativeVolume: scannerFieldValue(item, "relativeVolume"),
      marketCap: item.marketCap ?? null,
      vwapDistancePercent: scannerFieldValue(item, "distanceFromVwapPercent"),
      latestNewsAt,
      latestNewsTitle: context?.latestNews?.title ?? null,
      newsAgeMinutes: latestNewsAt === null ? null : Math.max(0, Math.floor((Date.parse(evaluationTime) - Date.parse(latestNewsAt)) / 60_000)),
      nextEventAt: context?.nextEvent?.startsAt ?? null,
      nextEventLabel: context?.nextEvent?.title ?? null,
      nextEventStatus: context?.nextEvent?.status.toUpperCase() ?? null,
      optionActivityScore: context?.options?.volumeToOpenInterest ?? null,
      researchPriority: priority.score,
      researchPriorityCoverage: priority.coveragePercent,
      scoreBreakdown: priority.contributions,
      lastUpdatedAt: context?.freshness.lastUpdatedAt ?? universe.meta?.asOf ?? null,
      matchedConditions: evaluation.reasons,
    };
  }), [contextBySymbol, evaluationTime, scan.matches, scoreWeights, universe.meta?.asOf]);
  const visibleRows = useMemo(() => sortedResults(rows, sortKey, sortDirection), [rows, sortDirection, sortKey]);

  const baseStatus = researchStatus(universe.meta, universe.error);
  const statusMessages = [
    baseStatus.message,
    `${scan.matches.length} of ${scan.evaluatedCount} securities match in ${watchlists.selected?.name ?? "the active"} universe.`,
    universe.data?.universeCoverage.truncated
      ? `Cross-source coverage: ${universe.data.universeCoverage.processedCount}/${universe.data.universeCoverage.requestedCount} selected symbols (safety limit ${universe.data.universeCoverage.safetyLimit}).`
      : `Cross-source coverage: ${universe.data?.universeCoverage.returnedCount ?? 0}/${universe.data?.universeCoverage.requestedCount ?? requestedSymbols.length} selected symbols returned.`,
    universe.data?.partialFailures.length ? universe.data.partialFailures.join(" · ") : null,
    unavailableFields.length ? "Unavailable for part of this universe: " + unavailableFields.join(", ") : null,
    validationMessage,
    savedScanners.message,
  ].filter((message): message is string => Boolean(message));
  const status: ResearchDataStatus = { ...baseStatus, message: statusMessages.join(" · ") || undefined };
  const presets = [...builtInPresets, ...savedPresets];
  const optionsDisclosure = useMemo(() => optionsSourceDisclosure(universe.data), [universe.data]);
  const commitEditableRule = (nextRule: ScannerRule) => {
    const editable = isRuleGroup(nextRule) ? nextRule : { kind: "all" as const, rules: [nextRule] };
    setRuleTree(editable);
    setConditions(ruleConditions(editable, "custom"));
    setLogic(editable.kind);
    setActivePresetId(null);
  };

  if (!universe.data) {
    return <DataState loading={universe.loading} error={universe.error} onRetry={universe.reload} />;
  }

  return (
    <ScannerTerminal
      status={status}
      watchlists={watchlists.lists.map((list) => ({
        id: list.id,
        name: list.name,
        symbolCount: list.tickers.length,
      }))}
      selectedWatchlistId={watchlists.selectedId}
      onWatchlistChange={(watchlistId) => {
        watchlists.setSelectedId(watchlistId);
        setActivePresetId(null);
      }}
      optionsSource={optionsDisclosure}
      presets={presets}
      activePresetId={activePresetId}
      conditions={conditions}
      logic={logic}
      autoRefresh={autoRefresh}
      draft={draft}
      ruleTree={ruleTree}
      selectedRuleGroupPath={selectedRuleGroupPath}
      maximumRuleDepth={4}
      scoreWeights={scoreWeights}
      scanName={scanName}
      isRunning={universe.refreshing || savedScanners.busy}
      results={visibleRows}
      totalCount={visibleRows.length}
      durationMs={null}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onPresetSelect={(preset) => {
        const enginePreset = enginePresets.find((candidate) => candidate.id === preset.id);
        const savedPreset = savedScanners.records.find((candidate) => candidate.id === preset.id);
        try {
          const selectedRule = enginePreset?.rule ?? savedRules.get(preset.id)
            ?? conditionsToRule(preset.conditions);
          setActivePresetId(preset.id);
          setConditions(ruleConditions(selectedRule, preset.id));
          setLogic(isRuleGroup(selectedRule) ? selectedRule.kind : "all");
          setRuleTree(isRuleGroup(selectedRule) ? selectedRule : { kind: "all", rules: [selectedRule] });
          setSelectedRuleGroupPath([]);
          setScanName(preset.name);
          setScoreWeights(savedPreset?.definition.scoreWeights ?? DEFAULT_RESEARCH_PRIORITY_WEIGHTS);
          if (savedPreset?.definition.watchlistId
            && watchlists.lists.some((list) => list.id === savedPreset.definition.watchlistId)) {
            watchlists.setSelectedId(savedPreset.definition.watchlistId);
          }
          setAppliedRule(selectedRule);
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The preset is invalid.");
        }
      }}
      onDeleteSavedPreset={(presetId) => {
        void savedScanners.remove(presetId);
        if (activePresetId === presetId) setActivePresetId(null);
      }}
      onDraftChange={setDraft}
      onAddCondition={() => {
        try {
          if (ruleLeafCount(ruleTree) >= 12) throw new Error("Scanner queries are limited to 12 conditions.");
          commitEditableRule(addRuleToGroup(ruleTree, [], conditionToRule(draft)));
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The filter is invalid.");
        }
      }}
      onAddConditionToGroup={(groupPath) => {
        try {
          if (ruleLeafCount(ruleTree) >= 12) throw new Error("Scanner queries are limited to 12 conditions.");
          commitEditableRule(addRuleToGroup(ruleTree, groupPath, conditionToRule(draft)));
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The filter is invalid.");
        }
      }}
      onRemoveCondition={(conditionId) => {
        setConditions((current) => current.filter((condition) => condition.id !== conditionId));
        setActivePresetId(null);
      }}
      onRuleGroupSelect={setSelectedRuleGroupPath}
      onRuleGroupLogicChange={(path, nextLogic) => {
        try {
          commitEditableRule(replaceRuleAt(ruleTree, path, (rule) => {
            if (!isRuleGroup(rule)) throw new Error("Only AND/OR groups have selectable logic.");
            return { kind: nextLogic, rules: rule.rules };
          }));
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The group logic could not be changed.");
        }
      }}
      onRuleGroupAdd={(parentPath, nextLogic) => {
        try {
          const parent = ruleAt(ruleTree, parentPath);
          if (!isRuleGroup(parent)) throw new Error("Select an AND or OR group before nesting another group.");
          const nextPath = [...parentPath, parent.rules.length];
          commitEditableRule(addRuleToGroup(ruleTree, parentPath, { kind: nextLogic, rules: [] }));
          setSelectedRuleGroupPath(nextPath);
          setValidationMessage("Empty group added. Add at least one filter before running or saving.");
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The nested group could not be added.");
        }
      }}
      onRuleRemove={(path) => {
        try {
          commitEditableRule(removeRuleAt(ruleTree, path));
          setSelectedRuleGroupPath([]);
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The scanner rule could not be removed.");
        }
      }}
      onScoreWeightsChange={(weights) => {
        if (Object.values(weights).every((weight) => weight === 0)) {
          setValidationMessage("At least one research-priority weight must be positive.");
          return;
        }
        setScoreWeights(weights);
        setValidationMessage(null);
      }}
      onScanNameChange={setScanName}
      onLogicChange={(nextLogic) => {
        setLogic(nextLogic);
        commitEditableRule({ kind: nextLogic, rules: isRuleGroup(ruleTree) ? ruleTree.rules : [ruleTree] });
        setActivePresetId(null);
      }}
      onAutoRefreshChange={setAutoRefresh}
      onRun={() => {
        if (ruleLeafCount(ruleTree) === 0) {
          setValidationMessage("Add at least one condition before running the scanner.");
          return;
        }
        try {
          setAppliedRule(validateScannerRule(ruleTree));
          setValidationMessage(null);
          universe.reload();
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The scanner query is invalid.");
        }
      }}
      onSave={() => {
        if (ruleLeafCount(ruleTree) === 0) {
          setValidationMessage("Add at least one filter before saving a preset.");
          return;
        }
        try {
          const savedRule = validateScannerRule(ruleTree);
          const savedConditions = ruleConditions(savedRule, "saved");
          if (savedConditions.length === 0) throw new Error("This rule tree cannot be represented by the saved-scanner compatibility format.");
          const definition = {
            version: 1 as const,
            logic: isRuleGroup(savedRule) ? savedRule.kind : "all" as const,
            conditions: savedConditions,
            rule: savedRule,
            scoreWeights,
            watchlistId: watchlists.selectedId || null,
          };
          const existing = savedScanners.records.find((record) => record.id === activePresetId);
          const mutation = existing
            ? savedScanners.update(existing.id, { name: scanName, definition })
            : savedScanners.save(scanName, definition);
          void mutation
            .then((saved) => {
              setScanName(saved.name);
              setActivePresetId(saved.id);
            })
            .catch((error: unknown) => setValidationMessage(error instanceof Error ? error.message : "The scanner could not be saved."));
          setAppliedRule(savedRule);
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The preset cannot be saved.");
        }
      }}
      onDuplicate={() => {
        if (ruleLeafCount(ruleTree) === 0) return;
        try {
          const duplicatedName = copyName(scanName, savedScanners.records.map((record) => record.name));
          const duplicatedRule = validateScannerRule(ruleTree);
          const duplicatedConditions = ruleConditions(duplicatedRule, "duplicate");
          if (duplicatedConditions.length === 0) throw new Error("This rule tree cannot be duplicated in the saved-scanner format.");
          void savedScanners.save(duplicatedName, {
            version: 1,
            logic: isRuleGroup(duplicatedRule) ? duplicatedRule.kind : "all",
            conditions: duplicatedConditions,
            rule: duplicatedRule,
            scoreWeights,
            watchlistId: watchlists.selectedId || null,
          }, `Duplicate of ${scanName.trim() || "Untitled scan"}.`)
            .then((saved) => {
              setScanName(saved.name);
              setActivePresetId(saved.id);
              setAppliedRule(duplicatedRule);
            })
            .catch((error: unknown) => setValidationMessage(error instanceof Error ? error.message : "The scanner could not be duplicated."));
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The scanner could not be duplicated.");
        }
      }}
      onClear={() => {
        setConditions([]);
        setRuleTree({ kind: "all", rules: [] });
        setSelectedRuleGroupPath([]);
        setActivePresetId(null);
        setValidationMessage(null);
      }}
      onSort={(key) => {
        if (sortKey === key) setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
        else {
          setSortKey(key);
          setSortDirection(key === "symbol" ? "ascending" : "descending");
        }
      }}
      onTickerSelect={(symbol, result) => onTickerSelect(symbol, {
        ticker: symbol,
        scanName,
        rule: appliedRule,
        evaluatedAt: evaluationTime,
        researchPriority: result.researchPriority ?? null,
        reasons: result.matchedConditions,
      })}
      onResearchSelect={onResearchSelect}
      onExport={() => exportResults(visibleRows)}
    />
  );
}
