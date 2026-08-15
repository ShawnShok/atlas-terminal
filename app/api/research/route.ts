import { NextRequest, NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { normalizeError } from "@/lib/errors";
import {
  DEFAULT_RESEARCH_UNIVERSE,
  getMassiveMarketDataService,
  getMassiveResearchService,
} from "@/lib/massive";
import { getMockResearchService } from "@/lib/mock";
import { researchSectorFromSic } from "@/lib/research";
import type {
  AggregateBar,
  CatalystTimelineEntry,
  ComparisonSecurity,
  CorporateEventType,
  DataQuality,
  EventsResearchBundle,
  SecurityClassification,
  SecurityResearchBundle,
  TerminalApiSuccess,
} from "@/types";

export const dynamic = "force-dynamic";

const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const OPTION_TICKER_PATTERN = /^O:[A-Z0-9.-]{1,15}[0-9]{6}[CP][0-9]{8}$/;
const CHATGPT_USER_EMAIL_HEADER = "oai-authenticated-user-email";
const MAX_UPSTREAM_BARS = 5_000;
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

function hasOwnKey<ObjectType extends object>(
  value: ObjectType,
  key: PropertyKey,
): key is keyof ObjectType {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function ticker(value: string | null, fallback = "NVDA"): string {
  const normalized = (value ?? fallback).trim().toUpperCase();
  if (!TICKER_PATTERN.test(normalized)) throw new Error("Ticker format is invalid.");
  return normalized;
}

function symbols(value: string | null, fallback: readonly string[]): readonly string[] {
  const values = value ? value.split(",") : fallback;
  const normalized = [...new Set(values.map((item) => ticker(item)))];
  if (normalized.length > 100) throw new Error("Too many tickers were requested.");
  return normalized;
}

function optionContract(value: string | null): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!OPTION_TICKER_PATTERN.test(normalized)) throw new Error("Option contract format is invalid.");
  return normalized;
}

function newsCategory(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!NEWS_CATEGORIES.has(normalized)) throw new Error("News category is invalid.");
  return normalized;
}

function isoTimestamp(value: string | null): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("News date is invalid.");
  return new Date(timestamp).toISOString();
}

function eventTypeFilter(
  value: string | null,
  earningsOnly: boolean,
): { readonly normalized: CorporateEventType | null; readonly providerTypes: readonly string[] } {
  const normalized = earningsOnly
    ? "earnings-release"
    : (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return { normalized: null, providerTypes: [] };
  }
  if (!hasOwnKey(TMX_EVENT_TYPES, normalized)) {
    throw new Error("Event type is invalid.");
  }
  return { normalized, providerTypes: TMX_EVENT_TYPES[normalized] };
}

function mergeEventBundles(bundles: readonly EventsResearchBundle[]): EventsResearchBundle {
  const first = bundles[0];
  if (!first) {
    throw new Error("Event response is invalid.");
  }
  const uniqueEvents = new Map(bundles.flatMap((bundle) => bundle.events).map((event) => [event.id, event]));
  return {
    ...first,
    events: [...uniqueEvents.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
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
  input: { mode: "live" | "mock"; source: string; quality?: DataQuality; asOf?: string },
): NextResponse<TerminalApiSuccess<T>> {
  return NextResponse.json({
    ok: true,
    data,
    meta: {
      mode: input.mode,
      source: input.source,
      quality: input.quality ?? (input.mode === "mock" ? "indicative" : "unknown"),
      asOf: input.asOf ?? new Date().toISOString(),
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
    const symbol = ticker(request.nextUrl.searchParams.get("ticker"));
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
        return response(data, { mode, source: mode === "mock" ? "mock" : "massive", quality: data.snapshot.quality, asOf: data.snapshot.asOf });
      }
      case "movers": {
        const data = mode === "mock" ? await mock.getMovers() : await live!.getMovers();
        return response(data, { mode, source: mode === "mock" ? "mock" : "massive", quality: data.quality, asOf: data.asOf });
      }
      case "watchlist": {
        const requested = symbols(request.nextUrl.searchParams.get("symbols"), ["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "META", "PLTR", "TSLA"]);
        const snapshots = mode === "mock" ? await mock.getSnapshots(requested) : await live!.getSnapshots(requested);
        return response({ name: "CORE", symbols: requested, snapshots }, { mode, source: mode === "mock" ? "mock" : "massive", asOf: snapshots[0]?.asOf });
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
        return response({ universe: requested, snapshots, scope: "CURATED U.S. RESEARCH UNIVERSE" }, { mode, source: mode === "mock" ? "mock" : "massive", asOf: snapshots[0]?.asOf });
      }
      case "news": {
        const tickerFilter = request.nextUrl.searchParams.get("all") === "true" ? undefined : symbol;
        const query = {
          ticker: tickerFilter,
          publishedAfter: isoTimestamp(request.nextUrl.searchParams.get("after")),
          category: newsCategory(request.nextUrl.searchParams.get("category")),
          keyword: request.nextUrl.searchParams.get("q") ?? undefined,
        };
        const data = mode === "mock" ? await mock.getBenzingaNews(query) : await live!.getBenzingaNews(query);
        return response(data, { mode, source: mode === "mock" ? "mock" : "benzinga", quality: mode === "mock" ? "indicative" : "live", asOf: data.articles[0]?.asOf });
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
        return response(data, { mode, source: mode === "mock" ? "mock" : "tmx", quality: mode === "mock" ? "indicative" : "delayed", asOf: data.events[0]?.asOf });
      }
      case "options": {
        const expiration = request.nextUrl.searchParams.get("expiration") ?? undefined;
        const data = mode === "mock"
          ? await mock.getOptionChain({ symbol, expiration })
          : await live!.getOptionChain({ symbol, expiration });
        return response(data, { mode, source: mode === "mock" ? "mock" : "massive", quality: data.quality, asOf: data.asOf });
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
              mock.getBenzingaNews({ ticker: symbol }),
              mock.getCorporateEvents({ ticker: symbol, from, to }),
              mock.getSecurity(symbol, 100),
            ] as const
          : [
              live!.getBenzingaNews({ ticker: symbol, publishedAfter: `${from}T00:00:00Z`, limit: 200 }),
              live!.getCorporateEvents({ ticker: symbol, from, to, limit: 300 }),
              Promise.all([
                market!.getSnapshot(symbol),
                market!.getTickerDetails(symbol),
                market!.getAggregateBars({ symbol, multiplier: 1, timespan: "day", from, to: isoDate(now), adjusted: true, sort: "asc", limit: 500 }),
              ]).then(([snapshot, details, bars]) => ({ snapshot, details, bars })),
            ] as const);
        const [newsResult, eventsResult, securityResult] = results;
        const notes = [
          newsResult.status === "rejected" ? "Benzinga news is unavailable for this timeline." : null,
          eventsResult.status === "rejected" ? "TMX events are unavailable for this timeline." : null,
          securityResult.status === "rejected" ? "Price-move history is unavailable for this timeline." : null,
        ].filter((note): note is string => note !== null);
        const newsArticles = newsResult.status === "fulfilled" ? newsResult.value.articles : [];
        const corporateEvents = eventsResult.status === "fulfilled" ? eventsResult.value.events : [];
        const priceBars = securityResult.status === "fulfilled" ? securityResult.value.bars : [];
        const entries: CatalystTimelineEntry[] = [
          ...newsArticles.map((article) => ({ id: article.id, at: article.publishedAt, symbol, kind: "news" as const, title: article.title, detail: article.summary, url: article.articleUrl })),
          ...corporateEvents.map((event) => ({ id: event.id, at: event.startsAt, symbol, kind: "event" as const, title: event.title, detail: event.description, url: event.eventUrl })),
          ...priceMoveEntries(symbol, priceBars),
        ].sort((a, b) => a.at.localeCompare(b.at));
        const sources = mode === "mock"
          ? "mock"
          : [
              securityResult.status === "fulfilled" ? "massive" : null,
              newsResult.status === "fulfilled" ? "benzinga" : null,
              eventsResult.status === "fulfilled" ? "tmx" : null,
            ].filter((source): source is string => source !== null).join(" + ") || "timeline sources unavailable";
        return response({
          symbol,
          entries,
          availability: {
            news: newsResult.status === "fulfilled",
            events: eventsResult.status === "fulfilled",
            priceMoves: securityResult.status === "fulfilled",
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
          }, { mode, source: "mock", asOf: snapshots[0]?.asOf });
        }

        const [snapshots, optionalResults] = await Promise.all([
          live!.getSnapshots(requested),
          Promise.allSettled([
            live!.getMovers(),
            live!.getBenzingaNews({ limit: 40 }),
            live!.getCorporateEvents({ from: eventFrom, to: eventTo, limit: 80 }),
          ]),
        ]);
        const [moversResult, newsResult, eventsResult] = optionalResults;
        const availabilityNotes = [
          moversResult.status === "rejected" ? "Market movers are currently unavailable." : null,
          newsResult.status === "rejected" ? "Benzinga headlines are currently unavailable." : null,
          eventsResult.status === "rejected" ? "TMX events are currently unavailable." : null,
        ].filter((note): note is string => note !== null);
        const asOf = snapshots[0]?.asOf ?? new Date().toISOString();
        const movers = moversResult.status === "fulfilled"
          ? moversResult.value
          : { gainers: [], losers: [], asOf, quality: "unknown" as const };
        return response({
          snapshots,
          movers,
          news: newsResult.status === "fulfilled" ? newsResult.value.articles : [],
          events: eventsResult.status === "fulfilled" ? eventsResult.value.events : [],
          availability: {
            movers: { available: moversResult.status === "fulfilled", note: availabilityNotes.find((note) => note.startsWith("Market movers")) ?? null },
            news: { available: newsResult.status === "fulfilled", note: availabilityNotes.find((note) => note.startsWith("Benzinga")) ?? null },
            events: { available: eventsResult.status === "fulfilled", note: availabilityNotes.find((note) => note.startsWith("TMX")) ?? null },
          },
          indexNote: [indexNote, ...availabilityNotes].join(" "),
        }, { mode, source: "massive + optional benzinga + tmx", asOf });
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
