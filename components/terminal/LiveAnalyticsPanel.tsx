"use client";

import { useMemo, useState } from "react";

import { AnalyticsTerminal } from "@/components/research";
import { TickerSearch } from "@/components/stocks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePrivateTimelineNotes } from "@/hooks/usePrivateTimelineNotes";
import { useResearchData } from "@/hooks/useResearchData";
import {
  associateNewsWithPriceMovement,
  calculateMarketBreadth,
  compareNormalizedPerformance,
  detectResearchPatterns,
} from "@/lib/analytics";
import { catalystSourceLabel, mergeCatalystTimeline } from "@/lib/research/client-timeline";
import type {
  AdvancedAnalyticsView,
  BreadthSnapshot,
  ComparisonCompany,
  ComparisonMetric,
  HeatmapCell,
  NewsPriceSeries,
  PatternCandidate,
  ResearchDataStatus,
} from "@/lib/research";
import type {
  CatalystTimelineBundle,
  ComparisonResearchBundle,
  MarketSnapshotRow,
  NewsArticle,
  SecurityResearchBundle,
  TerminalApiMeta,
  TickerSearchResult,
} from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

interface AnalyticsUniverseBundle {
  readonly universe: readonly string[];
  readonly snapshots: readonly MarketSnapshotRow[];
  readonly scope: string;
}

interface ComparisonViewModel {
  readonly companies: readonly ComparisonCompany[];
  readonly metrics: readonly ComparisonMetric[];
  readonly normalizedPerformanceAvailable: boolean;
}

const EMPTY_COMPARISON_EXCLUSIONS: readonly string[] = [];
const EMPTY_COMPARISON_ADDITIONS: readonly string[] = [];
const MAX_COMPARISON_SYMBOLS = 4;

export interface LiveAnalyticsPanelProps {
  readonly ticker: string;
  readonly onTickerSelect: (ticker: string) => void;
  readonly initialView?: AdvancedAnalyticsView;
  readonly comparisonSymbols?: readonly string[];
}

interface ComparisonTickerPickerProps {
  readonly symbols: readonly string[];
  readonly onAdd: (symbol: string) => void;
}

function ComparisonTickerPicker({ symbols, onAdd }: ComparisonTickerPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim(), 180);
  const search = useResearchData<readonly TickerSearchResult[]>(
    "search",
    { q: debouncedQuery },
    { enabled: pickerOpen && debouncedQuery.length >= 2 },
  );
  const normalizedQuery = query.trim().toUpperCase();
  const results = normalizedQuery.length >= 2
    ? (search.data ?? [])
      .filter((item) => item.active && !symbols.includes(item.symbol.toUpperCase()))
      .filter((item) => `${item.symbol} ${item.name}`.toUpperCase().includes(normalizedQuery))
      .sort((left, right) => Number(right.symbol.toUpperCase() === normalizedQuery) - Number(left.symbol.toUpperCase() === normalizedQuery))
      .slice(0, 10)
    : [];
  const full = symbols.length >= MAX_COMPARISON_SYMBOLS;

  const close = () => {
    setPickerOpen(false);
    setResultsOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return (
    <div className="research-comparison-toolbar">
      <div className="research-comparison-count">
        <strong>COMPARE SET</strong>
        <span>{symbols.length} / {MAX_COMPARISON_SYMBOLS} SECURITIES</span>
      </div>
      {pickerOpen && !full ? (
        <div className="research-comparison-picker">
          <TickerSearch
            query={query}
            results={results}
            isOpen={resultsOpen && normalizedQuery.length >= 2}
            activeIndex={Math.min(activeIndex, Math.max(results.length - 1, 0))}
            isLoading={search.loading && normalizedQuery.length >= 2}
            autoFocus
            onQueryChange={(value) => {
              const nextQuery = value.toUpperCase();
              setQuery(nextQuery);
              setActiveIndex(0);
              setResultsOpen(nextQuery.trim().length >= 2);
            }}
            onActiveIndexChange={setActiveIndex}
            onOpenChange={(open) => setResultsOpen(open && normalizedQuery.length >= 2)}
            onSelect={(item) => {
              onAdd(item.symbol);
              close();
            }}
          />
          <button type="button" className="research-comparison-close" onClick={close} aria-label="Close ticker picker">×</button>
        </div>
      ) : (
        <button
          type="button"
          className="research-comparison-add"
          disabled={full}
          aria-label={full ? "Remove a ticker before adding another" : "Add ticker to comparison"}
          onClick={() => {
            setPickerOpen(true);
            setResultsOpen(false);
          }}
        >
          <span aria-hidden="true">+</span>
          {full ? "REMOVE ONE TO ADD" : "ADD TICKER"}
        </button>
      )}
    </div>
  );
}

function heatmapCells(bundle: AnalyticsUniverseBundle | null): readonly HeatmapCell[] {
  if (!bundle) return [];
  return bundle.snapshots.map((snapshot) => ({
    id: snapshot.symbol,
    symbol: snapshot.symbol,
    label: "Company name unavailable in snapshot feed",
    group: bundle.scope,
    value: snapshot.changePercent,
    weight: Math.max(snapshot.volume ?? 1, 1),
    detail: snapshot.volume === null ? "Volume unavailable" : "Volume " + snapshot.volume.toLocaleString(),
  }));
}

function breadthSnapshot(
  bundle: AnalyticsUniverseBundle | null,
  asOf: string | null,
): BreadthSnapshot | null {
  if (!bundle || !asOf) return null;
  const eligible = bundle.snapshots.flatMap((snapshot) => {
    if (snapshot.lastPrice === null || snapshot.previousClose === null) return [];
    return [{
      symbol: snapshot.symbol,
      currentClose: snapshot.lastPrice,
      previousClose: snapshot.previousClose,
      closes: [],
    }];
  });
  const calculated = calculateMarketBreadth(eligible, asOf);
  return {
    asOf,
    advancing: calculated.advancing,
    declining: calculated.declining,
    unchanged: calculated.unchanged,
    above50Day: calculated.above50DaySma.percentAbove,
    above200Day: calculated.above200DaySma.percentAbove,
    newHighs: calculated.highLowEligibleCount === 0 ? null : calculated.newHighs,
    newLows: calculated.highLowEligibleCount === 0 ? null : calculated.newLows,
  };
}

function comparisonView(bundle: ComparisonResearchBundle | null): ComparisonViewModel {
  if (!bundle) return { companies: [], metrics: [], normalizedPerformanceAvailable: false };
  const companies = bundle.securities.map((security) => ({
    symbol: security.symbol,
    name: security.details.name,
  }));
  const metrics: ComparisonMetric[] = [
    {
      id: "price",
      label: "PRICE",
      format: "currency",
      preferred: "neutral",
      values: Object.fromEntries(bundle.securities.map((security) => [security.symbol, security.snapshot.quote.lastPrice])),
    },
    {
      id: "daily-change",
      label: "DAILY CHANGE",
      format: "percent",
      preferred: "neutral",
      values: Object.fromEntries(bundle.securities.map((security) => [security.symbol, security.snapshot.quote.changePercent])),
    },
    {
      id: "market-cap",
      label: "MARKET CAP",
      format: "number",
      preferred: "neutral",
      values: Object.fromEntries(bundle.securities.map((security) => [
        security.symbol,
        security.details.marketCap ?? security.snapshot.quote.marketCap,
      ])),
    },
  ];

  let normalizedPerformanceAvailable = false;
  if (bundle.securities.length >= 2 && bundle.securities.every((security) => security.bars.length > 0)) {
    try {
      const normalized = compareNormalizedPerformance(bundle.securities.map((security) => ({
        symbol: security.symbol,
        points: security.bars.map((bar) => ({ timestamp: bar.timestamp, price: bar.close })),
      })));
      metrics.push({
        id: "normalized-return",
        label: "NORMALIZED RETURN",
        format: "percent",
        preferred: "neutral",
        values: Object.fromEntries(normalized.series.map((series) => [
          series.symbol,
          series.points.at(-1)?.percentReturn ?? null,
        ])),
      });
      normalizedPerformanceAvailable = true;
    } catch {
      normalizedPerformanceAvailable = false;
    }
  }

  const ratioKeys = [...new Set(bundle.securities.flatMap((security) =>
    security.ratios.map((ratio) => ratio.key)))].slice(0, 8);
  for (const key of ratioKeys) {
    const descriptor = bundle.securities.flatMap((security) => security.ratios).find((ratio) => ratio.key === key);
    metrics.push({
      id: "ratio-" + key,
      label: descriptor?.label.toUpperCase() ?? key.toUpperCase(),
      format: descriptor?.format === "percent" ? "percent" : "ratio",
      preferred: "neutral",
      values: Object.fromEntries(bundle.securities.map((security) => [
        security.symbol,
        security.ratios.find((ratio) => ratio.key === key)?.value ?? null,
      ])),
    });
  }

  return { companies, metrics, normalizedPerformanceAvailable };
}

function timelineArticles(
  bundle: CatalystTimelineBundle | null,
  meta: TerminalApiMeta | null,
): readonly NewsArticle[] {
  if (!bundle) return [];
  return bundle.entries.filter((entry) => entry.kind === "news").map((entry) => ({
    id: entry.id,
    title: entry.title,
    summary: entry.detail,
    body: null,
    articleUrl: entry.url,
    imageUrl: null,
    publishedAt: entry.at,
    updatedAt: null,
    tickers: [entry.symbol],
    categories: ["other"],
    keywords: [],
    publisher: {
      name: catalystSourceLabel(entry.kind, meta),
      homepageUrl: null,
      logoUrl: null,
      faviconUrl: null,
    },
    asOf: meta?.asOf ?? entry.at,
    quality: meta?.quality ?? "unknown",
    source: meta?.mode === "mock"
      ? "mock"
      : meta?.source.toLowerCase().split(/\s*\+\s*/).includes("benzinga") ? "benzinga" : "massive",
  }));
}

function newsPriceSeries(
  ticker: string,
  chart: SecurityResearchBundle | null,
  timeline: CatalystTimelineBundle | null,
  timelineMeta: TerminalApiMeta | null,
): NewsPriceSeries | null {
  if (!chart || chart.bars.length === 0 || !timeline) return null;
  const articles = timelineArticles(timeline, timelineMeta);
  const associations = associateNewsWithPriceMovement(
    ticker,
    articles,
    chart.bars.map((bar) => ({ timestamp: bar.timestamp, price: bar.close })),
    { horizonsSeconds: [86_400, 259_200], maximumBaselineAgeSeconds: 172_800 },
  );
  const barTimestamps = new Set(chart.bars.map((bar) => bar.timestamp));
  const associationsByBar = new Map<string, Array<(typeof associations)[number]>>();
  for (const association of associations) {
    if (!association.baselineTimestamp || !barTimestamps.has(association.baselineTimestamp)) continue;
    const bucket = associationsByBar.get(association.baselineTimestamp) ?? [];
    bucket.push(association);
    associationsByBar.set(association.baselineTimestamp, bucket);
  }
  return {
    symbol: ticker,
    interval: chart.bars[0].interval,
    points: chart.bars.map((bar) => ({ timestamp: bar.timestamp, price: bar.close, volume: bar.volume })),
    markers: [...associationsByBar.entries()]
      .sort(([left], [right]) => Date.parse(left) - Date.parse(right))
      .map(([baselineTimestamp, bucket]) => ({
        id: bucket.length === 1
          ? bucket[0].articleId
          : `news-bucket-${baselineTimestamp}-${bucket.map((item) => item.articleId).join("-")}`,
        timestamp: baselineTimestamp,
        title: bucket.length === 1
          ? bucket[0].headline
          : `${bucket.length} STORIES · ${bucket.map((item) => item.headline).join(" · ")}`,
        category: "other" as const,
        priceAtPublication: bucket[0].baselinePrice,
        changeAfterPercent: bucket.length === 1
          ? bucket[0].moves.find((move) => move.percentChange !== null)?.percentChange ?? null
          : null,
      })),
  };
}

function patternCandidates(
  ticker: string,
  chart: SecurityResearchBundle | null,
): readonly PatternCandidate[] {
  if (!chart || chart.bars.length < 8) return [];
  const detections = detectResearchPatterns(chart.bars.map((bar) => ({
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  })));
  const volumeAvailable = chart.bars.some((bar) => bar.volume > 0);
  return detections.map((detection) => ({
    id: ticker + "-" + detection.pattern + "-" + detection.detectedAt,
    symbol: ticker,
    pattern: detection.pattern,
    phase: detection.phase,
    confidence: detection.confidence,
    detectedAt: detection.detectedAt,
    priceLevels: Object.entries(detection.relevantPriceLevels).map(([label, price]) => ({ label, price })),
    volumeConfirmation: detection.volumeConfirmation
      ? "confirmed"
      : volumeAvailable ? "not-confirmed" : "inconclusive",
    reasoning: [detection.reasoning],
  }));
}

function statusWithMessage(
  meta: TerminalApiMeta | null,
  error: { code: string; message: string } | null,
  message: string,
): ResearchDataStatus {
  const status = researchStatus(meta, error);
  return { ...status, message: [status.message, message].filter(Boolean).join(" · ") };
}

export function LiveAnalyticsPanel({
  ticker,
  onTickerSelect,
  initialView = "heatmap",
  comparisonSymbols: requestedComparisonSymbols,
}: LiveAnalyticsPanelProps) {
  const comparisonIntentKey = (requestedComparisonSymbols ?? [])
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .join(",");
  const intendedView: AdvancedAnalyticsView = comparisonIntentKey ? "comparison" : initialView;
  const viewIntentKey = `${initialView}|${comparisonIntentKey}`;
  const [viewState, setViewState] = useState<{
    readonly intentKey: string;
    readonly view: AdvancedAnalyticsView;
  }>(() => ({ intentKey: viewIntentKey, view: intendedView }));
  const activeView = viewState.intentKey === viewIntentKey ? viewState.view : intendedView;
  const setActiveView = (view: AdvancedAnalyticsView) =>
    setViewState({ intentKey: viewIntentKey, view });
  const exclusionScope = `${ticker}|${comparisonIntentKey || "default-comparison"}`;
  const [exclusionState, setExclusionState] = useState<{
    readonly scope: string;
    readonly symbols: readonly string[];
  }>(() => ({ scope: exclusionScope, symbols: [] }));
  const excludedComparisonSymbols = exclusionState.scope === exclusionScope
    ? exclusionState.symbols
    : EMPTY_COMPARISON_EXCLUSIONS;
  const [additionState, setAdditionState] = useState<{
    readonly scope: string;
    readonly symbols: readonly string[];
  }>(() => ({ scope: exclusionScope, symbols: [] }));
  const addedComparisonSymbols = additionState.scope === exclusionScope
    ? additionState.symbols
    : EMPTY_COMPARISON_ADDITIONS;
  const marketEnabled = activeView === "heatmap" || activeView === "breadth";
  const marketKind = activeView === "breadth" ? "breadth" : "heatmap";
  const market = useResearchData<AnalyticsUniverseBundle>(marketKind, {}, {
    enabled: marketEnabled,
    refreshMs: 30_000,
    retainMs: 20_000,
  });
  const comparisonSymbols = useMemo(() => [...new Set([
    ...(requestedComparisonSymbols?.length ? requestedComparisonSymbols : [ticker, "AMD", "AVGO"]),
    ...addedComparisonSymbols,
  ].map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
    .filter((symbol) => !excludedComparisonSymbols.includes(symbol))
    .slice(0, MAX_COMPARISON_SYMBOLS),
  [addedComparisonSymbols, excludedComparisonSymbols, requestedComparisonSymbols, ticker]);
  const comparisonParams = useMemo(() => ({ symbols: comparisonSymbols.join(","), range: "1Y" }), [comparisonSymbols]);
  const comparison = useResearchData<ComparisonResearchBundle>("compare", comparisonParams, {
    enabled: activeView === "comparison",
    refreshMs: 60_000,
    retainMs: 30_000,
  });
  const timelineParams = useMemo(() => ({ ticker }), [ticker]);
  const timeline = useResearchData<CatalystTimelineBundle>("timeline", timelineParams, {
    enabled: activeView === "catalysts" || activeView === "news-price",
    refreshMs: 5 * 60_000,
    retainMs: 60_000,
  });
  const privateNotes = usePrivateTimelineNotes(ticker, activeView === "catalysts");
  const chartParams = useMemo(() => ({ ticker, range: "1Y" }), [ticker]);
  const chart = useResearchData<SecurityResearchBundle>("chart", chartParams, {
    enabled: activeView === "news-price" || activeView === "patterns",
    refreshMs: 60_000,
    retainMs: 30_000,
  });

  const cells = useMemo(() => heatmapCells(market.data), [market.data]);
  const currentBreadth = useMemo(() => breadthSnapshot(market.data, market.meta?.asOf ?? null), [market.data, market.meta?.asOf]);
  const compared = useMemo(() => comparisonView(comparison.data), [comparison.data]);
  const catalysts = useMemo(() => mergeCatalystTimeline({
    symbol: ticker,
    entries: timeline.data?.entries ?? [],
    notes: privateNotes.notes,
    meta: timeline.meta,
  }), [privateNotes.notes, ticker, timeline.data, timeline.meta]);
  const newsPrice = useMemo(() => newsPriceSeries(ticker, chart.data, timeline.data, timeline.meta), [chart.data, ticker, timeline.data, timeline.meta]);
  const patterns = useMemo(() => patternCandidates(ticker, chart.data), [chart.data, ticker]);

  let activeMeta: TerminalApiMeta | null = null;
  let activeError = null as { code: string; message: string; retryable: boolean; requestId: string } | null;
  let loading = false;
  let missingData = false;
  let reload = market.reload;
  let statusMessage = "Cell size uses reported volume; company names are unavailable in the snapshot feed.";

  if (activeView === "heatmap" || activeView === "breadth") {
    activeMeta = market.meta;
    activeError = market.error;
    loading = market.loading;
    missingData = !market.data;
    reload = market.reload;
    if (activeView === "breadth") {
      statusMessage = "Snapshot breadth is available; SMA participation, yearly extremes, and breadth history require universe history and remain unavailable.";
    }
  } else if (activeView === "comparison") {
    activeMeta = comparison.meta;
    activeError = comparison.error;
    loading = comparison.loading;
    missingData = !comparison.data;
    reload = comparison.reload;
    statusMessage = compared.normalizedPerformanceAvailable
      ? "Performance uses the first timestamp shared by every displayed security."
      : "A shared normalized-performance baseline is unavailable for the returned histories.";
  } else if (activeView === "catalysts") {
    activeMeta = timeline.meta;
    activeError = timeline.error;
    loading = timeline.loading;
    missingData = !timeline.data;
    reload = () => { timeline.reload(); privateNotes.reload(); };
    statusMessage = [
      "Market observations and private PostgreSQL notes are merged in this browser in chronological order; private note content is not sent to market-data providers.",
      "Chronology and correlation do not establish causation.",
      privateNotes.message,
      ...(timeline.data?.availability.notes ?? []),
    ].filter(Boolean).join(" ");
  } else if (activeView === "patterns") {
    activeMeta = chart.meta;
    activeError = chart.error;
    loading = chart.loading;
    missingData = !chart.data;
    reload = chart.reload;
    statusMessage = "Experimental pattern observations include heuristic confidence and are not forecasts or recommendations. Developing setups are separated from fresh patterns confirmed by a closing neckline break.";
  } else {
    activeMeta = timeline.meta ?? chart.meta;
    activeError = timeline.error ?? chart.error;
    loading = timeline.loading || chart.loading;
    missingData = !timeline.data || !chart.data;
    reload = () => { timeline.reload(); chart.reload(); };
    statusMessage = [
      "Price Movement Following News uses daily bars and reports temporal association only; no causation is inferred.",
      "Move across the chart or use the arrow keys, then select a highlighted news marker or headline for event details.",
      ...(timeline.data?.availability.notes ?? []),
    ].join(" ");
  }

  if (missingData && !activeError) return <DataState loading={loading} error={activeError} onRetry={reload} />;
  const status = statusWithMessage(activeMeta, activeError, statusMessage);

  return (
    <AnalyticsTerminal
      status={status}
      activeView={activeView}
      heatmapCells={cells}
      breadthSnapshot={currentBreadth}
      breadthHistory={[]}
      comparisonCompanies={compared.companies}
      comparisonMetrics={compared.metrics}
      comparisonControls={activeView === "comparison" ? (
        <ComparisonTickerPicker
          key={exclusionScope}
          symbols={comparisonSymbols}
          onAdd={(value) => {
            const symbol = value.trim().toUpperCase();
            if (!symbol || comparisonSymbols.includes(symbol) || comparisonSymbols.length >= MAX_COMPARISON_SYMBOLS) return;
            setAdditionState((current) => {
              const scopedSymbols = current.scope === exclusionScope ? current.symbols : [];
              return {
                scope: exclusionScope,
                symbols: scopedSymbols.includes(symbol) ? scopedSymbols : [...scopedSymbols, symbol],
              };
            });
            setExclusionState((current) => ({
              scope: exclusionScope,
              symbols: (current.scope === exclusionScope ? current.symbols : []).filter((item) => item !== symbol),
            }));
          }}
        />
      ) : undefined}
      catalysts={catalysts}
      newsPriceSeries={newsPrice}
      patterns={patterns}
      onViewChange={setActiveView}
      onTickerSelect={onTickerSelect}
      onRemoveComparisonCompany={comparisonSymbols.length > 1 ? (symbol) => {
        setAdditionState((current) => ({
          scope: exclusionScope,
          symbols: (current.scope === exclusionScope ? current.symbols : []).filter((item) => item !== symbol),
        }));
        setExclusionState((current) => {
          const scopedSymbols = current.scope === exclusionScope ? current.symbols : [];
          return {
            scope: exclusionScope,
            symbols: scopedSymbols.includes(symbol) ? scopedSymbols : [...scopedSymbols, symbol],
          };
        });
      } : undefined}
    />
  );
}
