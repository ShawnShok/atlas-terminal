import "server-only";

import type { ResearchService } from "@/lib/services";
import type {
  AggregateBar,
  CorporateEvent,
  CorporateEventType,
  EventsResearchBundle,
  FinancialResearchBundle,
  MarketMovers,
  MarketSnapshotRow,
  NewsArticle,
  NewsCategory,
  NewsResearchBundle,
  OptionChainBundle,
  OptionContract,
  SecurityResearchBundle,
  Snapshot,
  TickerDetails,
  TickerSearchResult,
} from "@/types";

const MOCK_AS_OF = "2026-08-15T14:45:00.000Z";
const COMPANY_NAMES: Readonly<Record<string, string>> = {
  AAPL: "Apple Inc.",
  AMD: "Advanced Micro Devices, Inc.",
  AMZN: "Amazon.com, Inc.",
  AVGO: "Broadcom Inc.",
  GOOGL: "Alphabet Inc.",
  META: "Meta Platforms, Inc.",
  MSFT: "Microsoft Corporation",
  MU: "Micron Technology, Inc.",
  NVDA: "NVIDIA Corporation",
  PLTR: "Palantir Technologies Inc.",
  QQQ: "Invesco QQQ Trust",
  SPY: "SPDR S&P 500 ETF Trust",
  TSLA: "Tesla, Inc.",
};
const SYMBOLS = Object.keys(COMPANY_NAMES);
const CORPORATE_EVENT_TYPES: ReadonlySet<CorporateEventType> = new Set([
  "earnings-release",
  "earnings-call",
  "investor-day",
  "analyst-day",
  "shareholder-meeting",
  "conference",
  "presentation",
  "dividend",
  "stock-split",
  "company-update",
  "industry-event",
  "summit",
  "other",
]);
const PROVIDER_EVENT_TYPES: Readonly<Record<string, CorporateEventType>> = {
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

function seed(symbol: string): number {
  return [...symbol].reduce((total, character) => total * 31 + character.charCodeAt(0), 17);
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function symbolPrice(symbol: string): number {
  return round(42 + (seed(symbol) % 290) + (seed(symbol) % 100) / 100);
}

function normalizedEventType(value: string | undefined): CorporateEventType | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (CORPORATE_EVENT_TYPES.has(normalized as CorporateEventType)) return normalized as CorporateEventType;
  return PROVIDER_EVENT_TYPES[normalized] ?? null;
}

function makeSnapshotRow(symbol: string, position: number): MarketSnapshotRow {
  const lastPrice = symbolPrice(symbol);
  const changePercent = round(((seed(symbol) % 1_200) - 520) / 100 + position * 0.03);
  const previousClose = round(lastPrice / (1 + changePercent / 100));
  return {
    symbol,
    lastPrice,
    change: round(lastPrice - previousClose),
    changePercent,
    open: round(previousClose * (1 + ((seed(symbol) % 30) - 15) / 1_000)),
    high: round(lastPrice * 1.018),
    low: round(lastPrice * 0.982),
    previousClose,
    volume: 8_000_000 + (seed(symbol) % 220_000_000),
    vwap: round((lastPrice + previousClose) / 2),
    asOf: MOCK_AS_OF,
    quality: "indicative",
  };
}

function makeBars(symbol: string, count = 260): readonly AggregateBar[] {
  const initial = symbolPrice(symbol) * 0.72;
  const result: AggregateBar[] = [];
  let previous = initial;
  const end = new Date(MOCK_AS_OF);
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - index);
    const wave = Math.sin((count - index + (seed(symbol) % 19)) / 9) * 0.014;
    const drift = 0.0015 + ((seed(symbol) % 7) - 3) / 10_000;
    const close = round(previous * (1 + drift + wave));
    const open = round(previous * (1 + wave / 3));
    const high = round(Math.max(open, close) * 1.012);
    const low = round(Math.min(open, close) * 0.988);
    result.push({
      symbol,
      interval: "1D",
      timestamp: date.toISOString(),
      open,
      high,
      low,
      close,
      volume: 12_000_000 + ((seed(symbol) * (index + 11)) % 180_000_000),
      vwap: round((open + high + low + close) / 4),
      transactionCount: null,
      asOf: date.toISOString(),
      quality: "indicative",
      source: "mock",
    });
    previous = close;
  }
  return result;
}

function makeDetails(symbol: string): TickerDetails {
  return {
    symbol,
    name: COMPANY_NAMES[symbol] ?? `${symbol} Mock Corporation`,
    description: "Synthetic company profile used only while ATLAS mock mode is active.",
    active: true,
    assetType: symbol === "SPY" || symbol === "QQQ" ? "ETF" : "CS",
    market: "stocks",
    locale: "us",
    currency: "USD",
    primaryExchange: "XNAS",
    cik: null,
    compositeFigi: null,
    shareClassFigi: null,
    sicCode: null,
    sicDescription: "Mock technology research universe",
    homepageUrl: null,
    listDate: null,
    marketCap: symbolPrice(symbol) * (1_000_000_000 + (seed(symbol) % 20_000_000_000)),
    weightedSharesOutstanding: null,
    totalEmployees: null,
    branding: { iconUrl: null, logoUrl: null },
    asOf: MOCK_AS_OF,
    quality: "indicative",
    source: "mock",
  };
}

function makeSnapshot(symbol: string): Snapshot {
  const row = makeSnapshotRow(symbol, 0);
  const bars = makeBars(symbol, 2);
  const latest = bars.at(-1) ?? null;
  const previous = bars.at(-2) ?? null;
  return {
    symbol,
    quote: {
      symbol,
      lastPrice: row.lastPrice,
      bidPrice: row.lastPrice === null ? null : round(row.lastPrice - 0.02),
      bidSize: 4,
      askPrice: row.lastPrice === null ? null : round(row.lastPrice + 0.02),
      askSize: 6,
      change: row.change,
      changePercent: row.changePercent,
      open: row.open,
      high: row.high,
      low: row.low,
      previousClose: row.previousClose,
      volume: row.volume,
      averageVolume: row.volume === null ? null : Math.round(row.volume * 0.91),
      marketCap: makeDetails(symbol).marketCap,
      vwap: row.vwap,
      session: "regular",
      asOf: MOCK_AS_OF,
      quality: "indicative",
      source: "mock",
    },
    latestTrade: row.lastPrice === null ? null : {
      id: `mock-${symbol}`,
      symbol,
      price: row.lastPrice,
      size: 100,
      timestamp: MOCK_AS_OF,
      exchange: null,
      conditions: [],
      tape: null,
      asOf: MOCK_AS_OF,
      quality: "indicative",
      source: "mock",
    },
    minuteBar: null,
    dayBar: latest,
    previousDayBar: previous,
    asOf: MOCK_AS_OF,
    quality: "indicative",
    source: "mock",
  };
}

function mockNews(ticker?: string): readonly NewsArticle[] {
  const subjects = ticker ? [ticker] : SYMBOLS.slice(0, 10);
  return subjects.map((symbol, index) => ({
    id: `mock-news-${symbol}-${index}`,
    title: `MOCK · ${symbol} research headline ${index + 1}`,
    summary: "Synthetic Benzinga-shaped content for interface and filter development.",
    body: "This story is generated fixture text and is never presented as live market news.",
    articleUrl: null,
    imageUrl: null,
    publishedAt: new Date(Date.parse(MOCK_AS_OF) - index * 9 * 60_000).toISOString(),
    updatedAt: null,
    tickers: [symbol],
    categories: [index % 3 === 0 ? "earnings" : index % 3 === 1 ? "analyst" : "markets"],
    keywords: ["mock", "research"],
    publisher: { name: "ATLAS mock feed", homepageUrl: null, logoUrl: null, faviconUrl: null },
    asOf: MOCK_AS_OF,
    quality: "indicative",
    source: "mock",
  }));
}

function mockEvents(ticker?: string): readonly CorporateEvent[] {
  const subjects = ticker ? [ticker] : SYMBOLS.slice(0, 10);
  return subjects.map((symbol, index) => ({
    id: `mock-event-${symbol}-${index}`,
    symbol,
    companyName: COMPANY_NAMES[symbol] ?? symbol,
    title: `MOCK · ${index % 2 ? "Investor conference" : "Earnings announcement"}`,
    type: index % 2 ? "conference" : "earnings-release",
    status: index % 4 === 0 ? "pending" : "confirmed",
    startsAt: new Date(Date.parse(MOCK_AS_OF) + (index + 1) * 86_400_000).toISOString(),
    endsAt: null,
    allDay: true,
    description: "Synthetic TMX-shaped event for interface development.",
    eventUrl: null,
    asOf: MOCK_AS_OF,
    quality: "indicative",
    source: "mock",
  }));
}

function mockOptionChain(symbol: string, expiration?: string): OptionChainBundle {
  const underlyingPrice = symbolPrice(symbol);
  const expirations = ["2026-08-21", "2026-09-18", "2026-10-16", "2027-01-15"];
  const selectedExpiration = expiration && expirations.includes(expiration) ? expiration : expirations[0];
  const baseStrike = Math.round(underlyingPrice / 5) * 5;
  const contracts: OptionContract[] = [];
  for (let offset = -8; offset <= 8; offset += 1) {
    const strike = baseStrike + offset * 5;
    for (const type of ["call", "put"] as const) {
      const intrinsic = type === "call" ? Math.max(0, underlyingPrice - strike) : Math.max(0, strike - underlyingPrice);
      const extrinsic = round(2.4 + Math.max(0, 7 - Math.abs(offset)) * 0.58);
      const last = round(intrinsic + extrinsic);
      const deltaMagnitude = Math.max(0.08, Math.min(0.92, 0.5 - offset * 0.055));
      contracts.push({
        symbol: `O:${symbol}${selectedExpiration.replaceAll("-", "").slice(2)}${type === "call" ? "C" : "P"}${String(Math.round(strike * 1_000)).padStart(8, "0")}`,
        underlyingSymbol: symbol,
        type,
        expirationDate: selectedExpiration,
        strikePrice: strike,
        exerciseStyle: "american",
        sharesPerContract: 100,
        sharesPerContractReported: true,
        lastPrice: last,
        lastPriceSource: "day-close",
        bidPrice: round(last - 0.08),
        askPrice: round(last + 0.08),
        quoteAvailability: "available",
        volume: 100 + ((seed(symbol) + offset * 117 + (type === "call" ? 31 : 61)) % 7_500),
        openInterest: 400 + ((seed(symbol) + offset * 293 + (type === "call" ? 79 : 101)) % 24_000),
        impliedVolatility: round(0.28 + Math.abs(offset) * 0.012, 4),
        intrinsicValue: intrinsic,
        extrinsicValue: extrinsic,
        greeks: {
          delta: round(type === "call" ? deltaMagnitude : deltaMagnitude - 1, 4),
          gamma: round(0.012 + Math.max(0, 8 - Math.abs(offset)) * 0.002, 4),
          theta: round(-0.035 - Math.max(0, 8 - Math.abs(offset)) * 0.006, 4),
          vega: round(0.08 + Math.max(0, 8 - Math.abs(offset)) * 0.014, 4),
          rho: null,
        },
        asOf: MOCK_AS_OF,
        quality: "indicative",
        source: "mock",
      });
    }
  }
  return {
    underlyingSymbol: symbol,
    underlyingPrice,
    expirations,
    selectedExpiration,
    contracts,
    contractsComplete: true,
    asOf: MOCK_AS_OF,
    quality: "indicative",
    quoteAvailability: "available",
    quoteNote: "Synthetic mock bid/ask snapshots are indicative and not executable.",
  };
}

export class MockResearchService implements ResearchService {
  async searchTickers(queryInput: string, limit = 20): Promise<readonly TickerSearchResult[]> {
    const query = queryInput.trim().toUpperCase();
    return SYMBOLS.filter((symbol) =>
      symbol.includes(query) || COMPANY_NAMES[symbol].toUpperCase().includes(query),
    ).slice(0, limit).map((symbol) => ({
      symbol,
      name: COMPANY_NAMES[symbol],
      exchange: "XNAS",
      assetType: symbol === "SPY" || symbol === "QQQ" ? "ETF" : "CS",
      currency: "USD",
      active: true,
    }));
  }

  async getSecurity(symbolInput: string, days = 260): Promise<SecurityResearchBundle> {
    const symbol = symbolInput.trim().toUpperCase();
    return { snapshot: makeSnapshot(symbol), details: makeDetails(symbol), bars: makeBars(symbol, days) };
  }

  async getSnapshots(symbols: readonly string[] = SYMBOLS): Promise<readonly MarketSnapshotRow[]> {
    return symbols.map((symbol, index) => makeSnapshotRow(symbol.toUpperCase(), index));
  }

  async getMovers(): Promise<MarketMovers> {
    const rows = await this.getSnapshots();
    return {
      gainers: [...rows].sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity)).slice(0, 8),
      losers: [...rows].sort((a, b) => (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity)).slice(0, 8),
      asOf: MOCK_AS_OF,
      quality: "indicative",
    };
  }

  async getBenzingaNews(input: {
    ticker?: string;
    publishedAfter?: string;
    publishedBefore?: string;
    category?: string;
    keyword?: string;
    limit?: number;
  } = {}): Promise<NewsResearchBundle> {
    const ticker = input.ticker?.trim().toUpperCase() || undefined;
    const keyword = input.keyword?.trim().toLowerCase();
    const category = input.category?.trim().toLowerCase() as NewsCategory | undefined;
    const publishedAfter = input.publishedAfter ? Date.parse(input.publishedAfter) : null;
    const publishedBefore = input.publishedBefore ? Date.parse(input.publishedBefore) : null;
    const requestedLimit = Number.isFinite(input.limit) ? Math.trunc(input.limit ?? 120) : 120;
    const limit = Math.min(500, Math.max(1, requestedLimit));
    const articles = mockNews(ticker).filter((article) => {
      if (publishedAfter !== null && !Number.isNaN(publishedAfter) && Date.parse(article.publishedAt) < publishedAfter) return false;
      if (publishedBefore !== null && !Number.isNaN(publishedBefore) && Date.parse(article.publishedAt) > publishedBefore) return false;
      if (category && !article.categories.includes(category)) return false;
      if (!keyword) return true;
      return [article.title, article.summary ?? "", article.body ?? "", ...article.keywords]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    }).slice(0, limit);
    return { articles, filterTicker: ticker ?? null };
  }

  async getCorporateEvents(input: {
    ticker?: string;
    from: string;
    to: string;
    type?: string;
    limit?: number;
  }): Promise<EventsResearchBundle> {
    const ticker = input.ticker?.trim().toUpperCase() || undefined;
    const from = input.from.trim();
    const to = input.to.trim();
    const requestedType = input.type?.trim();
    const type = normalizedEventType(requestedType);
    const requestedLimit = Number.isFinite(input.limit) ? Math.trunc(input.limit ?? 500) : 500;
    const limit = Math.min(1_000, Math.max(1, requestedLimit));
    const events = mockEvents(ticker).filter((event) => {
      const date = event.startsAt.slice(0, 10);
      if (date < from || date > to) return false;
      if (requestedType && (!type || event.type !== type)) return false;
      return true;
    }).slice(0, limit);
    return { events, filterTicker: ticker ?? null, from, to };
  }

  async getOptionChain(input: { symbol: string; expiration?: string }): Promise<OptionChainBundle> {
    return mockOptionChain(input.symbol.trim().toUpperCase(), input.expiration);
  }

  async getFinancials(symbolInput: string): Promise<FinancialResearchBundle> {
    const symbol = symbolInput.trim().toUpperCase();
    const revenue = 18_000_000_000 + (seed(symbol) % 55_000_000_000);
    const periods = [0, 1, 2, 3].map((offset) => ({
      id: `mock-income-${symbol}-${offset}`,
      symbol,
      statement: "income" as const,
      timeframe: "quarterly" as const,
      fiscalYear: 2026,
      fiscalQuarter: 4 - offset,
      periodEnd: `2026-${String(Math.max(1, 12 - offset * 3)).padStart(2, "0")}-30`,
      filedAt: null,
      metrics: [
        { key: "revenue", label: "Revenue", value: Math.round(revenue * (1 - offset * 0.045)), unit: "USD" },
        { key: "gross_profit", label: "Gross Profit", value: Math.round(revenue * 0.61 * (1 - offset * 0.04)), unit: "USD" },
        { key: "net_income", label: "Net Income", value: Math.round(revenue * 0.29 * (1 - offset * 0.035)), unit: "USD" },
      ],
    }));
    return {
      symbol,
      incomeStatements: periods,
      balanceSheets: [],
      cashFlowStatements: [],
      ratios: [
        { key: "price_to_earnings", label: "P / E", value: round(21 + (seed(symbol) % 250) / 10) },
        { key: "price_to_sales", label: "Price / sales", value: round(4 + (seed(symbol) % 90) / 10) },
        { key: "return_on_equity", label: "Return on equity", value: round(0.18 + (seed(symbol) % 32) / 100) },
        { key: "debt_to_equity", label: "Debt / equity", value: round(0.25 + (seed(symbol) % 120) / 100) },
      ],
      asOf: MOCK_AS_OF,
      unavailableSections: [],
    };
  }
}

let service: MockResearchService | undefined;
export function getMockResearchService(): MockResearchService {
  service ??= new MockResearchService();
  return service;
}
