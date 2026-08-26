"use client";

import { ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { PanelView, WorkspaceCommandTarget } from "@/lib/workspace/model";

import { LiveAnalyticsPanel } from "./LiveAnalyticsPanel";
import { LiveEventsPanel } from "./LiveEventsPanel";
import { LiveFinancialsPanel } from "./LiveFinancialsPanel";
import { LiveNewsPanel } from "./LiveNewsPanel";
import { LiveOptionsPanel } from "./LiveOptionsPanel";
import { LiveScannerPanel, type ScannerNavigationContext, type ScannerSimilarSeed } from "./LiveScannerPanel";
import {
  LiveDashboardPanel,
  LiveMarketPanel,
  LiveMoversPanel,
  LiveStockPanel,
  LiveWatchlistPanel,
} from "./LiveStockPanels";
import { PersonalResearchPanel } from "./PersonalResearchPanel";
import {
  TickerResearchNav,
  TICKER_RESEARCH_VIEWS,
  type WatchlistResearchTarget,
} from "@/components/stocks";

interface PanelContentProps {
  readonly view: PanelView;
  readonly ticker: string;
  readonly activity: readonly string[];
  readonly recentTickers: readonly string[];
  readonly comparisonSymbols?: readonly string[];
  readonly commandTarget?: WorkspaceCommandTarget | null;
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
  commandTarget,
  onTickerChange,
  onViewChange,
}: PanelContentProps) {
  const [scannerContext, setScannerContext] = useState<ScannerNavigationContext | null>(null);
  const [similarSeed, setSimilarSeed] = useState<ScannerSimilarSeed | null>(null);
  const [watchlistResearch, setWatchlistResearch] = useState<{
    readonly ticker: string;
    readonly target: WatchlistResearchTarget;
  } | null>(null);
  const openSecurity = (symbol: string) => {
    onTickerChange(symbol);
    onViewChange("security");
  };

  const findSimilar = (symbol: string) => {
    setScannerContext(null);
    setSimilarSeed((current) => ({ ticker: symbol, sequence: (current?.sequence ?? 0) + 1 }));
    onTickerChange(symbol);
    onViewChange("scanner");
  };

  const openWatchlistResearch = (symbol: string, target: WatchlistResearchTarget) => {
    setScannerContext(null);
    setWatchlistResearch({ ticker: symbol, target });
    onTickerChange(symbol);
    onViewChange(target.view);
  };

  const activeWatchlistResearch = watchlistResearch?.ticker === ticker
    ? watchlistResearch.target
    : null;

  let content: ReactNode;
  switch (view) {
    case "dashboard":
      content = <LiveDashboardPanel recentTickers={recentTickers} onTickerSelect={openSecurity} />;
      break;
    case "security":
      content = <LiveStockPanel ticker={ticker} view="overview" onTickerSelect={onTickerChange} onFindSimilar={findSimilar} />;
      break;
    case "chart":
      content = <LiveStockPanel ticker={ticker} view="chart" onTickerSelect={onTickerChange} />;
      break;
    case "financials":
      content = <LiveFinancialsPanel ticker={ticker} />;
      break;
    case "market":
      content = <LiveMarketPanel onTickerSelect={openSecurity} />;
      break;
    case "movers":
      content = <LiveMoversPanel onTickerSelect={openSecurity} />;
      break;
    case "watchlist":
      content = <LiveWatchlistPanel commandTarget={commandTarget} onTickerSelect={openSecurity} onResearchSelect={openWatchlistResearch} />;
      break;
    case "news":
      content = <LiveNewsPanel ticker={ticker} initialArticleId={activeWatchlistResearch?.view === "news" ? activeWatchlistResearch.itemId : null} onTickerSelect={openSecurity} />;
      break;
    case "events":
      content = <LiveEventsPanel
        ticker={ticker}
        initialEventId={activeWatchlistResearch?.view === "events" ? activeWatchlistResearch.itemId : null}
        initialEventStartsAt={activeWatchlistResearch?.view === "events" ? activeWatchlistResearch.startsAt : null}
        onTickerSelect={openSecurity}
      />;
      break;
    case "earnings":
      content = <LiveEventsPanel ticker={ticker} earningsOnly onTickerSelect={openSecurity} />;
      break;
    case "options":
      content = <LiveOptionsPanel ticker={ticker} />;
      break;
    case "scanner":
      content = <LiveScannerPanel
        ticker={ticker}
        similarSeed={similarSeed}
        commandTarget={commandTarget}
        onTickerSelect={(symbol, context) => {
          setScannerContext(context);
          openSecurity(symbol);
        }}
        onResearchSelect={(symbol, nextView) => {
          setWatchlistResearch(null);
          onTickerChange(symbol);
          onViewChange(nextView);
        }}
      />;
      break;
    case "analytics":
      content = <LiveAnalyticsPanel ticker={comparisonSymbols?.[0] ?? ticker} comparisonSymbols={comparisonSymbols} initialView={comparisonSymbols?.length ? "comparison" : "heatmap"} onTickerSelect={openSecurity} />;
      break;
    case "timeline":
      content = <LiveAnalyticsPanel ticker={ticker} initialView="catalysts" onTickerSelect={openSecurity} />;
      break;
    case "alerts":
      content = <PersonalResearchPanel key={`alerts:${ticker}`} view="alerts" ticker={ticker} />;
      break;
    case "notes":
      content = <PersonalResearchPanel key={`notes:${ticker}`} view="notes" ticker={ticker} />;
      break;
    case "settings":
      content = <PersonalResearchPanel view="settings" ticker={ticker} />;
      break;
    case "system":
      content = <PersonalResearchPanel view="system" ticker={ticker} />;
      break;
    case "activity":
      content = <Activity activity={activity} />;
      break;
    case "shortcuts":
      content = <Shortcuts />;
      break;
    default:
      content = <LiveStockPanel ticker={ticker} view="overview" onTickerSelect={onTickerChange} />;
  }

  if (!TICKER_RESEARCH_VIEWS.has(view)) return content;
  return (
    <div className="ticker-research-surface">
      <TickerResearchNav ticker={ticker} activeView={view} onViewChange={onViewChange} />
      <div className="ticker-research-content">
        <div className="ticker-research-stack">
          {scannerContext?.ticker === ticker ? (
            <aside className="ticker-scanner-context" aria-label="Preserved scanner qualification context">
              <div>
                <span>OPENED FROM {scannerContext.scanName.toUpperCase()}</span>
                <strong>{scannerContext.researchPriority === null ? "RESEARCH PRIORITY UNAVAILABLE" : `RESEARCH PRIORITY ${scannerContext.researchPriority}/100`}</strong>
              </div>
              <details>
                <summary>{scannerContext.reasons.length} QUALIFICATION REASONS</summary>
                <ul>{scannerContext.reasons.map((reason, index) => <li key={`${ticker}-scanner-reason-${index}`}>{reason}</li>)}</ul>
              </details>
              <button type="button" onClick={() => onViewChange("scanner")}>RETURN TO SCANNER</button>
            </aside>
          ) : null}
          <div className="ticker-research-panel-content">{content}</div>
        </div>
      </div>
    </div>
  );
}
