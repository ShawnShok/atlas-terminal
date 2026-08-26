"use client";

import type { ReactNode } from "react";
import type { SecurityResearchBundle } from "@/types/research";
import {
  stockCompact,
  stockCurrency,
  stockDateTime,
  stockNumber,
  stockPercent,
  stockTone,
} from "@/lib/stocks";
import type {
  ChartDisplaySettings,
  ChartIndicatorSeries,
  StockDataStatus,
  StockTerminalView,
} from "@/lib/stocks";
import { PriceChart } from "@/components/charts";
import { StockEmptyState, StockFrame } from "./StockFrame";
import { TickerSearch, type TickerSearchProps } from "./TickerSearch";

interface QuoteMetricProps {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly tone?: "positive" | "negative" | "neutral";
}

function QuoteMetric({ label, value, detail, tone = "neutral" }: QuoteMetricProps) {
  return <div className={`stock-quote-metric ${tone}`}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

export interface StockQuoteHeaderProps {
  readonly security: SecurityResearchBundle;
}

export function StockQuoteHeader({ security }: StockQuoteHeaderProps) {
  const { details, snapshot } = security;
  const quote = snapshot.quote;
  const tone = stockTone(quote.changePercent);
  const spread = quote.bidPrice !== null && quote.askPrice !== null && quote.askPrice >= quote.bidPrice
    ? quote.askPrice - quote.bidPrice
    : null;
  const dailyRvol = quote.volume !== null && quote.averageVolume !== null && quote.averageVolume > 0
    ? quote.volume / quote.averageVolume
    : null;
  return (
    <header className="stock-quote-header">
      <div className="stock-security-identity">
        <div className="stock-security-symbol"><strong>{details.symbol}</strong><span>{details.primaryExchange ?? details.market ?? "—"}</span></div>
        <div><h1>{details.name}</h1><p>{details.assetType ?? "Security"} · {details.currency ?? "—"}</p></div>
      </div>
      <div className="stock-last-price">
        <span>LAST</span>
        <strong>{stockCurrency(quote.lastPrice)}</strong>
        <em className={tone}>{stockCurrency(quote.change)} · {stockPercent(quote.changePercent)}</em>
      </div>
      {quote.bidPrice !== null ? <QuoteMetric label="BID" value={stockCurrency(quote.bidPrice)} detail={quote.bidSize === null ? undefined : `${stockNumber(quote.bidSize, 0)} ×`} /> : null}
      {quote.askPrice !== null ? <QuoteMetric label="ASK" value={stockCurrency(quote.askPrice)} detail={quote.askSize === null ? undefined : `${stockNumber(quote.askSize, 0)} ×`} /> : null}
      {spread !== null ? <QuoteMetric label="SPREAD" value={stockCurrency(spread)} /> : null}
      <QuoteMetric label="VOLUME" value={stockCompact(quote.volume)} detail={quote.averageVolume === null ? "AVERAGE UNAVAILABLE" : `AVG ${stockCompact(quote.averageVolume)}`} />
      <QuoteMetric label="DAILY RVOL" value={dailyRvol === null ? "—" : `${stockNumber(dailyRvol)}×`} detail={dailyRvol === null ? "BASELINE UNAVAILABLE" : "VOLUME / AVG VOLUME"} />
      <QuoteMetric label="MARKET CAP" value={stockCompact(quote.marketCap ?? details.marketCap)} />
      <div className="stock-session-block"><span>SESSION</span><strong>{quote.session.replaceAll("-", " ")}</strong><time dateTime={quote.asOf}>{stockDateTime(quote.asOf)}</time></div>
    </header>
  );
}

export interface StockOverviewProps {
  readonly security: SecurityResearchBundle;
}

export function StockOverview({ security }: StockOverviewProps) {
  const { details, snapshot } = security;
  const quote = snapshot.quote;
  const high52Week = security.bars.length ? Math.max(...security.bars.map((bar) => bar.high)) : null;
  const low52Week = security.bars.length ? Math.min(...security.bars.map((bar) => bar.low)) : null;
  return (
    <div className="stock-overview">
      <section className="stock-overview-metrics" aria-label="Trading overview">
        <header><span>SESSION</span><h3>TRADING OVERVIEW</h3></header>
        <div className="stock-metric-grid">
          <QuoteMetric label="OPEN" value={stockCurrency(quote.open)} />
          <QuoteMetric label="HIGH" value={stockCurrency(quote.high)} />
          <QuoteMetric label="LOW" value={stockCurrency(quote.low)} />
          <QuoteMetric label="PREVIOUS CLOSE" value={stockCurrency(quote.previousClose)} />
          <QuoteMetric label="VWAP" value={stockCurrency(quote.vwap)} />
          <QuoteMetric label="LAST TRADE" value={snapshot.latestTrade ? stockCurrency(snapshot.latestTrade.price) : "—"} detail={snapshot.latestTrade ? `${stockNumber(snapshot.latestTrade.size, 0)} SHARES` : undefined} />
          <QuoteMetric label="DAY RANGE" value={quote.low === null || quote.high === null ? "—" : `${stockCurrency(quote.low)} — ${stockCurrency(quote.high)}`} />
          <QuoteMetric label="52-WEEK HIGH" value={stockCurrency(high52Week)} />
          <QuoteMetric label="52-WEEK LOW" value={stockCurrency(low52Week)} />
          <QuoteMetric label="DATA QUALITY" value={quote.quality.replaceAll("-", " ").toUpperCase()} detail={quote.source.toUpperCase()} />
        </div>
      </section>
      <section className="stock-company-profile" aria-label="Company profile">
        <header><span>REFERENCE</span><h3>COMPANY PROFILE</h3></header>
        <dl>
          <div><dt>PRIMARY EXCHANGE</dt><dd>{details.primaryExchange ?? "—"}</dd></div>
          <div><dt>MARKET / LOCALE</dt><dd>{[details.market, details.locale].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt>INDUSTRY</dt><dd>{details.sicDescription ?? "—"}</dd></div>
          <div><dt>SIC CODE</dt><dd>{details.sicCode ?? "—"}</dd></div>
          <div><dt>EMPLOYEES</dt><dd>{stockCompact(details.totalEmployees)}</dd></div>
          <div><dt>LIST DATE</dt><dd>{details.listDate ?? "—"}</dd></div>
          <div><dt>SHARES OUTSTANDING</dt><dd>{stockCompact(details.weightedSharesOutstanding)}</dd></div>
          <div><dt>CIK</dt><dd>{details.cik ?? "—"}</dd></div>
        </dl>
        {details.description ? <p>{details.description}</p> : <p className="stock-muted">No company description was supplied.</p>}
        {details.homepageUrl ? <a href={details.homepageUrl} target="_blank" rel="noreferrer">COMPANY WEBSITE ↗</a> : null}
      </section>
    </div>
  );
}

export interface StockTerminalProps {
  readonly status: StockDataStatus;
  readonly security: SecurityResearchBundle | null;
  readonly activeView: StockTerminalView;
  readonly chartSettings: ChartDisplaySettings;
  readonly indicatorSeries: readonly ChartIndicatorSeries[];
  readonly search?: TickerSearchProps;
  readonly overviewIntelligence?: ReactNode;
  readonly onChartSettingsChange: (settings: ChartDisplaySettings) => void;
}

export function StockTerminal({
  status,
  security,
  activeView,
  chartSettings,
  indicatorSeries,
  search,
  overviewIntelligence,
  onChartSettingsChange,
}: StockTerminalProps) {
  return (
    <StockFrame
      title={security ? `${security.details.symbol} SECURITY` : "SECURITY RESEARCH"}
      eyebrow="U.S. EQUITIES"
      status={status}
      className={`stock-terminal stock-terminal-${activeView}`}
      actions={search ? <TickerSearch {...search} /> : undefined}
    >
      {security ? (
        <>
          <StockQuoteHeader security={security} />
          {activeView === "overview" ? <><StockOverview security={security} />{overviewIntelligence}</> : (
            <PriceChart
              symbol={security.details.symbol}
              bars={security.bars}
              status={status}
              settings={chartSettings}
              indicatorSeries={indicatorSeries}
              onSettingsChange={onChartSettingsChange}
            />
          )}
        </>
      ) : (
        <StockEmptyState
          title={status.state === "loading" ? "LOADING SECURITY" : "NO SECURITY SELECTED"}
          detail={status.message ?? "Search for a U.S. equity to open its normalized research bundle."}
        />
      )}
    </StockFrame>
  );
}
