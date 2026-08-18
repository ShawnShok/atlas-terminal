import { ProviderError } from "@/lib/errors";
import type {
  AggregateBar,
  DataQuality,
  NewsArticle,
  NewsCategory,
  Snapshot,
  TickerDetails,
  Trade,
} from "@/types";

import type {
  MassiveAggregatesResponse,
  MassiveBar,
  MassiveNewsResponse,
  MassiveSnapshotResponse,
  MassiveTickerDetailsResponse,
} from "./schemas";

interface AdapterOptions {
  readonly asOf?: string;
  readonly quality?: DataQuality;
}

interface AggregateAdapterOptions extends AdapterOptions {
  readonly interval: AggregateBar["interval"];
  readonly symbol: string;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function toIsoTimestamp(value: number | undefined, fallback: string): string {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  // Massive timestamps may be Unix seconds, milliseconds, microseconds, or nanoseconds.
  const milliseconds =
    value > 10_000_000_000_000_000
      ? value / 1_000_000
      : value > 10_000_000_000_000
        ? value / 1_000
        : value > 10_000_000_000
          ? value
          : value * 1_000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? fallback : date.toISOString();
}

function toBar(
  raw: MassiveBar | undefined,
  options: AggregateAdapterOptions,
): AggregateBar | null {
  if (
    !raw ||
    raw.o === undefined ||
    raw.h === undefined ||
    raw.l === undefined ||
    raw.c === undefined ||
    raw.v === undefined
  ) {
    return null;
  }

  const asOf = options.asOf ?? new Date().toISOString();
  const timestamp = toIsoTimestamp(raw.t, asOf);
  return {
    symbol: normalizeSymbol(options.symbol),
    interval: options.interval,
    timestamp,
    open: raw.o,
    high: raw.h,
    low: raw.l,
    close: raw.c,
    volume: raw.v,
    vwap: raw.vw ?? null,
    transactionCount: raw.n ?? null,
    asOf: timestamp,
    quality: options.quality ?? "unknown",
    source: "massive",
  };
}

export function adaptSnapshot(
  response: MassiveSnapshotResponse,
  requestedSymbol: string,
  options: AdapterOptions = {},
): Snapshot {
  const raw = response.ticker;
  if (!raw) {
    throw new ProviderError(
      "UPSTREAM_RESPONSE_INVALID",
      "Massive returned a snapshot without ticker data.",
      {
        provider: "massive",
        requestId: response.request_id,
      },
    );
  }

  const symbol = normalizeSymbol(raw.ticker ?? requestedSymbol);
  const fallbackAsOf = options.asOf ?? new Date().toISOString();
  const asOf = toIsoTimestamp(
    raw.updated ?? raw.lastTrade?.t ?? raw.lastQuote?.t,
    fallbackAsOf,
  );
  const quality = options.quality ?? "unknown";

  let latestTrade: Trade | null = null;
  if (
    raw.lastTrade?.p !== undefined &&
    raw.lastTrade.s !== undefined &&
    raw.lastTrade.t !== undefined
  ) {
    const timestamp = toIsoTimestamp(raw.lastTrade.t, asOf);
    latestTrade = {
      id: raw.lastTrade.i ?? null,
      symbol,
      price: raw.lastTrade.p,
      size: raw.lastTrade.s,
      timestamp,
      exchange: raw.lastTrade.x ?? null,
      conditions: raw.lastTrade.c ?? [],
      tape: raw.lastTrade.z ?? null,
      asOf: timestamp,
      quality,
      source: "massive",
    };
  }

  const dayBar = toBar(raw.day, {
    symbol,
    interval: "1D",
    asOf,
    quality,
  });
  const previousDayBar = toBar(raw.prevDay, {
    symbol,
    interval: "1D",
    asOf,
    quality: "historical",
  });
  const minuteBar = toBar(raw.min, {
    symbol,
    interval: "1m",
    asOf,
    quality,
  });

  const quote = {
    symbol,
    lastPrice: raw.lastTrade?.p ?? raw.day?.c ?? null,
    bidPrice: raw.lastQuote?.p ?? null,
    bidSize: raw.lastQuote?.s ?? null,
    askPrice: raw.lastQuote?.P ?? null,
    askSize: raw.lastQuote?.S ?? null,
    change: raw.todaysChange ?? null,
    changePercent: raw.todaysChangePerc ?? null,
    open: raw.day?.o ?? null,
    high: raw.day?.h ?? null,
    low: raw.day?.l ?? null,
    previousClose: raw.prevDay?.c ?? null,
    volume: raw.day?.v ?? null,
    averageVolume: null,
    marketCap: null,
    vwap: raw.day?.vw ?? null,
    session: "unknown" as const,
    asOf,
    quality,
    source: "massive" as const,
  };

  return {
    symbol,
    quote,
    latestTrade,
    minuteBar,
    dayBar,
    previousDayBar,
    asOf,
    quality,
    source: "massive",
  };
}

export function adaptTickerDetails(
  response: MassiveTickerDetailsResponse,
  requestedSymbol: string,
  options: AdapterOptions = {},
): TickerDetails {
  const raw = response.results;
  if (!raw?.name) {
    throw new ProviderError(
      "UPSTREAM_RESPONSE_INVALID",
      "Massive returned incomplete ticker reference data.",
      {
        provider: "massive",
        requestId: response.request_id,
      },
    );
  }

  return {
    symbol: normalizeSymbol(raw.ticker ?? requestedSymbol),
    name: raw.name,
    description: raw.description ?? null,
    active: raw.active ?? false,
    assetType: raw.type ?? null,
    market: raw.market ?? null,
    locale: raw.locale ?? null,
    currency: raw.currency_name?.toUpperCase() ?? null,
    primaryExchange: raw.primary_exchange ?? null,
    cik: raw.cik ?? null,
    compositeFigi: raw.composite_figi ?? null,
    shareClassFigi: raw.share_class_figi ?? null,
    sicCode: raw.sic_code ?? null,
    sicDescription: raw.sic_description ?? null,
    homepageUrl: raw.homepage_url ?? null,
    listDate: raw.list_date ?? null,
    marketCap: raw.market_cap ?? null,
    weightedSharesOutstanding: raw.weighted_shares_outstanding ?? null,
    totalEmployees: raw.total_employees ?? null,
    branding: {
      iconUrl: raw.branding?.icon_url ?? null,
      logoUrl: raw.branding?.logo_url ?? null,
    },
    asOf: options.asOf ?? new Date().toISOString(),
    quality: options.quality ?? "historical",
    source: "massive",
  };
}

export function adaptAggregateBars(
  response: MassiveAggregatesResponse,
  options: AggregateAdapterOptions,
): readonly AggregateBar[] {
  return (response.results ?? []).flatMap((raw) => {
    const bar = toBar(raw, {
      ...options,
      quality: options.quality ?? "historical",
    });
    return bar ? [bar] : [];
  });
}

const CATEGORY_ALIASES: Readonly<Record<string, NewsCategory>> = {
  analyst: "analyst",
  breaking: "breaking",
  earnings: "earnings",
  fda: "fda",
  guidance: "guidance",
  macro: "macro",
  markets: "markets",
  "m&a": "mergers-acquisitions",
  merger: "mergers-acquisitions",
};

export function adaptNews(
  response: MassiveNewsResponse,
  options: AdapterOptions = {},
): readonly NewsArticle[] {
  return (response.results ?? []).flatMap((raw) => {
    if (!raw.id || !raw.title || !raw.published_utc) {
      return [];
    }

    const categories = (raw.keywords ?? []).flatMap((keyword) => {
      const category = CATEGORY_ALIASES[keyword.trim().toLowerCase()];
      return category ? [category] : [];
    });

    return [
      {
        id: raw.id,
        title: raw.title,
        summary: raw.description ?? null,
        body: null,
        articleUrl: raw.article_url ?? raw.amp_url ?? null,
        imageUrl: raw.image_url ?? null,
        publishedAt: raw.published_utc,
        updatedAt: null,
        tickers: (raw.tickers ?? []).map(normalizeSymbol),
        categories,
        keywords: raw.keywords ?? [],
        publisher: {
          name: raw.publisher?.name ?? "Unknown publisher",
          homepageUrl: raw.publisher?.homepage_url ?? null,
          logoUrl: raw.publisher?.logo_url ?? null,
          faviconUrl: raw.publisher?.favicon_url ?? null,
        },
        asOf: options.asOf ?? raw.published_utc,
        quality: options.quality ?? "unknown",
        source: "massive" as const,
      },
    ];
  });
}
