"use client";

import { useMemo, useRef, useState } from "react";

import { ScannerTerminal, type ScannerSortKey } from "@/components/research";
import { useResearchData } from "@/hooks/useResearchData";
import {
  exponentialMovingAverage,
  relativeStrengthIndex,
  simpleMovingAverage,
} from "@/lib/indicators";
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
  evaluateScannerRule,
  runScanner,
  scannerFieldValue,
  type MarketCapBucket,
  type ScannerNumericField,
  type ScannerPreset as EngineScannerPreset,
  type ScannerRule,
  type ScannerSecurity,
} from "@/lib/scanner";
import type { MarketSnapshotRow, SecurityResearchBundle } from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

interface ScannerUniverseBundle {
  readonly universe: readonly string[];
  readonly snapshots: readonly MarketSnapshotRow[];
  readonly scope: string;
}

export interface LiveScannerPanelProps {
  readonly ticker: string;
  readonly onTickerSelect: (ticker: string) => void;
}

const EMPTY_PARAMS = {} as const;
const DEFAULT_DRAFT: ScannerCondition = {
  id: "draft",
  field: "price",
  operator: "greater-than-or-equal",
  value: 5,
  unit: "USD",
};
const DEFAULT_RULE: ScannerRule = {
  kind: "numeric",
  field: "price",
  operator: "gte",
  value: 5,
};
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
  "daily-change": "dailyChangePercent",
  "weekly-change": "weeklyChangePercent",
  "monthly-change": "monthlyChangePercent",
  "vwap-distance": "distanceFromVwapPercent",
  rsi: "rsi",
  "distance-52w-high": "percentBelow52WeekHigh",
  "distance-52w-low": "percentAbove52WeekLow",
  "gap-percent": "gapPercent",
  "option-volume-oi": "optionVolumeToOpenInterest",
};

const RESEARCH_FIELDS: Readonly<Partial<Record<ScannerNumericField, ScannerField>>> = {
  price: "price",
  marketCap: "market-cap",
  volume: "volume",
  averageVolume: "average-volume",
  relativeVolume: "relative-volume",
  dailyChangePercent: "daily-change",
  weeklyChangePercent: "weekly-change",
  monthlyChangePercent: "monthly-change",
  rsi: "rsi",
  gapPercent: "gap-percent",
  percentBelow52WeekHigh: "distance-52w-high",
  percentAbove52WeekLow: "distance-52w-low",
  distanceFromVwapPercent: "vwap-distance",
  optionVolumeToOpenInterest: "option-volume-oi",
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
  if (condition.field === "event-within-days" || condition.field === "earnings-within-days") {
    return {
      kind: "catalyst-window",
      withinDays: nonNegativeValue(condition.value, "Catalyst window"),
      catalystTypes: condition.field === "earnings-within-days"
        ? ["earnings", "earnings-release"]
        : undefined,
    };
  }
  if (condition.field === "sma-distance" || condition.field === "ema-distance") {
    const threshold = numberValue(condition.value, "Moving-average distance");
    if (threshold !== 0) {
      throw new Error("Moving-average distance currently supports a zero threshold (above or below) only.");
    }
    const reference = condition.field === "sma-distance" ? "sma20" as const : "ema20" as const;
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

function conditionsToRule(conditions: readonly ScannerCondition[]): ScannerRule {
  return { kind: "all", rules: conditions.map(conditionToRule) };
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
    return [{ id: prefix, field: "recent-news-minutes", operator: "less-than-or-equal", value: rule.withinMinutes, unit: "MIN" }];
  }
  if (rule.kind === "catalyst-window") {
    const earnings = rule.catalystTypes?.some((type) => type.toLowerCase().includes("earning"));
    return [{ id: prefix, field: earnings ? "earnings-within-days" : "event-within-days", operator: "less-than-or-equal", value: rule.withinDays, unit: "DAYS" }];
  }
  if (rule.kind !== "price-relation") return [];
  return [{
    id: prefix,
    field: "price",
    operator: rule.relation === "above" ? "greater-than" : rule.relation === "at-or-above"
      ? "greater-than-or-equal" : rule.relation === "below" ? "less-than" : "less-than-or-equal",
    value: rule.reference.toUpperCase(),
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

function latestValue(values: readonly (number | null)[]): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index];
  }
  return null;
}

function historicalChange(closes: readonly number[], periods: number): number | null {
  if (closes.length <= periods) return null;
  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 1 - periods];
  return previous === 0 ? null : (current - previous) / previous * 100;
}

function scannerSecurity(
  snapshot: MarketSnapshotRow,
  enrichment: SecurityResearchBundle | null,
): ScannerSecurity {
  const isEnriched = enrichment?.snapshot.symbol === snapshot.symbol;
  const bars = isEnriched ? enrichment.bars : [];
  const closes = bars.map((bar) => bar.close);
  const quote = isEnriched ? enrichment.snapshot.quote : null;
  const recentBars = bars.slice(-21, -1);
  const currentPrice = snapshot.lastPrice ?? quote?.lastPrice ?? null;
  const averageVolume = quote?.averageVolume ?? null;
  return {
    symbol: snapshot.symbol,
    price: currentPrice,
    marketCap: isEnriched ? enrichment.details.marketCap ?? quote?.marketCap ?? null : null,
    volume: snapshot.volume,
    averageVolume,
    relativeVolume: snapshot.volume !== null && averageVolume !== null && averageVolume > 0
      ? snapshot.volume / averageVolume
      : null,
    dailyChangePercent: snapshot.changePercent,
    weeklyChangePercent: historicalChange(closes, 5),
    monthlyChangePercent: historicalChange(closes, 21),
    rsi: latestValue(relativeStrengthIndex(closes)),
    gapPercent: quote?.open !== null && quote?.open !== undefined
      && quote.previousClose !== null && quote.previousClose !== 0
      ? (quote.open - quote.previousClose) / quote.previousClose * 100
      : null,
    high52Week: bars.length ? Math.max(...bars.map((bar) => bar.high)) : null,
    low52Week: bars.length ? Math.min(...bars.map((bar) => bar.low)) : null,
    sma20: latestValue(simpleMovingAverage(closes, 20)),
    sma50: latestValue(simpleMovingAverage(closes, 50)),
    sma200: latestValue(simpleMovingAverage(closes, 200)),
    ema20: latestValue(exponentialMovingAverage(closes, 20)),
    ema50: latestValue(exponentialMovingAverage(closes, 50)),
    vwap: quote?.vwap ?? null,
    recentHigh20: recentBars.length === 20 ? Math.max(...recentBars.map((bar) => bar.high)) : null,
    recentLow20: recentBars.length === 20 ? Math.min(...recentBars.map((bar) => bar.low)) : null,
    optionVolume: null,
    optionOpenInterest: null,
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
    return result[key];
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

export function LiveScannerPanel({ ticker, onTickerSelect }: LiveScannerPanelProps) {
  const enginePresets = useMemo(() => createScannerPresets(), []);
  const builtInPresets = useMemo(() => enginePresets.map(toResearchPreset), [enginePresets]);
  const [savedPresets, setSavedPresets] = useState<ResearchScannerPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<ScannerCondition[]>([DEFAULT_CONDITION]);
  const [appliedRule, setAppliedRule] = useState<ScannerRule>(DEFAULT_RULE);
  const [draft, setDraft] = useState<ScannerCondition>(DEFAULT_DRAFT);
  const [scanName, setScanName] = useState("Price Screen");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ScannerSortKey>("changePercent");
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const idSequence = useRef(0);
  const savedRules = useRef(new Map<string, ScannerRule>());

  const universe = useResearchData<ScannerUniverseBundle>("scanner", EMPTY_PARAMS, {
    refreshMs: 30_000,
    retainMs: 20_000,
  });
  const securityParams = useMemo(() => ({ ticker, range: "1Y" }), [ticker]);
  const security = useResearchData<SecurityResearchBundle>("security", securityParams, {
    refreshMs: 60_000,
    retainMs: 30_000,
  });
  const scannerSecurities = useMemo(() => (universe.data?.snapshots ?? []).map((snapshot) =>
    scannerSecurity(snapshot, security.data ?? null)), [security.data, universe.data?.snapshots]);
  const evaluationTime = universe.meta?.asOf ?? security.meta?.asOf ?? new Date().toISOString();
  const scan = useMemo(() => runScanner(scannerSecurities, appliedRule, evaluationTime), [appliedRule, evaluationTime, scannerSecurities]);
  const unavailableFields = useMemo(() => [...new Set(scannerSecurities.flatMap((item) =>
    evaluateScannerRule(item, appliedRule, evaluationTime).missingFields))].sort(),
  [appliedRule, evaluationTime, scannerSecurities]);
  const enrichment = security.data;
  const rows = useMemo(() => scan.matches.map(({ security: item, evaluation }): ScannerResult => {
    const isEnriched = enrichment?.snapshot.symbol === item.symbol;
    return {
      symbol: item.symbol,
      companyName: isEnriched ? enrichment.details.name : "Name unavailable",
      sector: isEnriched ? enrichment.details.sicDescription : null,
      price: item.price,
      changePercent: item.dailyChangePercent ?? null,
      volume: item.volume ?? null,
      relativeVolume: scannerFieldValue(item, "relativeVolume"),
      marketCap: item.marketCap ?? null,
      latestNewsAt: null,
      nextEventAt: null,
      nextEventLabel: null,
      optionActivityScore: null,
      matchedConditions: evaluation.observations,
    };
  }), [enrichment, scan.matches]);
  const visibleRows = useMemo(() => sortedResults(rows, sortKey, sortDirection), [rows, sortDirection, sortKey]);

  const baseStatus = researchStatus(universe.meta, universe.error);
  const statusMessages = [
    baseStatus.message,
    security.error ? "Active-ticker history unavailable: " + security.error.message : null,
    unavailableFields.length ? "Unavailable for part of this universe: " + unavailableFields.join(", ") : null,
    validationMessage,
  ].filter((message): message is string => Boolean(message));
  const status: ResearchDataStatus = { ...baseStatus, message: statusMessages.join(" · ") || undefined };
  const presets = [...builtInPresets, ...savedPresets];

  if (!universe.data) {
    return <DataState loading={universe.loading} error={universe.error} onRetry={universe.reload} />;
  }

  return (
    <ScannerTerminal
      status={status}
      presets={presets}
      activePresetId={activePresetId}
      conditions={conditions}
      draft={draft}
      scanName={scanName}
      isRunning={universe.refreshing || security.refreshing}
      results={visibleRows}
      totalCount={visibleRows.length}
      durationMs={null}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onPresetSelect={(preset) => {
        const enginePreset = enginePresets.find((candidate) => candidate.id === preset.id);
        try {
          const selectedRule = enginePreset?.rule ?? savedRules.current.get(preset.id)
            ?? conditionsToRule(preset.conditions);
          setActivePresetId(preset.id);
          setConditions([...preset.conditions]);
          setAppliedRule(selectedRule);
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The preset is invalid.");
        }
      }}
      onDeleteSavedPreset={(presetId) => {
        setSavedPresets((current) => current.filter((preset) => preset.id !== presetId));
        savedRules.current.delete(presetId);
        if (activePresetId === presetId) setActivePresetId(null);
      }}
      onDraftChange={setDraft}
      onAddCondition={() => {
        try {
          conditionToRule(draft);
          idSequence.current += 1;
          setConditions((current) => [...current, { ...draft, id: "condition-" + idSequence.current }]);
          setActivePresetId(null);
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The filter is invalid.");
        }
      }}
      onRemoveCondition={(conditionId) => {
        setConditions((current) => current.filter((condition) => condition.id !== conditionId));
        setActivePresetId(null);
      }}
      onScanNameChange={setScanName}
      onRun={() => {
        try {
          const enginePreset = enginePresets.find((preset) => preset.id === activePresetId);
          setAppliedRule(enginePreset?.rule ?? conditionsToRule(conditions));
          setValidationMessage(null);
          universe.reload();
          security.reload();
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The scanner query is invalid.");
        }
      }}
      onSave={() => {
        if (!conditions.length) {
          setValidationMessage("Add at least one filter before saving a preset.");
          return;
        }
        try {
          const enginePreset = enginePresets.find((preset) => preset.id === activePresetId);
          const savedRule = enginePreset?.rule ?? conditionsToRule(conditions);
          idSequence.current += 1;
          const saved: ResearchScannerPreset = {
            id: "saved-" + idSequence.current,
            name: scanName.trim() || "Untitled scan",
            description: "Session-only custom research screen.",
            conditions: [...conditions],
            isSaved: true,
          };
          savedRules.current.set(saved.id, savedRule);
          setSavedPresets((current) => [...current, saved]);
          setActivePresetId(saved.id);
          setAppliedRule(savedRule);
          setValidationMessage(null);
        } catch (error) {
          setValidationMessage(error instanceof Error ? error.message : "The preset cannot be saved.");
        }
      }}
      onClear={() => {
        setConditions([]);
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
      onTickerSelect={onTickerSelect}
    />
  );
}
