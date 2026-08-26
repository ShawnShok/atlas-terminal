"use client";

import type { CSSProperties } from "react";
import type { AggregateBar, OptionContract, OptionQuoteAvailability } from "@/types";
import {
  calculateDaysToExpiration,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRatio,
  valueTone,
} from "@/lib/research";
import {
  optionMidpoint,
  optionVolumeToOpenInterest,
  type OptionDistributionBucket,
  type OptionRankingMetric,
} from "@/lib/options";
import type {
  OptionActivityCandidate,
  OptionActivityMetric,
  OptionChainFilters,
  OptionChainRow,
  OptionsUnderlying,
  ResearchDataStatus,
  StrategyAnalysis,
  StrategyLegDraft,
  StrategyTemplate,
} from "@/lib/research/types";
import { EmptyResearchState, MetricCell, ResearchFrame } from "./ResearchFrame";

const STRATEGY_TEMPLATES: readonly { value: StrategyTemplate; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "long-call", label: "Long call" },
  { value: "long-put", label: "Long put" },
  { value: "covered-call", label: "Covered call" },
  { value: "cash-secured-put", label: "Cash-secured put" },
  { value: "vertical-spread", label: "Vertical spread" },
  { value: "iron-condor", label: "Iron condor" },
  { value: "straddle", label: "Straddle" },
  { value: "strangle", label: "Strangle" },
];

function optionValue(value: number | null, format: "price" | "number" | "percent" = "number") {
  if (format === "price") return formatCurrency(value);
  if (format === "percent") return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
  return formatNumber(value);
}

function contractMidpoint(contract: OptionContract | null): number | null {
  if (!contract || contract.quoteAvailability !== "available") return null;
  return optionMidpoint(contract.bidPrice, contract.askPrice);
}

function quoteValue(value: number | null) {
  return value === null
    ? <span className="research-option-unavailable">UNAVAILABLE</span>
    : formatCurrency(value);
}

function reportedLastLabel(contract: OptionContract): string {
  if (contract.lastPriceSource === "last-trade") return "LAST TRADE";
  if (contract.lastPriceSource === "day-close") return "DAY CLOSE";
  return "LAST UNAVAILABLE";
}

interface ChainSideCellsProps {
  readonly contract: OptionContract | null;
  readonly moneyness: OptionChainRow["callMoneyness"];
  readonly showQuoteColumns: boolean;
  readonly onSelect?: (contract: OptionContract) => void;
}

function ChainSideCells({ contract, moneyness, showQuoteColumns, onSelect }: ChainSideCellsProps) {
  const columnCount = showQuoteColumns ? 11 : 8;
  if (!contract) {
    return <td colSpan={columnCount} className="research-option-empty">—</td>;
  }
  const cellClassName = `option-${moneyness}`;
  return (
    <>
      {showQuoteColumns ? (
        <>
          <td className={`${cellClassName} option-chain-bid`}>{quoteValue(contract.bidPrice)}</td>
          <td className={`${cellClassName} option-chain-ask`}>{quoteValue(contract.askPrice)}</td>
          <td className={`${cellClassName} option-chain-midpoint`} title="Descriptive midpoint of a valid reported two-sided quote; not an executable premium.">{quoteValue(contractMidpoint(contract))}</td>
        </>
      ) : null}
      <td className={`${cellClassName} option-chain-last`} title={`${reportedLastLabel(contract)}; not an executable premium.`}>
        <button type="button" className="research-contract-button" onClick={() => onSelect?.(contract)}>
          {quoteValue(contract.lastPrice)}
        </button>
      </td>
      <td className={`${cellClassName} option-chain-volume`}>{formatCompactNumber(contract.volume)}</td>
      <td className={`${cellClassName} option-chain-open-interest`}>{formatCompactNumber(contract.openInterest)}</td>
      <td className={`${cellClassName} option-chain-iv`}>{optionValue(contract.impliedVolatility, "percent")}</td>
      <td className={`${cellClassName} option-chain-delta`}>{optionValue(contract.greeks.delta)}</td>
      <td className={`${cellClassName} option-chain-gamma`}>{optionValue(contract.greeks.gamma, "number")}</td>
      <td className={`${cellClassName} option-chain-theta`}>{optionValue(contract.greeks.theta)}</td>
      <td className={`${cellClassName} option-chain-vega`}>{optionValue(contract.greeks.vega)}</td>
    </>
  );
}

export interface OptionsHeaderProps {
  readonly underlying: OptionsUnderlying;
  readonly filters: OptionChainFilters;
  readonly expirationDates: readonly string[];
  readonly nowIso: string;
  readonly chainAsOf: string;
  readonly dataMode: ResearchDataStatus["mode"];
  readonly quoteAvailability: OptionQuoteAvailability;
  readonly strikeRange: readonly [number, number] | null;
  readonly onFiltersChange: (filters: OptionChainFilters) => void;
}

export function OptionsHeader({
  underlying,
  filters,
  expirationDates,
  nowIso,
  chainAsOf,
  dataMode,
  quoteAvailability,
  strikeRange,
  onFiltersChange,
}: OptionsHeaderProps) {
  const dte = calculateDaysToExpiration(filters.expirationDate, nowIso);
  const update = <Key extends keyof OptionChainFilters,>(key: Key, value: OptionChainFilters[Key]) =>
    onFiltersChange({ ...filters, [key]: value });
  const quote = underlying.quote;
  const tone = valueTone(quote.changePercent);
  return (
    <div className="research-options-header">
      <div className="research-underlying-quote">
        <span>{underlying.symbol}</span>
        <strong>{formatCurrency(quote.lastPrice)}</strong>
        <em className={tone}>{formatPercent(quote.changePercent)}</em>
        <small>{underlying.name}</small>
      </div>
      <label className="research-option-expiration">
        <span>EXPIRATION</span>
        <select
          value={filters.expirationDate}
          disabled={expirationDates.length === 0}
          onChange={(event) => update("expirationDate", event.target.value)}
        >
          {expirationDates.length === 0
            ? <option value="">NO EXPIRATIONS</option>
            : expirationDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
        </select>
      </label>
      <div className="research-dte"><span>DTE</span><strong>{dte ?? "—"}</strong></div>
      <MetricCell
        label="STRIKE RANGE"
        value={strikeRange ? `${formatCurrency(strikeRange[0])} – ${formatCurrency(strikeRange[1])}` : "—"}
        tooltip="Minimum and maximum strikes in the currently filtered chain."
      />
      <MetricCell
        label="QUOTE AVAILABILITY"
        value={expirationDates.length === 0 ? "NO CHAIN" : quoteAvailability.toUpperCase()}
        tone={quoteAvailability === "available" ? "neutral" : "warning"}
        tooltip="Available means the returned contracts have valid two-sided bid/ask snapshots. It does not mean executable or real-time."
      />
      <MetricCell label="FRESHNESS" value={dataMode.toUpperCase()} detail={formatDateTime(chainAsOf)} />
      <div className="research-chain-quick-filters">
        <label><span>TYPE</span><select value={filters.contractType} onChange={(event) => update("contractType", event.target.value as OptionChainFilters["contractType"])}><option value="all">Calls + puts</option><option value="call">Calls</option><option value="put">Puts</option></select></label>
        <label><span>MONEYNESS</span><select value={filters.moneyness} onChange={(event) => update("moneyness", event.target.value as OptionChainFilters["moneyness"])}><option value="all">All</option><option value="itm">ITM</option><option value="atm">ATM</option><option value="otm">OTM</option></select></label>
        <label><span>STRIKE MIN</span><input type="number" value={filters.strikeMin ?? ""} onChange={(event) => update("strikeMin", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>STRIKE MAX</span><input type="number" value={filters.strikeMax ?? ""} onChange={(event) => update("strikeMax", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>MIN VOL</span><input type="number" min="0" value={filters.minimumVolume ?? ""} onChange={(event) => update("minimumVolume", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>MIN OI</span><input type="number" min="0" value={filters.minimumOpenInterest ?? ""} onChange={(event) => update("minimumOpenInterest", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>MIN VOL / OI</span><input type="number" min="0" step="0.1" value={filters.minimumVolumeToOpenInterest ?? ""} onChange={(event) => update("minimumVolumeToOpenInterest", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>IV MIN %</span><input type="number" min="0" step="1" value={filters.impliedVolatilityMin ?? ""} onChange={(event) => update("impliedVolatilityMin", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>IV MAX %</span><input type="number" min="0" step="1" value={filters.impliedVolatilityMax ?? ""} onChange={(event) => update("impliedVolatilityMax", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>DELTA MIN</span><input type="number" min="-1" max="1" step="0.05" value={filters.deltaMin ?? ""} onChange={(event) => update("deltaMin", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>DELTA MAX</span><input type="number" min="-1" max="1" step="0.05" value={filters.deltaMax ?? ""} onChange={(event) => update("deltaMax", event.target.value === "" ? null : Number(event.target.value))} /></label>
      </div>
    </div>
  );
}

export interface OptionsDataDisclosureProps {
  readonly mode: ResearchDataStatus["mode"];
  readonly hasContracts: boolean;
  readonly quoteAvailability: OptionQuoteAvailability;
  readonly quoteNote: string;
  readonly asOf: string;
}

export function OptionsDataDisclosure({ mode, hasContracts, quoteAvailability, quoteNote, asOf }: OptionsDataDisclosureProps) {
  const unavailable = !hasContracts || quoteAvailability === "unavailable";
  return (
    <aside
      className={`research-options-disclosure is-${quoteAvailability}`}
      role={unavailable ? "alert" : "status"}
    >
      <div>
        <strong>OPTIONS DATA — {mode.toUpperCase()}</strong>
        {!hasContracts ? <b>NO LISTED OPTION CONTRACTS RETURNED</b> : null}
        {hasContracts && quoteAvailability === "unavailable" ? <b>NO OPTION QUOTES AVAILABLE</b> : null}
        {hasContracts && quoteAvailability === "partial" ? <b>OPTION QUOTES INCOMPLETE</b> : null}
      </div>
      <span>{hasContracts && quoteAvailability === "unavailable" ? "LIVE BID/ASK QUOTES NOT INCLUDED · " : ""}{quoteNote} · RESEARCH USE ONLY</span>
      <time dateTime={asOf}>UPDATED {formatDateTime(asOf)}</time>
    </aside>
  );
}

export interface OptionChainProps {
  readonly rows: readonly OptionChainRow[];
  readonly hasContracts: boolean;
  readonly quoteAvailability: OptionQuoteAvailability;
  readonly selectedContractSymbol: string | null;
  readonly onContractSelect?: (contract: OptionContract) => void;
}

export function OptionChain({ rows, hasContracts, quoteAvailability, selectedContractSymbol, onContractSelect }: OptionChainProps) {
  if (rows.length === 0) {
    return <EmptyResearchState
      title="NO CONTRACTS"
      detail={hasContracts
        ? "No option contracts match the active chain filters."
        : "The provider returned no listed contracts for this symbol and expiration filter."}
    />;
  }
  const showQuoteColumns = quoteAvailability !== "unavailable";
  const columns = [
    ...(showQuoteColumns ? [
      { key: "bid", label: "BID" },
      { key: "ask", label: "ASK" },
      { key: "midpoint", label: "IND. MID*" },
    ] : []),
    { key: "last", label: "LAST†" },
    { key: "volume", label: "VOL" },
    { key: "open-interest", label: "OI" },
    { key: "iv", label: "IV" },
    { key: "delta", label: "Δ" },
    { key: "gamma", label: "Γ" },
    { key: "theta", label: "Θ" },
    { key: "vega", label: "V" },
  ] as const;
  const sideColumnCount = columns.length;
  return (
    <div className="research-table-wrap research-option-chain-wrap">
      <table className={`research-table research-option-chain${showQuoteColumns ? "" : " quotes-unavailable"}`}>
        <caption className="research-sr-only">Option chain with calls and puts by strike</caption>
        <thead>
          <tr className="research-option-groups"><th colSpan={sideColumnCount}>CALLS</th><th rowSpan={2}>STRIKE</th><th colSpan={sideColumnCount}>PUTS</th></tr>
          <tr>
            {columns.map((column) => <th className={`option-chain-${column.key}`} key={`call-${column.key}`}>{column.label}</th>)}
            {columns.map((column) => <th className={`option-chain-${column.key}`} key={`put-${column.key}`}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.strikePrice}
              className={row.call?.symbol === selectedContractSymbol || row.put?.symbol === selectedContractSymbol ? "is-selected" : ""}
            >
              <ChainSideCells contract={row.call} moneyness={row.callMoneyness} showQuoteColumns={showQuoteColumns} onSelect={onContractSelect} />
              <th scope="row" className="research-strike">{formatCurrency(row.strikePrice)}</th>
              <ChainSideCells contract={row.put} moneyness={row.putMoneyness} showQuoteColumns={showQuoteColumns} onSelect={onContractSelect} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="research-option-chain-key">* Indicative midpoint is descriptive only. † Last is a reported trade or day close, never a quote midpoint. Neither is treated as an executable premium.</p>
    </div>
  );
}

export interface ContractSparkBarsProps {
  readonly bars: readonly AggregateBar[];
}

export function ContractSparkBars({ bars }: ContractSparkBarsProps) {
  if (bars.length === 0) return <EmptyResearchState title="NO CONTRACT HISTORY" detail="No contract bars were supplied." />;
  const minimum = Math.min(...bars.map((bar) => bar.low));
  const maximum = Math.max(...bars.map((bar) => bar.high));
  const range = Math.max(maximum - minimum, 0.01);
  return (
    <div className="research-contract-chart" role="img" aria-label="Contract price history">
      {bars.map((bar) => {
        const height = Math.max(4, ((bar.high - bar.low) / range) * 100);
        const offset = ((bar.low - minimum) / range) * 100;
        const style = { "--bar-height": `${height}%`, "--bar-offset": `${offset}%` } as CSSProperties;
        return <i key={`${bar.timestamp}-${bar.close}`} className={bar.close >= bar.open ? "positive" : "negative"} style={style} title={`${formatDate(bar.timestamp)} ${formatCurrency(bar.close)}`} />;
      })}
    </div>
  );
}

export interface OptionContractDetailProps {
  readonly contract: OptionContract | null;
  readonly underlyingPrice: number | null;
  readonly manualPremium: number | null;
  readonly breakEven: number | null;
  readonly quoteNote: string;
  readonly bars: readonly AggregateBar[];
}

export function OptionContractDetail({ contract, underlyingPrice, manualPremium, breakEven, quoteNote, bars }: OptionContractDetailProps) {
  if (!contract) return <EmptyResearchState title="SELECT A CONTRACT" detail="Choose a call or put to inspect contract research." />;
  const midpoint = contractMidpoint(contract);
  return (
    <article className="research-contract-detail">
      <header>
        <span>OPTION CONTRACT</span>
        <h3>{contract.underlyingSymbol} {contract.expirationDate} {formatNumber(contract.strikePrice)}{contract.type === "call" ? "C" : "P"}</h3>
        <small>{contract.symbol}</small>
      </header>
      <div className="research-metric-grid research-contract-metrics">
        <MetricCell label={reportedLastLabel(contract)} value={quoteValue(contract.lastPrice)} tooltip="A reported last trade or day close only; never a quote midpoint or executable premium." />
        <MetricCell label="BID" value={quoteValue(contract.bidPrice)} tooltip="Reported snapshot bid, when included by the provider entitlement." />
        <MetricCell label="ASK" value={quoteValue(contract.askPrice)} tooltip="Reported snapshot ask, when included by the provider entitlement." />
        <MetricCell label="INDICATIVE MID" value={quoteValue(midpoint)} tooltip="Descriptive midpoint of a valid reported two-sided quote; not an executable premium." />
        <MetricCell label="VOLUME" value={formatCompactNumber(contract.volume)} />
        <MetricCell label="OPEN INTEREST" value={formatCompactNumber(contract.openInterest)} />
        <MetricCell label="IV" value={contract.impliedVolatility === null ? "—" : `${(contract.impliedVolatility * 100).toFixed(1)}%`} />
        <MetricCell label="DELTA" value={formatNumber(contract.greeks.delta, 3)} />
        <MetricCell label="GAMMA" value={formatNumber(contract.greeks.gamma, 3)} />
        <MetricCell label="THETA" value={formatNumber(contract.greeks.theta, 3)} />
        <MetricCell label="VEGA" value={formatNumber(contract.greeks.vega, 3)} />
        <MetricCell label="UNDERLYING" value={formatCurrency(underlyingPrice)} />
        <MetricCell label="MANUAL PREMIUM" value={quoteValue(manualPremium)} tooltip="User-entered scenario premium. This is the only premium used for the displayed break-even." />
        <MetricCell label="BREAK-EVEN (MANUAL)" value={formatCurrency(breakEven)} />
        <MetricCell label="INTRINSIC" value={formatCurrency(contract.intrinsicValue)} />
        <MetricCell label="EXTRINSIC (REPORTED)" value={formatCurrency(contract.extrinsicValue)} tooltip="Derived from the reported last trade or day close, when available; not an execution estimate." />
      </div>
      <p className="research-contract-pricing-note">{quoteNote} Payoff and break-even calculations require a manual premium; reported last and indicative midpoint values are never substituted.</p>
      <ContractSparkBars bars={bars} />
    </article>
  );
}

export interface OptionActivityPanelProps {
  readonly metrics: readonly OptionActivityMetric[];
  readonly candidates: readonly OptionActivityCandidate[];
  readonly rankings: readonly OptionActivityRanking[];
  readonly strikeDistribution: readonly OptionDistributionBucket[];
  readonly expirationDistribution: readonly OptionDistributionBucket[];
  readonly onContractSelect?: (contract: OptionContract) => void;
}

export interface OptionActivityRanking {
  readonly label: string;
  readonly detail: string;
  readonly metric: OptionRankingMetric;
  readonly contracts: readonly OptionContract[];
}

function activityMetricValue(metric: OptionActivityMetric): string {
  if (metric.format === "ratio") return formatRatio(metric.value);
  if (metric.format === "percent") return metric.value === null ? "—" : `${(metric.value * 100).toFixed(1)}%`;
  return formatNumber(metric.value);
}

function rankingValue(contract: OptionContract, metric: OptionRankingMetric): string {
  if (metric === "volume") return formatCompactNumber(contract.volume);
  if (metric === "open-interest") return formatCompactNumber(contract.openInterest);
  if (metric === "volume-open-interest-ratio") return formatRatio(optionVolumeToOpenInterest(contract));
  return contract.impliedVolatility === null ? "—" : `${(contract.impliedVolatility * 100).toFixed(1)}%`;
}

function OptionDistribution({ label, buckets }: { readonly label: string; readonly buckets: readonly OptionDistributionBucket[] }) {
  const supported = [...buckets]
    .filter((bucket) => bucket.volume !== null || bucket.openInterest !== null)
    .sort((left, right) => (right.volume ?? right.openInterest ?? 0) - (left.volume ?? left.openInterest ?? 0))
    .slice(0, 12);
  if (supported.length === 0) return null;
  const maximum = Math.max(1, ...supported.map((bucket) => bucket.volume ?? bucket.openInterest ?? 0));
  return (
    <article className="research-option-distribution">
      <header><strong>{label}</strong><small>REPORTED FIELDS ONLY</small></header>
      <ol>
        {supported.map((bucket) => {
          const magnitude = bucket.volume ?? bucket.openInterest ?? 0;
          const style = { "--distribution-size": `${Math.max(3, magnitude / maximum * 100)}%` } as CSSProperties;
          return (
            <li key={bucket.key}>
              <span>{bucket.label}</span>
              <i style={style} aria-hidden="true" />
              <small>VOL {formatCompactNumber(bucket.volume)} · OI {formatCompactNumber(bucket.openInterest)} · {bucket.contractCount} CONTRACT{bucket.contractCount === 1 ? "" : "S"}</small>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function OptionActivityPanel({
  metrics,
  candidates,
  rankings,
  strikeDistribution,
  expirationDistribution,
  onContractSelect,
}: OptionActivityPanelProps) {
  const supportedRankings = rankings.filter((ranking) => ranking.contracts.length > 0);
  return (
    <section className="research-subpanel" aria-label="Options activity analytics">
      <header className="research-subpanel-header"><div><span>DERIVATIVES RESEARCH</span><h3>OPTION ACTIVITY</h3></div></header>
      <div className="research-metric-grid research-activity-metrics">
        {metrics.map((metric) => <MetricCell key={metric.label} label={metric.label} value={activityMetricValue(metric)} detail={metric.detail} tooltip={metric.tooltip} tone={metric.tone} />)}
      </div>
      {supportedRankings.length ? (
        <div className="research-option-rankings">
          {supportedRankings.map((ranking) => (
            <article key={ranking.metric}>
              <header><strong>{ranking.label}</strong><small>{ranking.detail}</small></header>
              <ol>{ranking.contracts.map((contract) => (
                <li key={contract.symbol}>
                  <button type="button" className="research-contract-button" onClick={() => onContractSelect?.(contract)}>{contract.symbol}</button>
                  <strong>{rankingValue(contract, ranking.metric)}</strong>
                </li>
              ))}</ol>
            </article>
          ))}
        </div>
      ) : null}
      <div className="research-option-distributions">
        <OptionDistribution label="DISTRIBUTION BY STRIKE" buckets={strikeDistribution} />
        <OptionDistribution label="DISTRIBUTION BY EXPIRATION" buckets={expirationDistribution} />
      </div>
      {candidates.length === 0 ? <EmptyResearchState title="NO ACTIVITY CANDIDATES" detail="No candidates were supplied for the selected expiration." /> : (
        <div className="research-table-wrap">
          <table className="research-table research-option-activity-table">
            <caption className="research-sr-only">Option activity research candidates</caption>
            <thead><tr><th>CONTRACT</th><th>VOL</th><th>OI</th><th>VOL / OI</th><th>VS BASELINE</th><th>RESEARCH FLAG</th></tr></thead>
            <tbody>{candidates.map((candidate) => (
              <tr key={candidate.contract.symbol}>
                <td><button type="button" className="research-contract-button" onClick={() => onContractSelect?.(candidate.contract)}>{candidate.contract.symbol}</button></td>
                <td>{formatCompactNumber(candidate.contract.volume)}</td>
                <td>{formatCompactNumber(candidate.contract.openInterest)}</td>
                <td>{formatRatio(candidate.volumeToOpenInterest)}</td>
                <td>{formatRatio(candidate.volumeVsBaseline)}</td>
                <td>{candidate.reason}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="research-disclaimer">Activity flags are screening observations only. Unusual volume does not establish direction, intent, or institutional participation.</p>
    </section>
  );
}

export interface StrategyBuilderProps {
  readonly analysis: StrategyAnalysis;
  readonly draft: StrategyLegDraft;
  readonly availableContracts: readonly OptionContract[];
  readonly onTemplateChange: (template: StrategyTemplate) => void;
  readonly onDraftChange: (draft: StrategyLegDraft) => void;
  readonly onAddLeg: () => void;
  readonly onRemoveLeg: (legId: string) => void;
}

export function StrategyBuilder({
  analysis,
  draft,
  availableContracts,
  onTemplateChange,
  onDraftChange,
  onAddLeg,
  onRemoveLeg,
}: StrategyBuilderProps) {
  const maxMagnitude = Math.max(1, ...analysis.payoff.map((point) => Math.abs(point.profitLoss)));
  const hasManualPremium = draft.premium !== null && Number.isFinite(draft.premium) && draft.premium >= 0;
  return (
    <section className="research-subpanel research-strategy-builder" aria-label="Options strategy builder">
      <header className="research-subpanel-header">
        <div><span>READ-ONLY RESEARCH</span><h3>STRATEGY BUILDER</h3></div>
        <label><span>STRATEGY</span><select value={analysis.template} onChange={(event) => onTemplateChange(event.target.value as StrategyTemplate)}>{STRATEGY_TEMPLATES.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}</select></label>
      </header>
      <div className="research-strategy-entry">
        <label><span>SIDE</span><select value={draft.side} onChange={(event) => onDraftChange({ ...draft, side: event.target.value as StrategyLegDraft["side"] })}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label><span>QTY</span><input type="number" min="1" value={draft.quantity} onChange={(event) => onDraftChange({ ...draft, quantity: Math.max(1, Number(event.target.value)) })} /></label>
        <label className="research-filter-grow"><span>CONTRACT</span><select value={draft.contractSymbol} onChange={(event) => onDraftChange({ ...draft, contractSymbol: event.target.value })}><option value="">Select contract</option>{availableContracts.map((contract) => <option key={contract.symbol} value={contract.symbol}>{contract.symbol}</option>)}</select></label>
        <label><span>MANUAL PREMIUM</span><input type="number" min="0" step="0.01" value={draft.premium ?? ""} onChange={(event) => onDraftChange({ ...draft, premium: event.target.value === "" ? null : Number(event.target.value) })} placeholder="Required" /></label>
        <button type="button" className="research-action-button" onClick={onAddLeg} disabled={!draft.contractSymbol || !hasManualPremium}>ADD LEG</button>
      </div>
      <p className="research-manual-premium-note"><strong>MANUAL PREMIUM REQUIRED.</strong> Delayed last trades, day closes, and indicative midpoints are not substituted into strategy or payoff calculations.</p>
      <div className="research-table-wrap">
        <table className="research-table research-strategy-legs"><caption className="research-sr-only">Strategy legs</caption><thead><tr><th>SIDE</th><th>QTY</th><th>CONTRACT</th><th>MANUAL PREMIUM</th><th>DELTA</th><th>THETA</th><th><span className="research-sr-only">Actions</span></th></tr></thead><tbody>
          {analysis.legs.map((leg) => <tr key={leg.id}><td className={leg.side === "buy" ? "positive" : "negative"}>{leg.side.toUpperCase()}</td><td>{leg.quantity}</td><td>{leg.contract.symbol}</td><td title="User-entered scenario premium">{formatCurrency(leg.premium)}</td><td>{formatNumber(leg.contract.greeks.delta, 3)}</td><td>{formatNumber(leg.contract.greeks.theta, 3)}</td><td><button type="button" className="research-remove-button" onClick={() => onRemoveLeg(leg.id)} aria-label={`Remove ${leg.contract.symbol}`}>REMOVE</button></td></tr>)}
        </tbody></table>
      </div>
      <div className="research-strategy-analysis">
        <div className="research-metric-grid">
          <MetricCell label="NET DEBIT / CREDIT (MANUAL)" value={formatCurrency(analysis.netDebitCredit)} tone={analysis.netDebitCredit > 0 ? "negative" : "positive"} />
          <MetricCell label="MAX GAIN" value={analysis.maximumGain === null ? "UNDEFINED" : formatCurrency(analysis.maximumGain)} />
          <MetricCell label="MAX LOSS" value={analysis.maximumLoss === null ? "UNDEFINED" : formatCurrency(analysis.maximumLoss)} />
          <MetricCell label="BREAK-EVEN" value={analysis.breakEvenLevels.length ? analysis.breakEvenLevels.map((value) => formatCurrency(value)).join(" · ") : "—"} />
          <MetricCell label="NET Δ" value={formatNumber(analysis.combinedGreeks.delta, 3)} />
          <MetricCell label="NET Γ" value={formatNumber(analysis.combinedGreeks.gamma, 3)} />
          <MetricCell label="NET Θ" value={formatNumber(analysis.combinedGreeks.theta, 3)} />
          <MetricCell label="NET VEGA" value={formatNumber(analysis.combinedGreeks.vega, 3)} />
        </div>
        <div className="research-payoff-chart" role="img" aria-label="Strategy payoff at expiration">
          {analysis.payoff.map((point) => {
            const size = (Math.abs(point.profitLoss) / maxMagnitude) * 48;
            const style = { "--payoff-size": `${size}%` } as CSSProperties;
            return <div key={point.underlyingPrice} title={`${formatCurrency(point.underlyingPrice)}: ${formatCurrency(point.profitLoss)}`}><i className={point.profitLoss >= 0 ? "positive" : "negative"} style={style} /><span>{formatNumber(point.underlyingPrice, 0)}</span></div>;
          })}
        </div>
      </div>
      <p className="research-disclaimer">Scenario output is analytical and excludes assignment, early exercise, fees, taxes, and execution. This terminal does not place trades.</p>
    </section>
  );
}

export interface OptionsTerminalProps {
  readonly status: ResearchDataStatus;
  readonly underlying: OptionsUnderlying;
  readonly hasContracts: boolean;
  readonly filters: OptionChainFilters;
  readonly expirationDates: readonly string[];
  readonly nowIso: string;
  readonly chainAsOf: string;
  readonly quoteAvailability: OptionQuoteAvailability;
  readonly quoteNote: string;
  readonly rows: readonly OptionChainRow[];
  readonly selectedContract: OptionContract | null;
  readonly selectedContractBars: readonly AggregateBar[];
  readonly selectedManualPremium: number | null;
  readonly selectedBreakEven: number | null;
  readonly activityMetrics: readonly OptionActivityMetric[];
  readonly activityCandidates: readonly OptionActivityCandidate[];
  readonly activityRankings: readonly OptionActivityRanking[];
  readonly strikeDistribution: readonly OptionDistributionBucket[];
  readonly expirationDistribution: readonly OptionDistributionBucket[];
  readonly strategy: StrategyAnalysis;
  readonly strategyDraft: StrategyLegDraft;
  readonly strategyContracts: readonly OptionContract[];
  readonly onFiltersChange: (filters: OptionChainFilters) => void;
  readonly onContractSelect: (contract: OptionContract) => void;
  readonly onStrategyTemplateChange: (template: StrategyTemplate) => void;
  readonly onStrategyDraftChange: (draft: StrategyLegDraft) => void;
  readonly onStrategyAddLeg: () => void;
  readonly onStrategyRemoveLeg: (legId: string) => void;
}

export function OptionsTerminal(props: OptionsTerminalProps) {
  const strikes = props.rows.map((row) => row.strikePrice);
  const strikeRange = strikes.length
    ? [Math.min(...strikes), Math.max(...strikes)] as const
    : null;
  return (
    <ResearchFrame title={`${props.underlying.symbol} OPTIONS`} eyebrow="OPTIONS DEVELOPER" status={props.status} className="research-options-terminal">
      <OptionsDataDisclosure mode={props.status.mode} hasContracts={props.hasContracts} quoteAvailability={props.quoteAvailability} quoteNote={props.quoteNote} asOf={props.chainAsOf} />
      <OptionsHeader
        underlying={props.underlying}
        filters={props.filters}
        expirationDates={props.expirationDates}
        nowIso={props.nowIso}
        chainAsOf={props.chainAsOf}
        dataMode={props.status.mode}
        quoteAvailability={props.quoteAvailability}
        strikeRange={strikeRange}
        onFiltersChange={props.onFiltersChange}
      />
      <OptionChain rows={props.rows} hasContracts={props.hasContracts} quoteAvailability={props.quoteAvailability} selectedContractSymbol={props.selectedContract?.symbol ?? null} onContractSelect={props.onContractSelect} />
      <div className="research-options-secondary">
        <OptionContractDetail contract={props.selectedContract} underlyingPrice={props.underlying.quote.lastPrice} manualPremium={props.selectedManualPremium} breakEven={props.selectedBreakEven} quoteNote={props.quoteNote} bars={props.selectedContractBars} />
        <OptionActivityPanel metrics={props.activityMetrics} candidates={props.activityCandidates} rankings={props.activityRankings} strikeDistribution={props.strikeDistribution} expirationDistribution={props.expirationDistribution} onContractSelect={props.onContractSelect} />
      </div>
      <StrategyBuilder analysis={props.strategy} draft={props.strategyDraft} availableContracts={props.strategyContracts} onTemplateChange={props.onStrategyTemplateChange} onDraftChange={props.onStrategyDraftChange} onAddLeg={props.onStrategyAddLeg} onRemoveLeg={props.onStrategyRemoveLeg} />
    </ResearchFrame>
  );
}
