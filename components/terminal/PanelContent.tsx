"use client";

import { ArrowUpRight } from "lucide-react";

import type { PanelView } from "@/lib/workspace/model";

import { LiveAnalyticsPanel } from "./LiveAnalyticsPanel";
import { LiveEventsPanel } from "./LiveEventsPanel";
import { LiveFinancialsPanel } from "./LiveFinancialsPanel";
import { LiveNewsPanel } from "./LiveNewsPanel";
import { LiveOptionsPanel } from "./LiveOptionsPanel";
import { LiveScannerPanel } from "./LiveScannerPanel";
import {
  LiveDashboardPanel,
  LiveMarketPanel,
  LiveMoversPanel,
  LiveStockPanel,
  LiveWatchlistPanel,
} from "./LiveStockPanels";
import { PersonalResearchPanel } from "./PersonalResearchPanel";

interface PanelContentProps {
  readonly view: PanelView;
  readonly ticker: string;
  readonly activity: readonly string[];
  readonly recentTickers: readonly string[];
  readonly comparisonSymbols?: readonly string[];
  readonly onTickerChange: (ticker: string) => void;
  readonly onViewChange: (view: PanelView) => void;
}

function Activity({ activity }: { activity: readonly string[] }) {
  const rows = activity.length ? activity : ["ATLAS session initialized", "Provider boundary ready", "Research modules indexed"];
  return (
    <div className="table-panel">
      <div className="panel-subbar"><span>LOCAL SESSION LOG</span><span>{rows.length} ENTRIES</span></div>
      <div className="dense-table activity-table" role="table" aria-label="Local session activity">
        <div className="dense-row dense-head" role="row"><span role="columnheader">ORDER</span><span role="columnheader">EVENT</span><span role="columnheader">SCOPE</span></div>
        {rows.map((event, index) => <div className="dense-row" role="row" key={`${event}-${index}`}><span role="cell">{String(index + 1).padStart(2, "0")}</span><strong role="cell">{event}</strong><span role="cell">THIS SESSION</span></div>)}
      </div>
    </div>
  );
}

function Shortcuts() {
  const shortcuts = [
    ["⌘ / Ctrl + K", "Open command bar"],
    ["/", "Focus command bar"],
    ["Esc", "Close active overlay"],
    ["M", "Markets"],
    ["N", "News"],
    ["S", "Scanner"],
    ["W", "Watchlist"],
    ["E", "Events"],
    ["O", "Options"],
    ["?", "Show this reference"],
  ] as const;
  return <div className="shortcut-grid"><div className="shortcut-intro"><span>KEYBOARD MAP</span><strong>Move through research without leaving the keys.</strong><p>Single-key shortcuts pause while focus is inside a form field.</p></div>{shortcuts.map(([key, action]) => <div className="shortcut-row" key={key}><kbd>{key}</kbd><span>{action}</span><ArrowUpRight size={12} /></div>)}</div>;
}

export function PanelContent({
  view,
  ticker,
  activity,
  recentTickers,
  comparisonSymbols,
  onTickerChange,
  onViewChange,
}: PanelContentProps) {
  const openSecurity = (symbol: string) => {
    onTickerChange(symbol);
    onViewChange("security");
  };

  switch (view) {
    case "dashboard":
      return <LiveDashboardPanel recentTickers={recentTickers} onTickerSelect={openSecurity} />;
    case "security":
      return <LiveStockPanel ticker={ticker} view="overview" onTickerSelect={onTickerChange} onViewChange={(next) => onViewChange(next === "chart" ? "chart" : "security")} />;
    case "chart":
      return <LiveStockPanel ticker={ticker} view="chart" onTickerSelect={onTickerChange} onViewChange={(next) => onViewChange(next === "chart" ? "chart" : "security")} />;
    case "financials":
      return <LiveFinancialsPanel ticker={ticker} />;
    case "market":
      return <LiveMarketPanel onTickerSelect={openSecurity} />;
    case "movers":
      return <LiveMoversPanel onTickerSelect={openSecurity} />;
    case "watchlist":
      return <LiveWatchlistPanel onTickerSelect={openSecurity} />;
    case "news":
      return <LiveNewsPanel ticker={ticker} onTickerSelect={openSecurity} />;
    case "events":
      return <LiveEventsPanel ticker={ticker} onTickerSelect={openSecurity} />;
    case "earnings":
      return <LiveEventsPanel ticker={ticker} earningsOnly onTickerSelect={openSecurity} />;
    case "options":
      return <LiveOptionsPanel ticker={ticker} />;
    case "scanner":
      return <LiveScannerPanel ticker={ticker} onTickerSelect={openSecurity} />;
    case "analytics":
      return <LiveAnalyticsPanel ticker={comparisonSymbols?.[0] ?? ticker} comparisonSymbols={comparisonSymbols} initialView={comparisonSymbols?.length ? "comparison" : "heatmap"} onTickerSelect={openSecurity} />;
    case "alerts":
      return <PersonalResearchPanel key={`alerts:${ticker}`} view="alerts" ticker={ticker} />;
    case "notes":
      return <PersonalResearchPanel key={`notes:${ticker}`} view="notes" ticker={ticker} />;
    case "settings":
      return <PersonalResearchPanel view="settings" ticker={ticker} />;
    case "system":
      return <PersonalResearchPanel view="system" ticker={ticker} />;
    case "activity":
      return <Activity activity={activity} />;
    case "shortcuts":
      return <Shortcuts />;
    default:
      return <LiveStockPanel ticker={ticker} view="overview" onTickerSelect={onTickerChange} onViewChange={(next) => onViewChange(next === "chart" ? "chart" : "security")} />;
  }
}
