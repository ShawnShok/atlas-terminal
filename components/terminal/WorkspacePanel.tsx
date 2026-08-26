"use client";

import { useState } from "react";
import {
  Columns2,
  Expand,
  Minimize2,
  Rows2,
  X,
} from "lucide-react";
import type { PanelResearchScope, PanelView, WorkspaceCommandTarget, WorkspacePanel as PanelModel } from "@/lib/workspace/model";
import { PanelContent } from "./PanelContent";

interface WorkspacePanelProps {
  panel: PanelModel;
  active: boolean;
  maximized: boolean;
  hiddenByMaximize: boolean;
  canClose: boolean;
  activity: string[];
  recentTickers: readonly string[];
  comparisonSymbols?: readonly string[];
  commandTarget?: WorkspaceCommandTarget | null;
  researchScope: PanelResearchScope;
  onActivate: () => void;
  onClose: () => void;
  onMaximize: () => void;
  onSplit: (direction: "horizontal" | "vertical") => void;
  onTickerChange: (ticker: string) => void;
  onViewChange: (view: PanelView) => void;
}

const VIEW_LABELS: Record<PanelView, string> = {
  dashboard: "Home dashboard",
  security: "Security",
  chart: "Chart",
  financials: "Financials",
  market: "Market pulse",
  movers: "Market movers",
  watchlist: "Watchlist",
  news: "News",
  events: "Events",
  earnings: "Earnings",
  options: "Options",
  "options-surface": "IV surface",
  scanner: "Scanner",
  "saved-screens": "Saved screens",
  portfolio: "Portfolio",
  analytics: "Analytics",
  timeline: "Ticker timeline",
  alerts: "Alerts",
  notes: "Notes",
  settings: "Settings",
  activity: "Activity",
  system: "System",
  shortcuts: "Shortcuts",
};

export function WorkspacePanel({
  panel,
  active,
  maximized,
  hiddenByMaximize,
  canClose,
  activity,
  recentTickers,
  comparisonSymbols,
  commandTarget,
  researchScope,
  onActivate,
  onClose,
  onMaximize,
  onSplit,
  onTickerChange,
  onViewChange,
}: WorkspacePanelProps) {
  const [tickerDraft, setTickerDraft] = useState<string | null>(null);
  const commitTicker = () => {
    const normalized = (tickerDraft ?? panel.ticker).trim().toUpperCase();
    if (/^[A-Z][A-Z0-9.-]{0,14}$/.test(normalized)) onTickerChange(normalized);
    setTickerDraft(null);
  };
  return (
    <section
      className={`workspace-panel${active ? " is-active" : ""}${hiddenByMaximize ? " is-maximized-hidden" : ""}`}
      aria-hidden={hiddenByMaximize ? true : undefined}
      onPointerDown={onActivate}
    >
      <header className="panel-header">
        <span className="panel-index">{panel.id.slice(-2).toUpperCase()}</span>
        <input
          className="panel-ticker-input"
          value={tickerDraft ?? panel.ticker}
          aria-label="Panel ticker"
          maxLength={15}
          onChange={(event) => setTickerDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))}
          onBlur={commitTicker}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setTickerDraft(null);
              event.currentTarget.blur();
            }
          }}
          onFocus={(event) => {
            setTickerDraft(panel.ticker);
            event.currentTarget.select();
          }}
        />
        <select
          className="panel-view-select"
          value={panel.view}
          aria-label="Panel view"
          onChange={(event) => onViewChange(event.target.value as PanelView)}
        >
          {Object.entries(VIEW_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <span className="panel-freshness"><i /> SESSION</span>
        <div className="panel-actions">
          <button type="button" title="Split side by side" aria-label="Split panel horizontally" onClick={() => onSplit("horizontal")}><Columns2 size={13} /></button>
          <button type="button" title="Split top and bottom" aria-label="Split panel vertically" onClick={() => onSplit("vertical")}><Rows2 size={13} /></button>
          <button type="button" title={maximized ? "Restore panel" : "Maximize panel"} aria-label={maximized ? "Restore panel" : "Maximize panel"} onClick={onMaximize}>{maximized ? <Minimize2 size={13} /> : <Expand size={13} />}</button>
          <button type="button" title="Close panel" aria-label="Close panel" disabled={!canClose} onClick={onClose}><X size={14} /></button>
        </div>
      </header>
      <div className="panel-body">
        <PanelContent
          view={panel.view}
          ticker={panel.ticker || "—"}
          activity={activity}
          recentTickers={recentTickers}
          comparisonSymbols={comparisonSymbols}
          commandTarget={commandTarget}
          researchScope={researchScope}
          onTickerChange={onTickerChange}
          onViewChange={onViewChange}
        />
      </div>
    </section>
  );
}
