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

export type NewsScope =
  | "all"
  | "watchlist"
  | "ticker"
  | "breaking"
  | "earnings"
  | "analyst"
  | "mergers-acquisitions"
  | "fda"
  | "guidance"
  | "macro";

export interface NewsFiltersValue {
  readonly scope: NewsScope;
  readonly ticker: string;
  readonly sector: string;
  readonly category: NewsCategory | "all";
  readonly date: string;
  readonly keyword: string;
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
  | "this-month";

export interface EventFiltersValue {
  readonly horizon: EventHorizon;
  readonly watchlistOnly: boolean;
  readonly ticker: string;
  readonly type: CorporateEventType | "all";
  readonly marketCap: "all" | "micro" | "small" | "mid" | "large" | "mega";
  readonly sector: string;
  readonly date: string;
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
  readonly strikeMin: number | null;
  readonly strikeMax: number | null;
  readonly minimumVolume: number | null;
  readonly minimumOpenInterest: number | null;
}

export interface OptionActivityMetric {
  readonly label: string;
  readonly value: number | null;
  readonly detail?: string;
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
  | "daily-change"
  | "weekly-change"
  | "monthly-change"
  | "sma-distance"
  | "ema-distance"
  | "vwap-distance"
  | "rsi"
  | "distance-52w-high"
  | "distance-52w-low"
  | "gap-percent"
  | "recent-news-minutes"
  | "event-within-days"
  | "earnings-within-days"
  | "option-volume-oi";

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
  readonly type: "news" | "event" | "earnings" | "filing" | "analyst" | "other";
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
  readonly confidence: number;
  readonly detectedAt: string;
  readonly priceLevels: readonly PatternPriceLevel[];
  readonly volumeConfirmation: "confirmed" | "not-confirmed" | "inconclusive";
  readonly reasoning: readonly string[];
}

export type AdvancedAnalyticsView =
  | "heatmap"
  | "breadth"
  | "comparison"
  | "catalysts"
  | "news-price"
  | "patterns";
