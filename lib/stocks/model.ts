import type { AggregateBar } from "@/types/market";
import type { MarketSnapshotRow, WatchlistQuote } from "@/types/research";
import type { WatchlistColumnId, WatchlistSortKey } from "./types";

export interface NormalizedChartBar {
  readonly time: number;
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Sorts, validates, and de-duplicates provider bars for chart libraries. */
export function normalizeChartBars(bars: readonly AggregateBar[]): NormalizedChartBar[] {
  const byTime = new Map<number, NormalizedChartBar>();
  for (const bar of bars) {
    const milliseconds = Date.parse(bar.timestamp);
    if (!Number.isFinite(milliseconds)) continue;
    if (![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)) continue;
    const time = Math.floor(milliseconds / 1_000);
    byTime.set(time, {
      time,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    });
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

export function reorderSymbols(
  symbols: readonly string[],
  draggedSymbol: string,
  targetSymbol: string,
): string[] {
  if (draggedSymbol === targetSymbol) return [...symbols];
  const draggedIndex = symbols.indexOf(draggedSymbol);
  const targetIndex = symbols.indexOf(targetSymbol);
  if (draggedIndex < 0 || targetIndex < 0) return [...symbols];
  const next = [...symbols];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function sortableValue(row: MarketSnapshotRow, key: WatchlistSortKey): string | number | null {
  if (key === "symbol") return row.symbol;
  if (key === "lastPrice" || key === "change" || key === "changePercent" || key === "volume" || key === "vwap") {
    return row[key];
  }
  return null;
}

export function sortSnapshotRows(
  rows: readonly MarketSnapshotRow[],
  key: WatchlistSortKey,
  direction: "ascending" | "descending",
  supplemental: Readonly<Record<string, { relativeVolume: number | null; marketCap: number | null }>> = {},
): MarketSnapshotRow[] {
  const factor = direction === "ascending" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = key === "relativeVolume" || key === "marketCap"
      ? supplemental[left.symbol]?.[key] ?? null
      : sortableValue(left, key);
    const rightValue = key === "relativeVolume" || key === "marketCap"
      ? supplemental[right.symbol]?.[key] ?? null
      : sortableValue(right, key);
    if (leftValue === rightValue) return left.symbol.localeCompare(right.symbol);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return (typeof leftValue === "string"
      ? leftValue.localeCompare(String(rightValue))
      : leftValue - Number(rightValue)) * factor;
  });
}

export const DEFAULT_WATCHLIST_COLUMNS: readonly WatchlistColumnId[] = [
  "ticker",
  "companyName",
  "price",
  "changePercent",
  "volume",
  "dailyRvol",
  "vwap",
  "latestNews",
  "nextEvent",
  "optionsActivity",
  "freshness",
] as const;

export const OPTIONAL_WATCHLIST_COLUMNS: readonly WatchlistColumnId[] = [
  "change",
  "bidAsk",
  "dayRange",
  "previousClose",
  "averageVolume",
  "intradayRvol",
  "marketCap",
  "distanceFromVwap",
] as const;

function watchlistSortValue(row: WatchlistQuote, key: WatchlistSortKey): string | number | null {
  switch (key) {
    case "symbol": return row.ticker;
    case "companyName": return row.companyName;
    case "lastPrice": return row.price;
    case "change": return row.change;
    case "changePercent": return row.changePercent;
    case "bid": return row.bid;
    case "ask": return row.ask;
    case "dayHigh": return row.dayHigh;
    case "dayLow": return row.dayLow;
    case "previousClose": return row.previousClose;
    case "volume": return row.volume;
    case "averageVolume": return row.averageVolume;
    case "relativeVolume": return row.dailyRvol;
    case "intradayRvol": return row.intradayRvol;
    case "marketCap": return row.marketCap;
    case "vwap": return row.vwap;
    case "distanceFromVwapPercent": return row.distanceFromVwapPercent;
    case "latestNewsAt": return row.latestNews ? Date.parse(row.latestNews.publishedAt) : null;
    case "nextEventAt": return row.nextEvent ? Date.parse(row.nextEvent.startsAt) : null;
    case "daysUntilEvent": return row.nextEvent?.daysUntil ?? null;
    case "optionsActivity": return row.optionsActivity?.volumeToOpenInterest ?? null;
    case "freshness": return row.freshness.lastUpdatedAt ? Date.parse(row.freshness.lastUpdatedAt) : null;
  }
}

export function sortWatchlistQuotes(
  rows: readonly WatchlistQuote[],
  key: WatchlistSortKey,
  direction: "ascending" | "descending",
): WatchlistQuote[] {
  const factor = direction === "ascending" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = watchlistSortValue(left, key);
    const rightValue = watchlistSortValue(right, key);
    if (leftValue === rightValue) return left.ticker.localeCompare(right.ticker);
    if (leftValue === null || (typeof leftValue === "number" && Number.isNaN(leftValue))) return 1;
    if (rightValue === null || (typeof rightValue === "number" && Number.isNaN(rightValue))) return -1;
    const result = typeof leftValue === "string"
      ? leftValue.localeCompare(String(rightValue))
      : leftValue - Number(rightValue);
    return result * factor || left.ticker.localeCompare(right.ticker);
  });
}

export const MAX_WATCHLIST_SYMBOLS = 100;

export function normalizeWatchlistSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter((symbol) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)))]
    .slice(0, MAX_WATCHLIST_SYMBOLS);
}

export function findNextRowIndex(
  currentIndex: number,
  direction: "previous" | "next",
  rowCount: number,
): number {
  if (rowCount <= 0) return -1;
  const delta = direction === "next" ? 1 : -1;
  return Math.min(rowCount - 1, Math.max(0, currentIndex + delta));
}
