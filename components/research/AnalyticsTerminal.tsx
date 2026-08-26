"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  calculateBreadthPercentages,
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRatio,
  valueTone,
} from "@/lib/research";
import type {
  AdvancedAnalyticsView,
  BreadthPoint,
  BreadthSnapshot,
  CatalystTimelineItem,
  ComparisonCompany,
  ComparisonMetric,
  HeatmapCell,
  NewsPriceSeries,
  PatternCandidate,
  ResearchDataStatus,
} from "@/lib/research/types";
import { EmptyResearchState, MetricCell, ResearchFrame } from "./ResearchFrame";

export interface MarketHeatmapProps {
  readonly cells: readonly HeatmapCell[];
  readonly onTickerSelect?: (ticker: string) => void;
}

export function MarketHeatmap({ cells, onTickerSelect }: MarketHeatmapProps) {
  if (cells.length === 0) return <EmptyResearchState title="NO HEATMAP DATA" detail="No securities were supplied for this heatmap." />;
  const groups = [...new Set(cells.map((cell) => cell.group))];
  const maxWeight = Math.max(1, ...cells.map((cell) => cell.weight));
  return (
    <div className="research-heatmap" aria-label="Market performance heatmap">
      {groups.map((group) => {
        const groupCells = cells.filter((cell) => cell.group === group);
        return (
          <section key={group}>
            <header><strong>{group}</strong><span>{groupCells.length} SECURITIES</span></header>
            <div>
              {groupCells.map((cell) => {
                const normalizedWeight = Math.max(0.25, cell.weight / maxWeight);
                const intensity = Math.min(1, Math.abs(cell.value ?? 0) / 5);
                const style = {
                  "--heat-weight": normalizedWeight,
                  "--heat-intensity": 0.16 + intensity * 0.58,
                } as CSSProperties;
                return (
                  <button
                    type="button"
                    key={cell.id}
                    className={`research-heat-cell ${valueTone(cell.value)}`}
                    style={style}
                    onClick={() => onTickerSelect?.(cell.symbol)}
                    aria-label={`${cell.symbol}, ${cell.label}, ${formatPercent(cell.value)}`}
                  >
                    <strong>{cell.symbol}</strong>
                    <span>{formatPercent(cell.value)}</span>
                    <small>{cell.detail ?? cell.label}</small>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export interface MarketBreadthProps {
  readonly snapshot: BreadthSnapshot | null;
  readonly history: readonly BreadthPoint[];
}

export function MarketBreadth({ snapshot, history }: MarketBreadthProps) {
  if (!snapshot) return <EmptyResearchState title="NO BREADTH SNAPSHOT" detail="No advancing or declining issue counts were supplied." />;
  const percentages = calculateBreadthPercentages(snapshot);
  const maxAbsolute = Math.max(1, ...history.map((point) => Math.abs(point.advanceDecline)));
  return (
    <div className="research-breadth">
      <div className="research-metric-grid">
        <MetricCell label="ADVANCING" value={formatCompactNumber(snapshot.advancing)} detail={formatPercent(percentages.advancing, 1)} tone="positive" />
        <MetricCell label="DECLINING" value={formatCompactNumber(snapshot.declining)} detail={formatPercent(-percentages.declining, 1)} tone="negative" />
        <MetricCell label="UNCHANGED" value={formatCompactNumber(snapshot.unchanged)} detail={formatPercent(percentages.unchanged, 1)} />
        <MetricCell label="ABOVE 50D" value={formatPercent(snapshot.above50Day)} />
        <MetricCell label="ABOVE 200D" value={formatPercent(snapshot.above200Day)} />
        <MetricCell label="NEW HIGHS / LOWS" value={`${formatNumber(snapshot.newHighs, 0)} / ${formatNumber(snapshot.newLows, 0)}`} />
      </div>
      <div className="research-breadth-bar" aria-label="Advancing, declining, and unchanged shares">
        <i className="positive" style={{ width: `${percentages.advancing}%` }} title={`Advancing ${percentages.advancing.toFixed(1)}%`} />
        <i className="negative" style={{ width: `${percentages.declining}%` }} title={`Declining ${percentages.declining.toFixed(1)}%`} />
        <i style={{ width: `${percentages.unchanged}%` }} title={`Unchanged ${percentages.unchanged.toFixed(1)}%`} />
      </div>
      <section className="research-breadth-history" aria-label="Advance decline history">
        <header><span>ADVANCE − DECLINE</span><time dateTime={snapshot.asOf}>{formatDateTime(snapshot.asOf)}</time></header>
        {history.length === 0 ? <EmptyResearchState title="NO BREADTH HISTORY" detail="Only the current snapshot is available." /> : (
          <div role="img" aria-label="Historical advance decline values">
            {history.map((point) => {
              const height = (Math.abs(point.advanceDecline) / maxAbsolute) * 48;
              const style = { "--breadth-height": `${height}%` } as CSSProperties;
              return <i key={point.timestamp} className={point.advanceDecline >= 0 ? "positive" : "negative"} style={style} title={`${formatDateTime(point.timestamp)}: ${formatNumber(point.advanceDecline, 0)}`} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function formatComparisonValue(metric: ComparisonMetric, value: number | string | null): string {
  if (typeof value === "string") return value;
  if (value === null) return "—";
  if (metric.format === "currency") return formatCurrency(value);
  if (metric.format === "percent") return formatPercent(value);
  if (metric.format === "ratio") return formatRatio(value);
  return formatCompactNumber(value);
}

export interface CompanyComparisonProps {
  readonly companies: readonly ComparisonCompany[];
  readonly metrics: readonly ComparisonMetric[];
  readonly onTickerSelect?: (ticker: string) => void;
  readonly onRemoveCompany?: (symbol: string) => void;
}

export function CompanyComparison({ companies, metrics, onTickerSelect, onRemoveCompany }: CompanyComparisonProps) {
  if (companies.length === 0) return <EmptyResearchState title="NO COMPANIES" detail="Add securities to begin a side-by-side comparison." />;
  return (
    <div className="research-table-wrap">
      <table className="research-table research-comparison-table">
        <caption className="research-sr-only">Company metric comparison</caption>
        <thead><tr><th>METRIC</th>{companies.map((company) => <th key={company.symbol}><button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(company.symbol)}>{company.symbol}</button><small>{company.name}</small>{onRemoveCompany ? <button type="button" className="research-remove-button" onClick={() => onRemoveCompany(company.symbol)} aria-label={`Remove ${company.symbol}`}>×</button> : null}</th>)}</tr></thead>
        <tbody>{metrics.map((metric) => {
          const numericValues = companies.map((company) => metric.values[company.symbol]).filter((value): value is number => typeof value === "number");
          const best = numericValues.length === 0 || metric.preferred === "neutral" || !metric.preferred ? null : metric.preferred === "higher" ? Math.max(...numericValues) : Math.min(...numericValues);
          return <tr key={metric.id}><th scope="row">{metric.label}</th>{companies.map((company) => {
            const value = metric.values[company.symbol] ?? null;
            return <td key={company.symbol} className={typeof value === "number" && value === best ? "is-best" : ""}>{formatComparisonValue(metric, value)}</td>;
          })}</tr>;
        })}</tbody>
      </table>
    </div>
  );
}

export interface CatalystTimelineProps {
  readonly items: readonly CatalystTimelineItem[];
  readonly onTickerSelect?: (ticker: string) => void;
}

const TIMELINE_KIND_LABELS: Readonly<Record<CatalystTimelineItem["type"], string>> = {
  news: "NEWS",
  event: "CORPORATE EVENT",
  "price-move": "PRICE MOVE",
  "volume-spike": "VOLUME SPIKE",
  "options-activity": "OPTIONS ACTIVITY",
  note: "PRIVATE NOTE",
  earnings: "EARNINGS",
  filing: "FILING",
  analyst: "ANALYST",
  other: "OBSERVATION",
};

export function CatalystTimeline({ items, onTickerSelect }: CatalystTimelineProps) {
  return (
    <div className="research-catalyst-view">
      {items.length === 0
        ? <EmptyResearchState title="NO CATALYSTS" detail="No market observations or private notes were available for this ticker." />
        : (
          <ol className="research-catalyst-timeline" aria-label="Chronological ticker catalyst timeline">
            {items.map((item) => (
              <li
                key={item.id}
                className={`importance-${item.importance} timeline-kind-${item.type}`}
                data-kind={item.type}
              >
                <div className="research-timeline-rail"><i aria-hidden="true" /><time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time></div>
                <article>
                  <div className="research-detail-meta">
                    <button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(item.symbol)}>{item.symbol}</button>
                    <span className="research-timeline-kind">{TIMELINE_KIND_LABELS[item.type]}</span>
                    <span className="research-timeline-source">{item.sourceLabel}</span>
                  </div>
                  <h3>{item.title}</h3>
                  {item.description ? <p>{item.description}</p> : null}
                  {item.href ? <a href={item.href} target="_blank" rel="noreferrer">SOURCE ↗</a> : null}
                </article>
              </li>
            ))}
          </ol>
        )}
      <p className="research-disclaimer research-timeline-disclaimer">
        Timeline order shows chronology and possible correlation only. It does not establish that any item caused a market move.
      </p>
    </div>
  );
}

export interface NewsPriceTimelineProps {
  readonly series: NewsPriceSeries | null;
  readonly onMarkerSelect?: (markerId: string) => void;
}

export function NewsPriceTimeline({ series, onMarkerSelect }: NewsPriceTimelineProps) {
  if (!series || series.points.length === 0) return <EmptyResearchState title="NO NEWS / PRICE SERIES" detail="Price points and publication markers are required for this view." />;
  const minimum = Math.min(...series.points.map((point) => point.price));
  const maximum = Math.max(...series.points.map((point) => point.price));
  const range = Math.max(maximum - minimum, 0.01);
  return (
    <div className="research-news-price">
      <header><div><span>SECURITY</span><strong>{series.symbol}</strong></div><div><span>INTERVAL</span><strong>{series.interval}</strong></div><div><span>RANGE</span><strong>{formatCurrency(minimum)} — {formatCurrency(maximum)}</strong></div></header>
      <div className="research-price-columns" role="img" aria-label={`${series.symbol} price timeline`}>
        {series.points.map((point) => {
          const height = 12 + ((point.price - minimum) / range) * 78;
          const marker = series.markers.find((candidate) => candidate.timestamp === point.timestamp);
          const style = { "--price-height": `${height}%` } as CSSProperties;
          return <div key={point.timestamp} style={style} title={`${formatDateTime(point.timestamp)} ${formatCurrency(point.price)}`}><i />{marker ? <button type="button" onClick={() => onMarkerSelect?.(marker.id)} aria-label={`Open news marker: ${marker.title}`}>N</button> : null}</div>;
        })}
      </div>
      <div className="research-table-wrap">
        <table className="research-table research-news-markers"><caption className="research-sr-only">News events plotted against price</caption><thead><tr><th>TIME</th><th>CATEGORY</th><th>HEADLINE</th><th>PRICE AT NEWS</th><th>MOVE AFTER</th></tr></thead><tbody>
          {series.markers.map((marker) => <tr key={marker.id}><td>{formatDateTime(marker.timestamp)}</td><td>{marker.category}</td><td><button type="button" className="research-headline" onClick={() => onMarkerSelect?.(marker.id)}>{marker.title}</button></td><td>{formatCurrency(marker.priceAtPublication)}</td><td className={valueTone(marker.changeAfterPercent)}>{formatPercent(marker.changeAfterPercent)}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}

export interface PatternResearchProps {
  readonly candidates: readonly PatternCandidate[];
  readonly onTickerSelect?: (ticker: string) => void;
}

export function PatternResearch({ candidates, onTickerSelect }: PatternResearchProps) {
  if (candidates.length === 0) return <EmptyResearchState title="NO PATTERN CANDIDATES" detail="No experimental detections were supplied for this universe." />;
  return (
    <div className="research-pattern-grid">
      {candidates.map((candidate) => (
        <article key={candidate.id}>
          <header>
            <button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(candidate.symbol)}>{candidate.symbol}</button>
            <span className={`research-volume-status status-${candidate.volumeConfirmation}`}>{candidate.volumeConfirmation.replaceAll("-", " ")}</span>
          </header>
          <h3>{candidate.pattern.replaceAll("-", " ")}</h3>
          <div className="research-confidence"><span>MODEL CONFIDENCE</span><strong>{formatPercent(candidate.confidence * 100, 0)}</strong><i><b style={{ width: `${Math.max(0, Math.min(100, candidate.confidence * 100))}%` }} /></i></div>
          <dl>{candidate.priceLevels.map((level) => <div key={level.label}><dt>{level.label}</dt><dd>{formatCurrency(level.price)}</dd></div>)}</dl>
          <ul>{candidate.reasoning.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <time dateTime={candidate.detectedAt}>{formatDateTime(candidate.detectedAt)}</time>
        </article>
      ))}
      <p className="research-disclaimer">Experimental pattern candidates are probabilistic observations, not confirmed formations, forecasts, or trading recommendations.</p>
    </div>
  );
}

const ANALYTICS_VIEWS: readonly { value: AdvancedAnalyticsView; label: string }[] = [
  { value: "heatmap", label: "HEATMAP" },
  { value: "breadth", label: "BREADTH" },
  { value: "comparison", label: "COMPARISON" },
  { value: "catalysts", label: "CATALYSTS" },
  { value: "news-price", label: "NEWS / PRICE" },
  { value: "patterns", label: "PATTERNS" },
];

export interface AnalyticsTerminalProps {
  readonly status: ResearchDataStatus;
  readonly activeView: AdvancedAnalyticsView;
  readonly heatmapCells: readonly HeatmapCell[];
  readonly breadthSnapshot: BreadthSnapshot | null;
  readonly breadthHistory: readonly BreadthPoint[];
  readonly comparisonCompanies: readonly ComparisonCompany[];
  readonly comparisonMetrics: readonly ComparisonMetric[];
  readonly comparisonControls?: ReactNode;
  readonly catalysts: readonly CatalystTimelineItem[];
  readonly newsPriceSeries: NewsPriceSeries | null;
  readonly patterns: readonly PatternCandidate[];
  readonly onViewChange: (view: AdvancedAnalyticsView) => void;
  readonly onTickerSelect?: (ticker: string) => void;
  readonly onRemoveComparisonCompany?: (symbol: string) => void;
  readonly onNewsMarkerSelect?: (markerId: string) => void;
}

export function AnalyticsTerminal(props: AnalyticsTerminalProps) {
  let content;
  if (props.activeView === "heatmap") content = <MarketHeatmap cells={props.heatmapCells} onTickerSelect={props.onTickerSelect} />;
  else if (props.activeView === "breadth") content = <MarketBreadth snapshot={props.breadthSnapshot} history={props.breadthHistory} />;
  else if (props.activeView === "comparison") content = (
    <div className="research-comparison-view">
      {props.comparisonControls}
      <CompanyComparison companies={props.comparisonCompanies} metrics={props.comparisonMetrics} onTickerSelect={props.onTickerSelect} onRemoveCompany={props.onRemoveComparisonCompany} />
    </div>
  );
  else if (props.activeView === "catalysts") content = <CatalystTimeline items={props.catalysts} onTickerSelect={props.onTickerSelect} />;
  else if (props.activeView === "news-price") content = <NewsPriceTimeline series={props.newsPriceSeries} onMarkerSelect={props.onNewsMarkerSelect} />;
  else content = <PatternResearch candidates={props.patterns} onTickerSelect={props.onTickerSelect} />;

  return (
    <ResearchFrame
      title="ADVANCED ANALYTICS"
      eyebrow="CROSS-MARKET RESEARCH"
      status={props.status}
      className="research-analytics-terminal"
      actions={<div className="research-segmented research-analytics-tabs" role="tablist" aria-label="Analytics view">{ANALYTICS_VIEWS.map((view) => <button type="button" role="tab" key={view.value} aria-selected={props.activeView === view.value} className={props.activeView === view.value ? "is-active" : ""} onClick={() => props.onViewChange(view.value)}>{view.label}</button>)}</div>}
    >
      <div role="tabpanel" className="research-analytics-content">{content}</div>
    </ResearchFrame>
  );
}
