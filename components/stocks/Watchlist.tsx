"use client";

import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { DataFreshnessState } from "@/types/market";
import type { MarketSnapshotRow, WatchlistQuote, WatchlistResearchBundle } from "@/types/research";
import { freshnessLabel } from "@/lib/freshness";
import {
  DEFAULT_WATCHLIST_COLUMNS,
  OPTIONAL_WATCHLIST_COLUMNS,
  findNextRowIndex,
  reorderSymbols,
  sortWatchlistQuotes,
  stockCompact,
  stockCurrency,
  stockDateTime,
  stockNumber,
  stockPercent,
  stockTone,
} from "@/lib/stocks";
import type {
  StockDataStatus,
  WatchlistColumnId,
  WatchlistRowSupplement,
  WatchlistSortKey,
} from "@/lib/stocks";
import { StockEmptyState, StockStatusBadge } from "./StockFrame";

interface WatchlistColumn {
  readonly id: WatchlistColumnId;
  readonly label: string;
  readonly sortKey: WatchlistSortKey;
  readonly width: number;
  readonly minimumWidth: number;
  readonly maximumWidth: number;
}

export type WatchlistResearchTarget =
  | { readonly view: "news"; readonly itemId: string }
  | { readonly view: "events"; readonly itemId: string; readonly startsAt: string }
  | { readonly view: "options"; readonly itemId: null };

export type WatchlistResearchSelect = (ticker: string, target: WatchlistResearchTarget) => void;

const WATCHLIST_COLUMNS: readonly WatchlistColumn[] = [
  { id: "ticker", label: "TICKER", sortKey: "symbol", width: 78, minimumWidth: 64, maximumWidth: 140 },
  { id: "companyName", label: "COMPANY", sortKey: "companyName", width: 180, minimumWidth: 110, maximumWidth: 360 },
  { id: "price", label: "PRICE", sortKey: "lastPrice", width: 92, minimumWidth: 74, maximumWidth: 160 },
  { id: "change", label: "$ CHANGE", sortKey: "change", width: 92, minimumWidth: 76, maximumWidth: 160 },
  { id: "changePercent", label: "% CHANGE", sortKey: "changePercent", width: 98, minimumWidth: 82, maximumWidth: 170 },
  { id: "bidAsk", label: "BID / ASK", sortKey: "bid", width: 132, minimumWidth: 108, maximumWidth: 220 },
  { id: "dayRange", label: "DAY LOW / HIGH", sortKey: "dayHigh", width: 142, minimumWidth: 118, maximumWidth: 240 },
  { id: "previousClose", label: "PREV CLOSE", sortKey: "previousClose", width: 100, minimumWidth: 82, maximumWidth: 170 },
  { id: "volume", label: "VOLUME", sortKey: "volume", width: 92, minimumWidth: 76, maximumWidth: 170 },
  { id: "averageVolume", label: "AVG VOLUME", sortKey: "averageVolume", width: 102, minimumWidth: 84, maximumWidth: 180 },
  { id: "dailyRvol", label: "DAILY RVOL", sortKey: "relativeVolume", width: 100, minimumWidth: 84, maximumWidth: 180 },
  { id: "intradayRvol", label: "INTRADAY RVOL", sortKey: "intradayRvol", width: 112, minimumWidth: 94, maximumWidth: 190 },
  { id: "marketCap", label: "MARKET CAP", sortKey: "marketCap", width: 108, minimumWidth: 88, maximumWidth: 190 },
  { id: "vwap", label: "VWAP", sortKey: "vwap", width: 88, minimumWidth: 72, maximumWidth: 150 },
  { id: "distanceFromVwap", label: "FROM VWAP", sortKey: "distanceFromVwapPercent", width: 100, minimumWidth: 84, maximumWidth: 180 },
  { id: "latestNews", label: "LATEST NEWS", sortKey: "latestNewsAt", width: 174, minimumWidth: 132, maximumWidth: 320 },
  { id: "nextEvent", label: "NEXT EVENT", sortKey: "daysUntilEvent", width: 174, minimumWidth: 132, maximumWidth: 320 },
  { id: "optionsActivity", label: "OPTIONS ACTIVITY", sortKey: "optionsActivity", width: 158, minimumWidth: 124, maximumWidth: 300 },
  { id: "freshness", label: "FRESHNESS", sortKey: "freshness", width: 152, minimumWidth: 120, maximumWidth: 260 },
] as const;

const ALL_COLUMN_IDS = WATCHLIST_COLUMNS.map((column) => column.id);
const INITIAL_VISIBLE_COLUMNS = [...DEFAULT_WATCHLIST_COLUMNS, ...OPTIONAL_WATCHLIST_COLUMNS];

function fallbackFreshness(row: MarketSnapshotRow, status: StockDataStatus): DataFreshnessState {
  const inherited = status.meta?.freshness;
  return {
    status: inherited?.status ?? row.quality,
    delayMinutes: inherited?.delayMinutes ?? null,
    lastUpdatedAt: row.asOf,
    source: inherited?.source ?? status.meta?.source ?? "provider",
    marketSession: inherited?.marketSession ?? null,
  };
}

function snapshotQuote(
  row: MarketSnapshotRow,
  status: StockDataStatus,
  supplemental: WatchlistRowSupplement | undefined,
): WatchlistQuote {
  const distanceFromVwapPercent = row.lastPrice !== null && row.vwap !== null && row.vwap !== 0
    ? ((row.lastPrice - row.vwap) / Math.abs(row.vwap)) * 100
    : null;
  return {
    ticker: row.symbol,
    companyName: null,
    price: row.lastPrice,
    change: row.change,
    changePercent: row.changePercent,
    bid: null,
    ask: null,
    dayHigh: row.high,
    dayLow: row.low,
    previousClose: row.previousClose,
    volume: row.volume,
    averageVolume: null,
    dailyRvol: supplemental?.relativeVolume ?? null,
    intradayRvol: null,
    vwap: row.vwap,
    distanceFromVwapPercent,
    marketCap: supplemental?.marketCap ?? null,
    latestNews: null,
    nextEvent: null,
    optionsActivity: null,
    freshness: fallbackFreshness(row, status),
  };
}

function orderedRows(
  bundle: WatchlistResearchBundle,
  status: StockDataStatus,
  supplements: Readonly<Record<string, WatchlistRowSupplement>>,
): WatchlistQuote[] {
  const quotes = new Map((bundle.quotes ?? []).map((row) => [row.ticker, row]));
  const snapshots = new Map(bundle.snapshots.map((row) => [row.symbol, row]));
  const seen = new Set<string>();
  const result: WatchlistQuote[] = [];

  const append = (ticker: string) => {
    if (seen.has(ticker)) return;
    const quote = quotes.get(ticker);
    const snapshot = snapshots.get(ticker);
    if (quote) result.push(quote);
    else if (snapshot) result.push(snapshotQuote(snapshot, status, supplements[ticker]));
    else return;
    seen.add(ticker);
  };

  bundle.symbols.forEach(append);
  quotes.forEach((_, ticker) => append(ticker));
  snapshots.forEach((_, ticker) => append(ticker));
  return result;
}

function signedCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${stockCurrency(value)}`;
}

function ratio(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${stockNumber(value)}×`;
}

function renderCell(
  row: WatchlistQuote,
  column: WatchlistColumnId,
  onResearchSelect?: WatchlistResearchSelect,
): ReactNode {
  switch (column) {
    case "ticker":
      return row.ticker;
    case "companyName":
      return row.companyName ?? <span className="stock-muted">UNAVAILABLE</span>;
    case "price":
      return stockCurrency(row.price);
    case "change":
      return <strong className={stockTone(row.change)}>{signedCurrency(row.change)}</strong>;
    case "changePercent":
      return (
        <><strong className={stockTone(row.changePercent)}>{stockPercent(row.changePercent)}</strong>{Math.abs(row.changePercent ?? 0) >= 5 ? <small title="Absolute daily move is at least 5 percent">LARGE MOVE</small> : null}</>
      );
    case "bidAsk":
      return row.bid === null && row.ask === null
        ? <span className="stock-muted" title="The provider returned no stock bid or ask for this row.">NO QUOTE</span>
        : <>{stockCurrency(row.bid)} / {stockCurrency(row.ask)}<small>BID / ASK</small></>;
    case "dayRange":
      return <>{stockCurrency(row.dayLow)} / {stockCurrency(row.dayHigh)}<small>LOW / HIGH</small></>;
    case "previousClose":
      return stockCurrency(row.previousClose);
    case "volume":
      return stockCompact(row.volume);
    case "averageVolume":
      return stockCompact(row.averageVolume);
    case "dailyRvol":
      return <>{ratio(row.dailyRvol)}{(row.dailyRvol ?? 0) >= 2 ? <small title="Daily relative volume is at least 2 times its baseline.">HIGH RVOL</small> : <small>DAILY</small>}</>;
    case "intradayRvol":
      return row.intradayRvol === null
        ? <span className="stock-muted" title="Time-adjusted intraday history was insufficient or was not requested.">UNAVAILABLE</span>
        : <>{ratio(row.intradayRvol)}<small>TIME-ADJUSTED</small></>;
    case "marketCap":
      return stockCompact(row.marketCap);
    case "vwap":
      return stockCurrency(row.vwap);
    case "distanceFromVwap":
      return <strong className={stockTone(row.distanceFromVwapPercent)}>{stockPercent(row.distanceFromVwapPercent)}</strong>;
    case "latestNews": {
      const article = row.latestNews;
      if (!article) return <span className="stock-muted">NO NEWS FOUND</span>;
      const content = <><strong>NEWS</strong><small><time dateTime={article.publishedAt}>{stockDateTime(article.publishedAt)}</time></small></>;
      if (onResearchSelect) {
        return (
          <button
            type="button"
            className="stock-watchlist-research-button"
            title={`${article.publisher}: ${article.title}`}
            aria-label={`Open ${row.ticker} news: ${article.title}`}
            onClick={() => onResearchSelect(row.ticker, { view: "news", itemId: article.id })}
          >
            {content}
          </button>
        );
      }
      return article.articleUrl
        ? <a href={article.articleUrl} target="_blank" rel="noreferrer" title={`${article.publisher}: ${article.title}`}>{content}</a>
        : <span title={`${article.publisher}: ${article.title}`}>{content}</span>;
    }
    case "nextEvent": {
      const event = row.nextEvent;
      if (!event) return <span className="stock-muted">NO UPCOMING EVENT</span>;
      const earnings = event.type === "earnings-release" || event.type === "earnings-call";
      const content = <><strong>{earnings ? "EARNINGS" : "EVENT"}</strong><small>{event.daysUntil === 0 ? "TODAY" : `${event.daysUntil}D · ${event.status}`}</small></>;
      return onResearchSelect ? (
        <button
          type="button"
          className="stock-watchlist-research-button"
          title={`${event.title} · ${event.status} · ${stockDateTime(event.startsAt)}`}
          aria-label={`Open ${row.ticker} events: ${event.title}`}
          onClick={() => onResearchSelect(row.ticker, { view: "events", itemId: event.id, startsAt: event.startsAt })}
        >
          {content}
        </button>
      ) : <span title={`${event.title} · ${event.status} · ${stockDateTime(event.startsAt)}`}>{content}</span>;
    }
    case "optionsActivity": {
      const activity = row.optionsActivity;
      if (!activity) return <span className="stock-muted">DATA UNAVAILABLE</span>;
      const content = <><strong>{activity.observed ? "OPTIONS FLAG" : "NO FLAG"}</strong><small>{activity.volumeToOpenInterest === null ? activity.label : `${ratio(activity.volumeToOpenInterest)} VOL / OI`}</small></>;
      return onResearchSelect ? (
        <button
          type="button"
          className="stock-watchlist-research-button"
          title={activity.highestVolumeContract ?? activity.label}
          aria-label={`Open ${row.ticker} options activity`}
          onClick={() => onResearchSelect(row.ticker, { view: "options", itemId: null })}
        >
          {content}
        </button>
      ) : <span title={activity.highestVolumeContract ?? activity.label}>{content}</span>;
    }
    case "freshness":
      return <><span className={`data-badge is-${row.freshness.status}`} title={`Source: ${row.freshness.source}`}>{freshnessLabel(row.freshness)}</span><small><time dateTime={row.freshness.lastUpdatedAt ?? undefined}>{stockDateTime(row.freshness.lastUpdatedAt)}</time></small></>;
  }
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
  readonly onResearchSelect?: WatchlistResearchSelect;
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
  onResearchSelect,
  onReorder,
  onRemove,
}: WatchlistProps) {
  const [visibleColumnIds, setVisibleColumnIds] = useState<readonly WatchlistColumnId[]>(INITIAL_VISIBLE_COLUMNS);
  const [columnWidths, setColumnWidths] = useState<Readonly<Record<WatchlistColumnId, number>>>(() =>
    Object.fromEntries(WATCHLIST_COLUMNS.map((column) => [column.id, column.width])) as Record<WatchlistColumnId, number>,
  );
  const resizeState = useRef<{
    readonly pointerId: number;
    readonly column: WatchlistColumn;
    readonly startX: number;
    readonly startWidth: number;
  } | null>(null);
  const visibleColumns = useMemo(() => {
    const selected = new Set(visibleColumnIds);
    selected.add("ticker");
    return WATCHLIST_COLUMNS.filter((column) => selected.has(column.id));
  }, [visibleColumnIds]);
  const baseRows = useMemo(
    () => bundle ? orderedRows(bundle, status, supplements) : [],
    [bundle, status, supplements],
  );
  const rows = useMemo(
    () => sortKey ? sortWatchlistQuotes(baseRows, sortKey, sortDirection) : baseRows,
    [baseRows, sortDirection, sortKey],
  );
  const canReorder = Boolean(onReorder && !sortKey);
  const tableMinimumWidth = 34
    + visibleColumns.reduce((total, column) => total + columnWidths[column.id], 0)
    + (onRemove ? 72 : 0);
  const tableStyle = {
    width: "100%",
    "--watchlist-min-width": `${tableMinimumWidth}px`,
    tableLayout: "fixed",
  } as CSSProperties;

  const setColumnVisible = (columnId: WatchlistColumnId, visible: boolean) => {
    if (columnId === "ticker") return;
    setVisibleColumnIds((current) => {
      const next = new Set(current);
      if (visible) next.add(columnId);
      else next.delete(columnId);
      next.add("ticker");
      return ALL_COLUMN_IDS.filter((id) => next.has(id));
    });
  };

  const setColumnWidth = (column: WatchlistColumn, width: number) => {
    const nextWidth = Math.round(Math.min(column.maximumWidth, Math.max(column.minimumWidth, width)));
    setColumnWidths((current) => ({ ...current, [column.id]: nextWidth }));
  };

  const onResizeStart = (event: PointerEvent<HTMLSpanElement>, column: WatchlistColumn) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeState.current = {
      pointerId: event.pointerId,
      column,
      startX: event.clientX,
      startWidth: columnWidths[column.id],
    };
  };

  const onResizeMove = (event: PointerEvent<HTMLSpanElement>) => {
    const active = resizeState.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setColumnWidth(active.column, active.startWidth + event.clientX - active.startX);
  };

  const onResizeEnd = (event: PointerEvent<HTMLSpanElement>) => {
    if (resizeState.current?.pointerId !== event.pointerId) return;
    resizeState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const requestRemove = (ticker: string) => {
    if (!onRemove || !bundle) return;
    if (window.confirm(`Remove ${ticker} from ${bundle.name}?`)) onRemove(ticker);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number, ticker: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTickerSelect?.(ticker);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && onRemove) {
      event.preventDefault();
      requestRemove(ticker);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = findNextRowIndex(index, event.key === "ArrowDown" ? "next" : "previous", rows.length);
    const candidate = event.currentTarget.parentElement?.children.item(next);
    if (candidate instanceof HTMLElement) candidate.focus();
  };

  const onDrop = (event: DragEvent<HTMLTableRowElement>, targetTicker: string) => {
    event.preventDefault();
    if (!canReorder) return;
    const draggedTicker = event.dataTransfer.getData("text/plain");
    onReorder?.(reorderSymbols(rows.map((row) => row.ticker), draggedTicker, targetTicker));
  };

  const header = (column: WatchlistColumn) => (
    <th
      key={column.id}
      data-column={column.id}
      aria-sort={sortKey === column.sortKey ? sortDirection : "none"}
      style={{ width: columnWidths[column.id] }}
    >
      <button type="button" onClick={() => onSort(column.sortKey)} aria-label={`Sort watchlist by ${column.label}`}>
        {column.label}{sortKey === column.sortKey ? (sortDirection === "ascending" ? " ↑" : " ↓") : ""}
      </button>
      <span
        role="separator"
        aria-label={`Resize ${column.label} column`}
        aria-orientation="vertical"
        aria-valuemin={column.minimumWidth}
        aria-valuemax={column.maximumWidth}
        aria-valuenow={columnWidths[column.id]}
        tabIndex={0}
        title={`Resize ${column.label} column`}
        onPointerDown={(event) => onResizeStart(event, column)}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={() => setColumnWidth(column, column.width)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setColumnWidth(column, columnWidths[column.id] + (event.key === "ArrowRight" ? 10 : -10));
        }}
        style={{ position: "absolute", inset: "0 -4px 0 auto", width: 9, cursor: "col-resize", touchAction: "none", zIndex: 3 }}
      />
    </th>
  );

  return (
    <section className="stock-module stock-watchlist" aria-label={bundle ? `${bundle.name} watchlist` : "Watchlist"}>
      <header className="stock-module-header">
        <div><span>PERSONAL UNIVERSE</span><h3>{bundle?.name ?? "WATCHLIST"}</h3></div>
        <div className="stock-watchlist-meta"><strong>{bundle?.symbols.length ?? 0} SYMBOLS</strong>{onReorder ? <span>{canReorder ? "DRAG TO REORDER" : "CLEAR SORT TO REORDER"}</span> : null}</div>
        <details style={{ position: "relative" }}>
          <summary aria-label="Configure visible watchlist columns">COLUMNS {visibleColumns.length}/{WATCHLIST_COLUMNS.length}</summary>
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20, width: 240, maxHeight: 330, overflowY: "auto", padding: 8, border: "1px solid var(--line-strong)", background: "#090d12", boxShadow: "0 14px 30px rgba(0,0,0,.45)" }}>
            <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
              <button type="button" onClick={() => setVisibleColumnIds(ALL_COLUMN_IDS)}>SHOW ALL</button>
              <button type="button" onClick={() => setVisibleColumnIds(DEFAULT_WATCHLIST_COLUMNS)}>RESET</button>
            </div>
            {WATCHLIST_COLUMNS.map((column) => (
              <label key={column.id} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 25, color: "#8493a3", fontSize: 8 }}>
                <input
                  type="checkbox"
                  checked={visibleColumns.some((candidate) => candidate.id === column.id)}
                  disabled={column.id === "ticker"}
                  onChange={(event) => setColumnVisible(column.id, event.target.checked)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </details>
        <StockStatusBadge status={status} />
      </header>
      {!bundle || rows.length === 0 ? <StockEmptyState
        title={status.state === "loading" ? "LOADING WATCHLIST" : status.state === "error" ? "WATCHLIST UNAVAILABLE" : "EMPTY WATCHLIST"}
        detail={status.message ?? "Add securities to begin monitoring this list."}
      /> : (
        <div className="stock-table-wrap">
          <table className="stock-table stock-watchlist-table" style={tableStyle}>
            <caption className="stock-sr-only">Sortable, resizable, and reorderable {bundle.name} watchlist</caption>
            <colgroup>
              <col data-role="reorder" style={{ width: 34 }} />
              {visibleColumns.map((column) => <col key={column.id} data-column={column.id} style={{ width: columnWidths[column.id] }} />)}
              {onRemove ? <col data-role="actions" style={{ width: 72 }} /> : null}
            </colgroup>
            <thead><tr><th data-role="reorder"><span className="stock-sr-only">Reorder</span></th>{visibleColumns.map(header)}{onRemove ? <th data-role="actions"><span className="stock-sr-only">Actions</span></th> : null}</tr></thead>
            <tbody>{rows.map((row, index) => (
              <tr
                key={row.ticker}
                tabIndex={0}
                draggable={canReorder}
                className={selectedSymbol === row.ticker ? "is-selected" : ""}
                aria-selected={selectedSymbol === row.ticker}
                aria-label={`${row.ticker}, ${stockCurrency(row.price)}, ${stockPercent(row.changePercent)}`}
                onKeyDown={(event) => onRowKeyDown(event, index, row.ticker)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", row.ticker);
                }}
                onDragOver={(event) => {
                  if (canReorder) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => onDrop(event, row.ticker)}
              >
                <td className="stock-drag-handle" data-role="reorder" aria-hidden="true">⠿</td>
                {visibleColumns.map((column) => (
                  <td key={column.id} data-column={column.id} title={column.id === "companyName" ? row.companyName ?? undefined : undefined}>
                    {column.id === "ticker"
                      ? <button type="button" className="stock-symbol-button" onClick={() => onTickerSelect?.(row.ticker)}>{row.ticker}</button>
                      : renderCell(row, column.id, onResearchSelect)}
                  </td>
                ))}
                {onRemove ? <td data-role="actions"><button type="button" className="stock-remove-button" onClick={() => requestRemove(row.ticker)} aria-label={`Remove ${row.ticker} from ${bundle.name}`}>REMOVE</button></td> : null}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
