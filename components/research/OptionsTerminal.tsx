"use client";

import type { CSSProperties } from "react";
import type { AggregateBar, OptionContract } from "@/types";
import {
  calculateDaysToExpiration,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRatio,
  valueTone,
} from "@/lib/research";
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
  if (!contract || contract.bidPrice === null || contract.askPrice === null) return null;
  return (contract.bidPrice + contract.askPrice) / 2;
}

interface ChainSideCellsProps {
  readonly contract: OptionContract | null;
  readonly moneyness: OptionChainRow["callMoneyness"];
  readonly onSelect?: (contract: OptionContract) => void;
}

function ChainSideCells({ contract, moneyness, onSelect }: ChainSideCellsProps) {
  if (!contract) {
    return <td colSpan={11} className="research-option-empty">—</td>;
  }
  return (
    <>
      <td className={`option-${moneyness}`}>
        <button type="button" className="research-contract-button" onClick={() => onSelect?.(contract)}>
          {optionValue(contract.bidPrice, "price")}
        </button>
      </td>
      <td className={`option-${moneyness}`}>{optionValue(contract.askPrice, "price")}</td>
      <td className={`option-${moneyness}`}>{optionValue(contractMidpoint(contract), "price")}</td>
      <td className={`option-${moneyness}`}>{optionValue(contract.lastPrice, "price")}</td>
      <td className={`option-${moneyness}`}>{formatCompactNumber(contract.volume)}</td>
      <td className={`option-${moneyness}`}>{formatCompactNumber(contract.openInterest)}</td>
      <td className={`option-${moneyness}`}>{optionValue(contract.impliedVolatility, "percent")}</td>
      <td className={`option-${moneyness}`}>{optionValue(contract.greeks.delta)}</td>
      <td className={`option-${moneyness}`}>{optionValue(contract.greeks.gamma, "number")}</td>
      <td className={`option-${moneyness}`}>{optionValue(contract.greeks.theta)}</td>
      <td className={`option-${moneyness}`}>{optionValue(contract.greeks.vega)}</td>
    </>
  );
}

export interface OptionsHeaderProps {
  readonly underlying: OptionsUnderlying;
  readonly filters: OptionChainFilters;
  readonly expirationDates: readonly string[];
  readonly nowIso: string;
  readonly onFiltersChange: (filters: OptionChainFilters) => void;
}

export function OptionsHeader({
  underlying,
  filters,
  expirationDates,
  nowIso,
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
      <MetricCell label="IV RANK" value={formatPercent(underlying.ivRank)} />
      <MetricCell label="IV PERCENTILE" value={formatPercent(underlying.ivPercentile)} />
      <label className="research-option-expiration">
        <span>EXPIRATION</span>
        <select value={filters.expirationDate} onChange={(event) => update("expirationDate", event.target.value)}>
          {expirationDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
        </select>
      </label>
      <div className="research-dte"><span>DTE</span><strong>{dte ?? "—"}</strong></div>
      <div className="research-chain-quick-filters">
        <label><span>STRIKE MIN</span><input type="number" value={filters.strikeMin ?? ""} onChange={(event) => update("strikeMin", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>STRIKE MAX</span><input type="number" value={filters.strikeMax ?? ""} onChange={(event) => update("strikeMax", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>MIN VOL</span><input type="number" min="0" value={filters.minimumVolume ?? ""} onChange={(event) => update("minimumVolume", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label><span>MIN OI</span><input type="number" min="0" value={filters.minimumOpenInterest ?? ""} onChange={(event) => update("minimumOpenInterest", event.target.value === "" ? null : Number(event.target.value))} /></label>
      </div>
    </div>
  );
}

export interface OptionChainProps {
  readonly rows: readonly OptionChainRow[];
  readonly selectedContractSymbol: string | null;
  readonly onContractSelect?: (contract: OptionContract) => void;
}

export function OptionChain({ rows, selectedContractSymbol, onContractSelect }: OptionChainProps) {
  if (rows.length === 0) return <EmptyResearchState title="NO CONTRACTS" detail="No option contracts match the active chain filters." />;
  const columns = ["BID", "ASK", "MID", "LAST", "VOL", "OI", "IV", "Δ", "Γ", "Θ", "V"];
  return (
    <div className="research-table-wrap research-option-chain-wrap">
      <table className="research-table research-option-chain">
        <caption className="research-sr-only">Option chain with calls and puts by strike</caption>
        <thead>
          <tr className="research-option-groups"><th colSpan={11}>CALLS</th><th rowSpan={2}>STRIKE</th><th colSpan={11}>PUTS</th></tr>
          <tr>{columns.map((column) => <th key={`call-${column}`}>{column}</th>)}{columns.map((column) => <th key={`put-${column}`}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.strikePrice}
              className={row.call?.symbol === selectedContractSymbol || row.put?.symbol === selectedContractSymbol ? "is-selected" : ""}
            >
              <ChainSideCells contract={row.call} moneyness={row.callMoneyness} onSelect={onContractSelect} />
              <th scope="row" className="research-strike">{formatCurrency(row.strikePrice)}</th>
              <ChainSideCells contract={row.put} moneyness={row.putMoneyness} onSelect={onContractSelect} />
            </tr>
          ))}
        </tbody>
      </table>
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
  readonly breakEven: number | null;
  readonly bars: readonly AggregateBar[];
}

export function OptionContractDetail({ contract, underlyingPrice, breakEven, bars }: OptionContractDetailProps) {
  if (!contract) return <EmptyResearchState title="SELECT A CONTRACT" detail="Choose a call or put to inspect contract research." />;
  return (
    <article className="research-contract-detail">
      <header>
        <span>OPTION CONTRACT</span>
        <h3>{contract.underlyingSymbol} {contract.expirationDate} {formatNumber(contract.strikePrice)}{contract.type === "call" ? "C" : "P"}</h3>
        <small>{contract.symbol}</small>
      </header>
      <div className="research-metric-grid research-contract-metrics">
        <MetricCell label="LAST" value={formatCurrency(contract.lastPrice)} />
        <MetricCell label="BID" value={formatCurrency(contract.bidPrice)} />
        <MetricCell label="ASK" value={formatCurrency(contract.askPrice)} />
        <MetricCell label="VOLUME" value={formatCompactNumber(contract.volume)} />
        <MetricCell label="OPEN INTEREST" value={formatCompactNumber(contract.openInterest)} />
        <MetricCell label="IV" value={contract.impliedVolatility === null ? "—" : `${(contract.impliedVolatility * 100).toFixed(1)}%`} />
        <MetricCell label="DELTA" value={formatNumber(contract.greeks.delta, 3)} />
        <MetricCell label="GAMMA" value={formatNumber(contract.greeks.gamma, 3)} />
        <MetricCell label="THETA" value={formatNumber(contract.greeks.theta, 3)} />
        <MetricCell label="VEGA" value={formatNumber(contract.greeks.vega, 3)} />
        <MetricCell label="UNDERLYING" value={formatCurrency(underlyingPrice)} />
        <MetricCell label="BREAK-EVEN" value={formatCurrency(breakEven)} />
        <MetricCell label="INTRINSIC" value={formatCurrency(contract.intrinsicValue)} />
        <MetricCell label="EXTRINSIC" value={formatCurrency(contract.extrinsicValue)} />
      </div>
      <ContractSparkBars bars={bars} />
    </article>
  );
}

export interface OptionActivityPanelProps {
  readonly metrics: readonly OptionActivityMetric[];
  readonly candidates: readonly OptionActivityCandidate[];
  readonly onContractSelect?: (contract: OptionContract) => void;
}

export function OptionActivityPanel({ metrics, candidates, onContractSelect }: OptionActivityPanelProps) {
  return (
    <section className="research-subpanel" aria-label="Options activity analytics">
      <header className="research-subpanel-header"><div><span>DERIVATIVES RESEARCH</span><h3>OPTION ACTIVITY</h3></div></header>
      <div className="research-metric-grid research-activity-metrics">
        {metrics.map((metric) => <MetricCell key={metric.label} label={metric.label} value={formatNumber(metric.value)} detail={metric.detail} tone={metric.tone} />)}
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
        <label><span>PREMIUM</span><input type="number" min="0" step="0.01" value={draft.premium ?? ""} onChange={(event) => onDraftChange({ ...draft, premium: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <button type="button" className="research-action-button" onClick={onAddLeg} disabled={!draft.contractSymbol}>ADD LEG</button>
      </div>
      <div className="research-table-wrap">
        <table className="research-table research-strategy-legs"><caption className="research-sr-only">Strategy legs</caption><thead><tr><th>SIDE</th><th>QTY</th><th>CONTRACT</th><th>PREMIUM</th><th>DELTA</th><th>THETA</th><th><span className="research-sr-only">Actions</span></th></tr></thead><tbody>
          {analysis.legs.map((leg) => <tr key={leg.id}><td className={leg.side === "buy" ? "positive" : "negative"}>{leg.side.toUpperCase()}</td><td>{leg.quantity}</td><td>{leg.contract.symbol}</td><td>{formatCurrency(leg.premium)}</td><td>{formatNumber(leg.contract.greeks.delta, 3)}</td><td>{formatNumber(leg.contract.greeks.theta, 3)}</td><td><button type="button" className="research-remove-button" onClick={() => onRemoveLeg(leg.id)} aria-label={`Remove ${leg.contract.symbol}`}>REMOVE</button></td></tr>)}
        </tbody></table>
      </div>
      <div className="research-strategy-analysis">
        <div className="research-metric-grid">
          <MetricCell label="NET DEBIT / CREDIT" value={formatCurrency(analysis.netDebitCredit)} tone={analysis.netDebitCredit > 0 ? "negative" : "positive"} />
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
  readonly filters: OptionChainFilters;
  readonly expirationDates: readonly string[];
  readonly nowIso: string;
  readonly rows: readonly OptionChainRow[];
  readonly selectedContract: OptionContract | null;
  readonly selectedContractBars: readonly AggregateBar[];
  readonly selectedBreakEven: number | null;
  readonly activityMetrics: readonly OptionActivityMetric[];
  readonly activityCandidates: readonly OptionActivityCandidate[];
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
  return (
    <ResearchFrame title={`${props.underlying.symbol} OPTIONS`} eyebrow="OPTIONS DEVELOPER" status={props.status} className="research-options-terminal">
      <OptionsHeader underlying={props.underlying} filters={props.filters} expirationDates={props.expirationDates} nowIso={props.nowIso} onFiltersChange={props.onFiltersChange} />
      <OptionChain rows={props.rows} selectedContractSymbol={props.selectedContract?.symbol ?? null} onContractSelect={props.onContractSelect} />
      <div className="research-options-secondary">
        <OptionContractDetail contract={props.selectedContract} underlyingPrice={props.underlying.quote.lastPrice} breakEven={props.selectedBreakEven} bars={props.selectedContractBars} />
        <OptionActivityPanel metrics={props.activityMetrics} candidates={props.activityCandidates} onContractSelect={props.onContractSelect} />
      </div>
      <StrategyBuilder analysis={props.strategy} draft={props.strategyDraft} availableContracts={props.strategyContracts} onTemplateChange={props.onStrategyTemplateChange} onDraftChange={props.onStrategyDraftChange} onAddLeg={props.onStrategyAddLeg} onRemoveLeg={props.onStrategyRemoveLeg} />
    </ResearchFrame>
  );
}

