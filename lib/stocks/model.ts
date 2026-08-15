import type { AggregateBar } from "@/types/market";
import type { MarketSnapshotRow } from "@/types/research";
import type { WatchlistSortKey } from "./types";

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
  if (key === "relativeVolume") return null;
  if (key === "marketCap") return null;
  return row[key];
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

export function findNextRowIndex(
  currentIndex: number,
  direction: "previous" | "next",
  rowCount: number,
): number {
  if (rowCount <= 0) return -1;
  const delta = direction === "next" ? 1 : -1;
  return Math.min(rowCount - 1, Math.max(0, currentIndex + delta));
}

