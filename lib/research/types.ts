import type {
  AggregateBar,
  CorporateEvent,
  CorporateEventType,
  NewsArticle,
  NewsCategory,
  OptionContract,
  OptionGreeks,
  Quote,
} from "@/types";

/** Explicit provenance shown by every research surface. */
export type ResearchDataMode =
  | "live"
  | "delayed"
  | "historical"
  | "mock"
  | "unavailable";

export interface ResearchDataStatus {
  readonly mode: ResearchDataMode;
  readonly label: string;
  readonly asOf: string | null;
  readonly message?: string;
}

export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

export type NewsScope = "all" | "watchlist" | "ticker";

export type NewsRecentWindow = "all" | "5" | "15" | "30" | "60" | "today";

export type NewsSortKey =
  | "publishedAt"
  | "age"
  | "ticker"
  | "headline"
  | "category"
  | "source";

export type NewsSortDirection = "asc" | "desc";

export interface NewsFiltersValue {
  readonly scope: NewsScope;
  /** Comma- or whitespace-separated provider-neutral ticker symbols. */
  readonly tickers: string;
  readonly sector: string;
  readonly category: NewsCategory | "all";
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly timeFrom: string;
  readonly timeTo: string;
  readonly source: string;
  readonly recent: NewsRecentWindow;
  readonly unreadOnly: boolean;
  readonly keyword: string;
}

export interface NewsWatchlistOption {
  readonly id: string;
  readonly label: string;
}

export interface NewsAlertDraft {
  readonly ticker: string;
  readonly watchlistId: string;
  readonly keyword: string;
  readonly category: NewsCategory | "all";
  readonly browserNotification: boolean;
  readonly sound: boolean;
  readonly cooldownMinutes: number;
  readonly enabled: boolean;
}

export interface NewsFeedPropsModel {
  readonly articles: readonly NewsArticle[];
  readonly selectedArticleId: string | null;
  readonly recentThresholdMinutes?: number;
}

export type EventHorizon =
  | "today"
  | "tomorrow"
  | "this-week"
  | "next-week"
  | "this-month"
  | "custom";

export interface EventFiltersValue {
  readonly horizon: EventHorizon;
  readonly watchlistOnly: boolean;
  readonly ticker: string;
  readonly type: CorporateEventType | "all";
  readonly status: CorporateEvent["status"] | "all";
  readonly confirmedOnly: boolean;
  readonly earningsOnly: boolean;
  readonly marketCap: "all" | "micro" | "small" | "mid" | "large" | "mega";
  readonly sector: string;
  readonly customFrom: string;
  readonly customTo: string;
}

export interface EventCalendarDay {
  readonly date: string;
  readonly label: string;
  readonly isToday?: boolean;
  readonly events: readonly CorporateEvent[];
}

export interface EventCountdown {
  readonly eventId: string;
  readonly symbol: string;
  readonly label: string;
  readonly startsAt: string;
  readonly allDay: boolean;
  readonly urgency: "normal" | "soon" | "imminent";
}

export interface EarningsEvent {
  readonly event: CorporateEvent;
  readonly fiscalPeriod: string | null;
  readonly timing: "before-market" | "during-market" | "after-market" | "unknown";
  readonly epsEstimate: number | null;
  readonly revenueEstimate: number | null;
  readonly previousEps: number | null;
}

export interface OptionsUnderlying {
  readonly symbol: string;
  readonly name: string;
  readonly quote: Quote;
  readonly ivRank: number | null;
  readonly ivPercentile: number | null;
}

export type OptionMoneyness = "itm" | "atm" | "otm";

export interface OptionChainRow {
  readonly strikePrice: number;
  readonly call: OptionContract | null;
  readonly put: OptionContract | null;
  readonly callMoneyness: OptionMoneyness;
  readonly putMoneyness: OptionMoneyness;
}

export interface OptionChainFilters {
  readonly expirationDate: string;
  readonly contractType: "all" | OptionContract["type"];
  readonly strikeMin: number | null;
  readonly strikeMax: number | null;
  readonly minimumVolume: number | null;
  readonly minimumOpenInterest: number | null;
  readonly minimumVolumeToOpenInterest: number | null;
  /** User-facing percentage points, e.g. 35 means 35%. */
  readonly impliedVolatilityMin: number | null;
  readonly impliedVolatilityMax: number | null;
  readonly deltaMin: number | null;
  readonly deltaMax: number | null;
  readonly moneyness: "all" | OptionMoneyness;
}

export interface OptionActivityMetric {
  readonly label: string;
  readonly value: number | null;
  readonly detail?: string;
  readonly tooltip?: string;
  readonly format?: "number" | "ratio" | "percent";
  readonly tone?: "neutral" | "positive" | "negative" | "warning";
}

export interface OptionActivityCandidate {
  readonly contract: OptionContract;
  readonly volumeToOpenInterest: number | null;
  readonly volumeVsBaseline: number | null;
  readonly reason: string;
}

export type StrategyTemplate =
  | "custom"
  | "long-call"
  | "long-put"
  | "covered-call"
  | "cash-secured-put"
  | "vertical-spread"
  | "iron-condor"
  | "straddle"
  | "strangle";

export interface StrategyLeg {
  readonly id: string;
  readonly side: "buy" | "sell";
  readonly quantity: number;
  readonly contract: OptionContract;
  readonly premium: number;
}

export interface StrategyPayoffPoint {
  readonly underlyingPrice: number;
  readonly profitLoss: number;
}

export interface StrategyAnalysis {
  readonly template: StrategyTemplate;
  readonly legs: readonly StrategyLeg[];
  readonly netDebitCredit: number;
  readonly maximumGain: number | null;
  readonly maximumLoss: number | null;
  readonly breakEvenLevels: readonly number[];
  readonly combinedGreeks: OptionGreeks;
  readonly payoff: readonly StrategyPayoffPoint[];
}

export interface StrategyLegDraft {
  readonly side: StrategyLeg["side"];
  readonly quantity: number;
  readonly contractSymbol: string;
  readonly premium: number | null;
}

export type ScannerField =
  | "price"
  | "market-cap"
  | "volume"
  | "average-volume"
  | "relative-volume"
  | "daily-relative-volume"
  | "intraday-relative-volume"
  | "daily-change"
  | "weekly-change"
  | "monthly-change"
  | "sma-distance"
  | "ema-distance"
  | "vwap-distance"
  | "rsi"
  | "distance-day-high"
  | "distance-day-low"
  | "distance-52w-high"
  | "distance-52w-low"
  | "distance-recent-high"
  | "volume-acceleration"
  | "new-intraday-high"
  | "new-intraday-low"
  | "gap-percent"
  | "price-vs-vwap"
  | "price-vs-sma20"
  | "price-vs-sma50"
  | "price-vs-sma200"
  | "price-vs-ema20"
  | "price-vs-ema50"
  | "price-vs-recent-high"
  | "price-vs-recent-low"
  | "recent-news-minutes"
  | "news-headline"
  | "news-category"
  | "news-keyword"
  | "event-within-days"
  | "earnings-within-days"
  | "confirmed-event-within-days"
  | "investor-event-within-days"
  | "option-volume"
  | "option-open-interest"
  | "option-volume-oi"
  | "option-call-volume"
  | "option-put-volume"
  | "option-call-open-interest"
  | "option-put-open-interest"
  | "option-call-put-volume"
  | "option-call-put-open-interest"
  | "option-average-iv"
  | "option-min-dte"
  | "option-max-dte"
  | "option-highest-contract-volume"
  | "option-highest-contract-open-interest"
  | "option-volume-relative-underlying";

export type ScannerOperator =
  | "greater-than"
  | "greater-than-or-equal"
  | "less-than"
  | "less-than-or-equal"
  | "equal"
  | "between"
  | "in";

export interface ScannerCondition {
  readonly id: string;
  readonly field: ScannerField;
  readonly operator: ScannerOperator;
  readonly value: number | string;
  readonly secondaryValue?: number | string;
  readonly unit?: string;
}

export interface ScannerPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly conditions: readonly ScannerCondition[];
  readonly isSaved?: boolean;
}

export interface ScannerResult {
  readonly symbol: string;
  readonly companyName: string;
  readonly sector: string | null;
  readonly price: number | null;
  readonly changePercent: number | null;
  readonly volume: number | null;
  readonly relativeVolume: number | null;
  readonly marketCap: number | null;
  readonly latestNewsAt: string | null;
  readonly nextEventAt: string | null;
  readonly nextEventLabel: string | null;
  readonly optionActivityScore: number | null;
  readonly vwapDistancePercent?: number | null;
  readonly latestNewsTitle?: string | null;
  readonly newsAgeMinutes?: number | null;
  readonly nextEventStatus?: string | null;
  readonly researchPriority?: number | null;
  readonly researchPriorityCoverage?: number | null;
  readonly scoreBreakdown?: readonly {
    readonly label: string;
    readonly available: boolean;
    readonly points: number;
    readonly weight: number;
    readonly explanation: string;
  }[];
  readonly lastUpdatedAt?: string | null;
  readonly matchedConditions: readonly string[];
}

export interface HeatmapCell {
  readonly id: string;
  readonly symbol: string;
  readonly label: string;
  readonly group: string;
  readonly value: number | null;
  readonly weight: number;
  readonly detail?: string;
}

export interface BreadthSnapshot {
  readonly asOf: string;
  readonly advancing: number;
  readonly declining: number;
  readonly unchanged: number;
  readonly above50Day: number | null;
  readonly above200Day: number | null;
  readonly newHighs: number | null;
  readonly newLows: number | null;
}

export interface BreadthPoint {
  readonly timestamp: string;
  readonly advanceDecline: number;
  readonly upVolumePercent: number | null;
}

export interface ComparisonCompany {
  readonly symbol: string;
  readonly name: string;
}

export interface ComparisonMetric {
  readonly id: string;
  readonly label: string;
  readonly format: "currency" | "number" | "percent" | "ratio" | "text";
  readonly values: Readonly<Record<string, number | string | null>>;
  readonly preferred?: "higher" | "lower" | "neutral";
}

export interface CatalystTimelineItem {
  readonly id: string;
  readonly symbol: string;
  readonly occurredAt: string;
  readonly type:
    | "news"
    | "event"
    | "price-move"
    | "volume-spike"
    | "options-activity"
    | "note"
    | "earnings"
    | "filing"
    | "analyst"
    | "other";
  readonly title: string;
  readonly description: string | null;
  readonly sourceLabel: string;
  readonly href: string | null;
  readonly importance: "low" | "medium" | "high";
}

export interface NewsPricePoint {
  readonly timestamp: string;
  readonly price: number;
  readonly volume: number | null;
}

export interface NewsPriceMarker {
  readonly id: string;
  readonly timestamp: string;
  readonly title: string;
  readonly category: NewsCategory;
  readonly priceAtPublication: number | null;
  readonly changeAfterPercent: number | null;
}

export interface NewsPriceSeries {
  readonly symbol: string;
  readonly interval: AggregateBar["interval"];
  readonly points: readonly NewsPricePoint[];
  readonly markers: readonly NewsPriceMarker[];
}

export type PatternName =
  | "double-bottom"
  | "double-top"
  | "ascending-triangle"
  | "descending-triangle"
  | "symmetrical-triangle"
  | "bullish-pennant"
  | "bearish-pennant"
  | "consolidation-breakout"
  | "support-resistance-test";

export interface PatternPriceLevel {
  readonly label: string;
  readonly price: number;
}

export interface PatternCandidate {
  readonly id: string;
  readonly symbol: string;
  readonly pattern: PatternName;
  readonly phase: "developing" | "confirmed";
  readonly confidence: number;
  readonly detectedAt: string;
  readonly priceLevels: readonly PatternPriceLevel[];
  readonly volumeConfirmation: "confirmed" | "not-confirmed" | "inconclusive";
  readonly analysis: string;
  readonly reasoning: readonly string[];
}

export type AdvancedAnalyticsView =
  | "heatmap"
  | "breadth"
  | "comparison"
  | "catalysts"
  | "news-price"
  | "patterns";
