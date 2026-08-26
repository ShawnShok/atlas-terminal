"use client";

import type { PanelView } from "@/lib/workspace/model";

export const TICKER_RESEARCH_TABS = [
  { label: "OVERVIEW", view: "security" },
  { label: "CHART", view: "chart" },
  { label: "NEWS", view: "news" },
  { label: "EVENTS", view: "events" },
  { label: "FINANCIALS", view: "financials" },
  { label: "OPTIONS", view: "options" },
  { label: "TIMELINE", view: "timeline" },
  { label: "NOTES", view: "notes" },
] as const satisfies readonly { readonly label: string; readonly view: PanelView }[];

export const TICKER_RESEARCH_VIEWS = new Set<PanelView>([
  ...TICKER_RESEARCH_TABS.map((tab) => tab.view),
  "options-surface",
]);

export function TickerResearchNav({
  ticker,
  activeView,
  onViewChange,
}: {
  readonly ticker: string;
  readonly activeView: PanelView;
  readonly onViewChange: (view: PanelView) => void;
}) {
  return (
    <nav className="ticker-research-nav" aria-label={`${ticker} research sections`}>
      <strong>{ticker}</strong>
      <div>
        {TICKER_RESEARCH_TABS.map((tab) => {
          const active = activeView === tab.view || (activeView === "options-surface" && tab.view === "options");
          return (
          <button
            type="button"
            key={tab.view}
            className={active ? "is-active" : ""}
            aria-current={active ? "page" : undefined}
            onClick={() => onViewChange(tab.view)}
          >
            {tab.label}
          </button>
          );
        })}
      </div>
    </nav>
  );
}
