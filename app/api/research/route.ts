import { NextRequest, NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { AppError, isAppError, normalizeError } from "@/lib/errors";
import { describeFreshness } from "@/lib/freshness";
import {
  DEFAULT_RESEARCH_UNIVERSE,
  getMassiveMarketDataService,
  getMassiveResearchService,
} from "@/lib/massive";
import { getMockResearchService } from "@/lib/mock";
import {
  dedupeCorporateEvents,
  dedupeNewsArticles,
  optionsActivityTimelineEntries,
  researchSectorFromSic,
  volumeSpikeTimelineEntries,
} from "@/lib/research";
import { relativeVolume } from "@/lib/indicators";
import { findUnusualOptionActivity } from "@/lib/options";
import { buildScannerContextRow, mapWithConcurrency, type ScannerContextBundle } from "@/lib/scanner";
import type {
  BenzingaNewsService,
  ResearchService,
  StockMarketService,
} from "@/lib/services";
import type {
  AggregateBar,
  CatalystTimelineEntry,
  ComparisonSecurity,
  CorporateEventType,
  DataQuality,
  EventsResearchBundle,
  MarketSession,
  NewsArticle,
  NewsResearchBundle,
  OptionChainBundle,
  SecurityResearchBundle,
  Snapshot,
  SecurityClassification,
  TerminalApiSuccess,
  TickerDetails,
  WatchlistQuote,
} from "@/types";

export const dynamic = "force-dynamic";

const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const OPTION_TICKER_PATTERN = /^O:[A-Z0-9.-]{1,15}[0-9]{6}[CP][0-9]{8}$/;
const CHATGPT_USER_EMAIL_HEADER = "oai-authenticated-user-email";
const MAX_UPSTREAM_BARS = 5_000;
const SCANNER_CONTEXT_SAFETY_LIMIT = 100;
const SCANNER_CONTEXT_CONCURRENCY = 4;
const SCANNER_INTRADAY_HISTORY_DAYS = 35;
const NEWS_CATEGORIES = new Set(["breaking", "earnings", "analyst", "mergers-acquisitions", "fda", "guidance", "macro", "company", "markets", "other"]);

const CHART_INTERVALS = {
  "1M": { multiplier: 1, timespan: "minute" },
  "5M": { multiplier: 5, timespan: "minute" },
  "15M": { multiplier: 15, timespan: "minute" },
  "30M": { multiplier: 30, timespan: "minute" },
  "1H": { multiplier: 1, timespan: "hour" },
  "4H": { multiplier: 4, timespan: "hour" },
  "1D": { multiplier: 1, timespan: "day" },
  "1W": { multiplier: 1, timespan: "week" },
} as const;

const TMX_EVENT_TYPES: Readonly<Record<CorporateEventType, readonly string[]>> = {
  "earnings-release": ["earnings_announcement_date", "earnings_results_announcement"],
  "earnings-call": ["earnings_conference_call"],
  "investor-day": ["capital_markets_day", "research_and_development_day"],
  "analyst-day": ["analyst_day"],
  "shareholder-meeting": ["shareholder_meeting"],
  conference: ["conference", "forum"],
  presentation: ["seminar"],
  dividend: ["dividend"],
  "stock-split": ["stock_split"],
  "company-update": ["business_update"],
  "industry-event": ["tradeshow", "workshop"],
  summit: ["summit"],
  other: [],
};

interface LiveNewsQuery {
  readonly ticker?: string;
  readonly publishedAfter?: string;
  readonly publishedBefore?: string;
  readonly category?: string;
  readonly keyword?: string;
  readonly limit?: number;
}

interface LiveNewsResult {
  readonly bundle: NewsResearchBundle;
  readonly source: "benzinga" | "massive stock news" | "mock";
  readonly note: string | null;
}

function filterNewsArticles(
  articles: readonly NewsArticle[],
  input: LiveNewsQuery,
): readonly NewsArticle[] {
  const keyword = input.keyword?.trim().toLowerCase();
  const publishedBefore = input.publishedBefore ? Date.parse(input.publishedBefore) : null;
  return dedupeNewsArticles(articles).filter((article) => {
    if (
      publishedBefore !== null
      && Number.isFinite(publishedBefore)
      && Date.parse(article.publishedAt) > publishedBefore
    ) return false;
    if (input.category && !article.categories.includes(input.category as typeof article.categories[number])) {
      return false;
    }
    if (!keyword) return true;
    return [article.title, article.summary ?? "", article.body ?? "", ...article.keywords]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
}

async function getLiveNewsWithFallback(
  research: BenzingaNewsService,
  market: StockMarketService,
  input: LiveNewsQuery = {},
): Promise<LiveNewsResult> {
  try {
    const bundle = await research.getBenzingaNews(input);
    return {
      bundle: { ...bundle, articles: dedupeNewsArticles(bundle.articles) },
      source: "benzinga",
      note: null,
    };
  } catch (benzingaError) {
    try {
      const articles = await market.getNews({
        symbol: input.ticker,
        publishedAfter: input.publishedAfter,
        publishedBefore: input.publishedBefore,
        limit: Math.min(1_000, Math.max(1, Math.trunc(input.limit ?? 120))),
        order: "desc",
      });
      const entitlementMissing = isAppError(benzingaError) && benzingaError.code === "ENTITLEMENT_REQUIRED";
      return {
        bundle: {
          articles: filterNewsArticles(articles, input),
          filterTicker: input.ticker ?? null,
        },
        source: "massive stock news",
        note: entitlementMissing
          ? "Benzinga add-on unavailable; using Massive stock news included with the Stocks plan."
          : "Benzinga is temporarily unavailable; using Massive stock news.",
      };
    } catch {
      throw benzingaError;
    }
  }
}

function hasOwnKey<ObjectType extends object>(
  value: ObjectType,
  key: PropertyKey,
): key is keyof ObjectType {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function ticker(value: string | null, fallback?: string): string {
  const normalized = (value ?? fallback ?? "").trim().toUpperCase();
  if (!normalized) {
    throw new AppError("VALIDATION_ERROR", "A ticker query parameter is required.");
  }
  if (!TICKER_PATTERN.test(normalized)) {
    throw new AppError("VALIDATION_ERROR", "Ticker format is invalid.");
  }
  return normalized;
}

function symbols(value: string | null, fallback: readonly string[], maximum = 100): readonly string[] {
  const values = value ? value.split(",") : fallback;
  const normalized = [...new Set(values.map((item) => ticker(item)))];
  if (normalized.length > maximum) {
    throw new AppError("VALIDATION_ERROR", "Too many tickers were requested.");
  }
  return normalized;
}

function optionContract(value: string | null): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!OPTION_TICKER_PATTERN.test(normalized)) {
    throw new AppError("VALIDATION_ERROR", "Option contract format is invalid.");
  }
  return normalized;
}

function newsCategory(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!NEWS_CATEGORIES.has(normalized)) {
    throw new AppError("VALIDATION_ERROR", "News category is invalid.");
  }
  return normalized;
}

function isoTimestamp(value: string | null): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new AppError("VALIDATION_ERROR", "News date is invalid.");
  }
  return new Date(timestamp).toISOString();
}

function eventTypeFilter(
  value: string | null,
  earningsOnly: boolean,
): { readonly normalized: CorporateEventType | null; readonly providerTypes: readonly string[] } {
  if (earningsOnly) {
    return {
      normalized: null,
      providerTypes: [
        ...TMX_EVENT_TYPES["earnings-release"],
        ...TMX_EVENT_TYPES["earnings-call"],
      ],
    };
  }
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return { normalized: null, providerTypes: [] };
  }
  if (!hasOwnKey(TMX_EVENT_TYPES, normalized)) {
    throw new AppError("VALIDATION_ERROR", "Event type is invalid.");
  }
  return { normalized, providerTypes: TMX_EVENT_TYPES[normalized] };
}

function mergeEventBundles(bundles: readonly EventsResearchBundle[]): EventsResearchBundle {
  const first = bundles[0];
  if (!first) {
    throw new Error("Event response is invalid.");
  }
  return {
    ...first,
    events: dedupeCorporateEvents(bundles.flatMap((bundle) => bundle.events)),
  };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

interface WatchlistSecurityContext {
  readonly snapshot: Snapshot;
  readonly details: TickerDetails | null;
  readonly bars: readonly AggregateBar[];
  readonly intradayBars?: readonly AggregateBar[];
  readonly options: OptionChainBundle | null;
}

interface ScannerSecurityContext extends Omit<WatchlistSecurityContext, "details"> {
  readonly details: TickerDetails;
}

function completedAverageVolume(bars: readonly AggregateBar[]): number | null {
  const completed = bars.slice(-21, -1).map((bar) => bar.volume).filter((value) => Number.isFinite(value) && value >= 0);
  if (completed.length < 5) return null;
  return completed.reduce((sum, value) => sum + value, 0) / completed.length;
}

function watchlistQuote(
  context: WatchlistSecurityContext,
  articles: readonly NewsArticle[],
  events: EventsResearchBundle["events"],
  source: string,
  staleAfterMs: number | null,
): WatchlistQuote {
  const { snapshot, details, bars, options } = context;
  const quote = snapshot.quote;
  const averageVolume = quote.averageVolume ?? completedAverageVolume(bars);
  const dailyRvol = quote.volume !== null && averageVolume !== null && averageVolume > 0
    ? relativeVolume(quote.volume, averageVolume)
    : null;
  const matchingNews = articles.find((article) => article.tickers.includes(snapshot.symbol)) ?? null;
  const matchingEvent = events
    .filter((event) => event.symbol === snapshot.symbol && Date.parse(event.startsAt) >= Date.now())
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null;
  const optionObservations = options
    ? findUnusualOptionActivity(options.contracts, { minimumVolume: 100, minimumVolumeToOpenInterest: 1.5 })
    : [];
  const topOption = optionObservations[0] ?? null;

  return {
    ticker: snapshot.symbol,
    companyName: details?.name || null,
    price: quote.lastPrice,
    change: quote.change,
    changePercent: quote.changePercent,
    bid: quote.bidPrice,
    ask: quote.askPrice,
    dayHigh: quote.high,
    dayLow: quote.low,
    previousClose: quote.previousClose,
    volume: quote.volume,
    averageVolume,
    dailyRvol,
    // Like-for-like intraday history is not fetched by this bounded watchlist request.
    intradayRvol: null,
    vwap: quote.vwap,
    distanceFromVwapPercent: quote.lastPrice !== null && quote.vwap !== null && quote.vwap !== 0
      ? ((quote.lastPrice - quote.vwap) / Math.abs(quote.vwap)) * 100
      : null,
    marketCap: details?.marketCap ?? quote.marketCap,
    latestNews: matchingNews ? {
      id: matchingNews.id,
      title: matchingNews.title,
      publishedAt: matchingNews.publishedAt,
      articleUrl: matchingNews.articleUrl,
      publisher: matchingNews.publisher.name,
    } : null,
    nextEvent: matchingEvent ? {
      id: matchingEvent.id,
      type: matchingEvent.type,
      status: matchingEvent.status,
      title: matchingEvent.title,
      startsAt: matchingEvent.startsAt,
      daysUntil: Math.max(0, Math.ceil((Date.parse(matchingEvent.startsAt) - Date.now()) / 86_400_000)),
    } : null,
    optionsActivity: options && options.contracts.length > 0 ? {
      observed: Boolean(topOption),
      label: topOption ? "ELEVATED VOLUME / OI" : "NO ELEVATED CONTRACT",
      highestVolumeContract: topOption?.contract.symbol ?? null,
      volumeToOpenInterest: topOption?.volumeToOpenInterest ?? null,
      asOf: options.asOf,
    } : null,
    freshness: describeFreshness({
      quality: snapshot.quality,
      asOf: snapshot.asOf,
      source,
      marketSession: quote.session,
      staleAfterMs,
    }),
  };
}

async function watchlistContexts(
  requested: readonly string[],
  mode: "live" | "mock",
  research: ResearchService,
  market: StockMarketService | null,
  historyDays = 45,
): Promise<readonly (WatchlistSecurityContext | null)[]> {
  const from = isoDate(addDays(new Date(), -historyDays));
  const to = isoDate(new Date());
  return mapWithConcurrency(requested, SCANNER_CONTEXT_CONCURRENCY, async (symbol) => {
    try {
      if (mode === "mock") {
        const mockSecurity = await getMockResearchService().getSecurity(symbol, historyDays);
        const options = await research.getOptionChain({ symbol }).catch(() => null);
        return { ...mockSecurity, options };
      }
      if (!market) return null;
      const snapshot = await market.getSnapshot(symbol);
      const [details, bars, options] = await Promise.all([
        market.getTickerDetails(symbol).catch(() => null),
        market.getAggregateBars({ symbol, multiplier: 1, timespan: "day", from, to, adjusted: true, sort: "asc", limit: Math.min(MAX_UPSTREAM_BARS, historyDays + 5) }).catch(() => []),
        research.getOptionChain({ symbol }).catch(() => null),
      ]);
      return { snapshot, details, bars, options };
    } catch {
      return null;
    }
  });
}

interface ScannerSecurityContextResult {
  readonly symbol: string;
  readonly context: ScannerSecurityContext | null;
  readonly optionsSucceeded: boolean;
  readonly failures: readonly string[];
}

async function scannerContextResults(
  requested: readonly string[],
  mode: "live" | "mock",
  research: ResearchService,
  market: StockMarketService | null,
  historyDays: number,
): Promise<readonly ScannerSecurityContextResult[]> {
  const from = isoDate(addDays(new Date(), -historyDays));
  const intradayFrom = isoDate(addDays(new Date(), -SCANNER_INTRADAY_HISTORY_DAYS));
  const to = isoDate(new Date());
  return mapWithConcurrency(requested, SCANNER_CONTEXT_CONCURRENCY, async (symbol): Promise<ScannerSecurityContextResult> => {
    const securityPromise: Promise<SecurityResearchBundle> = mode === "mock"
      ? getMockResearchService().getSecurity(symbol, historyDays)
      : market
        ? Promise.all([
            market.getSnapshot(symbol),
            market.getTickerDetails(symbol),
            market.getAggregateBars({
              symbol,
              multiplier: 1,
              timespan: "day",
              from,
              to,
              adjusted: true,
              sort: "asc",
              limit: Math.min(MAX_UPSTREAM_BARS, historyDays + 5),
            }),
          ]).then(([snapshot, details, bars]) => ({ snapshot, details, bars }))
        : Promise.reject(new Error("Stock market context is unavailable."));
    const intradayPromise: Promise<readonly AggregateBar[]> = mode === "mock"
      ? Promise.resolve([])
      : market
        ? market.getAggregateBars({
            symbol,
            multiplier: 5,
            timespan: "minute",
            from: intradayFrom,
            to,
            adjusted: true,
            sort: "asc",
            limit: MAX_UPSTREAM_BARS,
          })
        : Promise.reject(new Error("Intraday stock context is unavailable."));
    const [securityResult, intradayResult, optionsResult] = await Promise.allSettled([
      securityPromise,
      intradayPromise,
      research.getOptionChain({ symbol }),
    ]);
    const failures = [
      securityResult.status === "rejected" ? `${symbol}: stock context unavailable` : null,
      intradayResult.status === "rejected" ? `${symbol}: intraday RVOL context unavailable` : null,
      optionsResult.status === "rejected" ? `${symbol}: options context unavailable` : null,
    ].filter((message): message is string => message !== null);
    return {
      symbol,
      context: securityResult.status === "fulfilled" ? {
        ...securityResult.value,
        intradayBars: intradayResult.status === "fulfilled" ? intradayResult.value : [],
        options: optionsResult.status === "fulfilled" ? optionsResult.value : null,
      } : null,
      optionsSucceeded: optionsResult.status === "fulfilled",
      failures,
    };
  });
}

function upstreamBarLimit(
  days: number,
  interval: (typeof CHART_INTERVALS)[keyof typeof CHART_INTERVALS],
): number {
  const estimatedBars = interval.timespan === "minute"
    ? Math.ceil((days * 24 * 60) / interval.multiplier)
    : interval.timespan === "hour"
      ? Math.ceil((days * 24) / interval.multiplier)
      : interval.timespan === "day"
        ? Math.ceil(days / interval.multiplier)
        : Math.ceil(days / (7 * interval.multiplier));
  return Math.min(MAX_UPSTREAM_BARS, Math.max(1, estimatedBars + 2));
}

function chartRange(rangeInput: string | null, intervalInput: string | null): {
  readonly from: string;
  readonly to: string;
  readonly multiplier: number;
  readonly timespan: "minute" | "hour" | "day" | "week";
  readonly limit: number;
} {
  const range = (rangeInput ?? "1Y").trim().toUpperCase();
  const now = new Date();
  const settings = {
    "1D": { days: 1, defaultInterval: "5M", allowedIntervals: ["1M", "5M", "15M", "30M", "1H"] },
    "5D": { days: 7, defaultInterval: "15M", allowedIntervals: ["5M", "15M", "30M", "1H"] },
    "1M": { days: 31, defaultInterval: "1D", allowedIntervals: ["30M", "1H", "4H", "1D"] },
    "3M": { days: 93, defaultInterval: "1D", allowedIntervals: ["1H", "4H", "1D"] },
    "6M": { days: 186, defaultInterval: "1D", allowedIntervals: ["4H", "1D"] },
    YTD: {
      days: Math.max(1, Math.ceil((now.valueOf() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000)),
      defaultInterval: "1D",
      allowedIntervals: ["1D", "1W"],
    },
    "1Y": { days: 366, defaultInterval: "1D", allowedIntervals: ["1D", "1W"] },
    "3Y": { days: 1_096, defaultInterval: "1W", allowedIntervals: ["1D", "1W"] },
    "5Y": { days: 1_827, defaultInterval: "1W", allowedIntervals: ["1D", "1W"] },
    MAX: { days: 7_305, defaultInterval: "1W", allowedIntervals: ["1W"] },
  } as const;
  if (!hasOwnKey(settings, range)) {
    throw new Error("Chart range is invalid.");
  }
  const selected = settings[range];
  const intervalName = (intervalInput ?? selected.defaultInterval).trim().toUpperCase();
  if (
    !hasOwnKey(CHART_INTERVALS, intervalName)
    || !selected.allowedIntervals.some((candidate) => candidate === intervalName)
  ) {
    throw new Error("Chart range and interval combination is invalid.");
  }
  const interval = CHART_INTERVALS[intervalName];
  return {
    from: isoDate(addDays(now, -selected.days)),
    to: isoDate(now),
    multiplier: interval.multiplier,
    timespan: interval.timespan,
    limit: upstreamBarLimit(selected.days, interval),
  };
}

function unauthorizedResponse(requestId: string) {
  return NextResponse.json({
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
      retryable: false,
      requestId,
    },
  }, {
    status: 401,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function response<T>(
  data: T,
  input: {
    mode: "live" | "mock";
    source: string;
    quality?: DataQuality;
    asOf?: string;
    marketSession?: MarketSession | null;
    staleAfterMs?: number | null;
    delayMinutes?: number | null;
  },
): NextResponse<TerminalApiSuccess<T>> {
  const quality = input.quality ?? (input.mode === "mock" ? "indicative" : "unknown");
  const asOf = input.asOf ?? new Date().toISOString();
  return NextResponse.json({
    ok: true,
    data,
    meta: {
      mode: input.mode,
      source: input.source,
      quality,
      asOf,
      freshness: describeFreshness({
        quality,
        asOf,
        source: input.source,
        marketSession: input.marketSession,
        staleAfterMs: input.staleAfterMs,
        delayMinutes: input.delayMinutes,
      }),
    },
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function priceMoveEntries(symbol: string, bars: readonly AggregateBar[]): readonly CatalystTimelineEntry[] {
  return bars.flatMap((bar, index) => {
    const previous = bars[index - 1];
    if (!previous || previous.close === 0) return [];
    const change = ((bar.close - previous.close) / previous.close) * 100;
    if (Math.abs(change) < 4) return [];
    return [{
      id: `price-${symbol}-${bar.timestamp}`,
      at: bar.timestamp,
      symbol,
      kind: "price-move" as const,
      title: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% price move`,
      detail: `Close ${bar.close.toFixed(2)}; association only, not attributed causation.`,
      url: null,
    }];
  });
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (
    process.env.NODE_ENV === "production"
    && !process.env.NODE_TEST_CONTEXT
    && !request.headers.get(CHATGPT_USER_EMAIL_HEADER)?.trim()
  ) {
    return unauthorizedResponse(requestId);
  }
  try {
    const environment = getServerEnv();
    const mode = environment.USE_MOCK_DATA ? "mock" as const : "live" as const;
    const kind = request.nextUrl.searchParams.get("kind")?.toLowerCase() ?? "dashboard";
    const tickerParameter = request.nextUrl.searchParams.get("ticker");
    const allSymbolsRequested = request.nextUrl.searchParams.get("all") === "true";
    const tickerRequired = ["security", "chart", "options", "financials", "timeline"].includes(kind)
      || (["news", "events", "earnings"].includes(kind) && !allSymbolsRequested);
    // Symbol-specific endpoints fail closed when `ticker` is absent. This avoids
    // a stale caller accidentally receiving NVDA data for another requested name.
    const symbol = ticker(tickerParameter, tickerRequired ? undefined : "NVDA");
    const mock = getMockResearchService();
    const live = mode === "live" ? getMassiveResearchService() : null;
    const market = mode === "live" ? getMassiveMarketDataService() : null;
    const range = chartRange(
      request.nextUrl.searchParams.get("range"),
      request.nextUrl.searchParams.get("interval"),
    );

    switch (kind) {
      case "search": {
        const query = request.nextUrl.searchParams.get("q") ?? "";
        const data = mode === "mock" ? await mock.searchTickers(query) : await live!.searchTickers(query);
        return response(data, { mode, source: mode === "mock" ? "mock" : "massive", quality: "historical" });
      }
      case "security":
      case "chart": {
        let data: SecurityResearchBundle;
        if (mode === "mock") {
          data = await mock.getSecurity(symbol, kind === "chart" ? 420 : 260);
        } else {
          const [snapshot, details, bars] = await Promise.all([
            market!.getSnapshot(symbol),
            market!.getTickerDetails(symbol),
            market!.getAggregateBars({ symbol, ...range, adjusted: true, sort: "asc" }),
          ]);
          data = { snapshot, details, bars };
        }
        if (kind === "security") {
          const averageVolume = completedAverageVolume(
            data.bars.filter((bar) => bar.interval === "1D"),
          );
          data = {
            ...data,
            snapshot: {
              ...data.snapshot,
              quote: {
                ...data.snapshot.quote,
                averageVolume: data.snapshot.quote.averageVolume ?? averageVolume,
                marketCap: data.snapshot.quote.marketCap ?? data.details.marketCap,
              },
            },
          };
        }
        return response(data, {
          mode,
          source: mode === "mock" ? "mock" : "massive",
          quality: data.snapshot.quality,
          asOf: data.snapshot.asOf,
          marketSession: data.snapshot.quote.session,
          staleAfterMs: mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
        });
      }
      case "movers": {
        const data = mode === "mock" ? await mock.getMovers() : await live!.getMovers();
        return response(data, {
          mode,
          source: mode === "mock" ? "mock" : "massive",
          quality: data.quality,
          asOf: data.asOf,
          staleAfterMs: mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
        });
      }
      case "watchlist": {
        const requested = symbols(request.nextUrl.searchParams.get("symbols"), ["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "META", "PLTR", "TSLA"]);
        const research: ResearchService = mode === "mock" ? mock : live!;
        const eventFrom = isoDate(new Date());
        const eventTo = isoDate(addDays(new Date(), 45));
        const [snapshots, contexts, newsResult, eventsResult] = await Promise.all([
          research.getSnapshots(requested),
          watchlistContexts(requested, mode, research, market),
          (mode === "mock"
            ? mock.getBenzingaNews({ limit: 200 }).then((bundle) => ({ bundle, source: "mock" as const, note: null }))
            : getLiveNewsWithFallback(live!, market!, { limit: 200 })
          ).catch(() => null),
          research.getCorporateEvents({ from: eventFrom, to: eventTo, limit: 300 }).catch(() => null),
        ]);
        // Broad feeds can omit a watchlist name simply because it falls outside
        // the provider page limit. Fill only missing symbols with bounded,
        // ticker-specific queries so NEWS/EVENT badges are relevant.
        const broadArticles = newsResult?.bundle.articles ?? [];
        const missingNewsSymbols = requested
          .filter((item) => !broadArticles.some((article) => article.tickers.includes(item)))
          .slice(0, 12);
        const broadEvents = eventsResult?.events ?? [];
        const missingEventSymbols = requested
          .filter((item) => !broadEvents.some((event) => event.symbol === item))
          .slice(0, 12);
        const [targetedNews, targetedEvents] = await Promise.all([
          Promise.all(missingNewsSymbols.map((item) => (
            mode === "mock"
              ? mock.getBenzingaNews({ ticker: item, limit: 20 }).then((bundle) => ({ bundle, source: "mock" as const, note: null }))
              : getLiveNewsWithFallback(live!, market!, { ticker: item, limit: 20 })
          ).catch(() => null))),
          Promise.all(missingEventSymbols.map((item) => research.getCorporateEvents({
            ticker: item,
            from: eventFrom,
            to: eventTo,
            limit: 50,
          }).catch(() => null))),
        ]);
        const articles = dedupeNewsArticles([
          ...broadArticles,
          ...targetedNews.flatMap((result) => result?.bundle.articles ?? []),
        ]);
        const events = eventsResult
          ? mergeEventBundles([eventsResult, ...targetedEvents.filter((result): result is EventsResearchBundle => result !== null)])
              .events
          : dedupeCorporateEvents(targetedEvents.flatMap((result) => result?.events ?? []));
        const newsSource = newsResult?.source
          ?? targetedNews.find((result) => result !== null)?.source
          ?? null;
        const hasOptions = contexts.some((context) => context?.options !== null && context?.options !== undefined);
        const source = mode === "mock"
          ? "mock"
          : ["massive", newsSource, eventsResult || targetedEvents.some(Boolean) ? "tmx" : null, hasOptions ? "options developer" : null]
              .filter((value): value is string => Boolean(value)).join(" + ");
        const quotes = contexts.flatMap((context) => context
          ? [watchlistQuote(
              context,
              articles,
              events,
              source,
              mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
            )]
          : []);
        return response({ name: "CORE", symbols: requested, snapshots, quotes }, {
          mode,
          source,
          quality: snapshots[0]?.quality,
          asOf: snapshots[0]?.asOf,
          staleAfterMs: mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
        });
      }
      case "classifications": {
        const requested = symbols(request.nextUrl.searchParams.get("symbols"), [symbol]);
        const classifications: SecurityClassification[] = [];
        for (let offset = 0; offset < requested.length; offset += 10) {
          const batch = requested.slice(offset, offset + 10);
          const results = await Promise.allSettled(batch.map(async (item) => {
            const details = mode === "mock"
              ? (await mock.getSecurity(item, 1)).details
              : await market!.getTickerDetails(item);
            return {
              symbol: item,
              name: details.name,
              marketCap: details.marketCap,
              sector: researchSectorFromSic(details.sicCode, details.sicDescription),
              industry: details.sicDescription,
            } satisfies SecurityClassification;
          }));
          for (const result of results) {
            if (result.status === "fulfilled") classifications.push(result.value);
          }
        }
        return response(classifications, {
          mode,
          source: mode === "mock" ? "mock classification" : "massive reference + local SIC classification",
          quality: "historical",
        });
      }
      case "market":
      case "heatmap":
      case "breadth":
      case "scanner": {
        const requested = symbols(request.nextUrl.searchParams.get("symbols"), DEFAULT_RESEARCH_UNIVERSE);
        const snapshots = mode === "mock" ? await mock.getSnapshots(requested) : await live!.getSnapshots(requested);
        return response({ universe: requested, snapshots, scope: "CURATED U.S. RESEARCH UNIVERSE" }, {
          mode,
          source: mode === "mock" ? "mock" : "massive",
          quality: snapshots[0]?.quality,
          asOf: snapshots[0]?.asOf,
          staleAfterMs: mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
        });
      }
      case "scanner-context": {
        const selectedUniverse = symbols(
          request.nextUrl.searchParams.get("symbols"),
          DEFAULT_RESEARCH_UNIVERSE.slice(0, 8),
          501,
        );
        const requested = selectedUniverse.slice(0, SCANNER_CONTEXT_SAFETY_LIMIT);
        const research: ResearchService = mode === "mock" ? mock : live!;
        const now = new Date();
        const eventFrom = isoDate(now);
        const eventTo = isoDate(addDays(now, 45));
        const [contextResults, newsResult, eventsResult] = await Promise.all([
          scannerContextResults(requested, mode, research, market, 366),
          (mode === "mock"
            ? mock.getBenzingaNews({ limit: 500 }).then((bundle) => ({ bundle, source: "mock" as const, note: null }))
            : getLiveNewsWithFallback(live!, market!, { limit: 500 })
          ).catch(() => null),
          research.getCorporateEvents({ from: eventFrom, to: eventTo, limit: 500 }).catch(() => null),
        ]);
        const broadArticles = newsResult?.bundle.articles ?? [];
        const broadEvents = eventsResult?.events ?? [];
        const missingNewsSymbols = requested
          .filter((item) => !broadArticles.some((article) => article.tickers.includes(item)));
        const missingEventSymbols = requested
          .filter((item) => !broadEvents.some((event) => event.symbol === item));
        const [targetedNews, targetedEvents] = await Promise.all([
          mapWithConcurrency(missingNewsSymbols, SCANNER_CONTEXT_CONCURRENCY, (item) => (
            mode === "mock"
              ? mock.getBenzingaNews({ ticker: item, limit: 20 }).then((bundle) => ({ bundle, source: "mock" as const, note: null }))
              : getLiveNewsWithFallback(live!, market!, { ticker: item, limit: 20 })
          ).catch(() => null)),
          mapWithConcurrency(missingEventSymbols, SCANNER_CONTEXT_CONCURRENCY, (item) => research.getCorporateEvents({
            ticker: item,
            from: eventFrom,
            to: eventTo,
            limit: 50,
          }).catch(() => null)),
        ]);
        const targetedNewsBySymbol = new Map(missingNewsSymbols.map((item, index) => [item, targetedNews[index]]));
        const targetedEventsBySymbol = new Map(missingEventSymbols.map((item, index) => [item, targetedEvents[index]]));
        const articles = dedupeNewsArticles([
          ...broadArticles,
          ...targetedNews.flatMap((result) => result?.bundle.articles ?? []),
        ]);
        const events = dedupeCorporateEvents([
          ...broadEvents,
          ...targetedEvents.flatMap((result) => result?.events ?? []),
        ]);
        const newsSource = newsResult?.source
          ?? targetedNews.find((result) => result !== null)?.source
          ?? null;
        const eventsSourceAvailable = eventsResult !== null || targetedEvents.some((result) => result !== null);
        const newsAvailableFor = (item: string) => broadArticles.some((article) => article.tickers.includes(item))
          || (targetedNewsBySymbol.has(item) && targetedNewsBySymbol.get(item) !== null);
        const eventsAvailableFor = (item: string) => broadEvents.some((event) => event.symbol === item)
          || (targetedEventsBySymbol.has(item) && targetedEventsBySymbol.get(item) !== null);
        const evaluationTime = new Date().toISOString();
        const optionsAvailable = contextResults.some((result) => result.optionsSucceeded);
        const stocksAvailable = contextResults.some((result) => result.context !== null);
        const source = mode === "mock"
          ? "mock"
          : [
              stocksAvailable ? "massive stocks" : null,
              newsSource,
              eventsSourceAvailable ? "tmx events" : null,
              optionsAvailable ? "options developer" : null,
            ].filter((value): value is string => Boolean(value)).join(" + ") || "scanner sources unavailable";
        const rows = contextResults.flatMap((result) => result.context ? [buildScannerContextRow({
          snapshot: result.context.snapshot,
          details: result.context.details,
          bars: result.context.bars,
          intradayBars: result.context.intradayBars ?? [],
          news: articles,
          events,
          optionChain: result.context.options,
          freshness: describeFreshness({
            quality: result.context.snapshot.quality,
            asOf: result.context.snapshot.asOf,
            source: mode === "mock" ? "mock" : [
              "massive stocks",
              newsAvailableFor(result.symbol) ? newsSource : null,
              eventsAvailableFor(result.symbol) ? "tmx events" : null,
              result.optionsSucceeded ? "options developer" : null,
            ].filter((value): value is string => Boolean(value)).join(" + "),
            marketSession: result.context.snapshot.quote.session,
            staleAfterMs: mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
          }),
          now: evaluationTime,
          newsAvailable: newsAvailableFor(result.symbol),
          eventsAvailable: eventsAvailableFor(result.symbol),
        })] : []);
        const partialFailures = [
          ...(selectedUniverse.length > requested.length
            ? [`Scanner processed ${requested.length}/${selectedUniverse.length} selected symbols because cross-source requests have a ${SCANNER_CONTEXT_SAFETY_LIMIT}-symbol safety limit.`]
            : []),
          ...contextResults.flatMap((result) => result.failures),
          ...missingNewsSymbols.flatMap((item, index) => targetedNews[index] === null
            ? [`${item}: ticker-specific news fill unavailable`]
            : []),
          ...missingEventSymbols.flatMap((item, index) => targetedEvents[index] === null
            ? [`${item}: ticker-specific corporate-event fill unavailable`]
            : []),
          ...(newsResult?.note ? requested.map((item) => `${item}: ${newsResult.note}`) : []),
          ...missingNewsSymbols.flatMap((item, index) => targetedNews[index]?.note
            ? [`${item}: ${targetedNews[index]?.note}`]
            : []),
        ];
        const data: ScannerContextBundle = {
          universe: selectedUniverse,
          rows,
          scope: "SELECTED WATCHLIST CROSS-SOURCE RESEARCH UNIVERSE",
          evaluationTime,
          partialFailures,
          universeCoverage: {
            requestedCount: selectedUniverse.length,
            processedCount: requested.length,
            returnedCount: rows.length,
            safetyLimit: SCANNER_CONTEXT_SAFETY_LIMIT,
            truncated: selectedUniverse.length > requested.length,
          },
        };
        const firstContext = contextResults.find((result) => result.context !== null)?.context ?? null;
        return response(data, {
          mode,
          source,
          quality: firstContext?.snapshot.quality,
          asOf: evaluationTime,
          marketSession: firstContext?.snapshot.quote.session,
          staleAfterMs: mode === "live" ? environment.CACHE_TTL_QUOTE_MS * 3 : null,
        });
      }
      case "news": {
        const tickerFilter = request.nextUrl.searchParams.get("all") === "true" ? undefined : symbol;
        const query = {
          ticker: tickerFilter,
          publishedAfter: isoTimestamp(request.nextUrl.searchParams.get("after")),
          publishedBefore: isoTimestamp(request.nextUrl.searchParams.get("before")),
          category: newsCategory(request.nextUrl.searchParams.get("category")),
          keyword: request.nextUrl.searchParams.get("q") ?? undefined,
        };
        if (mode === "mock") {
          const bundle = await mock.getBenzingaNews(query);
          const data = { ...bundle, articles: dedupeNewsArticles(bundle.articles) };
          return response(data, { mode, source: "mock", quality: "indicative", asOf: data.articles[0]?.asOf });
        }
        const news = await getLiveNewsWithFallback(live!, market!, query);
        return response({ ...news.bundle, providerNote: news.note }, {
          mode,
          source: news.source,
          quality: news.source === "benzinga" ? "live" : "unknown",
          asOf: news.bundle.articles[0]?.asOf,
        });
      }
      case "events":
      case "earnings": {
        const now = new Date();
        const from = request.nextUrl.searchParams.get("from") ?? isoDate(addDays(now, -1));
        const to = request.nextUrl.searchParams.get("to") ?? isoDate(addDays(now, kind === "earnings" ? 21 : 45));
        const eventFilter = eventTypeFilter(
          request.nextUrl.searchParams.get("type"),
          kind === "earnings",
        );
        const query = {
          ticker: request.nextUrl.searchParams.get("all") === "true" ? undefined : symbol,
          from,
          to,
        };
        let data: EventsResearchBundle;
        if (mode === "mock") {
          data = await mock.getCorporateEvents(query);
        } else if (eventFilter.providerTypes.length === 0) {
          data = await live!.getCorporateEvents(query);
        } else {
          data = mergeEventBundles(await Promise.all(eventFilter.providerTypes.map((type) =>
            live!.getCorporateEvents({ ...query, type })
          )));
        }
        if (eventFilter.normalized) {
          data = {
            ...data,
            events: data.events.filter((event) => event.type === eventFilter.normalized),
          };
        }
        data = { ...data, events: dedupeCorporateEvents(data.events) };
        return response(data, { mode, source: mode === "mock" ? "mock" : "tmx", quality: mode === "mock" ? "indicative" : "delayed", asOf: data.events[0]?.asOf });
      }
      case "options": {
        const expiration = request.nextUrl.searchParams.get("expiration") ?? undefined;
        const data = mode === "mock"
          ? await mock.getOptionChain({ symbol, expiration })
          : await live!.getOptionChain({ symbol, expiration });
        return response(data, {
          mode,
          source: mode === "mock" ? "mock" : "massive",
          quality: data.quality,
          asOf: data.asOf,
          staleAfterMs: mode === "live" ? environment.CACHE_TTL_OPTIONS_MS * 3 : null,
        });
      }
      case "option-chart": {
        const contract = optionContract(request.nextUrl.searchParams.get("contract"));
        const bars = mode === "mock"
          ? (await mock.getSecurity(contract, 120)).bars
          : await market!.getAggregateBars({
              symbol: contract,
              multiplier: range.multiplier,
              timespan: range.timespan,
              from: range.from,
              to: range.to,
              adjusted: true,
              sort: "asc",
              limit: range.limit,
            });
        return response(bars, { mode, source: mode === "mock" ? "mock" : "massive", quality: mode === "mock" ? "indicative" : "historical", asOf: bars.at(-1)?.asOf });
      }
      case "financials": {
        const data = mode === "mock" ? await mock.getFinancials(symbol) : await live!.getFinancials(symbol);
        return response(data, { mode, source: mode === "mock" ? "mock" : "massive", quality: mode === "mock" ? "indicative" : "historical", asOf: data.asOf });
      }
      case "compare": {
        const requested = symbols(request.nextUrl.searchParams.get("symbols"), [symbol, "AMD", "AVGO"]).slice(0, 4);
        const securities: ComparisonSecurity[] = await Promise.all(requested.map(async (item) => {
          if (mode === "mock") {
            const [security, financials] = await Promise.all([mock.getSecurity(item, 260), mock.getFinancials(item)]);
            return { symbol: item, ...security, ratios: financials.ratios };
          }
          const [snapshot, details, bars, financials] = await Promise.all([
            market!.getSnapshot(item),
            market!.getTickerDetails(item),
            market!.getAggregateBars({ symbol: item, multiplier: 1, timespan: "day", from: range.from, to: range.to, adjusted: true, sort: "asc", limit: MAX_UPSTREAM_BARS }),
            live!.getFinancials(item),
          ]);
          return { symbol: item, snapshot, details, bars, ratios: financials.ratios };
        }));
        return response({ securities, from: range.from, to: range.to }, { mode, source: mode === "mock" ? "mock" : "massive", quality: securities[0]?.snapshot.quality, asOf: securities[0]?.snapshot.asOf });
      }
      case "timeline": {
        const now = new Date();
        const from = isoDate(addDays(now, -90));
        const to = isoDate(addDays(now, 90));
        const results = await Promise.allSettled(mode === "mock"
          ? [
              mock.getBenzingaNews({ ticker: symbol }).then((bundle) => ({
                bundle,
                source: "mock" as const,
                note: null,
              })),
              mock.getCorporateEvents({ ticker: symbol, from, to }),
              mock.getSecurity(symbol, 100),
              mock.getOptionChain({ symbol }),
            ] as const
          : [
              getLiveNewsWithFallback(live!, market!, { ticker: symbol, publishedAfter: `${from}T00:00:00Z`, limit: 200 }),
              live!.getCorporateEvents({ ticker: symbol, from, to, limit: 300 }),
              Promise.all([
                market!.getSnapshot(symbol),
                market!.getTickerDetails(symbol),
                market!.getAggregateBars({ symbol, multiplier: 1, timespan: "day", from, to: isoDate(now), adjusted: true, sort: "asc", limit: 500 }),
              ]).then(([snapshot, details, bars]) => ({ snapshot, details, bars })),
              live!.getOptionChain({ symbol }),
            ] as const);
        const [newsResult, eventsResult, securityResult, optionsResult] = results;
        const notes = [
          newsResult.status === "rejected" ? "Market news is unavailable for this timeline." : newsResult.value.note,
          eventsResult.status === "rejected" ? "TMX events are unavailable for this timeline." : null,
          securityResult.status === "rejected" ? "Price-move history is unavailable for this timeline." : null,
          optionsResult.status === "rejected" ? "Options activity observations are unavailable for this timeline." : null,
        ].filter((note): note is string => note !== null);
        const newsArticles = newsResult.status === "fulfilled" ? newsResult.value.bundle.articles : [];
        const corporateEvents = eventsResult.status === "fulfilled" ? eventsResult.value.events : [];
        const priceBars = securityResult.status === "fulfilled" ? securityResult.value.bars : [];
        const optionChain = optionsResult.status === "fulfilled" ? optionsResult.value : null;
        const entries: CatalystTimelineEntry[] = [
          ...newsArticles.map((article) => ({ id: article.id, at: article.publishedAt, symbol, kind: "news" as const, title: article.title, detail: article.summary, url: article.articleUrl })),
          ...corporateEvents.map((event) => ({ id: event.id, at: event.startsAt, symbol, kind: "event" as const, title: event.title, detail: event.description, url: event.eventUrl })),
          ...priceMoveEntries(symbol, priceBars),
          ...volumeSpikeTimelineEntries(symbol, priceBars),
          ...optionsActivityTimelineEntries(symbol, optionChain),
        ].sort((a, b) => a.at.localeCompare(b.at));
        const sources = mode === "mock"
          ? "mock"
          : [
              securityResult.status === "fulfilled" ? "massive" : null,
              newsResult.status === "fulfilled" ? newsResult.value.source : null,
              eventsResult.status === "fulfilled" ? "tmx" : null,
              optionsResult.status === "fulfilled" ? "options developer" : null,
            ].filter((source): source is string => source !== null).join(" + ") || "timeline sources unavailable";
        return response({
          symbol,
          entries,
          availability: {
            news: newsResult.status === "fulfilled",
            events: eventsResult.status === "fulfilled",
            priceMoves: securityResult.status === "fulfilled",
            volumeSpikes: securityResult.status === "fulfilled",
            optionsActivity: optionsResult.status === "fulfilled",
            notes,
          },
        }, { mode, source: sources, quality: mode === "mock" ? "indicative" : "unknown", asOf: new Date().toISOString() });
      }
      case "dashboard": {
        const eventFrom = isoDate(new Date());
        const eventTo = isoDate(addDays(new Date(), 14));
        const requested = ["SPY", "QQQ", "DIA", "IWM", "NVDA", "AAPL", "MSFT", "AMD"];
        const indexNote = "SPY / QQQ / DIA / IWM are labeled ETF proxies; direct indices require a separate entitlement.";
        if (mode === "mock") {
          const [snapshots, movers, news, events] = await Promise.all([
            mock.getSnapshots(requested),
            mock.getMovers(),
            mock.getBenzingaNews(),
            mock.getCorporateEvents({ from: eventFrom, to: eventTo }),
          ]);
          return response({
            snapshots,
            movers,
            news: news.articles,
            events: events.events,
            availability: {
              movers: { available: true, note: null },
              news: { available: true, note: null },
              events: { available: true, note: null },
            },
            indexNote,
          }, { mode, source: "mock", quality: snapshots[0]?.quality, asOf: snapshots[0]?.asOf });
        }

        const [snapshots, optionalResults] = await Promise.all([
          live!.getSnapshots(requested),
          Promise.allSettled([
            live!.getMovers(),
            getLiveNewsWithFallback(live!, market!, { limit: 40 }),
            live!.getCorporateEvents({ from: eventFrom, to: eventTo, limit: 80 }),
          ]),
        ]);
        const [moversResult, newsResult, eventsResult] = optionalResults;
        const availabilityNotes = [
          moversResult.status === "rejected" ? "Market movers are currently unavailable." : null,
          newsResult.status === "rejected" ? "Market headlines are currently unavailable." : newsResult.value.note,
          eventsResult.status === "rejected" ? "TMX events are currently unavailable." : null,
        ].filter((note): note is string => note !== null);
        const asOf = snapshots[0]?.asOf ?? new Date().toISOString();
        const movers = moversResult.status === "fulfilled"
          ? moversResult.value
          : { gainers: [], losers: [], asOf, quality: "unknown" as const };
        return response({
          snapshots,
          movers,
          news: newsResult.status === "fulfilled" ? newsResult.value.bundle.articles : [],
          events: eventsResult.status === "fulfilled" ? eventsResult.value.events : [],
          availability: {
            movers: { available: moversResult.status === "fulfilled", note: availabilityNotes.find((note) => note.startsWith("Market movers")) ?? null },
            news: { available: newsResult.status === "fulfilled", note: newsResult.status === "fulfilled" ? newsResult.value.note : availabilityNotes.find((note) => note.startsWith("Market headlines")) ?? null },
            events: { available: eventsResult.status === "fulfilled", note: availabilityNotes.find((note) => note.startsWith("TMX")) ?? null },
          },
          indexNote: [indexNote, ...availabilityNotes].join(" "),
        }, {
          mode,
          source: [
            "massive",
            newsResult.status === "fulfilled" ? newsResult.value.source : null,
            eventsResult.status === "fulfilled" ? "tmx" : null,
          ].filter((source): source is string => source !== null).join(" + "),
          quality: snapshots[0]?.quality,
          asOf,
          staleAfterMs: environment.CACHE_TTL_QUOTE_MS * 3,
        });
      }
      default:
        return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Unknown research module.", retryable: false, requestId } }, { status: 404 });
    }
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.code === "UNKNOWN_ERROR" && error instanceof Error && error.message.includes("invalid")
          ? "The request parameters are invalid."
          : normalized.message,
        retryable: normalized.retryable,
        requestId,
      },
    }, {
      status: normalized.code === "UNKNOWN_ERROR" ? 400 : normalized.statusCode,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
