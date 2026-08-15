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
import type {
  ResearchDataStatus,
  ScannerCondition,
  ScannerField,
  ScannerOperator,
  ScannerPreset,
  ScannerResult,
} from "@/lib/research/types";
import { EmptyResearchState, ResearchFrame } from "./ResearchFrame";

const SCANNER_FIELDS: readonly { group: string; value: ScannerField; label: string }[] = [
  { group: "PRICE", value: "price", label: "Price" },
  { group: "FUNDAMENTAL", value: "market-cap", label: "Market cap" },
  { group: "VOLUME", value: "volume", label: "Volume" },
  { group: "VOLUME", value: "average-volume", label: "Average volume" },
  { group: "VOLUME", value: "relative-volume", label: "Relative volume" },
  { group: "PERFORMANCE", value: "daily-change", label: "Daily change" },
  { group: "PERFORMANCE", value: "weekly-change", label: "Weekly change" },
  { group: "PERFORMANCE", value: "monthly-change", label: "Monthly change" },
  { group: "TECHNICAL", value: "sma-distance", label: "Distance from SMA" },
  { group: "TECHNICAL", value: "ema-distance", label: "Distance from EMA" },
  { group: "TECHNICAL", value: "vwap-distance", label: "Distance from VWAP" },
  { group: "TECHNICAL", value: "rsi", label: "RSI" },
  { group: "TECHNICAL", value: "distance-52w-high", label: "Distance from 52W high" },
  { group: "TECHNICAL", value: "distance-52w-low", label: "Distance from 52W low" },
  { group: "GAP", value: "gap-percent", label: "Gap percent" },
  { group: "CATALYST", value: "recent-news-minutes", label: "Recent news within" },
  { group: "CATALYST", value: "event-within-days", label: "Corporate event within" },
  { group: "CATALYST", value: "earnings-within-days", label: "Earnings within" },
  { group: "OPTIONS", value: "option-volume-oi", label: "Option volume / OI" },
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

export interface ScannerBuilderProps {
  readonly conditions: readonly ScannerCondition[];
  readonly draft: ScannerCondition;
  readonly scanName: string;
  readonly isRunning: boolean;
  readonly onDraftChange: (condition: ScannerCondition) => void;
  readonly onAddCondition: () => void;
  readonly onRemoveCondition: (conditionId: string) => void;
  readonly onScanNameChange: (name: string) => void;
  readonly onRun: () => void;
  readonly onSave?: () => void;
  readonly onClear?: () => void;
}

export function ScannerBuilder({
  conditions,
  draft,
  scanName,
  isRunning,
  onDraftChange,
  onAddCondition,
  onRemoveCondition,
  onScanNameChange,
  onRun,
  onSave,
  onClear,
}: ScannerBuilderProps) {
  const groups = [...new Set(SCANNER_FIELDS.map((field) => field.group))];
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
        <button type="button" className="research-action-button" onClick={onAddCondition}>ADD FILTER</button>
      </div>
      <ol className="research-condition-list" aria-label="Active scanner conditions">
        {conditions.length === 0 ? <li className="research-condition-empty">No active filters. Add at least one condition to narrow the universe.</li> : conditions.map((condition, index) => (
          <li key={condition.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <code>{describeScannerCondition(condition)}</code>
            <button type="button" className="research-remove-button" onClick={() => onRemoveCondition(condition.id)} aria-label={`Remove ${describeScannerCondition(condition)}`}>REMOVE</button>
          </li>
        ))}
      </ol>
      <footer className="research-builder-actions">
        <span>{conditions.length} ACTIVE FILTER{conditions.length === 1 ? "" : "S"}</span>
        {onClear ? <button type="button" onClick={onClear}>CLEAR</button> : null}
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
  | "optionActivityScore";

export interface ScannerResultsProps {
  readonly results: readonly ScannerResult[];
  readonly totalCount: number;
  readonly durationMs: number | null;
  readonly sortKey: ScannerSortKey;
  readonly sortDirection: "ascending" | "descending";
  readonly onSort: (key: ScannerSortKey) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function ScannerResults({
  results,
  totalCount,
  durationMs,
  sortKey,
  sortDirection,
  onSort,
  onTickerSelect,
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
        <strong>{totalCount} MATCHES{durationMs === null ? "" : ` · ${durationMs} MS`}</strong>
      </header>
      {results.length === 0 ? <EmptyResearchState title="NO MATCHES" detail="Run the scanner or broaden the active conditions." /> : (
        <div className="research-table-wrap">
          <table className="research-table research-scanner-table">
            <caption className="research-sr-only">Configurable stock scanner results</caption>
            <thead><tr><th>{header("symbol", "SYMBOL")}</th><th>COMPANY</th><th>{header("price", "PRICE")}</th><th>{header("changePercent", "CHANGE")}</th><th>{header("volume", "VOLUME")}</th><th>{header("relativeVolume", "RVOL")}</th><th>{header("marketCap", "MKT CAP")}</th><th>{header("latestNewsAt", "LATEST NEWS")}</th><th>{header("nextEventAt", "NEXT EVENT")}</th><th>{header("optionActivityScore", "OPT ACT")}</th></tr></thead>
            <tbody>{results.map((result) => (
              <tr key={result.symbol}>
                <td><button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(result.symbol)}>{result.symbol}</button></td>
                <td><strong>{result.companyName}</strong><small>{result.sector ?? "—"}</small></td>
                <td>{formatCurrency(result.price)}</td>
                <td className={valueTone(result.changePercent)}>{formatPercent(result.changePercent)}</td>
                <td>{formatCompactNumber(result.volume)}</td>
                <td>{formatRatio(result.relativeVolume)}</td>
                <td>{formatCompactNumber(result.marketCap)}</td>
                <td>{formatDateTime(result.latestNewsAt)}</td>
                <td>{result.nextEventLabel ?? "—"}<small>{formatDateTime(result.nextEventAt)}</small></td>
                <td>{result.optionActivityScore === null ? "—" : formatPercent(result.optionActivityScore, 0)}</td>
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
  readonly presets: readonly ScannerPreset[];
  readonly activePresetId: string | null;
  readonly conditions: readonly ScannerCondition[];
  readonly draft: ScannerCondition;
  readonly scanName: string;
  readonly isRunning: boolean;
  readonly results: readonly ScannerResult[];
  readonly totalCount: number;
  readonly durationMs: number | null;
  readonly sortKey: ScannerSortKey;
  readonly sortDirection: "ascending" | "descending";
  readonly onPresetSelect: (preset: ScannerPreset) => void;
  readonly onDeleteSavedPreset?: (presetId: string) => void;
  readonly onDraftChange: (condition: ScannerCondition) => void;
  readonly onAddCondition: () => void;
  readonly onRemoveCondition: (conditionId: string) => void;
  readonly onScanNameChange: (name: string) => void;
  readonly onRun: () => void;
  readonly onSave?: () => void;
  readonly onClear?: () => void;
  readonly onSort: (key: ScannerSortKey) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function ScannerTerminal(props: ScannerTerminalProps) {
  return (
    <ResearchFrame title="STOCK SCANNER" eyebrow="CROSS-DATASET RESEARCH" status={props.status} className="research-scanner-terminal">
      <div className="research-scanner-layout">
        <ScannerPresetRail presets={props.presets} activePresetId={props.activePresetId} onSelect={props.onPresetSelect} onDeleteSaved={props.onDeleteSavedPreset} />
        <div className="research-scanner-main">
          <ScannerBuilder conditions={props.conditions} draft={props.draft} scanName={props.scanName} isRunning={props.isRunning} onDraftChange={props.onDraftChange} onAddCondition={props.onAddCondition} onRemoveCondition={props.onRemoveCondition} onScanNameChange={props.onScanNameChange} onRun={props.onRun} onSave={props.onSave} onClear={props.onClear} />
          <ScannerResults results={props.results} totalCount={props.totalCount} durationMs={props.durationMs} sortKey={props.sortKey} sortDirection={props.sortDirection} onSort={props.onSort} onTickerSelect={props.onTickerSelect} />
        </div>
      </div>
      <p className="research-disclaimer">Scanner output is a configurable research screen, not a recommendation or prediction. Catalyst and pattern conditions depend on the supplied datasets and their timestamps.</p>
    </ResearchFrame>
  );
}

