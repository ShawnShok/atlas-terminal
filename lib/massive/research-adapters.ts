import type {
  CorporateEvent,
  CorporateEventStatus,
  CorporateEventType,
  DataQuality,
  NewsArticle,
  NewsCategory,
  OptionContract,
} from "@/types";
import type {
  FinancialRatioPoint,
  MarketSnapshotRow,
  NormalizedFinancialPeriod,
  OptionChainBundle,
  TickerSearchResult,
} from "@/types/research";

import type {
  MassiveBenzingaNewsResponse,
  MassiveFinancialRecord,
  MassiveFinancialsResponse,
  MassiveOptionChainResponse,
  MassiveRatiosResponse,
  MassiveSnapshotListResponse,
  MassiveSnapshotTicker,
  MassiveTickerSearchResponse,
  MassiveTmxEventsResponse,
} from "./research-schemas";

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function toIsoTimestamp(value: number | undefined, fallback: string): string {
  if (value === undefined || !Number.isFinite(value)) return fallback;
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

function qualityFromTimeframe(value: string | undefined): DataQuality {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("real")) return "live";
  if (normalized.includes("delay")) return "delayed";
  if (normalized.includes("histor")) return "historical";
  return "unknown";
}

function mergeQuality(values: readonly DataQuality[]): DataQuality {
  if (values.length === 0 || values.includes("unknown")) return "unknown";
  if (values.includes("delayed")) return "delayed";
  if (values.includes("indicative")) return "indicative";
  if (values.includes("historical")) return "historical";
  return values.every((value) => value === "live") ? "live" : "unknown";
}

function humanizeKey(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decodeEntities(value: string): string {
  const entities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    nbsp: " ",
    quot: '"',
    rsquo: "’",
  };
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => entities[name.toLowerCase()] ?? match);
}

export function sanitizeArticleBody(value: string | undefined): string | null {
  if (!value) return null;
  const text = decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  const normalized = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return normalized || null;
}

export function adaptTickerSearch(
  response: MassiveTickerSearchResponse,
): readonly TickerSearchResult[] {
  return (response.results ?? []).flatMap((raw) => {
    if (!raw.ticker || !raw.name) return [];
    return [{
      symbol: normalizeSymbol(raw.ticker),
      name: raw.name,
      exchange: raw.primary_exchange ?? null,
      assetType: raw.type ?? null,
      currency: raw.currency_name?.toUpperCase() ?? null,
      active: raw.active ?? true,
    }];
  });
}

export function adaptSnapshotTicker(
  raw: MassiveSnapshotTicker,
  fallbackAsOf = new Date().toISOString(),
  quality: DataQuality = "unknown",
): MarketSnapshotRow | null {
  if (!raw.ticker) return null;
  return {
    symbol: normalizeSymbol(raw.ticker),
    lastPrice: raw.lastTrade?.p ?? raw.day?.c ?? null,
    change: raw.todaysChange ?? null,
    changePercent: raw.todaysChangePerc ?? null,
    open: raw.day?.o ?? null,
    high: raw.day?.h ?? null,
    low: raw.day?.l ?? null,
    previousClose: raw.prevDay?.c ?? null,
    volume: raw.day?.v ?? null,
    vwap: raw.day?.vw ?? null,
    asOf: toIsoTimestamp(raw.updated ?? raw.lastTrade?.t ?? raw.lastQuote?.t, fallbackAsOf),
    quality,
  };
}

export function adaptSnapshotList(
  response: MassiveSnapshotListResponse,
  quality: DataQuality = "unknown",
): readonly MarketSnapshotRow[] {
  const fetchedAt = new Date().toISOString();
  return (response.tickers ?? []).flatMap((raw) => {
    const row = adaptSnapshotTicker(raw, fetchedAt, quality);
    return row ? [row] : [];
  });
}

const CATEGORY_MAP: Readonly<Record<string, NewsCategory>> = {
  analyst: "analyst",
  analysts: "analyst",
  breaking: "breaking",
  earnings: "earnings",
  fda: "fda",
  guidance: "guidance",
  macro: "macro",
  markets: "markets",
  merger: "mergers-acquisitions",
  mergers: "mergers-acquisitions",
  "m&a": "mergers-acquisitions",
};

function inferNewsCategories(values: readonly string[]): readonly NewsCategory[] {
  const categories = new Set<NewsCategory>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    const exact = CATEGORY_MAP[normalized];
    if (exact) categories.add(exact);
    if (normalized.includes("price target") || normalized.includes("analyst")) categories.add("analyst");
    if (normalized.includes("earning")) categories.add("earnings");
    if (normalized.includes("guidance")) categories.add("guidance");
    if (normalized.includes("merger") || normalized.includes("acquisition")) categories.add("mergers-acquisitions");
  }
  if (!categories.size) categories.add("company");
  return [...categories];
}

export function adaptBenzingaNews(
  response: MassiveBenzingaNewsResponse,
): readonly NewsArticle[] {
  const fetchedAt = new Date().toISOString();
  const seen = new Set<string>();
  return (response.results ?? []).flatMap((raw) => {
    if (!raw.benzinga_id || !raw.title || !raw.published) return [];
    const id = `benzinga-${raw.benzinga_id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const tags = [...(raw.channels ?? []), ...(raw.tags ?? [])];
    return [{
      id,
      title: raw.title,
      summary: sanitizeArticleBody(raw.teaser),
      body: sanitizeArticleBody(raw.body),
      articleUrl: raw.url ?? null,
      imageUrl: raw.images?.[0] ?? null,
      publishedAt: raw.published,
      updatedAt: raw.last_updated ?? null,
      tickers: (raw.tickers ?? []).map(normalizeSymbol),
      categories: inferNewsCategories(tags),
      keywords: tags,
      publisher: {
        name: raw.author ? `Benzinga · ${raw.author}` : "Benzinga",
        homepageUrl: "https://www.benzinga.com",
        logoUrl: null,
        faviconUrl: null,
      },
      asOf: fetchedAt,
      quality: "live" as const,
      source: "benzinga" as const,
    }];
  });
}

const EVENT_TYPES: Readonly<Record<string, CorporateEventType>> = {
  analyst_day: "analyst-day",
  business_update: "company-update",
  capital_markets_day: "investor-day",
  conference: "conference",
  dividend: "dividend",
  earnings_announcement_date: "earnings-release",
  earnings_conference_call: "earnings-call",
  earnings_results_announcement: "earnings-release",
  forum: "conference",
  research_and_development_day: "investor-day",
  seminar: "presentation",
  shareholder_meeting: "shareholder-meeting",
  stock_split: "stock-split",
  summit: "summit",
  tradeshow: "industry-event",
  workshop: "industry-event",
};

function eventStatus(value: string | undefined): CorporateEventStatus {
  switch (value?.toLowerCase()) {
    case "approved":
    case "confirmed":
      return "confirmed";
    case "pending_approval":
    case "postponed":
    case "unconfirmed":
      return "pending";
    case "canceled":
      return "canceled";
    case "historical":
      return "completed";
    default:
      return "unknown";
  }
}

export function adaptTmxEvents(
  response: MassiveTmxEventsResponse,
): readonly CorporateEvent[] {
  const fetchedAt = new Date().toISOString();
  return (response.results ?? []).flatMap((raw) => {
    if (!raw.ticker || !raw.date || !raw.name) return [];
    const symbol = normalizeSymbol(raw.ticker);
    return [{
      id: `tmx-${raw.tmx_record_id ?? `${symbol}-${raw.date}-${raw.type ?? "event"}`}`,
      symbol,
      companyName: raw.company_name ?? symbol,
      title: raw.name,
      type: EVENT_TYPES[raw.type?.toLowerCase() ?? ""] ?? "other",
      status: eventStatus(raw.status),
      startsAt: `${raw.date}T12:00:00.000Z`,
      endsAt: null,
      allDay: true,
      description: raw.type ? humanizeKey(raw.type) : null,
      eventUrl: raw.url ?? null,
      asOf: fetchedAt,
      quality: "delayed" as const,
      source: "tmx" as const,
    }];
  });
}

export function adaptOptionChain(
  response: MassiveOptionChainResponse,
  underlyingSymbol: string,
  selectedExpiration?: string,
): OptionChainBundle {
  const fetchedAt = new Date().toISOString();
  let underlyingPrice: number | null = null;
  const qualities: DataQuality[] = [];
  const contracts: OptionContract[] = [];

  for (const raw of response.results ?? []) {
    const details = raw.details;
    if (
      !details?.ticker ||
      !details.contract_type ||
      !details.expiration_date ||
      details.strike_price === undefined
    ) continue;

    underlyingPrice ??= raw.underlying_asset?.price ?? null;
    const premium = raw.last_trade?.price ?? raw.day?.close ?? raw.last_quote?.midpoint ?? null;
    const intrinsic = underlyingPrice === null
      ? null
      : details.contract_type === "call"
        ? Math.max(0, underlyingPrice - details.strike_price)
        : Math.max(0, details.strike_price - underlyingPrice);
    const timeframe = raw.last_quote?.timeframe ?? raw.last_trade?.timeframe ?? raw.underlying_asset?.timeframe;
    const quality = qualityFromTimeframe(timeframe);
    qualities.push(quality);
    const asOf = toIsoTimestamp(
      raw.last_quote?.last_updated ?? raw.last_trade?.sip_timestamp ?? raw.underlying_asset?.last_updated ?? raw.day?.last_updated,
      fetchedAt,
    );
    const style = details.exercise_style?.toLowerCase();

    contracts.push({
      symbol: details.ticker,
      underlyingSymbol: normalizeSymbol(underlyingSymbol),
      type: details.contract_type,
      expirationDate: details.expiration_date,
      strikePrice: details.strike_price,
      exerciseStyle:
        style === "american" || style === "european" || style === "bermudan"
          ? style
          : "unknown",
      sharesPerContract: details.shares_per_contract ?? 100,
      lastPrice: premium,
      bidPrice: raw.last_quote?.bid ?? null,
      askPrice: raw.last_quote?.ask ?? null,
      volume: raw.day?.volume ?? null,
      openInterest: raw.open_interest ?? null,
      impliedVolatility: raw.implied_volatility ?? null,
      intrinsicValue: intrinsic,
      extrinsicValue:
        premium !== null && intrinsic !== null ? Math.max(0, premium - intrinsic) : null,
      greeks: {
        delta: raw.greeks?.delta ?? null,
        gamma: raw.greeks?.gamma ?? null,
        theta: raw.greeks?.theta ?? null,
        vega: raw.greeks?.vega ?? null,
        rho: null,
      },
      asOf,
      quality,
      source: "massive",
    });
  }

  const expirations = [...new Set(contracts.map((contract) => contract.expirationDate))].sort();
  return {
    underlyingSymbol: normalizeSymbol(underlyingSymbol),
    underlyingPrice,
    expirations,
    selectedExpiration: selectedExpiration ?? expirations[0] ?? null,
    contracts,
    asOf: contracts[0]?.asOf ?? fetchedAt,
    quality: mergeQuality(qualities),
  };
}

const FINANCIAL_METADATA = new Set([
  "cik",
  "filing_date",
  "fiscal_quarter",
  "fiscal_year",
  "period_end",
  "timeframe",
  "tickers",
]);

function metricUnit(key: string): string {
  if (key.includes("shares_outstanding")) return "shares";
  if (key.includes("earnings_per_share")) return "USD/share";
  return "USD";
}

function financialTimeframe(value: unknown): "annual" | "quarterly" | "ttm" {
  const normalized = String(value ?? "quarterly").toLowerCase();
  if (normalized.includes("annual")) return "annual";
  if (normalized.includes("ttm") || normalized.includes("trailing")) return "ttm";
  return "quarterly";
}

export function adaptFinancialPeriods(
  response: MassiveFinancialsResponse,
  symbol: string,
  statement: NormalizedFinancialPeriod["statement"],
): readonly NormalizedFinancialPeriod[] {
  return (response.results ?? []).flatMap((raw: MassiveFinancialRecord, index) => {
    if (!raw.period_end) return [];
    const metrics = Object.entries(raw).flatMap(([key, value]) =>
      FINANCIAL_METADATA.has(key) || typeof value !== "number" || !Number.isFinite(value)
        ? []
        : [{ key, label: humanizeKey(key), value, unit: metricUnit(key) }],
    );
    return [{
      id: `${statement}-${symbol}-${raw.period_end}-${index}`,
      symbol: normalizeSymbol(raw.tickers?.[0] ?? symbol),
      statement,
      timeframe: financialTimeframe(raw.timeframe),
      fiscalYear: raw.fiscal_year ?? null,
      fiscalQuarter: raw.fiscal_quarter ?? null,
      periodEnd: raw.period_end,
      filedAt: raw.filing_date ?? null,
      metrics,
    }];
  });
}

const RATIO_LABELS: Readonly<Record<string, string>> = {
  cash: "Cash ratio",
  current: "Current ratio",
  debt_to_equity: "Debt / equity",
  dividend_yield: "Dividend yield",
  ev_to_ebitda: "EV / EBITDA",
  ev_to_sales: "EV / revenue",
  free_cash_flow_margin: "FCF margin",
  gross_margin: "Gross margin",
  net_margin: "Net margin",
  operating_margin: "Operating margin",
  price_to_book: "Price / book",
  price_to_earnings: "P / E",
  price_to_free_cash_flow: "Price / FCF",
  price_to_sales: "Price / sales",
  return_on_assets: "Return on assets",
  return_on_equity: "Return on equity",
};

export function adaptFinancialRatios(
  response: MassiveRatiosResponse,
): readonly FinancialRatioPoint[] {
  const raw = response.results?.[0];
  if (!raw) return [];
  return Object.entries(RATIO_LABELS).map(([key, label]) => ({
    key,
    label,
    value: typeof raw[key] === "number" && Number.isFinite(raw[key]) ? raw[key] : null,
  }));
}
