import type {
  AggregateBar,
  CorporateEvent,
  CorporateEventStatus,
  CorporateEventType,
  DataFreshnessState,
  DataQuality,
  FinancialLineItem,
  NewsArticle,
  OptionContract,
  Snapshot,
  TickerDetails,
} from "./market";

export interface TickerSearchResult {
  readonly symbol: string;
  readonly name: string;
  readonly exchange: string | null;
  readonly assetType: string | null;
  readonly currency: string | null;
  readonly active: boolean;
}

export interface MarketSnapshotRow {
  readonly symbol: string;
  readonly lastPrice: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly previousClose: number | null;
  readonly volume: number | null;
  readonly vwap: number | null;
  readonly asOf: string;
  readonly quality: DataQuality;
}

export interface SecurityClassification {
  readonly symbol: string;
  readonly name: string;
  readonly marketCap: number | null;
  readonly sector: string | null;
  readonly industry: string | null;
}

export interface MarketMovers {
  readonly gainers: readonly MarketSnapshotRow[];
  readonly losers: readonly MarketSnapshotRow[];
  readonly asOf: string;
  readonly quality: DataQuality;
}

export interface SecurityResearchBundle {
  readonly snapshot: Snapshot;
  readonly details: TickerDetails;
  readonly bars: readonly AggregateBar[];
}

export interface WatchlistResearchBundle {
  readonly name: string;
  readonly symbols: readonly string[];
  readonly snapshots: readonly MarketSnapshotRow[];
}

export interface NewsSummary {
  readonly id: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly articleUrl: string | null;
  readonly publisher: string;
}

export interface CorporateEventSummary {
  readonly id: string;
  readonly type: CorporateEventType;
  readonly status: CorporateEventStatus;
  readonly title: string;
  readonly startsAt: string;
  readonly daysUntil: number;
}

export interface OptionsActivitySummary {
  readonly observed: boolean;
  readonly label: string;
  readonly highestVolumeContract: string | null;
  readonly volumeToOpenInterest: number | null;
  readonly asOf: string | null;
}

/** Provider-neutral row contract for durable and session watchlists. */
export interface WatchlistQuote {
  readonly ticker: string;
  readonly companyName: string | null;
  readonly price: number | null;
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly dayHigh: number | null;
  readonly dayLow: number | null;
  readonly previousClose: number | null;
  readonly volume: number | null;
  readonly averageVolume: number | null;
  readonly dailyRvol: number | null;
  readonly intradayRvol: number | null;
  readonly vwap: number | null;
  readonly distanceFromVwapPercent: number | null;
  readonly marketCap: number | null;
  readonly latestNews: NewsSummary | null;
  readonly nextEvent: CorporateEventSummary | null;
  readonly optionsActivity: OptionsActivitySummary | null;
  readonly freshness: DataFreshnessState;
}

export type CatalystReasonCategory =
  | "price"
  | "volume"
  | "technical"
  | "news"
  | "event"
  | "options";

export interface CatalystReason {
  readonly category: CatalystReasonCategory;
  readonly title: string;
  readonly explanation: string;
  readonly observedValue?: number | string;
  readonly threshold?: number | string;
  readonly timestamp?: string;
}

export interface CatalystScannerResult {
  readonly ticker: string;
  /** Transparent research-priority score, never a return prediction. */
  readonly researchPriority: number | null;
  readonly reasons: readonly CatalystReason[];
  readonly freshness: DataFreshnessState;
}

export interface NewsResearchBundle {
  readonly articles: readonly NewsArticle[];
  readonly filterTicker: string | null;
}

export interface EventsResearchBundle {
  readonly events: readonly CorporateEvent[];
  readonly filterTicker: string | null;
  readonly from: string;
  readonly to: string;
}

export interface OptionChainBundle {
  readonly underlyingSymbol: string;
  readonly underlyingPrice: number | null;
  readonly expirations: readonly string[];
  readonly selectedExpiration: string | null;
  readonly contracts: readonly OptionContract[];
  readonly asOf: string;
  readonly quality: DataQuality;
}

export type FinancialTimeframe = "annual" | "quarterly" | "ttm";

export interface NormalizedFinancialPeriod {
  readonly id: string;
  readonly symbol: string;
  readonly statement: "income" | "balance-sheet" | "cash-flow";
  readonly timeframe: FinancialTimeframe;
  readonly fiscalYear: number | null;
  readonly fiscalQuarter: number | null;
  readonly periodEnd: string;
  readonly filedAt: string | null;
  readonly metrics: readonly FinancialLineItem[];
}

export interface FinancialRatioPoint {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
}

export interface FinancialResearchBundle {
  readonly symbol: string;
  readonly incomeStatements: readonly NormalizedFinancialPeriod[];
  readonly balanceSheets: readonly NormalizedFinancialPeriod[];
  readonly cashFlowStatements: readonly NormalizedFinancialPeriod[];
  readonly ratios: readonly FinancialRatioPoint[];
  readonly asOf: string;
  readonly unavailableSections: readonly string[];
}

export interface ComparisonSecurity {
  readonly symbol: string;
  readonly details: TickerDetails;
  readonly snapshot: Snapshot;
  readonly bars: readonly AggregateBar[];
  readonly ratios: readonly FinancialRatioPoint[];
}

export interface ComparisonResearchBundle {
  readonly securities: readonly ComparisonSecurity[];
  readonly from: string;
  readonly to: string;
}

export interface CatalystTimelineEntry {
  readonly id: string;
  readonly at: string;
  readonly symbol: string;
  readonly kind: "news" | "event" | "price-move";
  readonly title: string;
  readonly detail: string | null;
  readonly url: string | null;
}

export interface CatalystTimelineBundle {
  readonly symbol: string;
  readonly entries: readonly CatalystTimelineEntry[];
  readonly availability: {
    readonly news: boolean;
    readonly events: boolean;
    readonly priceMoves: boolean;
    readonly notes: readonly string[];
  };
}

export interface TerminalApiMeta {
  readonly mode: "live" | "mock";
  readonly source: string;
  readonly quality: DataQuality;
  readonly asOf: string;
  readonly freshness: DataFreshnessState;
}

export interface TerminalApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly meta: TerminalApiMeta;
}

export interface TerminalApiFailure {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly requestId: string;
  };
}

export type TerminalApiResponse<T> = TerminalApiSuccess<T> | TerminalApiFailure;
