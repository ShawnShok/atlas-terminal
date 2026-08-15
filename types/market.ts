/** Provider-neutral market data contracts used by both live and mock services. */

export type MarketDataSource = "massive" | "benzinga" | "tmx" | "mock";

export type DataQuality =
  | "live"
  | "delayed"
  | "end-of-day"
  | "historical"
  | "indicative"
  | "unknown";

export type MarketSession =
  | "pre-market"
  | "regular"
  | "after-hours"
  | "closed"
  | "unknown";

export interface DataFreshness {
  readonly asOf: string;
  readonly quality: DataQuality;
  readonly source: MarketDataSource;
}

export interface Quote extends DataFreshness {
  readonly symbol: string;
  readonly lastPrice: number | null;
  readonly bidPrice: number | null;
  readonly bidSize: number | null;
  readonly askPrice: number | null;
  readonly askSize: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  readonly volume: number | null;
  readonly averageVolume: number | null;
  readonly marketCap: number | null;
  readonly vwap: number | null;
  readonly session: MarketSession;
}

export interface TickerBranding {
  readonly iconUrl: string | null;
  readonly logoUrl: string | null;
}

export interface TickerDetails extends DataFreshness {
  readonly symbol: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
  readonly assetType: string | null;
  readonly market: string | null;
  readonly locale: string | null;
  readonly currency: string | null;
  readonly primaryExchange: string | null;
  readonly cik: string | null;
  readonly compositeFigi: string | null;
  readonly shareClassFigi: string | null;
  readonly sicCode: string | null;
  readonly sicDescription: string | null;
  readonly homepageUrl: string | null;
  readonly listDate: string | null;
  readonly marketCap: number | null;
  readonly weightedSharesOutstanding: number | null;
  readonly totalEmployees: number | null;
  readonly branding: TickerBranding;
}

export type NewsCategory =
  | "breaking"
  | "earnings"
  | "analyst"
  | "mergers-acquisitions"
  | "fda"
  | "guidance"
  | "macro"
  | "company"
  | "markets"
  | "other";

export interface NewsPublisher {
  readonly name: string;
  readonly homepageUrl: string | null;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
}

export interface NewsArticle extends DataFreshness {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly body: string | null;
  readonly articleUrl: string | null;
  readonly imageUrl: string | null;
  readonly publishedAt: string;
  readonly updatedAt: string | null;
  readonly tickers: readonly string[];
  readonly categories: readonly NewsCategory[];
  readonly keywords: readonly string[];
  readonly publisher: NewsPublisher;
}

export type CorporateEventType =
  | "earnings-release"
  | "earnings-call"
  | "investor-day"
  | "analyst-day"
  | "shareholder-meeting"
  | "conference"
  | "presentation"
  | "dividend"
  | "stock-split"
  | "company-update"
  | "industry-event"
  | "summit"
  | "other";

export type CorporateEventStatus =
  | "confirmed"
  | "pending"
  | "canceled"
  | "completed"
  | "unknown";

export interface CorporateEvent extends DataFreshness {
  readonly id: string;
  readonly symbol: string;
  readonly companyName: string;
  readonly title: string;
  readonly type: CorporateEventType;
  readonly status: CorporateEventStatus;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly allDay: boolean;
  readonly description: string | null;
  readonly eventUrl: string | null;
}

export type OptionType = "call" | "put";

export interface OptionGreeks {
  readonly delta: number | null;
  readonly gamma: number | null;
  readonly theta: number | null;
  readonly vega: number | null;
  readonly rho: number | null;
}

export interface OptionContract extends DataFreshness {
  readonly symbol: string;
  readonly underlyingSymbol: string;
  readonly type: OptionType;
  readonly expirationDate: string;
  readonly strikePrice: number;
  readonly exerciseStyle: "american" | "european" | "bermudan" | "unknown";
  readonly sharesPerContract: number;
  readonly lastPrice: number | null;
  readonly bidPrice: number | null;
  readonly askPrice: number | null;
  readonly volume: number | null;
  readonly openInterest: number | null;
  readonly impliedVolatility: number | null;
  readonly intrinsicValue: number | null;
  readonly extrinsicValue: number | null;
  readonly greeks: OptionGreeks;
}

export type FinancialStatementType =
  | "income-statement"
  | "balance-sheet"
  | "cash-flow-statement";

export type FinancialPeriod = "annual" | "quarterly" | "ttm";

export interface FinancialLineItem {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
  readonly unit: "USD" | "shares" | "ratio" | "percent" | string;
}

export interface FinancialStatement extends DataFreshness {
  readonly id: string;
  readonly symbol: string;
  readonly type: FinancialStatementType;
  readonly period: FinancialPeriod;
  readonly fiscalYear: number;
  readonly fiscalQuarter: 1 | 2 | 3 | 4 | null;
  readonly periodStart: string | null;
  readonly periodEnd: string;
  readonly filedAt: string | null;
  readonly currency: string;
  readonly lineItems: readonly FinancialLineItem[];
}

export type AggregateTimespan =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export interface AggregateBar extends DataFreshness {
  readonly symbol: string;
  readonly interval: `${number}${"m" | "h" | "D" | "W" | "M"}`;
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly vwap: number | null;
  readonly transactionCount: number | null;
}

export interface Trade extends DataFreshness {
  readonly id: string | null;
  readonly symbol: string;
  readonly price: number;
  readonly size: number;
  readonly timestamp: string;
  readonly exchange: number | null;
  readonly conditions: readonly number[];
  readonly tape: number | null;
}

export interface Snapshot extends DataFreshness {
  readonly symbol: string;
  readonly quote: Quote;
  readonly latestTrade: Trade | null;
  readonly minuteBar: AggregateBar | null;
  readonly dayBar: AggregateBar | null;
  readonly previousDayBar: AggregateBar | null;
}

export interface PaginatedResult<T> {
  readonly results: readonly T[];
  readonly nextCursor: string | null;
}
