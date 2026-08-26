import type { CorporateEvent, NewsArticle, OptionContract } from "@/types/market";
import type { OptionChainBundle, SecurityResearchBundle } from "@/types/research";

const DAY_MILLISECONDS = 86_400_000;
const MARKET_TIME_ZONE = "America/New_York";

export interface PerformanceMeasurement {
  readonly label: "1D" | "1W" | "1M" | "3M" | "1Y";
  readonly changePercent: number | null;
  readonly basis: "provider quote" | "loaded bars";
}

export interface MovingAveragePosition {
  readonly label: "SMA 20" | "SMA 50" | "SMA 200";
  readonly average: number | null;
  readonly distancePercent: number | null;
}

export interface TechnicalPositionSummary {
  readonly lastPrice: number | null;
  readonly vwap: number | null;
  readonly distanceFromVwapPercent: number | null;
  readonly movingAverages: readonly MovingAveragePosition[];
  readonly rangeLow: number | null;
  readonly rangeHigh: number | null;
  readonly rangePositionPercent: number | null;
  readonly rangeLabel: "52W RANGE" | "LOADED RANGE" | "RANGE UNAVAILABLE";
}

export interface RelativeVolumeIntelligence {
  readonly currentVolume: number | null;
  readonly averageDailyVolume: number | null;
  readonly dailyRvol: number | null;
  /** A time-aligned historical baseline is not present in SecurityResearchBundle. */
  readonly intradayRvol: null;
}

export interface EventCountdown {
  readonly event: CorporateEvent;
  readonly daysUntil: number;
}

export type OptionsCoverageState = "not-provided" | "symbol-mismatch" | "empty" | "available";

export interface OptionsObservationSummary {
  readonly state: OptionsCoverageState;
  readonly contractCount: number;
  readonly expirationCount: number;
  readonly reportedVolume: number | null;
  readonly callVolume: number | null;
  readonly putVolume: number | null;
  readonly putCallVolumeRatio: number | null;
  readonly reportedOpenInterest: number | null;
  readonly volumeToOpenInterestRatio: number | null;
  readonly topVolumeContract: OptionContract | null;
}

export interface TickerOverviewIntelligenceModel {
  readonly symbol: string;
  readonly referenceTime: string;
  readonly performance: readonly PerformanceMeasurement[];
  readonly technical: TechnicalPositionSummary;
  readonly relativeVolume: RelativeVolumeIntelligence;
  readonly newsProvided: boolean;
  readonly recentNews: readonly NewsArticle[];
  readonly eventsProvided: boolean;
  readonly upcomingEvents: readonly EventCountdown[];
  readonly options: OptionsObservationSummary;
}

export interface BuildTickerOverviewIntelligenceInput {
  readonly security: SecurityResearchBundle;
  readonly news?: readonly NewsArticle[] | null;
  readonly events?: readonly CorporateEvent[] | null;
  readonly optionChain?: OptionChainBundle | null;
  /** Defaults to the normalized snapshot timestamp for deterministic rendering. */
  readonly referenceTime?: string;
  readonly newsLimit?: number;
  readonly eventLimit?: number;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percentChange(current: number | null, baseline: number | null): number | null {
  if (!finite(current) || !finite(baseline) || baseline === 0) return null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function parsedTime(value: string): number | null {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function marketDateNumber(value: string): number | null {
  const milliseconds = parsedTime(value);
  if (milliseconds === null) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(milliseconds));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (![year, month, day].every(Number.isFinite)) return null;
  return Date.UTC(year, month - 1, day);
}

/** Counts calendar boundaries in New York, avoiding DST-driven 23/25-hour day errors. */
export function marketCalendarDaysBetween(referenceTime: string, futureTime: string): number | null {
  const referenceDate = marketDateNumber(referenceTime);
  const futureDate = marketDateNumber(futureTime);
  if (referenceDate === null || futureDate === null) return null;
  return Math.round((futureDate - referenceDate) / DAY_MILLISECONDS);
}

function chronologicalBars(security: SecurityResearchBundle) {
  return security.bars
    .filter((bar) => parsedTime(bar.timestamp) !== null && finite(bar.close) && finite(bar.high) && finite(bar.low))
    .slice()
    .sort((left, right) => (parsedTime(left.timestamp) ?? 0) - (parsedTime(right.timestamp) ?? 0));
}

function periodPerformance(
  bars: ReturnType<typeof chronologicalBars>,
  lastPrice: number | null,
  calendarDays: number,
): number | null {
  const lastBar = bars.at(-1);
  const lastTime = lastBar ? parsedTime(lastBar.timestamp) : null;
  if (lastTime === null || !finite(lastPrice)) return null;
  const target = lastTime - calendarDays * DAY_MILLISECONDS;
  const baseline = bars.findLast((bar) => (parsedTime(bar.timestamp) ?? Number.POSITIVE_INFINITY) <= target);
  return percentChange(lastPrice, baseline?.close ?? null);
}

function movingAverage(values: readonly number[], window: number): number | null {
  if (values.length < window) return null;
  const sample = values.slice(-window);
  return sample.reduce((total, value) => total + value, 0) / window;
}

function sumReported(contracts: readonly OptionContract[], field: "volume" | "openInterest"): number | null {
  const values = contracts.map((contract) => contract[field]).filter(finite);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function summarizeOptions(
  symbol: string,
  optionChain: OptionChainBundle | null | undefined,
): OptionsObservationSummary {
  const empty = (state: OptionsCoverageState): OptionsObservationSummary => ({
    state,
    contractCount: 0,
    expirationCount: 0,
    reportedVolume: null,
    callVolume: null,
    putVolume: null,
    putCallVolumeRatio: null,
    reportedOpenInterest: null,
    volumeToOpenInterestRatio: null,
    topVolumeContract: null,
  });
  if (!optionChain) return empty("not-provided");
  if (optionChain.underlyingSymbol.toUpperCase() !== symbol) return empty("symbol-mismatch");
  const contracts = optionChain.contracts.filter((contract) => contract.underlyingSymbol.toUpperCase() === symbol);
  if (!contracts.length) return empty("empty");
  const callContracts = contracts.filter((contract) => contract.type === "call");
  const putContracts = contracts.filter((contract) => contract.type === "put");
  const reportedVolume = sumReported(contracts, "volume");
  const callVolume = sumReported(callContracts, "volume");
  const putVolume = sumReported(putContracts, "volume");
  const reportedOpenInterest = sumReported(contracts, "openInterest");
  const topVolumeContract = contracts
    .filter((contract) => finite(contract.volume))
    .slice()
    .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))[0] ?? null;
  return {
    state: "available",
    contractCount: contracts.length,
    expirationCount: new Set(contracts.map((contract) => contract.expirationDate)).size,
    reportedVolume,
    callVolume,
    putVolume,
    putCallVolumeRatio: finite(putVolume) && finite(callVolume) && callVolume > 0 ? putVolume / callVolume : null,
    reportedOpenInterest,
    volumeToOpenInterestRatio: finite(reportedVolume) && finite(reportedOpenInterest) && reportedOpenInterest > 0
      ? reportedVolume / reportedOpenInterest
      : null,
    topVolumeContract,
  };
}

export function buildTickerOverviewIntelligence({
  security,
  news,
  events,
  optionChain,
  referenceTime = security.snapshot.asOf,
  newsLimit = 3,
  eventLimit = 3,
}: BuildTickerOverviewIntelligenceInput): TickerOverviewIntelligenceModel {
  const symbol = security.details.symbol.toUpperCase();
  const bars = chronologicalBars(security);
  const quote = security.snapshot.quote;
  const lastPrice = finite(quote.lastPrice) ? quote.lastPrice : bars.at(-1)?.close ?? null;
  const closes = bars.map((bar) => bar.close);
  const latestBarTime = bars.at(-1) ? parsedTime(bars.at(-1)!.timestamp) : null;
  const earliestBarTime = bars[0] ? parsedTime(bars[0].timestamp) : null;
  const hasApproximateYear = latestBarTime !== null && earliestBarTime !== null
    && latestBarTime - earliestBarTime >= 330 * DAY_MILLISECONDS;
  const rangeBars = hasApproximateYear && latestBarTime !== null
    ? bars.filter((bar) => (parsedTime(bar.timestamp) ?? 0) >= latestBarTime - 365 * DAY_MILLISECONDS)
    : bars;
  const rangeLow = rangeBars.length ? Math.min(...rangeBars.map((bar) => bar.low)) : null;
  const rangeHigh = rangeBars.length ? Math.max(...rangeBars.map((bar) => bar.high)) : null;
  const rangePositionPercent = finite(lastPrice) && finite(rangeLow) && finite(rangeHigh) && rangeHigh > rangeLow
    ? ((lastPrice - rangeLow) / (rangeHigh - rangeLow)) * 100
    : null;
  const movingAverages = ([20, 50, 200] as const).map((window) => {
    const average = movingAverage(closes, window);
    return {
      label: `SMA ${window}` as MovingAveragePosition["label"],
      average,
      distancePercent: percentChange(lastPrice, average),
    };
  });
  const completedVolumes = bars.slice(-21, -1).map((bar) => bar.volume).filter(finite);
  const averageDailyVolume = finite(quote.averageVolume)
    ? quote.averageVolume
    : completedVolumes.length >= 5
      ? completedVolumes.reduce((total, volume) => total + volume, 0) / completedVolumes.length
      : null;
  const matchingNews = (news ?? [])
    .filter((article) => article.tickers.some((ticker) => ticker.toUpperCase() === symbol))
    .filter((article) => parsedTime(article.publishedAt) !== null)
    .slice()
    .sort((left, right) => (parsedTime(right.publishedAt) ?? 0) - (parsedTime(left.publishedAt) ?? 0))
    .slice(0, Math.max(0, newsLimit));
  const upcomingEvents = (events ?? [])
    .filter((event) => event.symbol.toUpperCase() === symbol)
    .filter((event) => event.status !== "canceled" && event.status !== "completed")
    .flatMap((event): EventCountdown[] => {
      const daysUntil = marketCalendarDaysBetween(referenceTime, event.startsAt);
      return daysUntil === null || daysUntil < 0 ? [] : [{ event, daysUntil }];
    })
    .sort((left, right) => left.daysUntil - right.daysUntil || left.event.startsAt.localeCompare(right.event.startsAt))
    .slice(0, Math.max(0, eventLimit));

  return {
    symbol,
    referenceTime,
    performance: [
      { label: "1D", changePercent: quote.changePercent, basis: "provider quote" },
      { label: "1W", changePercent: periodPerformance(bars, lastPrice, 7), basis: "loaded bars" },
      { label: "1M", changePercent: periodPerformance(bars, lastPrice, 30), basis: "loaded bars" },
      { label: "3M", changePercent: periodPerformance(bars, lastPrice, 90), basis: "loaded bars" },
      { label: "1Y", changePercent: periodPerformance(bars, lastPrice, 365), basis: "loaded bars" },
    ],
    technical: {
      lastPrice,
      vwap: quote.vwap,
      distanceFromVwapPercent: percentChange(lastPrice, quote.vwap),
      movingAverages,
      rangeLow,
      rangeHigh,
      rangePositionPercent,
      rangeLabel: rangeBars.length ? (hasApproximateYear ? "52W RANGE" : "LOADED RANGE") : "RANGE UNAVAILABLE",
    },
    relativeVolume: {
      currentVolume: quote.volume,
      averageDailyVolume,
      dailyRvol: finite(quote.volume) && finite(averageDailyVolume) && averageDailyVolume > 0
        ? quote.volume / averageDailyVolume
        : null,
      intradayRvol: null,
    },
    newsProvided: news !== undefined && news !== null,
    recentNews: matchingNews,
    eventsProvided: events !== undefined && events !== null,
    upcomingEvents,
    options: summarizeOptions(symbol, optionChain),
  };
}
