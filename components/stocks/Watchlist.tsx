"use client";

import type { DragEvent, KeyboardEvent } from "react";

import type { MarketSnapshotRow, WatchlistResearchBundle } from "@/types/research";
import {
  findNextRowIndex,
  reorderSymbols,
  sortSnapshotRows,
  stockCompact,
  stockCurrency,
  stockDateTime,
  stockNumber,
  stockPercent,
  stockTone,
} from "@/lib/stocks";
import type {
  StockDataStatus,
  WatchlistRowSupplement,
  WatchlistSortKey,
} from "@/lib/stocks";
import { StockEmptyState, StockStatusBadge } from "./StockFrame";

function orderedRows(bundle: WatchlistResearchBundle): MarketSnapshotRow[] {
  const position = new Map(bundle.symbols.map((symbol, index) => [symbol, index]));
  return [...bundle.snapshots].sort(
    (left, right) => (position.get(left.symbol) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.symbol) ?? Number.MAX_SAFE_INTEGER),
  );
}

export interface WatchlistProps {
  readonly status: StockDataStatus;
  readonly bundle: WatchlistResearchBundle | null;
  readonly supplements?: Readonly<Record<string, WatchlistRowSupplement>>;
  readonly sortKey: WatchlistSortKey | null;
  readonly sortDirection: "ascending" | "descending";
  readonly selectedSymbol: string | null;
  readonly onSort: (key: WatchlistSortKey) => void;
  readonly onTickerSelect?: (ticker: string) => void;
  readonly onReorder?: (symbols: readonly string[]) => void;
  readonly onRemove?: (ticker: string) => void;
}

export function Watchlist({
  status,
  bundle,
  supplements = {},
  sortKey,
  sortDirection,
  selectedSymbol,
  onSort,
  onTickerSelect,
  onReorder,
  onRemove,
}: WatchlistProps) {
  const baseRows = bundle ? orderedRows(bundle) : [];
  const rows = sortKey ? sortSnapshotRows(baseRows, sortKey, sortDirection, supplements) : baseRows;
  const canReorder = Boolean(onReorder && !sortKey);
  const header = (key: WatchlistSortKey, label: string) => (
    <button type="button" onClick={() => onSort(key)} aria-label={`Sort watchlist by ${label}`}>
      {label}{sortKey === key ? (sortDirection === "ascending" ? " ↑" : " ↓") : ""}
    </button>
  );

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number, symbol: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTickerSelect?.(symbol);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = findNextRowIndex(index, event.key === "ArrowDown" ? "next" : "previous", rows.length);
    const candidate = event.currentTarget.parentElement?.children.item(next);
    if (candidate instanceof HTMLElement) candidate.focus();
  };

  const onDrop = (event: DragEvent<HTMLTableRowElement>, targetSymbol: string) => {
    event.preventDefault();
    if (!canReorder) return;
    const draggedSymbol = event.dataTransfer.getData("text/plain");
    onReorder?.(reorderSymbols(rows.map((row) => row.symbol), draggedSymbol, targetSymbol));
  };

  return (
    <section className="stock-module stock-watchlist" aria-label={bundle ? `${bundle.name} watchlist` : "Watchlist"}>
      <header className="stock-module-header">
        <div><span>PERSONAL UNIVERSE</span><h3>{bundle?.name ?? "WATCHLIST"}</h3></div>
        <div className="stock-watchlist-meta"><strong>{bundle?.symbols.length ?? 0} SYMBOLS</strong>{onReorder ? <span>{canReorder ? "DRAG TO REORDER" : "CLEAR SORT TO REORDER"}</span> : null}</div>
        <StockStatusBadge status={status} />
      </header>
      {!bundle || rows.length === 0 ? <StockEmptyState title="EMPTY WATCHLIST" detail={status.message ?? "Add securities to begin monitoring this list."} /> : (
        <div className="stock-table-wrap">
          <table className="stock-table stock-watchlist-table">
            <caption className="stock-sr-only">Sortable and reorderable {bundle.name} watchlist</caption>
            <thead><tr><th><span className="stock-sr-only">Reorder</span></th><th>{header("symbol", "SYMBOL")}</th><th>{header("lastPrice", "LAST")}</th><th>{header("changePercent", "% CHANGE")}</th><th>{header("volume", "VOLUME")}</th><th>{header("relativeVolume", "RVOL")}</th><th>{header("marketCap", "MARKET CAP")}</th><th>VWAP</th><th>AS OF</th>{onRemove ? <th><span className="stock-sr-only">Actions</span></th> : null}</tr></thead>
            <tbody>{rows.map((row, index) => {
              const supplemental = supplements[row.symbol];
              return (
                <tr
                  key={row.symbol}
                  tabIndex={0}
                  draggable={canReorder}
                  className={selectedSymbol === row.symbol ? "is-selected" : ""}
                  aria-label={`${row.symbol}, ${stockCurrency(row.lastPrice)}, ${stockPercent(row.changePercent)}`}
                  onKeyDown={(event) => onRowKeyDown(event, index, row.symbol)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", row.symbol);
                  }}
                  onDragOver={(event) => {
                    if (canReorder) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => onDrop(event, row.symbol)}
                >
                  <td className="stock-drag-handle" aria-hidden="true">⠿</td>
                  <td><button type="button" className="stock-symbol-button" onClick={() => onTickerSelect?.(row.symbol)}>{row.symbol}</button></td>
                  <td>{stockCurrency(row.lastPrice)}</td>
                  <td className={stockTone(row.changePercent)}><strong>{stockPercent(row.changePercent)}</strong></td>
                  <td>{stockCompact(row.volume)}</td>
                  <td>{supplemental?.relativeVolume === null || supplemental?.relativeVolume === undefined ? "—" : `${stockNumber(supplemental.relativeVolume)}×`}</td>
                  <td>{stockCompact(supplemental?.marketCap ?? null)}</td>
                  <td>{stockCurrency(row.vwap)}</td>
                  <td><time dateTime={row.asOf}>{stockDateTime(row.asOf)}</time><small>{row.quality}</small></td>
                  {onRemove ? <td><button type="button" className="stock-remove-button" onClick={() => onRemove(row.symbol)} aria-label={`Remove ${row.symbol} from ${bundle.name}`}>REMOVE</button></td> : null}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

