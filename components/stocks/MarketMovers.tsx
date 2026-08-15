"use client";

import type { MarketMovers as MarketMoversData, MarketSnapshotRow } from "@/types/research";
import {
  stockCompact,
  stockCurrency,
  stockDateTime,
  stockPercent,
  stockTone,
} from "@/lib/stocks";
import type { MarketMoverSide, StockDataStatus } from "@/lib/stocks";
import { StockEmptyState, StockStatusBadge } from "./StockFrame";

export interface MarketMoversProps {
  readonly status: StockDataStatus;
  readonly movers: MarketMoversData | null;
  readonly activeSide: MarketMoverSide;
  readonly maxRows?: number;
  readonly onSideChange: (side: MarketMoverSide) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function MarketMovers({
  status,
  movers,
  activeSide,
  maxRows,
  onSideChange,
  onTickerSelect,
}: MarketMoversProps) {
  const rows: readonly MarketSnapshotRow[] = movers?.[activeSide] ?? [];
  const visibleRows = maxRows === undefined ? rows : rows.slice(0, maxRows);
  return (
    <section className="stock-module stock-market-movers" aria-label="Market movers">
      <header className="stock-module-header">
        <div><span>U.S. EQUITIES</span><h3>MARKET MOVERS</h3></div>
        <div className="stock-segmented" role="group" aria-label="Mover direction">
          <button type="button" className={activeSide === "gainers" ? "is-active gainers" : ""} aria-pressed={activeSide === "gainers"} onClick={() => onSideChange("gainers")}>GAINERS</button>
          <button type="button" className={activeSide === "losers" ? "is-active losers" : ""} aria-pressed={activeSide === "losers"} onClick={() => onSideChange("losers")}>LOSERS</button>
        </div>
        <StockStatusBadge status={status} />
      </header>
      {visibleRows.length === 0 ? <StockEmptyState title="NO MOVERS" detail={status.message ?? "No market mover rows were supplied."} /> : (
        <div className="stock-table-wrap">
          <table className="stock-table stock-movers-table">
            <caption className="stock-sr-only">Top market {activeSide}</caption>
            <thead><tr><th>RANK</th><th>SYMBOL</th><th>LAST</th><th>CHANGE</th><th>% CHANGE</th><th>VOLUME</th><th>HIGH / LOW</th><th>AS OF</th></tr></thead>
            <tbody>{visibleRows.map((row, index) => {
              const tone = stockTone(row.changePercent);
              return (
                <tr key={row.symbol} tabIndex={0} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onTickerSelect?.(row.symbol);
                  }
                }}>
                  <td>{String(index + 1).padStart(2, "0")}</td>
                  <td><button type="button" className="stock-symbol-button" onClick={() => onTickerSelect?.(row.symbol)}>{row.symbol}</button></td>
                  <td>{stockCurrency(row.lastPrice)}</td>
                  <td className={tone}>{stockCurrency(row.change)}</td>
                  <td className={tone}><strong>{stockPercent(row.changePercent)}</strong></td>
                  <td>{stockCompact(row.volume)}</td>
                  <td>{stockCurrency(row.high)} / {stockCurrency(row.low)}</td>
                  <td><time dateTime={row.asOf}>{stockDateTime(row.asOf)}</time><small>{row.quality}</small></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

