"use client";

import { useMemo, useState } from "react";

import {
  HomeDashboard,
  MarketMovers,
  StockTerminal,
  TickerSearch,
  Watchlist,
  type TickerSearchProps,
} from "@/components/stocks";
import { useResearchData } from "@/hooks/useResearchData";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  averageTrueRange,
  bollingerBands,
  cumulativeVwap,
  exponentialMovingAverage,
  movingAverageConvergenceDivergence,
  relativeStrengthIndex,
  simpleMovingAverage,
} from "@/lib/indicators";
import {
  type ChartDisplaySettings,
  type ChartIndicatorSeries,
  type ChartInterval,
  type ChartTimeframe,
  type MarketMoverSide,
  type StockDataStatus,
  type WatchlistSortKey,
} from "@/lib/stocks";
import type {
  CorporateEvent,
  MarketMovers as MarketMoversData,
  MarketSnapshotRow,
  NewsArticle,
  SecurityResearchBundle,
  TerminalApiMeta,
  TickerSearchResult,
  WatchlistResearchBundle,
} from "@/types";

import { DataState, FreshnessStrip } from "./DataState";

const CORE_SYMBOLS = ["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "META", "PLTR", "TSLA"] as const;

const DEFAULT_CHART_SETTINGS: ChartDisplaySettings = {
  timeframe: "1Y",
  interval: "1D",
  seriesType: "candlestick",
  volumeVisible: true,
  activeIndicators: ["sma", "ema", "vwap"],
};

const INTERVALS_BY_TIMEFRAME: Readonly<Record<ChartTimeframe, readonly ChartInterval[]>> = {
  "1D": ["1m", "5m", "15m", "30m", "1h"],
  "5D": ["5m", "15m", "30m", "1h"],
  "1M": ["30m", "1h", "4h", "1D"],
  "3M": ["1h", "4h", "1D"],
  "6M": ["4h", "1D"],
  YTD: ["1D", "1W"],
  "1Y": ["1D", "1W"],
  "3Y": ["1D", "1W"],
  "5Y": ["1D", "1W"],
  MAX: ["1W"],
};

interface DashboardBundle {
  readonly snapshots: readonly MarketSnapshotRow[];
  readonly movers: MarketMoversData;
  readonly news: readonly NewsArticle[];
  readonly events: readonly CorporateEvent[];
  readonly indexNote: string;
}

function statusFrom(
  data: unknown,
  meta: TerminalApiMeta | null,
  loading: boolean,
  error: { code: string; message: string } | null,
  emptyMessage?: string,
): StockDataStatus {
  if (error) return { state: "error", label: error.code.replaceAll("_", " "), meta, message: error.message };
  if (loading && !data) return { state: "loading", label: "LOADING", meta, message: "Requesting normalized market data…" };
  if (!data) return { state: "empty", label: "NO DATA", meta, message: emptyMessage ?? "No provider data was returned." };
  const label = meta?.mode === "mock"
    ? "MOCK DATA"
    : meta?.quality === "unknown"
      ? "TIMING UNVERIFIED"
      : (meta?.quality ?? "UNKNOWN").toUpperCase();
  return { state: "ready", label, meta, message: emptyMessage };
}

function useTickerSearch(onTickerSelect: (ticker: string) => void): TickerSearchProps {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim(), 180);
  const result = useResearchData<readonly TickerSearchResult[]>("search", { q: debouncedQuery }, { enabled: debouncedQuery.length >= 2 });
  const normalizedQuery = query.trim().toUpperCase();
  const results = normalizedQuery
    ? (result.data ?? []).filter((item) => `${item.symbol} ${item.name}`.toUpperCase().includes(normalizedQuery)).slice(0, 12)
    : [];

  return {
    query,
    results,
    isOpen,
    activeIndex,
    isLoading: result.loading && normalizedQuery.length > 0,
    onQueryChange: (value) => {
      setQuery(value.toUpperCase());
      setActiveIndex(0);
      setIsOpen(true);
    },
    onActiveIndexChange: setActiveIndex,
    onOpenChange: setIsOpen,
    onSelect: (item) => {
      setQuery(item.symbol);
      setIsOpen(false);
      onTickerSelect(item.symbol);
    },
  };
}

function points(
  id: string,
  indicator: ChartIndicatorSeries["indicator"],
  label: string,
  color: string,
  values: readonly (number | null)[],
  timestamps: readonly string[],
  pane: ChartIndicatorSeries["pane"] = "price",
  kind: ChartIndicatorSeries["kind"] = "line",
): ChartIndicatorSeries {
  return {
    id,
    indicator,
    label,
    color,
    pane,
    kind,
    points: values.flatMap((value, index) => value === null ? [] : [{ timestamp: timestamps[index], value }]),
  };
}

function indicatorSeries(bundle: SecurityResearchBundle | null): readonly ChartIndicatorSeries[] {
  const bars = bundle?.bars ?? [];
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const timestamps = bars.map((bar) => bar.timestamp);
  if (!bars.length) return [];
  const macd = movingAverageConvergenceDivergence(closes);
  const bands = bollingerBands(closes);
  const volumeAverage = simpleMovingAverage(volumes, 20);
  const rvol = volumes.map((volume, index) => {
    const expected = volumeAverage[index];
    return expected && expected > 0 ? volume / expected : null;
  });
  return [
    points("sma-20", "sma", "SMA 20", "#f5b83d", simpleMovingAverage(closes, 20), timestamps),
    points("ema-20", "ema", "EMA 20", "#9b7bff", exponentialMovingAverage(closes, 20), timestamps),
    points("vwap", "vwap", "VWAP", "#3b9eff", cumulativeVwap(bars), timestamps),
    points("rsi-14", "rsi", "RSI 14", "#45d7d0", relativeStrengthIndex(closes), timestamps, "separate"),
    points("macd", "macd", "MACD", "#42d392", macd.map((item) => item.macd), timestamps, "separate"),
    points("macd-signal", "macd", "MACD SIGNAL", "#ff9c66", macd.map((item) => item.signal), timestamps, "separate"),
    points("macd-histogram", "macd", "MACD HIST", "#607c96", macd.map((item) => item.histogram), timestamps, "separate", "histogram"),
    points("bollinger-upper", "bollinger", "BB UPPER", "#73899e", bands.map((item) => item.upper), timestamps),
    points("bollinger-middle", "bollinger", "BB MID", "#4c5d6e", bands.map((item) => item.middle), timestamps),
    points("bollinger-lower", "bollinger", "BB LOWER", "#73899e", bands.map((item) => item.lower), timestamps),
    points("atr-14", "atr", "ATR 14", "#ff6278", averageTrueRange(bars), timestamps, "separate"),
    points("rvol-20", "relative-volume", "RVOL 20", "#4bb6ff", rvol, timestamps, "separate"),
  ];
}

function normalizeChartSettings(next: ChartDisplaySettings): ChartDisplaySettings {
  const allowed = INTERVALS_BY_TIMEFRAME[next.timeframe];
  return allowed.includes(next.interval) ? next : { ...next, interval: allowed[0] };
}

export function LiveStockPanel({
  ticker,
  view,
  onTickerSelect,
  onViewChange,
}: {
  ticker: string;
  view: "overview" | "chart";
  onTickerSelect: (ticker: string) => void;
  onViewChange: (view: "overview" | "chart") => void;
}) {
  const [settings, setSettings] = useState<ChartDisplaySettings>(() => ({
    ...DEFAULT_CHART_SETTINGS,
    timeframe: view === "chart" ? "1Y" : "6M",
    interval: "1D",
  }));
  const result = useResearchData<SecurityResearchBundle>(view === "chart" ? "chart" : "security", {
    ticker,
    range: settings.timeframe,
    interval: settings.interval,
  }, { refreshMs: view === "chart" && settings.timeframe === "1D" ? 15_000 : 60_000 });
  const search = useTickerSearch(onTickerSelect);
  return (
    <StockTerminal
      status={statusFrom(result.data, result.meta, result.loading, result.error)}
      security={result.data}
      activeView={view}
      chartSettings={settings}
      indicatorSeries={useMemo(() => indicatorSeries(result.data), [result.data])}
      search={search}
      onViewChange={onViewChange}
      onChartSettingsChange={(next) => setSettings(normalizeChartSettings(next))}
    />
  );
}

export function LiveMoversPanel({ onTickerSelect }: { onTickerSelect: (ticker: string) => void }) {
  const [side, setSide] = useState<MarketMoverSide>("gainers");
  const result = useResearchData<MarketMoversData>("movers", {}, { refreshMs: 20_000 });
  return (
    <div className="live-stock-module">
      <FreshnessStrip meta={result.meta} refreshing={result.refreshing} />
      <MarketMovers
        status={statusFrom(result.data, result.meta, result.loading, result.error)}
        movers={result.data}
        activeSide={side}
        onSideChange={setSide}
        onTickerSelect={onTickerSelect}
      />
    </div>
  );
}

export function LiveWatchlistPanel({ onTickerSelect }: { onTickerSelect: (ticker: string) => void }) {
  const [symbols, setSymbols] = useState<readonly string[]>(CORE_SYMBOLS);
  const [sortKey, setSortKey] = useState<WatchlistSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const [selected, setSelected] = useState<string | null>(null);
  const result = useResearchData<WatchlistResearchBundle>("watchlist", { symbols: symbols.join(",") }, { refreshMs: 20_000 });
  const bundle = result.data ? { ...result.data, symbols } : null;
  const handleSort = (key: WatchlistSortKey) => {
    if (sortKey === key) setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
    else {
      setSortKey(key);
      setSortDirection(key === "symbol" ? "ascending" : "descending");
    }
  };
  const select = (symbol: string) => {
    setSelected(symbol);
    onTickerSelect(symbol);
  };
  return (
    <div className="live-stock-module">
      <FreshnessStrip meta={result.meta} refreshing={result.refreshing} />
      <div className="session-only-note">CORE is a session watchlist in this deployment. Durable lists, additions, and saved ordering activate when PostgreSQL is configured.</div>
      <Watchlist
        status={statusFrom(result.data, result.meta, result.loading, result.error)}
        bundle={bundle}
        sortKey={sortKey}
        sortDirection={sortDirection}
        selectedSymbol={selected}
        onSort={handleSort}
        onTickerSelect={select}
        onReorder={(next) => {
          setSymbols(next);
          setSortKey(null);
        }}
        onRemove={(symbol) => setSymbols((current) => current.filter((candidate) => candidate !== symbol))}
      />
    </div>
  );
}

export function LiveDashboardPanel({ recentTickers, onTickerSelect }: { recentTickers: readonly string[]; onTickerSelect: (ticker: string) => void }) {
  const [side, setSide] = useState<MarketMoverSide>("gainers");
  const [sortKey, setSortKey] = useState<WatchlistSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("descending");
  const [symbols, setSymbols] = useState<readonly string[]>(CORE_SYMBOLS);
  const dashboard = useResearchData<DashboardBundle>("dashboard", {}, { refreshMs: 30_000 });
  const watchlist = useResearchData<WatchlistResearchBundle>("watchlist", { symbols: symbols.join(",") }, { refreshMs: 20_000 });
  const search = useTickerSearch(onTickerSelect);
  const status = statusFrom(dashboard.data, dashboard.meta, dashboard.loading, dashboard.error, dashboard.data?.indexNote);
  return (
    <div className="live-dashboard-stack">
      <HomeDashboard
        status={status}
        marketOverview={(dashboard.data?.snapshots ?? []).filter((row) => ["SPY", "QQQ", "DIA", "IWM"].includes(row.symbol))}
        movers={dashboard.data?.movers ?? null}
        moverSide={side}
        watchlist={watchlist.data ? { ...watchlist.data, symbols } : null}
        watchlistSortKey={sortKey}
        watchlistSortDirection={sortDirection}
        recentlyViewed={recentTickers.slice(0, 5)}
        search={search}
        onMoverSideChange={setSide}
        onWatchlistSort={(key) => {
          if (sortKey === key) setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
          else {
            setSortKey(key);
            setSortDirection(key === "symbol" ? "ascending" : "descending");
          }
        }}
        onWatchlistReorder={(next) => {
          setSymbols(next);
          setSortKey(null);
        }}
        onTickerSelect={onTickerSelect}
      />
      <div className="dashboard-intel-strip">
        <section>
          <header><span>BENZINGA</span><strong>LATEST HEADLINES</strong></header>
          {(dashboard.data?.news ?? []).slice(0, 5).map((article) => <article key={article.id}><time>{new Date(article.publishedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })}</time><button type="button" onClick={() => article.tickers[0] && onTickerSelect(article.tickers[0])}>{article.title}</button></article>)}
        </section>
        <section>
          <header><span>TMX</span><strong>UPCOMING EVENTS</strong></header>
          {(dashboard.data?.events ?? []).slice(0, 5).map((event) => <article key={event.id}><time>{event.startsAt.slice(0, 10)}</time><button type="button" onClick={() => onTickerSelect(event.symbol)}><b>{event.symbol}</b> {event.title}</button></article>)}
        </section>
      </div>
    </div>
  );
}

export function LiveMarketPanel({ onTickerSelect }: { onTickerSelect: (ticker: string) => void }) {
  const result = useResearchData<{ universe: readonly string[]; snapshots: readonly MarketSnapshotRow[]; scope: string }>("market", {}, { refreshMs: 20_000 });
  if (!result.data) return <DataState loading={result.loading} error={result.error} onRetry={result.reload} />;
  return (
    <div className="market-universe-panel">
      <FreshnessStrip meta={result.meta} refreshing={result.refreshing} />
      <header><div><span>UNIVERSE</span><strong>MARKET PULSE</strong></div><small>{result.data.scope}</small></header>
      <div className="market-universe-grid">
        {result.data.snapshots.map((row) => <button type="button" key={row.symbol} onClick={() => onTickerSelect(row.symbol)}><strong>{row.symbol}</strong><span>{row.lastPrice?.toFixed(2) ?? "—"}</span><em className={(row.changePercent ?? 0) >= 0 ? "positive" : "negative"}>{row.changePercent === null ? "—" : `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(2)}%`}</em><small>VOL {row.volume?.toLocaleString() ?? "—"}</small></button>)}
      </div>
      <p className="research-disclaimer">Equal-weight curated research universe. This is not a complete exchange breadth calculation.</p>
    </div>
  );
}

export { TickerSearch };
