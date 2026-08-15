"use client";

import { useMemo, useState } from "react";

import { useResearchData } from "@/hooks/useResearchData";
import { formatCompact, formatCurrency, formatDate } from "@/lib/format";
import type {
  FinancialLineItem,
  FinancialResearchBundle,
  FinancialTimeframe,
  NormalizedFinancialPeriod,
} from "@/types";

import { DataState, FreshnessStrip } from "./DataState";

type FinancialView = "income" | "balance-sheet" | "cash-flow" | "ratios" | "growth";

const VIEW_LABELS: Readonly<Record<FinancialView, string>> = {
  income: "INCOME",
  "balance-sheet": "BALANCE SHEET",
  "cash-flow": "CASH FLOW",
  ratios: "RATIOS",
  growth: "GROWTH",
};

function periodsFor(bundle: FinancialResearchBundle, view: FinancialView): readonly NormalizedFinancialPeriod[] {
  if (view === "income" || view === "growth") return bundle.incomeStatements;
  if (view === "balance-sheet") return bundle.balanceSheets;
  if (view === "cash-flow") return bundle.cashFlowStatements;
  return [];
}

function metricValue(item: FinancialLineItem | undefined): string {
  if (!item || item.value === null) return "—";
  if (item.unit.toUpperCase() === "USD") return formatCurrency(item.value);
  if (item.unit === "shares") return formatCompact(item.value);
  if (item.unit === "percent") return `${(item.value * 100).toFixed(2)}%`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(item.value);
}

function periodLabel(period: NormalizedFinancialPeriod): string {
  if (period.timeframe === "ttm") return `TTM ${formatDate(period.periodEnd)}`;
  if (period.timeframe === "annual") return `FY ${period.fiscalYear ?? "—"}`;
  return `Q${period.fiscalQuarter ?? "—"} ${period.fiscalYear ?? "—"}`;
}

function FinancialTable({ periods }: { periods: readonly NormalizedFinancialPeriod[] }) {
  const metrics = [...new Map(periods.flatMap((period) => period.metrics).map((metric) => [metric.key, metric])).values()];
  if (!periods.length) return <div className="financial-empty"><strong>NO ENTITLED DATA</strong><span>The provider returned no periods for this statement and timeframe.</span></div>;
  return (
    <div className="financial-table-wrap">
      <table className="financial-table">
        <caption className="research-sr-only">Financial statement periods</caption>
        <thead><tr><th>METRIC</th>{periods.slice(0, 8).map((period) => <th key={period.id}>{periodLabel(period)}<small>{period.periodEnd}</small></th>)}</tr></thead>
        <tbody>{metrics.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}<small>{metric.unit}</small></th>{periods.slice(0, 8).map((period) => <td key={period.id}>{metricValue(period.metrics.find((candidate) => candidate.key === metric.key))}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function GrowthTable({ periods }: { periods: readonly NormalizedFinancialPeriod[] }) {
  const revenuePeriods = periods
    .map((period) => ({ period, metric: period.metrics.find((metric) => metric.key.toLowerCase().includes("revenue")) }))
    .filter((item): item is { period: NormalizedFinancialPeriod; metric: FinancialLineItem & { value: number } } => typeof item.metric?.value === "number");
  if (revenuePeriods.length < 2) return <div className="financial-empty"><strong>INSUFFICIENT HISTORY</strong><span>At least two comparable revenue periods are required for growth calculations.</span></div>;
  return (
    <div className="financial-table-wrap">
      <table className="financial-table">
        <caption className="research-sr-only">Calculated revenue growth</caption>
        <thead><tr><th>PERIOD</th><th>REVENUE</th><th>SEQUENTIAL</th><th>YEAR OVER YEAR</th></tr></thead>
        <tbody>{revenuePeriods.slice(0, 8).map((item, index) => {
          const prior = revenuePeriods[index + 1]?.metric.value;
          const yearPrior = revenuePeriods[index + (item.period.timeframe === "quarterly" ? 4 : 1)]?.metric.value;
          const change = (base: number | undefined) => base && base !== 0 ? ((item.metric.value - base) / Math.abs(base)) * 100 : null;
          const sequential = change(prior);
          const yearOverYear = change(yearPrior);
          return <tr key={item.period.id}><th>{periodLabel(item.period)}<small>{item.period.periodEnd}</small></th><td>{metricValue(item.metric)}</td><td className={(sequential ?? 0) >= 0 ? "positive" : "negative"}>{sequential === null ? "—" : `${sequential >= 0 ? "+" : ""}${sequential.toFixed(2)}%`}</td><td className={(yearOverYear ?? 0) >= 0 ? "positive" : "negative"}>{yearOverYear === null ? "—" : `${yearOverYear >= 0 ? "+" : ""}${yearOverYear.toFixed(2)}%`}</td></tr>;
        })}</tbody>
      </table>
      <p className="research-disclaimer">Growth is calculated from normalized filed periods. Restatements and incomparable fiscal periods can affect results.</p>
    </div>
  );
}

export function LiveFinancialsPanel({ ticker }: { ticker: string }) {
  const [view, setView] = useState<FinancialView>("income");
  const [timeframe, setTimeframe] = useState<FinancialTimeframe>("quarterly");
  const result = useResearchData<FinancialResearchBundle>("financials", { ticker }, { refreshMs: 6 * 60 * 60_000 });
  const periods = useMemo(() => result.data ? periodsFor(result.data, view).filter((period) => period.timeframe === timeframe) : [], [result.data, timeframe, view]);

  if (!result.data) return <DataState loading={result.loading} error={result.error} onRetry={result.reload} />;
  return (
    <section className="financial-terminal" aria-label={`${ticker} financial research`}>
      <header className="financial-header">
        <div><span>FUNDAMENTAL RESEARCH</span><h2>{ticker} FINANCIALS</h2></div>
        <FreshnessStrip meta={result.meta} refreshing={result.refreshing} />
      </header>
      <nav className="financial-tabs" aria-label="Financial view">{Object.entries(VIEW_LABELS).map(([key, label]) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => setView(key as FinancialView)}>{label}</button>)}</nav>
      {view !== "ratios" && <div className="financial-timeframes" role="group" aria-label="Financial timeframe">{(["annual", "quarterly", "ttm"] as const).map((value) => <button type="button" key={value} className={timeframe === value ? "is-active" : ""} onClick={() => setTimeframe(value)}>{value.toUpperCase()}</button>)}</div>}
      {result.data.unavailableSections.length > 0 && <div className="financial-entitlement"><strong>SUBSCRIPTION LIMIT</strong><span>Unavailable: {result.data.unavailableSections.join(", ")}. ATLAS does not fabricate missing sections.</span></div>}
      <div className="financial-content">
        {view === "ratios" ? (
          result.data.ratios.length ? <div className="ratio-grid">{result.data.ratios.map((ratio) => <div key={ratio.key}><span>{ratio.label}</span><strong>{ratio.value === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(ratio.value)}</strong></div>)}</div> : <div className="financial-empty"><strong>RATIOS UNAVAILABLE</strong><span>The current Massive entitlement returned no ratio data. Forward P/E requires a separate forward-estimates dataset.</span></div>
        ) : view === "growth" ? <GrowthTable periods={periods} /> : <FinancialTable periods={periods} />}
      </div>
      <footer className="financial-footer">AS OF {formatDate(result.data.asOf)} · HISTORICAL FILINGS · RESEARCH ONLY</footer>
    </section>
  );
}
