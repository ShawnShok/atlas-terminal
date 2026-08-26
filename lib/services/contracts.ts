import type {
  AggregateBar,
  AggregateTimespan,
  CatalystScannerResult,
  CorporateEvent,
  EventsResearchBundle,
  FinancialResearchBundle,
  MarketMovers,
  MarketSnapshotRow,
  NewsArticle,
  NewsResearchBundle,
  OptionChainBundle,
  OptionContract,
  Snapshot,
  TickerDetails,
  TickerSearchResult,
} from "@/types";

/** Provider-neutral inputs and service boundaries for market-data capabilities. */

export interface AggregateBarsInput {
  readonly symbol: string;
  readonly multiplier: number;
  readonly timespan: AggregateTimespan;
  readonly from: string;
  readonly to: string;
  readonly adjusted?: boolean;
  readonly sort?: "asc" | "desc";
  readonly limit?: number;
}

export interface NewsQuery {
  readonly symbol?: string;
  readonly publishedAfter?: string;
  readonly publishedBefore?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
}

export interface StockMarketDataService {
  getSnapshot(symbol: string): Promise<Snapshot>;
  getTickerDetails(symbol: string): Promise<TickerDetails>;
  getAggregateBars(input: AggregateBarsInput): Promise<readonly AggregateBar[]>;
  getNews(input?: NewsQuery): Promise<readonly NewsArticle[]>;
}

/** Preferred Stage 1 boundary name. */
export type StockMarketService = StockMarketDataService;

/** Backwards-compatible name retained for callers of the original abstraction. */
export type MarketDataService = StockMarketDataService;

export interface TickerResearchService {
  searchTickers(query: string, limit?: number): Promise<readonly TickerSearchResult[]>;
  getSnapshots(symbols?: readonly string[]): Promise<readonly MarketSnapshotRow[]>;
  getMovers(): Promise<MarketMovers>;
  getFinancials(symbol: string): Promise<FinancialResearchBundle>;
}

export interface BenzingaNewsQuery {
  readonly ticker?: string;
  readonly publishedAfter?: string;
  readonly publishedBefore?: string;
  readonly category?: string;
  readonly keyword?: string;
  readonly limit?: number;
}

export interface BenzingaNewsService {
  getBenzingaNews(input?: BenzingaNewsQuery): Promise<NewsResearchBundle>;
}

export interface CorporateEventsQuery {
  readonly ticker?: string;
  readonly from: string;
  readonly to: string;
  readonly type?: string;
  readonly limit?: number;
}

export interface CorporateEventsService {
  getCorporateEvents(input: CorporateEventsQuery): Promise<EventsResearchBundle>;
}

/** Preferred singular boundary name; plural alias remains for compatibility. */
export type CorporateEventService = CorporateEventsService;

export interface OptionChainQuery {
  readonly symbol: string;
  readonly expiration?: string;
  readonly strikeMin?: number;
  readonly strikeMax?: number;
}

export interface OptionsResearchService {
  getOptionChain(input: OptionChainQuery): Promise<OptionChainBundle>;
}

/** Common live/mock research surface currently consumed by the research API. */
export interface ResearchService
  extends TickerResearchService,
    BenzingaNewsService,
    CorporateEventsService,
    OptionsResearchService {}

export interface CatalystScannerQuery {
  readonly symbols: readonly string[];
  readonly asOf?: string;
  readonly limit?: number;
}

export interface CatalystScannerService {
  scanCatalysts(
    input: CatalystScannerQuery,
  ): Promise<readonly CatalystScannerResult[]>;
}

export type AlertType =
  | "PRICE"
  | "PERCENT_CHANGE"
  | "RELATIVE_VOLUME"
  | "NEWS"
  | "EVENT"
  | "OPTIONS"
  | "TECHNICAL";

export interface AlertDefinition {
  readonly id: string;
  readonly type: AlertType;
  readonly symbol: string | null;
  readonly enabled: boolean;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly lastTriggeredAt: string | null;
}

/**
 * Normalized observations supplied to an alert evaluator. Omitted capabilities
 * are unavailable; an empty collection means the capability was queried and
 * returned no matching observations.
 */
export interface AlertEvaluationData {
  readonly snapshot?: Snapshot | null;
  readonly bars?: readonly AggregateBar[];
  readonly news?: readonly NewsArticle[];
  readonly events?: readonly CorporateEvent[];
  readonly optionContracts?: readonly OptionContract[];
  readonly catalysts?: readonly CatalystScannerResult[];
}

export interface AlertEvaluationInput {
  readonly alert: AlertDefinition;
  readonly data: AlertEvaluationData;
  readonly evaluatedAt: string;
}

export type AlertEvaluationOutcome =
  | "triggered"
  | "not-triggered"
  | "insufficient-data"
  | "disabled";

export interface AlertEvaluationResult {
  readonly alertId: string;
  readonly symbol: string | null;
  readonly outcome: AlertEvaluationOutcome;
  readonly triggered: boolean;
  readonly evaluatedAt: string;
  readonly observedAt: string | null;
  readonly observedValue: string | number | boolean | null;
  readonly reason: string;
  readonly missingData: readonly string[];
}

export interface AlertEvaluationService {
  evaluateAlert(input: AlertEvaluationInput): Promise<AlertEvaluationResult>;
}
