"use client";

import type {
  MarketMovers as MarketMoversData,
  MarketSnapshotRow,
  WatchlistResearchBundle,
} from "@/types/research";
import {
  stockCompact,
  stockCurrency,
  stockPercent,
  stockTone,
} from "@/lib/stocks";
import type {
  MarketMoverSide,
  StockDataStatus,
  WatchlistRowSupplement,
  WatchlistSortKey,
} from "@/lib/stocks";
import { MarketMovers } from "./MarketMovers";
import { StockEmptyState, StockFrame } from "./StockFrame";
import { TickerSearch, type TickerSearchProps } from "./TickerSearch";
import { Watchlist } from "./Watchlist";

export interface HomeDashboardProps {
  readonly status: StockDataStatus;
  readonly marketOverview: readonly MarketSnapshotRow[];
  readonly movers: MarketMoversData | null;
  readonly moverSide: MarketMoverSide;
  readonly watchlist: WatchlistResearchBundle | null;
  readonly watchlistSupplements?: Readonly<Record<string, WatchlistRowSupplement>>;
  readonly watchlistSortKey: WatchlistSortKey | null;
  readonly watchlistSortDirection: "ascending" | "descending";
  readonly recentlyViewed: readonly string[];
  readonly search?: TickerSearchProps;
  readonly onMoverSideChange: (side: MarketMoverSide) => void;
  readonly onWatchlistSort: (key: WatchlistSortKey) => void;
  readonly onWatchlistReorder?: (symbols: readonly string[]) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function HomeDashboard(props: HomeDashboardProps) {
  return (
    <StockFrame
      title="MARKET COMMAND"
      eyebrow="HOME DASHBOARD"
      status={props.status}
      className="stock-home-dashboard"
      actions={props.search ? <TickerSearch {...props.search} /> : undefined}
    >
      <section className="stock-market-overview" aria-label="Market overview">
        <header><span>SESSION PULSE</span><h3>MARKET OVERVIEW</h3></header>
        {props.marketOverview.length === 0 ? <StockEmptyState title="NO MARKET SNAPSHOTS" detail="No overview instruments were supplied." /> : (
          <div>{props.marketOverview.map((row) => (
            <button type="button" key={row.symbol} onClick={() => props.onTickerSelect?.(row.symbol)}>
              <span>{row.symbol}</span><strong>{stockCurrency(row.lastPrice)}</strong><em className={stockTone(row.changePercent)}>{stockPercent(row.changePercent)}</em><small>VOL {stockCompact(row.volume)}</small>
            </button>
          ))}</div>
        )}
      </section>
      <div className="stock-home-grid">
        <MarketMovers status={props.status} movers={props.movers} activeSide={props.moverSide} maxRows={8} onSideChange={props.onMoverSideChange} onTickerSelect={props.onTickerSelect} />
        <section className="stock-module stock-recent-securities" aria-label="Recently viewed securities">
          <header className="stock-module-header"><div><span>SESSION HISTORY</span><h3>RECENTLY VIEWED</h3></div></header>
          {props.recentlyViewed.length === 0 ? <StockEmptyState title="NO RECENT SECURITIES" detail="Opened equities will appear here." /> : (
            <div>{props.recentlyViewed.map((symbol) => (
              <button type="button" key={symbol} onClick={() => props.onTickerSelect?.(symbol)}>
                <strong>{symbol}</strong><span>Opened research context</span><small>THIS SESSION</small>
              </button>
            ))}</div>
          )}
        </section>
      </div>
      <Watchlist
        status={props.status}
        bundle={props.watchlist}
        supplements={props.watchlistSupplements}
        sortKey={props.watchlistSortKey}
        sortDirection={props.watchlistSortDirection}
        selectedSymbol={null}
        onSort={props.onWatchlistSort}
        onTickerSelect={props.onTickerSelect}
        onReorder={props.onWatchlistReorder}
      />
    </StockFrame>
  );
}
