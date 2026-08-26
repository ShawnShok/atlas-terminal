"use client";

import {
  BookmarkCheck,
  BriefcaseBusiness,
  CircleDollarSign,
  ListFilter,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { useSavedScanners } from "@/hooks/useSavedScanners";
import { formatDateTime } from "@/lib/research";
import type { PanelView } from "@/lib/workspace/model";

export function PortfolioPanel({
  ticker,
  onViewChange,
}: {
  readonly ticker: string;
  readonly onViewChange: (view: PanelView) => void;
}) {
  return (
    <section className="utility-workspace portfolio-workspace" aria-labelledby="portfolio-title">
      <header>
        <div><span>PRIVATE RESEARCH</span><h2 id="portfolio-title">PORTFOLIO</h2></div>
        <BriefcaseBusiness size={20} aria-hidden="true" />
      </header>
      <div className="portfolio-empty-state">
        <BriefcaseBusiness size={30} aria-hidden="true" />
        <strong>NO PORTFOLIO SOURCE CONNECTED</strong>
        <p>ATLAS will not invent holdings, cost basis, market value, or profit and loss. Connect a portfolio source in a future integration to populate this workspace.</p>
      </div>
      <div className="portfolio-metric-grid" aria-label="Portfolio metric availability">
        {["MARKET VALUE", "DAY P&L", "TOTAL RETURN", "CASH", "EXPOSURE", "POSITIONS"].map((label) => (
          <div key={label}><span>{label}</span><strong>UNAVAILABLE</strong><small>NO SOURCE</small></div>
        ))}
      </div>
      <footer className="utility-actions">
        <button type="button" onClick={() => onViewChange("watchlist")}><Search size={12} /> OPEN WATCHLIST</button>
        <button type="button" onClick={() => onViewChange("security")}><ListFilter size={12} /> RESEARCH {ticker}</button>
        <button type="button" onClick={() => onViewChange("options")}><CircleDollarSign size={12} /> OPEN OPTIONS</button>
      </footer>
    </section>
  );
}

export function SavedScreensPanel({
  onOpenScanner,
  onCreateScanner,
}: {
  readonly onOpenScanner: (scannerId: string) => void;
  readonly onCreateScanner: () => void;
}) {
  const saved = useSavedScanners();
  const persistenceLabel = saved.persistenceState === "durable"
    ? "POSTGRESQL"
    : saved.persistenceState === "session"
      ? "THIS SESSION"
      : saved.persistenceState === "checking"
        ? "CHECKING"
        : "UNAVAILABLE";

  return (
    <section className="utility-workspace saved-screens-workspace" aria-labelledby="saved-screens-title">
      <header>
        <div><span>SCANNER LIBRARY</span><h2 id="saved-screens-title">SAVED SCREENS</h2></div>
        <div className="utility-header-status"><strong>{saved.records.length}</strong><span>SAVED · {persistenceLabel}</span></div>
      </header>
      <div className="saved-screens-toolbar">
        <p>Open a saved screen directly in the live cross-dataset scanner.</p>
        <button type="button" onClick={() => void saved.reload()} disabled={saved.busy}><RefreshCw size={12} /> REFRESH</button>
        <button type="button" onClick={onCreateScanner}><ListFilter size={12} /> CREATE SCREEN</button>
      </div>
      {saved.message ? <p className="utility-message" role={saved.error ? "alert" : "status"}>{saved.message}</p> : null}
      {saved.persistenceState === "checking" ? (
        <div className="utility-loading"><span className="data-spinner" /> LOADING SAVED SCREENS…</div>
      ) : saved.records.length === 0 ? (
        <div className="saved-screens-empty">
          <BookmarkCheck size={28} aria-hidden="true" />
          <strong>NO SAVED SCREENS YET</strong>
          <p>Build filters in Scanner, name the screen, and choose Save Preset. It will appear here immediately.</p>
          <button type="button" onClick={onCreateScanner}>OPEN SCANNER</button>
        </div>
      ) : (
        <div className="saved-screen-list">
          {saved.records.map((record) => (
            <article key={record.id}>
              <button type="button" className="saved-screen-open" onClick={() => onOpenScanner(record.id)}>
                <span><BookmarkCheck size={14} aria-hidden="true" /></span>
                <div>
                  <strong>{record.name}</strong>
                  <p>{record.description ?? "Saved custom research screen."}</p>
                  <small>{record.definition.conditions.length} FILTER{record.definition.conditions.length === 1 ? "" : "S"}{record.updatedAt ? ` · UPDATED ${formatDateTime(record.updatedAt)}` : ""}</small>
                </div>
                <em>OPEN IN SCANNER</em>
              </button>
              <button
                type="button"
                className="saved-screen-delete"
                disabled={saved.busy}
                onClick={() => void saved.remove(record.id)}
                aria-label={`Delete ${record.name}`}
                title={`Delete ${record.name}`}
              ><Trash2 size={13} /></button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
