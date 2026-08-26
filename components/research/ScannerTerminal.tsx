"use client";

import {
  describeScannerCondition,
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatRatio,
  valueTone,
} from "@/lib/research";
import {
  DEFAULT_RESEARCH_PRIORITY_WEIGHTS,
  type ResearchPriorityComponent,
  type ResearchPriorityWeights,
  type ScannerRule,
} from "@/lib/scanner";
import type {
  ResearchDataStatus,
  ScannerCondition,
  ScannerField,
  ScannerOperator,
  ScannerPreset,
  ScannerResult,
} from "@/lib/research/types";
import type { DataQuality } from "@/types";
import { EmptyResearchState, ResearchFrame } from "./ResearchFrame";

const SCANNER_FIELDS: readonly { group: string; value: ScannerField; label: string }[] = [
  { group: "PRICE", value: "price", label: "Price" },
  { group: "FUNDAMENTAL", value: "market-cap", label: "Market cap" },
  { group: "VOLUME", value: "volume", label: "Volume" },
  { group: "VOLUME", value: "average-volume", label: "Average volume" },
  { group: "VOLUME", value: "relative-volume", label: "Relative volume" },
  { group: "VOLUME", value: "daily-relative-volume", label: "Daily RVOL" },
  { group: "VOLUME", value: "intraday-relative-volume", label: "Intraday RVOL (when available)" },
  { group: "VOLUME", value: "volume-acceleration", label: "5m volume acceleration (3 bars / prior 3)" },
  { group: "PERFORMANCE", value: "daily-change", label: "Daily change" },
  { group: "PERFORMANCE", value: "weekly-change", label: "Weekly change" },
  { group: "PERFORMANCE", value: "monthly-change", label: "Monthly change" },
  { group: "TECHNICAL", value: "sma-distance", label: "Distance from SMA" },
  { group: "TECHNICAL", value: "ema-distance", label: "Distance from EMA" },
  { group: "TECHNICAL", value: "vwap-distance", label: "Distance from VWAP" },
  { group: "TECHNICAL", value: "rsi", label: "RSI" },
  { group: "TECHNICAL", value: "distance-day-high", label: "Distance below day high" },
  { group: "TECHNICAL", value: "distance-day-low", label: "Distance above day low" },
  { group: "TECHNICAL", value: "distance-52w-high", label: "Distance from 52W high" },
  { group: "TECHNICAL", value: "distance-52w-low", label: "Distance from 52W low" },
  { group: "TECHNICAL", value: "distance-recent-high", label: "Distance below recent 20-session high" },
  { group: "TECHNICAL", value: "price-vs-vwap", label: "Price versus VWAP" },
  { group: "TECHNICAL", value: "price-vs-sma20", label: "Price versus SMA 20" },
  { group: "TECHNICAL", value: "price-vs-sma50", label: "Price versus SMA 50" },
  { group: "TECHNICAL", value: "price-vs-sma200", label: "Price versus SMA 200" },
  { group: "TECHNICAL", value: "price-vs-ema20", label: "Price versus EMA 20" },
  { group: "TECHNICAL", value: "price-vs-ema50", label: "Price versus EMA 50" },
  { group: "TECHNICAL", value: "price-vs-recent-high", label: "Price versus recent high" },
  { group: "TECHNICAL", value: "price-vs-recent-low", label: "Price versus recent low" },
  { group: "TECHNICAL", value: "new-intraday-high", label: "Latest completed 5m bar made new high (1=yes)" },
  { group: "TECHNICAL", value: "new-intraday-low", label: "Latest completed 5m bar made new low (1=yes)" },
  { group: "GAP", value: "gap-percent", label: "Gap percent" },
  { group: "CATALYST", value: "recent-news-minutes", label: "Recent news within" },
  { group: "CATALYST", value: "news-headline", label: "Today headline contains" },
  { group: "CATALYST", value: "news-category", label: "Today news category" },
  { group: "CATALYST", value: "news-keyword", label: "Today news keyword" },
  { group: "CATALYST", value: "event-within-days", label: "Corporate event within" },
  { group: "CATALYST", value: "earnings-within-days", label: "Earnings within" },
  { group: "CATALYST", value: "confirmed-event-within-days", label: "Confirmed event within" },
  { group: "CATALYST", value: "investor-event-within-days", label: "Investor event within" },
  { group: "OPTIONS", value: "option-volume", label: "Option volume (reported)" },
  { group: "OPTIONS", value: "option-open-interest", label: "Option open interest (reported)" },
  { group: "OPTIONS", value: "option-volume-oi", label: "Option volume / OI" },
  { group: "OPTIONS", value: "option-call-volume", label: "Call volume (reported)" },
  { group: "OPTIONS", value: "option-put-volume", label: "Put volume (reported)" },
  { group: "OPTIONS", value: "option-call-open-interest", label: "Call open interest" },
  { group: "OPTIONS", value: "option-put-open-interest", label: "Put open interest" },
  { group: "OPTIONS", value: "option-call-put-volume", label: "Call / put volume ratio" },
  { group: "OPTIONS", value: "option-call-put-open-interest", label: "Call / put OI ratio" },
  { group: "OPTIONS", value: "option-average-iv", label: "Average reported IV" },
  { group: "OPTIONS", value: "option-min-dte", label: "Minimum DTE" },
  { group: "OPTIONS", value: "option-max-dte", label: "Maximum DTE" },
  { group: "OPTIONS", value: "option-highest-contract-volume", label: "Highest individual contract volume" },
  { group: "OPTIONS", value: "option-highest-contract-open-interest", label: "Highest individual contract open interest" },
  { group: "OPTIONS", value: "option-volume-relative-underlying", label: "Option equivalent-share volume / underlying" },
];

const SCANNER_OPERATORS: readonly { value: ScannerOperator; label: string }[] = [
  { value: "greater-than", label: ">" },
  { value: "greater-than-or-equal", label: "≥" },
  { value: "less-than", label: "<" },
  { value: "less-than-or-equal", label: "≤" },
  { value: "equal", label: "=" },
  { value: "between", label: "BETWEEN" },
  { value: "in", label: "IN" },
];

const SCORE_WEIGHT_FIELDS: readonly {
  value: ResearchPriorityComponent;
  label: string;
  detail: string;
}[] = [
  { value: "priceMovement", label: "PRICE MOVEMENT", detail: "Absolute daily move" },
  { value: "relativeVolume", label: "RELATIVE VOLUME", detail: "Reported volume versus baseline" },
  { value: "technicalConfirmation", label: "TECHNICAL", detail: "VWAP-distance observation" },
  { value: "newsRecency", label: "NEWS RECENCY", detail: "Age of latest timestamped article" },
  { value: "eventProximity", label: "EVENT PROXIMITY", detail: "Time to next timestamped event" },
  { value: "optionsActivity", label: "OPTIONS ACTIVITY", detail: "Reported option volume / open interest" },
];

export interface ScannerWatchlistOption {
  readonly id: string;
  readonly name: string;
  readonly symbolCount: number;
}

export interface ScannerOptionsSourceDisclosure {
  readonly availability: "available" | "partial" | "unavailable" | "unknown";
  readonly quality: DataQuality;
  readonly asOf: string | null;
  readonly coveredSymbols?: number;
  readonly totalSymbols?: number;
  readonly expirationCoverage?: readonly {
    readonly expiration: string;
    readonly symbolCount: number;
    readonly contractCount: number;
  }[];
  readonly message?: string;
}

export type ScannerRulePath = readonly number[];

function sameRulePath(left: ScannerRulePath | undefined, right: ScannerRulePath): boolean {
  return Boolean(left && left.length === right.length && left.every((value, index) => value === right[index]));
}

function humanizeRuleField(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .toUpperCase();
}

function scannerRuleDescription(rule: ScannerRule): string {
  if (rule.kind === "numeric") {
    const operators = {
      gt: ">",
      gte: "≥",
      lt: "<",
      lte: "≤",
      eq: "=",
      between: "BETWEEN",
      "absolute-gte": "ABSOLUTE ≥",
    } as const;
    const suffix = rule.operator === "between" ? ` ${rule.value} AND ${rule.upperValue ?? "—"}` : ` ${rule.value}`;
    return `${humanizeRuleField(rule.field)} ${operators[rule.operator]}${suffix}`;
  }
  if (rule.kind === "price-relation") {
    return `PRICE ${humanizeRuleField(rule.relation)} ${humanizeRuleField(rule.reference)}`;
  }
  if (rule.kind === "market-cap") return `MARKET CAP IN ${rule.buckets.map((bucket) => bucket.toUpperCase()).join(", ")}`;
  if (rule.kind === "recent-news") return rule.calendarDay === "today"
    ? "TIMESTAMPED NEWS TODAY · AMERICA/NEW_YORK"
    : `TIMESTAMPED NEWS WITHIN ${rule.withinMinutes} MINUTES`;
  if (rule.kind === "catalyst-window") {
    const types = rule.catalystTypes?.length ? ` · ${rule.catalystTypes.join(", ").toUpperCase()}` : "";
    return `CATALYST WITHIN ${rule.withinDays} DAYS${types}`;
  }
  if (rule.kind === "not") return `NOT (${scannerRuleDescription(rule.rule)})`;
  return `${rule.kind === "all" ? "ALL" : "ANY"} OF ${rule.rules.length} RULE${rule.rules.length === 1 ? "" : "S"}`;
}

function countScannerRuleLeaves(rule: ScannerRule): number {
  if (rule.kind === "all" || rule.kind === "any") {
    return rule.rules.reduce((total, child) => total + countScannerRuleLeaves(child), 0);
  }
  return 1;
}

function boundedRuleDepth(value: number | undefined): number {
  return value !== undefined && Number.isInteger(value)
    ? Math.min(4, Math.max(1, value))
    : 3;
}

export interface ScannerContextBarProps {
  readonly watchlists?: readonly ScannerWatchlistOption[];
  readonly selectedWatchlistId?: string | null;
  readonly optionsSource?: ScannerOptionsSourceDisclosure;
  readonly onWatchlistChange?: (watchlistId: string) => void;
}

export function ScannerContextBar({
  watchlists = [],
  selectedWatchlistId = null,
  optionsSource,
  onWatchlistChange,
}: ScannerContextBarProps) {
  const source = optionsSource ?? {
    availability: "unknown" as const,
    quality: "unknown" as const,
    asOf: null,
    message: "Options-source status has not been supplied by the scanner controller.",
  };
  const selected = watchlists.find((watchlist) => watchlist.id === selectedWatchlistId) ?? null;
  const coverage = source.coveredSymbols !== undefined && source.totalSymbols !== undefined
    ? `${source.coveredSymbols} / ${source.totalSymbols} SYMBOLS`
    : "COVERAGE NOT REPORTED";
  const sourceMessage = source.message ?? (
    source.availability === "unavailable"
      ? "Options conditions fail closed when reported option activity is unavailable."
      : "Options activity uses reported volume and open interest only; bid/ask quotes are never scanner inputs."
  );
  return (
    <section className="research-scanner-context" aria-label="Scanner universe and source disclosure">
      <label>
        <span>WATCHLIST UNIVERSE</span>
        <select
          value={selectedWatchlistId ?? ""}
          onChange={(event) => onWatchlistChange?.(event.target.value)}
          disabled={!onWatchlistChange || watchlists.length === 0}
        >
          {watchlists.length === 0 ? <option value="">Active watchlist</option> : null}
          {watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name} · {watchlist.symbolCount} symbols</option>)}
        </select>
        <small>{selected ? `${selected.symbolCount} SYMBOL${selected.symbolCount === 1 ? "" : "S"} SELECTED` : "CONTROLLED BY THE ACTIVE WATCHLIST"}</small>
      </label>
      <div className={`research-scanner-option-source is-${source.availability}`} role="status">
        <div><span>OPTIONS SOURCE</span><strong>{source.availability.toUpperCase()}</strong></div>
        <div><span>QUALITY</span><strong>{source.quality.toUpperCase()}</strong></div>
        <div><span>AS OF</span><strong>{formatDateTime(source.asOf)}</strong></div>
        <div><span>COVERAGE</span><strong>{coverage}</strong></div>
        <p>{source.quality === "delayed" ? "DELAYED OPTIONS DATA · " : ""}{sourceMessage} RESEARCH USE ONLY.</p>
      </div>
    </section>
  );
}

export interface ScannerPresetRailProps {
  readonly presets: readonly ScannerPreset[];
  readonly activePresetId: string | null;
  readonly onSelect: (preset: ScannerPreset) => void;
  readonly onDeleteSaved?: (presetId: string) => void;
}

export function ScannerPresetRail({ presets, activePresetId, onSelect, onDeleteSaved }: ScannerPresetRailProps) {
  return (
    <aside className="research-scanner-presets" aria-label="Scanner presets">
      <header><span>QUICK START</span><strong>PRESETS</strong></header>
      {presets.length === 0 ? <p>No presets supplied.</p> : presets.map((preset) => (
        <div key={preset.id} className={activePresetId === preset.id ? "is-active" : ""}>
          <button type="button" onClick={() => onSelect(preset)} aria-pressed={activePresetId === preset.id}>
            <strong>{preset.name}</strong>
            <span>{preset.description}</span>
            <small>{preset.conditions.length} FILTER{preset.conditions.length === 1 ? "" : "S"}</small>
          </button>
          {preset.isSaved && onDeleteSaved ? <button type="button" className="research-remove-button" onClick={() => onDeleteSaved(preset.id)} aria-label={`Delete ${preset.name}`}>×</button> : null}
        </div>
      ))}
    </aside>
  );
}

export interface ScannerRuleTreeProps {
  readonly rule: ScannerRule;
  readonly selectedGroupPath?: ScannerRulePath;
  readonly maximumDepth?: number;
  readonly onGroupSelect?: (path: ScannerRulePath) => void;
  readonly onGroupLogicChange?: (path: ScannerRulePath, logic: "all" | "any") => void;
  readonly onGroupAdd?: (parentPath: ScannerRulePath, logic: "all" | "any") => void;
  readonly onRuleRemove?: (path: ScannerRulePath) => void;
}

interface ScannerRuleTreeNodeProps extends ScannerRuleTreeProps {
  readonly rule: ScannerRule;
  readonly path: ScannerRulePath;
  readonly depth: number;
  readonly isRoot: boolean;
}

function ScannerRuleTreeNode({
  rule,
  path,
  depth,
  isRoot,
  selectedGroupPath,
  maximumDepth = 3,
  onGroupSelect,
  onGroupLogicChange,
  onGroupAdd,
  onRuleRemove,
}: ScannerRuleTreeNodeProps) {
  if (rule.kind !== "all" && rule.kind !== "any") {
    return (
      <div className={`research-rule-leaf${rule.kind === "not" ? " is-negated" : ""}`}>
        <span>{path.map((value) => value + 1).join(".") || "1"}</span>
        <code>{scannerRuleDescription(rule)}</code>
        {onRuleRemove ? <button type="button" className="research-remove-button" onClick={() => onRuleRemove(path)} aria-label={`Remove ${scannerRuleDescription(rule)}`}>REMOVE</button> : null}
      </div>
    );
  }

  const selected = sameRulePath(selectedGroupPath, path);
  const canNest = depth + 1 < maximumDepth;
  return (
    <section className={`research-rule-group kind-${rule.kind}${selected ? " is-target" : ""}`} aria-label={`${rule.kind === "all" ? "AND" : "OR"} scanner group`}>
      <header>
        <div>
          <span>{isRoot ? "ROOT GROUP" : `NESTED GROUP · LEVEL ${depth + 1}`}</span>
          <strong>{rule.kind === "all" ? "MATCH ALL (AND)" : "MATCH ANY (OR)"}</strong>
        </div>
        <div className="research-rule-group-actions">
          {onGroupLogicChange ? (
            <div className="research-logic-toggle" role="group" aria-label={`Logic for group ${path.join(".") || "root"}`}>
              <button type="button" className={rule.kind === "all" ? "is-active" : ""} aria-pressed={rule.kind === "all"} onClick={() => onGroupLogicChange(path, "all")}>AND</button>
              <button type="button" className={rule.kind === "any" ? "is-active" : ""} aria-pressed={rule.kind === "any"} onClick={() => onGroupLogicChange(path, "any")}>OR</button>
            </div>
          ) : null}
          {onGroupSelect ? <button type="button" className={selected ? "is-active" : ""} aria-pressed={selected} onClick={() => onGroupSelect(path)}>ADD FILTER HERE</button> : null}
          {onGroupAdd ? <button type="button" onClick={() => onGroupAdd(path, "all")} disabled={!canNest}>+ AND GROUP</button> : null}
          {onGroupAdd ? <button type="button" onClick={() => onGroupAdd(path, "any")} disabled={!canNest}>+ OR GROUP</button> : null}
          {!isRoot && onRuleRemove ? <button type="button" className="research-remove-button" onClick={() => onRuleRemove(path)}>REMOVE GROUP</button> : null}
        </div>
      </header>
      <div className="research-rule-children">
        {rule.rules.length === 0 ? <p>Empty group. Add a filter or nested group before running.</p> : rule.rules.map((child, index) => (
          <ScannerRuleTreeNode
            key={`${path.join("-") || "root"}-${index}-${child.kind}`}
            rule={child}
            path={[...path, index]}
            depth={depth + 1}
            isRoot={false}
            selectedGroupPath={selectedGroupPath}
            maximumDepth={maximumDepth}
            onGroupSelect={onGroupSelect}
            onGroupLogicChange={onGroupLogicChange}
            onGroupAdd={onGroupAdd}
            onRuleRemove={onRuleRemove}
          />
        ))}
      </div>
    </section>
  );
}

export function ScannerRuleTree(props: ScannerRuleTreeProps) {
  const maximumDepth = boundedRuleDepth(props.maximumDepth);
  return (
    <div className="research-rule-tree" aria-label="Nested scanner rule tree">
      <ScannerRuleTreeNode {...props} maximumDepth={maximumDepth} path={[]} depth={0} isRoot />
      <p>Boolean groups mirror the scanner engine exactly. Missing fields continue to fail closed; grouping changes only AND/OR evaluation.</p>
    </div>
  );
}

export interface ScannerScoreWeightsProps {
  readonly weights: ResearchPriorityWeights;
  readonly onChange?: (weights: ResearchPriorityWeights) => void;
}

export function ScannerScoreWeights({ weights, onChange }: ScannerScoreWeightsProps) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const update = (component: ResearchPriorityComponent, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    onChange?.({ ...weights, [component]: value });
  };
  return (
    <details className="research-score-weights">
      <summary>
        <span>RESEARCH PRIORITY WEIGHTS</span>
        <strong>{total.toLocaleString()} TOTAL</strong>
      </summary>
      <div>
        {SCORE_WEIGHT_FIELDS.map((field) => (
          <label key={field.value}>
            <span>{field.label}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={weights[field.value]}
              disabled={!onChange}
              aria-label={`${field.label} score weight`}
              onChange={(event) => update(field.value, event.currentTarget.valueAsNumber)}
            />
            <small>{field.detail}</small>
          </label>
        ))}
      </div>
      <footer>
        <span>{total > 0 ? "Weights are normalized by their total and serialize as a plain numeric object." : "At least one weight must be positive before scoring."}</span>
        {onChange ? <button type="button" onClick={() => onChange(DEFAULT_RESEARCH_PRIORITY_WEIGHTS)}>RESET DEFAULTS</button> : null}
      </footer>
      <p>RESEARCH PRIORITY is transparent triage, not a buy score, return forecast, or probability.</p>
    </details>
  );
}

export interface ScannerBuilderProps {
  readonly conditions: readonly ScannerCondition[];
  readonly draft: ScannerCondition;
  readonly ruleTree?: ScannerRule;
  readonly selectedRuleGroupPath?: ScannerRulePath;
  readonly maximumRuleDepth?: number;
  readonly scanName: string;
  readonly isRunning: boolean;
  readonly logic: "all" | "any";
  readonly conditionLimit?: number;
  readonly autoRefresh?: boolean;
  readonly scoreWeights?: ResearchPriorityWeights;
  readonly onDraftChange: (condition: ScannerCondition) => void;
  readonly onAddCondition: () => void;
  readonly onAddConditionToGroup?: (groupPath: ScannerRulePath) => void;
  readonly onRemoveCondition: (conditionId: string) => void;
  readonly onRuleGroupSelect?: (path: ScannerRulePath) => void;
  readonly onRuleGroupLogicChange?: (path: ScannerRulePath, logic: "all" | "any") => void;
  readonly onRuleGroupAdd?: (parentPath: ScannerRulePath, logic: "all" | "any") => void;
  readonly onRuleRemove?: (path: ScannerRulePath) => void;
  readonly onScoreWeightsChange?: (weights: ResearchPriorityWeights) => void;
  readonly onScanNameChange: (name: string) => void;
  readonly onRun: () => void;
  readonly onLogicChange: (logic: "all" | "any") => void;
  readonly onAutoRefreshChange?: (enabled: boolean) => void;
  readonly onSave?: () => void;
  readonly onDuplicate?: () => void;
  readonly onClear?: () => void;
}

export function ScannerBuilder({
  conditions,
  draft,
  ruleTree,
  selectedRuleGroupPath,
  maximumRuleDepth = 3,
  scanName,
  isRunning,
  logic,
  conditionLimit = 12,
  autoRefresh = false,
  scoreWeights = DEFAULT_RESEARCH_PRIORITY_WEIGHTS,
  onDraftChange,
  onAddCondition,
  onAddConditionToGroup,
  onRemoveCondition,
  onRuleGroupSelect,
  onRuleGroupLogicChange,
  onRuleGroupAdd,
  onRuleRemove,
  onScoreWeightsChange,
  onScanNameChange,
  onRun,
  onLogicChange,
  onAutoRefreshChange,
  onSave,
  onDuplicate,
  onClear,
}: ScannerBuilderProps) {
  const groups = [...new Set(SCANNER_FIELDS.map((field) => field.group))];
  const activeConditionCount = ruleTree ? countScannerRuleLeaves(ruleTree) : conditions.length;
  const targetGroupPath = selectedRuleGroupPath ?? [];
  const effectiveMaximumRuleDepth = boundedRuleDepth(maximumRuleDepth);
  return (
    <section className="research-scanner-builder" aria-label="Scanner builder">
      <header className="research-subpanel-header">
        <div><span>QUERY COMPOSER</span><h3>SCANNER BUILDER</h3></div>
        <label className="research-scanner-name"><span>SCAN NAME</span><input value={scanName} onChange={(event) => onScanNameChange(event.target.value)} placeholder="Untitled scan" /></label>
      </header>
      <div className="research-condition-entry">
        <label className="research-filter-grow">
          <span>FIELD</span>
          <select value={draft.field} onChange={(event) => onDraftChange({ ...draft, field: event.target.value as ScannerField })}>
            {groups.map((group) => <optgroup key={group} label={group}>{SCANNER_FIELDS.filter((field) => field.group === group).map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</optgroup>)}
          </select>
        </label>
        <label><span>OPERATOR</span><select value={draft.operator} onChange={(event) => onDraftChange({ ...draft, operator: event.target.value as ScannerOperator })}>{SCANNER_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}</select></label>
        <label><span>VALUE</span><input value={draft.value} onChange={(event) => onDraftChange({ ...draft, value: event.target.value })} /></label>
        {draft.operator === "between" ? <label><span>SECOND VALUE</span><input value={draft.secondaryValue ?? ""} onChange={(event) => onDraftChange({ ...draft, secondaryValue: event.target.value })} /></label> : null}
        <label><span>UNIT</span><input value={draft.unit ?? ""} onChange={(event) => onDraftChange({ ...draft, unit: event.target.value })} placeholder="%, x, days" /></label>
        <button
          type="button"
          className="research-action-button"
          onClick={() => ruleTree && onAddConditionToGroup ? onAddConditionToGroup(targetGroupPath) : onAddCondition()}
          disabled={activeConditionCount >= conditionLimit}
        >
          {ruleTree && onAddConditionToGroup ? "ADD TO GROUP" : "ADD FILTER"}
        </button>
      </div>
      {ruleTree ? (
        <ScannerRuleTree
          rule={ruleTree}
          selectedGroupPath={targetGroupPath}
          maximumDepth={effectiveMaximumRuleDepth}
          onGroupSelect={onRuleGroupSelect}
          onGroupLogicChange={onRuleGroupLogicChange}
          onGroupAdd={onRuleGroupAdd}
          onRuleRemove={onRuleRemove}
        />
      ) : (
        <ol className="research-condition-list" aria-label="Active scanner conditions">
          {conditions.length === 0 ? <li className="research-condition-empty">No active filters. Add at least one condition to narrow the universe.</li> : conditions.map((condition, index) => (
            <li key={condition.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <code>{describeScannerCondition(condition)}</code>
              <button type="button" className="research-remove-button" onClick={() => onRemoveCondition(condition.id)} aria-label={`Remove ${describeScannerCondition(condition)}`}>REMOVE</button>
            </li>
          ))}
        </ol>
      )}
      <ScannerScoreWeights weights={scoreWeights} onChange={onScoreWeightsChange} />
      <footer className="research-builder-actions">
        <span>{activeConditionCount}/{conditionLimit} ACTIVE FILTER{activeConditionCount === 1 ? "" : "S"}</span>
        {ruleTree ? <div className="research-nested-rule-status">NESTED ENGINE RULE · MAX {effectiveMaximumRuleDepth} LEVELS</div> : (
          <div className="research-logic-toggle" role="group" aria-label="Scanner condition logic">
            <button type="button" className={logic === "all" ? "is-active" : ""} aria-pressed={logic === "all"} onClick={() => onLogicChange("all")}>MATCH ALL (AND)</button>
            <button type="button" className={logic === "any" ? "is-active" : ""} aria-pressed={logic === "any"} onClick={() => onLogicChange("any")}>MATCH ANY (OR)</button>
          </div>
        )}
        {onAutoRefreshChange ? <button type="button" className={autoRefresh ? "is-active" : ""} aria-pressed={autoRefresh} onClick={() => onAutoRefreshChange(!autoRefresh)}>AUTO 60S {autoRefresh ? "ON" : "OFF"}</button> : null}
        {onClear ? <button type="button" onClick={onClear}>CLEAR</button> : null}
        {onDuplicate ? <button type="button" onClick={onDuplicate} disabled={activeConditionCount === 0}>DUPLICATE</button> : null}
        {onSave ? <button type="button" onClick={onSave}>SAVE PRESET</button> : null}
        <button type="button" className="research-primary-button" onClick={onRun} disabled={isRunning} aria-live="polite">
          {isRunning ? "SCANNING…" : "RUN SCAN"}
        </button>
      </footer>
    </section>
  );
}

export type ScannerSortKey =
  | "symbol"
  | "price"
  | "changePercent"
  | "volume"
  | "relativeVolume"
  | "marketCap"
  | "latestNewsAt"
  | "nextEventAt"
  | "optionActivityScore"
  | "vwapDistancePercent"
  | "researchPriority";

export interface ScannerResultsProps {
  readonly results: readonly ScannerResult[];
  readonly totalCount: number;
  readonly durationMs: number | null;
  readonly sortKey: ScannerSortKey;
  readonly sortDirection: "ascending" | "descending";
  readonly onSort: (key: ScannerSortKey) => void;
  readonly onTickerSelect?: (ticker: string, result: ScannerResult) => void;
  readonly onResearchSelect?: (ticker: string, view: "news" | "events" | "options") => void;
  readonly onExport?: () => void;
}

export function ScannerResults({
  results,
  totalCount,
  durationMs,
  sortKey,
  sortDirection,
  onSort,
  onTickerSelect,
  onResearchSelect,
  onExport,
}: ScannerResultsProps) {
  const header = (key: ScannerSortKey, label: string) => (
    <button type="button" onClick={() => onSort(key)} aria-label={`Sort by ${label}`}>
      {label} {sortKey === key ? (sortDirection === "ascending" ? "↑" : "↓") : ""}
    </button>
  );
  return (
    <section className="research-subpanel research-scanner-results" aria-label="Scanner results">
      <header className="research-subpanel-header">
        <div><span>MATCHED UNIVERSE</span><h3>RESULTS</h3></div>
        <div className="research-scanner-result-actions">
          <strong>{totalCount} MATCHES{durationMs === null ? "" : ` · ${durationMs} MS`}</strong>
          {onExport ? <button type="button" onClick={onExport} disabled={results.length === 0}>EXPORT CSV</button> : null}
        </div>
      </header>
      {results.length === 0 ? <EmptyResearchState title="NO MATCHES" detail="Run the scanner or broaden the active conditions." /> : (
        <div className="research-table-wrap">
          <table className="research-table research-scanner-table">
            <caption className="research-sr-only">Configurable stock scanner results</caption>
            <thead><tr><th>{header("symbol", "TICKER")}</th><th>COMPANY</th><th>{header("price", "PRICE")}</th><th>{header("changePercent", "CHANGE %")}</th><th>{header("relativeVolume", "RVOL")}</th><th>{header("volume", "VOLUME")}</th><th>{header("vwapDistancePercent", "VWAP DIST")}</th><th>{header("latestNewsAt", "LATEST NEWS")}</th><th>{header("nextEventAt", "NEXT EVENT")}</th><th>{header("optionActivityScore", "OPTIONS")}</th><th>{header("researchPriority", "RESEARCH PRIORITY")}</th><th>REASONS / UPDATED</th></tr></thead>
            <tbody>{results.map((result) => (
              <tr key={result.symbol}>
                <td><button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(result.symbol, result)}>{result.symbol}</button></td>
                <td><strong>{result.companyName}</strong><small>{result.sector ?? "—"}</small></td>
                <td>{formatCurrency(result.price)}</td>
                <td className={valueTone(result.changePercent)}>{formatPercent(result.changePercent)}</td>
                <td>{formatRatio(result.relativeVolume)}</td>
                <td>{formatCompactNumber(result.volume)}</td>
                <td>{formatPercent(result.vwapDistancePercent ?? null)}</td>
                <td>{result.latestNewsAt ? <button type="button" className="research-inline-link" onClick={() => onResearchSelect?.(result.symbol, "news")}>{result.latestNewsTitle ?? formatDateTime(result.latestNewsAt)}<small>{result.newsAgeMinutes === null || result.newsAgeMinutes === undefined ? formatDateTime(result.latestNewsAt) : `${result.newsAgeMinutes} MIN AGO`}</small></button> : "—"}</td>
                <td>{result.nextEventAt ? <button type="button" className="research-inline-link" onClick={() => onResearchSelect?.(result.symbol, "events")}>{result.nextEventLabel ?? "EVENT"}<small>{result.nextEventStatus ?? formatDateTime(result.nextEventAt)}</small></button> : "—"}</td>
                <td>{result.optionActivityScore === null ? "—" : <button type="button" className="research-inline-link" onClick={() => onResearchSelect?.(result.symbol, "options")}>{formatRatio(result.optionActivityScore)}<small>VOLUME / OI</small></button>}</td>
                <td><strong>{result.researchPriority === null || result.researchPriority === undefined ? "—" : `${result.researchPriority}/100`}</strong><small>{result.researchPriorityCoverage === null || result.researchPriorityCoverage === undefined ? "" : `${result.researchPriorityCoverage}% DATA COVERAGE`}</small></td>
                <td><details className="research-scanner-reasons"><summary>{result.matchedConditions.length} REASONS</summary><ul>{result.matchedConditions.map((reason, index) => <li key={`${result.symbol}-${index}`}>{reason}</li>)}</ul>{result.scoreBreakdown?.length ? <div>{result.scoreBreakdown.map((item) => <span key={item.label}><b>{item.label}</b> {item.available ? `${item.points.toFixed(1)} / ${item.weight}` : "UNAVAILABLE"}<small>{item.explanation}</small></span>)}</div> : null}</details><small>{formatDateTime(result.lastUpdatedAt ?? null)}</small></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export interface ScannerTerminalProps {
  readonly status: ResearchDataStatus;
  readonly watchlists?: readonly ScannerWatchlistOption[];
  readonly selectedWatchlistId?: string | null;
  readonly optionsSource?: ScannerOptionsSourceDisclosure;
  readonly presets: readonly ScannerPreset[];
  readonly activePresetId: string | null;
  readonly conditions: readonly ScannerCondition[];
  readonly draft: ScannerCondition;
  /** Optional engine-native JSON rule tree. Flat condition props remain supported. */
  readonly ruleTree?: ScannerRule;
  readonly selectedRuleGroupPath?: ScannerRulePath;
  readonly maximumRuleDepth?: number;
  readonly scanName: string;
  readonly isRunning: boolean;
  readonly logic: "all" | "any";
  readonly autoRefresh?: boolean;
  readonly scoreWeights?: ResearchPriorityWeights;
  readonly results: readonly ScannerResult[];
  readonly totalCount: number;
  readonly durationMs: number | null;
  readonly sortKey: ScannerSortKey;
  readonly sortDirection: "ascending" | "descending";
  readonly onPresetSelect: (preset: ScannerPreset) => void;
  readonly onDeleteSavedPreset?: (presetId: string) => void;
  readonly onWatchlistChange?: (watchlistId: string) => void;
  readonly onDraftChange: (condition: ScannerCondition) => void;
  readonly onAddCondition: () => void;
  readonly onAddConditionToGroup?: (groupPath: ScannerRulePath) => void;
  readonly onRemoveCondition: (conditionId: string) => void;
  readonly onRuleGroupSelect?: (path: ScannerRulePath) => void;
  readonly onRuleGroupLogicChange?: (path: ScannerRulePath, logic: "all" | "any") => void;
  readonly onRuleGroupAdd?: (parentPath: ScannerRulePath, logic: "all" | "any") => void;
  readonly onRuleRemove?: (path: ScannerRulePath) => void;
  readonly onScoreWeightsChange?: (weights: ResearchPriorityWeights) => void;
  readonly onScanNameChange: (name: string) => void;
  readonly onRun: () => void;
  readonly onLogicChange: (logic: "all" | "any") => void;
  readonly onAutoRefreshChange?: (enabled: boolean) => void;
  readonly onSave?: () => void;
  readonly onDuplicate?: () => void;
  readonly onClear?: () => void;
  readonly onSort: (key: ScannerSortKey) => void;
  readonly onTickerSelect?: (ticker: string, result: ScannerResult) => void;
  readonly onResearchSelect?: (ticker: string, view: "news" | "events" | "options") => void;
  readonly onExport?: () => void;
}

export function ScannerTerminal(props: ScannerTerminalProps) {
  return (
    <ResearchFrame title="STOCK SCANNER" eyebrow="CROSS-DATASET RESEARCH" status={props.status} className="research-scanner-terminal">
      <ScannerContextBar watchlists={props.watchlists} selectedWatchlistId={props.selectedWatchlistId} optionsSource={props.optionsSource} onWatchlistChange={props.onWatchlistChange} />
      <div className="research-scanner-layout">
        <ScannerPresetRail presets={props.presets} activePresetId={props.activePresetId} onSelect={props.onPresetSelect} onDeleteSaved={props.onDeleteSavedPreset} />
        <div className="research-scanner-main">
          <ScannerBuilder
            conditions={props.conditions}
            draft={props.draft}
            ruleTree={props.ruleTree}
            selectedRuleGroupPath={props.selectedRuleGroupPath}
            maximumRuleDepth={props.maximumRuleDepth}
            scanName={props.scanName}
            isRunning={props.isRunning}
            logic={props.logic}
            autoRefresh={props.autoRefresh}
            scoreWeights={props.scoreWeights}
            onDraftChange={props.onDraftChange}
            onAddCondition={props.onAddCondition}
            onAddConditionToGroup={props.onAddConditionToGroup}
            onRemoveCondition={props.onRemoveCondition}
            onRuleGroupSelect={props.onRuleGroupSelect}
            onRuleGroupLogicChange={props.onRuleGroupLogicChange}
            onRuleGroupAdd={props.onRuleGroupAdd}
            onRuleRemove={props.onRuleRemove}
            onScoreWeightsChange={props.onScoreWeightsChange}
            onScanNameChange={props.onScanNameChange}
            onRun={props.onRun}
            onLogicChange={props.onLogicChange}
            onAutoRefreshChange={props.onAutoRefreshChange}
            onSave={props.onSave}
            onDuplicate={props.onDuplicate}
            onClear={props.onClear}
          />
          <ScannerResults results={props.results} totalCount={props.totalCount} durationMs={props.durationMs} sortKey={props.sortKey} sortDirection={props.sortDirection} onSort={props.onSort} onTickerSelect={props.onTickerSelect} onResearchSelect={props.onResearchSelect} onExport={props.onExport} />
        </div>
      </div>
      <p className="research-disclaimer">Scanner output is a configurable research screen, not a recommendation or prediction. Catalyst and pattern conditions depend on the supplied datasets and their timestamps.</p>
    </ResearchFrame>
  );
}
