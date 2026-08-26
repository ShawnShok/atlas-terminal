"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { ScannerCondition } from "@/lib/research";
import type { ResearchPriorityWeights, ScannerRule } from "@/lib/scanner";

export interface SavedScannerDefinition {
  readonly version: 1;
  readonly logic: "all" | "any";
  readonly conditions: readonly ScannerCondition[];
  /** Provider-neutral rule JSON used to preserve rules that cannot be losslessly rebuilt from the UI rows. */
  readonly rule?: ScannerRule;
  readonly scoreWeights?: ResearchPriorityWeights;
  readonly watchlistId?: string | null;
}

export interface SavedScannerRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly definition: SavedScannerDefinition;
  readonly updatedAt?: string;
}

export interface SavedScannerUpdate {
  readonly name?: string;
  readonly description?: string | null;
  readonly definition?: SavedScannerDefinition;
}

export type SavedScannerPersistenceState = "checking" | "durable" | "session" | "unavailable";

interface ApiPayload<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly message: string };
}

const MAX_SCANNER_CONDITIONS = 12;
const MAX_RULE_DEPTH = 4;
const MAX_RULE_NODES = 40;
const MAX_SCALAR_MAGNITUDE = 1_000_000_000_000_000;

const FIELDS = new Set([
  "price", "market-cap", "volume", "average-volume", "relative-volume", "daily-change",
  "weekly-change", "monthly-change", "sma-distance", "ema-distance", "vwap-distance", "rsi",
  "distance-52w-high", "distance-52w-low", "gap-percent", "recent-news-minutes",
  "daily-relative-volume", "intraday-relative-volume", "distance-recent-high",
  "volume-acceleration", "distance-day-high", "distance-day-low", "new-intraday-high", "new-intraday-low",
  "price-vs-vwap", "price-vs-sma20", "price-vs-sma50", "price-vs-sma200", "price-vs-ema20", "price-vs-ema50",
  "price-vs-recent-high", "price-vs-recent-low", "news-headline", "news-category", "news-keyword",
  "event-within-days", "earnings-within-days", "confirmed-event-within-days", "investor-event-within-days",
  "option-volume", "option-open-interest", "option-volume-oi", "option-call-volume", "option-put-volume",
  "option-call-open-interest", "option-put-open-interest", "option-call-put-volume", "option-call-put-open-interest",
  "option-average-iv", "option-min-dte", "option-max-dte",
  "option-highest-contract-volume", "option-highest-contract-open-interest", "option-volume-relative-underlying",
]);
const OPERATORS = new Set(["greater-than", "greater-than-or-equal", "less-than", "less-than-or-equal", "equal", "between", "in"]);
const NUMERIC_RULE_FIELDS = new Set([
  "price", "marketCap", "volume", "averageVolume", "relativeVolume", "dailyChangePercent",
  "weeklyChangePercent", "monthlyChangePercent", "rsi", "gapPercent", "percentBelow52WeekHigh",
  "percentAbove52WeekLow", "percentBelowRecentHigh20", "distanceFromVwapPercent", "dailyRelativeVolume",
  "intradayRelativeVolume", "optionVolume", "optionOpenInterest", "optionVolumeToOpenInterest",
  "percentBelowDayHigh", "percentAboveDayLow", "volumeAccelerationRatio", "newIntradayHigh", "newIntradayLow",
  "optionCallVolume", "optionPutVolume", "optionCallOpenInterest", "optionPutOpenInterest",
  "optionCallToPutVolumeRatio", "optionCallToPutOpenInterestRatio", "optionAverageImpliedVolatility",
  "optionMinimumDte", "optionMaximumDte",
  "optionHighestContractVolume", "optionHighestContractOpenInterest", "optionVolumeRelativeToUnderlying",
]);
const NUMERIC_RULE_OPERATORS = new Set(["gt", "gte", "lt", "lte", "eq", "between", "absolute-gte"]);
const PRICE_REFERENCES = new Set(["sma20", "sma50", "sma200", "ema20", "ema50", "vwap", "recentHigh20", "recentLow20"]);
const PRICE_RELATIONS = new Set(["above", "at-or-above", "below", "at-or-below"]);
const MARKET_CAP_BUCKETS = new Set(["micro", "small", "mid", "large", "mega"]);
const SCORE_COMPONENTS = ["priceMovement", "relativeVolume", "technicalConfirmation", "newsRecency", "eventProximity", "optionsActivity"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_SCALAR_MAGNITUDE;
}

function isBoundedScalar(value: unknown): value is string | number {
  return isBoundedNumber(value) || (typeof value === "string" && value.trim().length > 0 && value.length <= 200);
}

function isBoundedStringList(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 20
    && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 80);
}

function isSerializedScannerRule(
  value: unknown,
  depth = 0,
  budget: { nodes: number } = { nodes: 0 },
): value is ScannerRule {
  if (!isRecord(value) || depth > MAX_RULE_DEPTH || budget.nodes >= MAX_RULE_NODES) return false;
  budget.nodes += 1;

  if (value.kind === "numeric") {
    if (!hasOnlyKeys(value, ["kind", "field", "operator", "value", "upperValue"])) return false;
    if (!NUMERIC_RULE_FIELDS.has(String(value.field)) || !NUMERIC_RULE_OPERATORS.has(String(value.operator)) || !isBoundedNumber(value.value)) return false;
    if (value.operator === "between") {
      return isBoundedNumber(value.upperValue) && value.upperValue >= value.value;
    }
    return value.upperValue === undefined;
  }

  if (value.kind === "price-relation") {
    return hasOnlyKeys(value, ["kind", "reference", "relation"])
      && PRICE_REFERENCES.has(String(value.reference))
      && PRICE_RELATIONS.has(String(value.relation));
  }

  if (value.kind === "market-cap") {
    if (!hasOnlyKeys(value, ["kind", "buckets"]) || !Array.isArray(value.buckets) || value.buckets.length < 1 || value.buckets.length > 5) return false;
    return value.buckets.every((bucket) => MARKET_CAP_BUCKETS.has(String(bucket)))
      && new Set(value.buckets).size === value.buckets.length;
  }

  if (value.kind === "recent-news") {
    return hasOnlyKeys(value, ["kind", "withinMinutes", "calendarDay", "headlineIncludes", "categories", "keywords"])
      && isBoundedNumber(value.withinMinutes)
      && value.withinMinutes >= 0
      && value.withinMinutes <= 525_600
      && (value.calendarDay === undefined || value.calendarDay === "today")
      && (value.headlineIncludes === undefined || (typeof value.headlineIncludes === "string" && value.headlineIncludes.trim().length > 0 && value.headlineIncludes.length <= 120))
      && (value.categories === undefined || isBoundedStringList(value.categories))
      && (value.keywords === undefined || isBoundedStringList(value.keywords));
  }

  if (value.kind === "catalyst-window") {
    if (!hasOnlyKeys(value, ["kind", "withinDays", "catalystTypes", "statuses"])
      || !isBoundedNumber(value.withinDays) || value.withinDays < 0 || value.withinDays > 3_650) return false;
    return (value.catalystTypes === undefined || isBoundedStringList(value.catalystTypes))
      && (value.statuses === undefined || isBoundedStringList(value.statuses));
  }

  if (value.kind === "all" || value.kind === "any") {
    return hasOnlyKeys(value, ["kind", "rules"])
      && Array.isArray(value.rules)
      && value.rules.length >= 1
      && value.rules.length <= MAX_SCANNER_CONDITIONS
      && value.rules.every((rule) => isSerializedScannerRule(rule, depth + 1, budget));
  }

  if (value.kind === "not") {
    return hasOnlyKeys(value, ["kind", "rule"])
      && isSerializedScannerRule(value.rule, depth + 1, budget);
  }

  return false;
}

export function parseSavedScannerDefinition(value: unknown): SavedScannerDefinition | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "logic", "conditions", "rule", "scoreWeights", "watchlistId"])) return null;
  if (value.version !== 1 || (value.logic !== "all" && value.logic !== "any")
    || !Array.isArray(value.conditions) || value.conditions.length < 1 || value.conditions.length > MAX_SCANNER_CONDITIONS) return null;

  const conditions = value.conditions.flatMap((candidate): ScannerCondition[] => {
    if (!isRecord(candidate) || !hasOnlyKeys(candidate, ["id", "field", "operator", "value", "secondaryValue", "unit"])) return [];
    if (typeof candidate.id !== "string" || candidate.id.trim().length < 1 || candidate.id.length > 120
      || !FIELDS.has(String(candidate.field)) || !OPERATORS.has(String(candidate.operator))
      || !isBoundedScalar(candidate.value)) return [];
    if (candidate.secondaryValue !== undefined && !isBoundedScalar(candidate.secondaryValue)) return [];
    if (candidate.unit !== undefined && (typeof candidate.unit !== "string" || candidate.unit.trim().length < 1 || candidate.unit.length > 24)) return [];
    return [{
      id: candidate.id,
      field: candidate.field as ScannerCondition["field"],
      operator: candidate.operator as ScannerCondition["operator"],
      value: candidate.value,
      ...(candidate.secondaryValue === undefined ? {} : { secondaryValue: candidate.secondaryValue as string | number }),
      ...(candidate.unit === undefined ? {} : { unit: candidate.unit }),
    }];
  });
  if (conditions.length !== value.conditions.length) return null;
  if (value.rule !== undefined && !isSerializedScannerRule(value.rule)) return null;
  let scoreWeights: ResearchPriorityWeights | undefined;
  const rawScoreWeights = value.scoreWeights;
  if (rawScoreWeights !== undefined) {
    if (!isRecord(rawScoreWeights) || !hasOnlyKeys(rawScoreWeights, SCORE_COMPONENTS)
      || SCORE_COMPONENTS.some((component) => !isBoundedNumber(rawScoreWeights[component]) || Number(rawScoreWeights[component]) < 0)
      || SCORE_COMPONENTS.reduce((sum, component) => sum + Number(rawScoreWeights[component]), 0) <= 0) return null;
    scoreWeights = Object.fromEntries(SCORE_COMPONENTS.map((component) => [component, Number(rawScoreWeights[component])])) as unknown as ResearchPriorityWeights;
  }
  const watchlistId = value.watchlistId;
  if (watchlistId !== undefined && watchlistId !== null
    && (typeof watchlistId !== "string" || !watchlistId.trim() || watchlistId.length > 64)) return null;
  return {
    version: 1,
    logic: value.logic,
    conditions,
    ...(value.rule === undefined ? {} : { rule: value.rule }),
    ...(scoreWeights === undefined ? {} : { scoreWeights }),
    ...(watchlistId === undefined ? {} : { watchlistId: watchlistId === null ? null : watchlistId.trim() }),
  };
}

export function parseSavedScannerRecord(value: unknown): SavedScannerRecord | null {
  if (!isRecord(value)) return null;
  const parsed = parseSavedScannerDefinition(value.definition);
  if (typeof value.id !== "string" || value.id.trim().length < 1 || value.id.length > 128
    || typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 80
    || (value.description !== undefined && value.description !== null && (typeof value.description !== "string" || value.description.length > 500))
    || !parsed) return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : null,
    definition: parsed,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...init,
  });
  const payload = await response.json() as ApiPayload<T>;
  if (!payload.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Saved scanner request failed.");
  return payload.data;
}

function mutationUnavailableMessage(state: SavedScannerPersistenceState): string {
  return state === "checking"
    ? "Saved scanner persistence is still being checked. Try again in a moment."
    : "Saved scanners are unavailable. Reload after restoring authentication or network access.";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function putFirst(current: readonly SavedScannerRecord[], next: SavedScannerRecord): readonly SavedScannerRecord[] {
  return [next, ...current.filter((item) => item.id !== next.id && item.name !== next.name)];
}

const SCANNER_SESSION_STORAGE_KEY = "atlas.saved-scanners.session.v1";
let sessionScannerRecords: readonly SavedScannerRecord[] = [];
let sessionScannerStoreHydrated = false;
const sessionScannerListeners = new Set<() => void>();

function sessionScannerSnapshot(): readonly SavedScannerRecord[] {
  return sessionScannerRecords;
}

function subscribeSessionScanners(listener: () => void): () => void {
  sessionScannerListeners.add(listener);
  return () => sessionScannerListeners.delete(listener);
}

function publishSessionScanners(records: readonly SavedScannerRecord[]): void {
  sessionScannerRecords = records;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(SCANNER_SESSION_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // The in-memory external store remains the fallback when storage is blocked.
    }
  }
  sessionScannerListeners.forEach((listener) => listener());
}

function updateSessionScanners(
  updater: (current: readonly SavedScannerRecord[]) => readonly SavedScannerRecord[],
): void {
  publishSessionScanners(updater(sessionScannerRecords));
}

function hydrateSessionScanners(): void {
  if (sessionScannerStoreHydrated || typeof window === "undefined") return;
  sessionScannerStoreHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(SCANNER_SESSION_STORAGE_KEY);
    if (!raw) return;
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values)) return;
    const records = values.flatMap((value) => {
      const parsed = parseSavedScannerRecord(value);
      return parsed && parsed.id.startsWith("session-") ? [parsed] : [];
    });
    if (records.length === values.length) publishSessionScanners(records);
  } catch {
    // Ignore malformed or inaccessible storage and keep the safe empty store.
  }
}

export function useSavedScanners() {
  const sessionRecords = useSyncExternalStore(
    subscribeSessionScanners,
    sessionScannerSnapshot,
    sessionScannerSnapshot,
  );
  const [durableRecords, setDurableRecords] = useState<readonly SavedScannerRecord[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [persistenceState, setPersistenceState] = useState<SavedScannerPersistenceState>("checking");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setConfigured(null);
    setPersistenceState("checking");
    setError(null);
    setNotice(null);
    try {
      const status = await request<{ configured: boolean }>("/api/personal?resource=status");
      if (typeof status.configured !== "boolean") throw new Error("Saved scanner persistence returned an invalid status.");
      if (status.configured === false) {
        setConfigured(false);
        setPersistenceState("session");
        setNotice("Session mode · connect PostgreSQL to persist saved scanners.");
        return;
      }

      const values = await request<readonly unknown[]>("/api/personal?resource=scanners");
      if (!Array.isArray(values)) throw new Error("Saved scanner persistence returned an invalid collection.");
      setDurableRecords(values.flatMap((value) => {
        const parsed = parseSavedScannerRecord(value);
        return parsed ? [parsed] : [];
      }));
      setConfigured(true);
      setPersistenceState("durable");
    } catch (cause) {
      setConfigured(null);
      setPersistenceState("unavailable");
      setError(errorMessage(cause, "Saved scanners are unavailable."));
    }
  }, []);

  useEffect(() => {
    hydrateSessionScanners();
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const records = persistenceState === "durable" || persistenceState === "unavailable"
    ? durableRecords
    : sessionRecords;

  const save = useCallback(async (
    name: string,
    nextDefinition: SavedScannerDefinition,
    description: string | null = "Custom multi-source research screen.",
  ) => {
    setBusy(true);
    setError(null);
    try {
      const normalizedName = name.trim().slice(0, 80) || "Untitled scan";
      if (description !== null && description.length > 500) throw new Error("Scanner descriptions are limited to 500 characters.");
      const normalizedDescription = description === null ? null : description.trim() || null;
      const parsedDefinition = parseSavedScannerDefinition(nextDefinition);
      if (!parsedDefinition) throw new Error("The scanner definition is invalid or exceeds the saved-scanner limits.");

      if (persistenceState === "session") {
        const existing = records.find((item) => item.name === normalizedName);
        const next: SavedScannerRecord = {
          id: existing?.id ?? `session-${crypto.randomUUID()}`,
          name: normalizedName,
          description: normalizedDescription,
          definition: parsedDefinition,
          updatedAt: new Date().toISOString(),
        };
        updateSessionScanners((current) => putFirst(current, next));
        setNotice(existing
          ? "Session scanner updated; connect PostgreSQL for durability."
          : "Scanner saved for this session; connect PostgreSQL for durability.");
        return next;
      }
      if (persistenceState !== "durable") throw new Error(mutationUnavailableMessage(persistenceState));

      const saved = await request<unknown>("/api/personal?resource=scanners", {
        method: "POST",
        body: JSON.stringify({ name: normalizedName, description: normalizedDescription, definition: parsedDefinition }),
      });
      const parsed = parseSavedScannerRecord(saved);
      if (!parsed) throw new Error("Saved scanner response was invalid.");
      setDurableRecords((current) => putFirst(current, parsed));
      setNotice("Scanner saved to PostgreSQL.");
      return parsed;
    } catch (cause) {
      const message = errorMessage(cause, "The scanner could not be saved.");
      setError(message);
      throw cause instanceof Error ? cause : new Error(message);
    } finally {
      setBusy(false);
    }
  }, [persistenceState, records]);

  const update = useCallback(async (id: string, changes: SavedScannerUpdate) => {
    setBusy(true);
    setError(null);
    try {
      if (!id.trim()) throw new Error("A saved scanner identifier is required.");
      if (changes.name === undefined && changes.description === undefined && changes.definition === undefined) {
        throw new Error("At least one saved scanner field must be supplied.");
      }

      const payload: SavedScannerUpdate = {
        ...(changes.name === undefined ? {} : { name: changes.name.trim().slice(0, 80) }),
        ...(changes.description === undefined ? {} : { description: changes.description === null ? null : changes.description.trim() || null }),
        ...(changes.definition === undefined ? {} : { definition: parseSavedScannerDefinition(changes.definition) ?? undefined }),
      };
      if (payload.name !== undefined && !payload.name) throw new Error("Scanner names cannot be empty.");
      if (changes.description !== null && changes.description !== undefined && changes.description.length > 500) throw new Error("Scanner descriptions are limited to 500 characters.");
      if (changes.definition !== undefined && payload.definition === undefined) throw new Error("The scanner definition is invalid or exceeds the saved-scanner limits.");

      if (persistenceState === "session") {
        const existing = records.find((item) => item.id === id);
        if (!existing) throw new Error("The selected session scanner is no longer available.");
        const next: SavedScannerRecord = { ...existing, ...payload, updatedAt: new Date().toISOString() };
        updateSessionScanners((current) => putFirst(current, next));
        setNotice("Session scanner updated; connect PostgreSQL for durability.");
        return next;
      }
      if (persistenceState !== "durable") throw new Error(mutationUnavailableMessage(persistenceState));

      const saved = await request<unknown>(`/api/personal?resource=scanners&id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const parsed = parseSavedScannerRecord(saved);
      if (!parsed) throw new Error("Updated scanner response was invalid.");
      setDurableRecords((current) => putFirst(current, parsed));
      setNotice("Saved scanner updated.");
      return parsed;
    } catch (cause) {
      const message = errorMessage(cause, "The scanner could not be updated.");
      setError(message);
      throw cause instanceof Error ? cause : new Error(message);
    } finally {
      setBusy(false);
    }
  }, [persistenceState, records]);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      if (persistenceState === "session") {
        updateSessionScanners((current) => current.filter((item) => item.id !== id));
        setNotice("Session scanner deleted.");
        return true;
      }
      if (persistenceState !== "durable") throw new Error(mutationUnavailableMessage(persistenceState));
      await request<{ deleted: boolean }>(`/api/personal?resource=scanners&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setDurableRecords((current) => current.filter((item) => item.id !== id));
      setNotice("Saved scanner deleted.");
      return true;
    } catch (cause) {
      setError(errorMessage(cause, "Saved scanner could not be deleted."));
      return false;
    } finally {
      setBusy(false);
    }
  }, [persistenceState]);

  const clearError = useCallback(() => setError(null), []);
  const clearMessage = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    records,
    configured,
    persistenceState,
    busy,
    error,
    message: error ?? notice,
    save,
    update,
    remove,
    reload: load,
    clearError,
    clearMessage,
  } as const;
}
