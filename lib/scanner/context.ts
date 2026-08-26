import {
  exponentialMovingAverage,
  relativeStrengthIndex,
  simpleMovingAverage,
} from "@/lib/indicators";
import type {
  AggregateBar,
  CorporateEvent,
  DataFreshnessState,
  NewsArticle,
  OptionChainBundle,
  Snapshot,
  TickerDetails,
} from "@/types";

import type { ScannerSecurity } from "./engine";
import { calculateIntradayRelativeVolume, calculateIntradayScannerSignals } from "./market-time";
import { summarizeScannerOptions, type ScannerOptionsObservation } from "./options-context";

export interface ScannerLatestNews {
  readonly id: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly articleUrl: string | null;
  readonly categories: readonly string[];
  readonly keywords: readonly string[];
}

export interface ScannerNextEvent {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly startsAt: string;
  readonly eventUrl: string | null;
}

export interface ScannerContextRow {
  readonly security: ScannerSecurity;
  readonly companyName: string;
  readonly sector: string | null;
  readonly latestNews: ScannerLatestNews | null;
  readonly nextEvent: ScannerNextEvent | null;
  readonly options: ScannerOptionsObservation;
  readonly intradayRvolCoverage: {
    readonly baselineSessionCount: number;
    readonly intervalMinutes: number;
    readonly throughMinuteEastern: number;
  } | null;
  readonly freshness: DataFreshnessState;
}

export interface ScannerContextBundle {
  readonly universe: readonly string[];
  readonly rows: readonly ScannerContextRow[];
  readonly scope: string;
  readonly evaluationTime: string;
  readonly partialFailures: readonly string[];
  readonly universeCoverage: {
    readonly requestedCount: number;
    readonly processedCount: number;
    readonly returnedCount: number;
    readonly safetyLimit: number;
    readonly truncated: boolean;
  };
}

function latestValue(values: readonly (number | null)[]): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index];
  }
  return null;
}

function historicalChange(closes: readonly number[], periods: number): number | null {
  if (closes.length <= periods) return null;
  const current = closes.at(-1);
  const previous = closes[closes.length - 1 - periods];
  if (current === undefined || previous === 0) return null;
  return (current - previous) / previous * 100;
}

function completedAverageVolume(bars: readonly AggregateBar[]): number | null {
  const values = bars.slice(-21, -1).map((bar) => bar.volume).filter((value) => Number.isFinite(value) && value >= 0);
  if (values.length < 5) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildScannerContextRow(input: {
  readonly snapshot: Snapshot;
  readonly details: TickerDetails;
  readonly bars: readonly AggregateBar[];
  readonly intradayBars: readonly AggregateBar[];
  readonly news: readonly NewsArticle[];
  readonly events: readonly CorporateEvent[];
  readonly optionChain: OptionChainBundle | null;
  readonly freshness: DataFreshnessState;
  readonly now: string;
  readonly newsAvailable?: boolean;
  readonly eventsAvailable?: boolean;
}): ScannerContextRow {
  const { snapshot, details, bars, intradayBars, optionChain, freshness } = input;
  const symbol = snapshot.symbol;
  const closes = bars.map((bar) => bar.close);
  const recentBars = bars.slice(-21, -1);
  const averageVolume = snapshot.quote.averageVolume ?? completedAverageVolume(bars);
  const relevantNews = input.news
    .filter((article) => article.tickers.includes(symbol))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const nowMs = Date.parse(input.now);
  const relevantEvents = input.events
    .filter((event) => event.symbol === symbol && Date.parse(event.startsAt) >= nowMs)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const options = summarizeScannerOptions(optionChain, input.now);
  const price = snapshot.quote.lastPrice;
  const dailyRelativeVolume = snapshot.quote.volume !== null && averageVolume !== null && averageVolume > 0
    ? snapshot.quote.volume / averageVolume
    : null;
  const intradayRelativeVolume = calculateIntradayRelativeVolume(intradayBars, input.now);
  const intradaySignals = calculateIntradayScannerSignals(intradayBars, input.now);
  const optionVolumeRelativeToUnderlying = options.contractEquivalentShareVolume !== null
    && options.equivalentShareVolumeComplete
    && snapshot.quote.volume !== null
    && snapshot.quote.volume > 0
    ? options.contractEquivalentShareVolume / snapshot.quote.volume
    : null;

  return {
    security: {
      symbol,
      price,
      marketCap: details.marketCap ?? snapshot.quote.marketCap,
      volume: snapshot.quote.volume,
      averageVolume,
      relativeVolume: dailyRelativeVolume,
      dailyRelativeVolume,
      intradayRelativeVolume: intradayRelativeVolume?.value ?? null,
      dailyChangePercent: snapshot.quote.changePercent,
      weeklyChangePercent: historicalChange(closes, 5),
      monthlyChangePercent: historicalChange(closes, 21),
      rsi: latestValue(relativeStrengthIndex(closes)),
      gapPercent: snapshot.quote.open !== null && snapshot.quote.previousClose !== null && snapshot.quote.previousClose !== 0
        ? (snapshot.quote.open - snapshot.quote.previousClose) / snapshot.quote.previousClose * 100
        : null,
      dayHigh: snapshot.quote.high,
      dayLow: snapshot.quote.low,
      high52Week: bars.length ? Math.max(...bars.map((bar) => bar.high)) : null,
      low52Week: bars.length ? Math.min(...bars.map((bar) => bar.low)) : null,
      sma20: latestValue(simpleMovingAverage(closes, 20)),
      sma50: latestValue(simpleMovingAverage(closes, 50)),
      sma200: latestValue(simpleMovingAverage(closes, 200)),
      ema20: latestValue(exponentialMovingAverage(closes, 20)),
      ema50: latestValue(exponentialMovingAverage(closes, 50)),
      vwap: snapshot.quote.vwap,
      recentHigh20: recentBars.length === 20 ? Math.max(...recentBars.map((bar) => bar.high)) : null,
      recentLow20: recentBars.length === 20 ? Math.min(...recentBars.map((bar) => bar.low)) : null,
      volumeAccelerationRatio: intradaySignals?.volumeAccelerationRatio ?? null,
      newIntradayHigh: intradaySignals?.newIntradayHigh === undefined || intradaySignals?.newIntradayHigh === null
        ? null
        : intradaySignals.newIntradayHigh ? 1 : 0,
      newIntradayLow: intradaySignals?.newIntradayLow === undefined || intradaySignals?.newIntradayLow === null
        ? null
        : intradaySignals.newIntradayLow ? 1 : 0,
      optionVolume: options?.totalVolume ?? null,
      optionOpenInterest: options?.totalOpenInterest ?? null,
      optionVolumeToOpenInterest: options.volumeToOpenInterest,
      optionCallVolume: options.callVolume,
      optionPutVolume: options.putVolume,
      optionCallOpenInterest: options.callOpenInterest,
      optionPutOpenInterest: options.putOpenInterest,
      optionCallToPutVolumeRatio: options.callToPutVolumeRatio,
      optionCallToPutOpenInterestRatio: options.callToPutOpenInterestRatio,
      optionAverageImpliedVolatility: options.averageImpliedVolatility,
      optionMinimumDte: options.minimumDte,
      optionMaximumDte: options.maximumDte,
      optionHighestContractVolume: options.highestContractVolume,
      optionHighestContractOpenInterest: options.highestContractOpenInterest,
      optionHighestVolumeContract: options.highestVolumeContract,
      optionHighestOpenInterestContract: options.highestOpenInterestContract,
      optionVolumeRelativeToUnderlying,
      optionContractCount: options.contractCount,
      optionVolumeReportedContractCount: options.volumeReportedContractCount,
      optionOpenInterestReportedContractCount: options.openInterestReportedContractCount,
      optionVolumeOpenInterestPairedContractCount: options.volumeOpenInterestPairedContractCount,
      optionVolumeComplete: options.volumeComplete,
      optionOpenInterestComplete: options.openInterestComplete,
      optionCallContractCount: options.callContractCount,
      optionPutContractCount: options.putContractCount,
      optionCallVolumeReportedContractCount: options.callVolumeReportedContractCount,
      optionPutVolumeReportedContractCount: options.putVolumeReportedContractCount,
      optionCallOpenInterestReportedContractCount: options.callOpenInterestReportedContractCount,
      optionPutOpenInterestReportedContractCount: options.putOpenInterestReportedContractCount,
      optionCallVolumeComplete: options.callVolumeComplete,
      optionPutVolumeComplete: options.putVolumeComplete,
      optionCallOpenInterestComplete: options.callOpenInterestComplete,
      optionPutOpenInterestComplete: options.putOpenInterestComplete,
      optionIvReportedContractCount: options.reportedIvContractCount,
      optionDteContractCount: options.dteContractCount,
      optionSelectedExpiration: options.selectedExpiration,
      optionAvailableExpirationCount: options.availableExpirations.length,
      optionContractsComplete: options.contractsComplete,
      optionEquivalentShareVolumeReportedContractCount: options.equivalentShareVolumeReportedContractCount,
      optionEquivalentShareVolumeComplete: options.equivalentShareVolumeComplete,
      optionsAvailable: options.available,
      optionsQuality: options.quality,
      optionsAsOf: options.asOf,
      newsAvailable: input.newsAvailable ?? true,
      eventsAvailable: input.eventsAvailable ?? true,
      news: relevantNews.map((article) => ({
        publishedAt: article.publishedAt,
        headline: article.title,
        categories: article.categories,
        keywords: article.keywords,
      })),
      newsPublishedAt: relevantNews.map((article) => article.publishedAt),
      catalysts: relevantEvents.map((event) => ({
        type: event.type,
        occursAt: event.startsAt,
        status: event.status,
      })),
    },
    companyName: details.name,
    sector: details.sicDescription,
    latestNews: relevantNews[0] ? {
      id: relevantNews[0].id,
      title: relevantNews[0].title,
      publishedAt: relevantNews[0].publishedAt,
      articleUrl: relevantNews[0].articleUrl,
      categories: relevantNews[0].categories,
      keywords: relevantNews[0].keywords,
    } : null,
    nextEvent: relevantEvents[0] ? {
      id: relevantEvents[0].id,
      title: relevantEvents[0].title,
      type: relevantEvents[0].type,
      status: relevantEvents[0].status,
      startsAt: relevantEvents[0].startsAt,
      eventUrl: relevantEvents[0].eventUrl,
    } : null,
    options,
    intradayRvolCoverage: intradayRelativeVolume ? {
      baselineSessionCount: intradayRelativeVolume.baselineSessionCount,
      intervalMinutes: intradayRelativeVolume.intervalMinutes,
      throughMinuteEastern: intradayRelativeVolume.throughMinuteEastern,
    } : null,
    freshness,
  };
}
