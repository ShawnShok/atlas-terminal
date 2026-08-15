"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Command,
  CornerDownLeft,
  LayoutDashboard,
  Search,
  Star,
  TerminalSquare,
  X,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useResearchData } from "@/hooks/useResearchData";
import type { TickerSearchResult } from "@/types";

interface CommandItem {
  id: string;
  command: string;
  title: string;
  detail: string;
  group: "SECURITIES" | "FUNCTIONS" | "WORKSPACES" | "WATCHLISTS";
  source: "ATLAS" | "MASSIVE" | "MOCK" | "PERSONAL";
  keywords: string;
}

const COMMANDS: CommandItem[] = [
  { id: "market", command: "MARKET", title: "Market pulse", detail: "Curated U.S. equity universe", group: "FUNCTIONS", source: "ATLAS", keywords: "market indices breadth movers" },
  { id: "movers", command: "MOVERS", title: "Market movers", detail: "Top Massive gainers and losers", group: "FUNCTIONS", source: "ATLAS", keywords: "gainers losers volume gaps" },
  { id: "scan", command: "SCAN", title: "Stock scanner", detail: "Configurable research scanner", group: "FUNCTIONS", source: "ATLAS", keywords: "scanner momentum breakout" },
  { id: "news", command: "NVDA NEWS", title: "Ticker news", detail: "Benzinga ticker headline feed", group: "FUNCTIONS", source: "ATLAS", keywords: "news benzinga headlines" },
  { id: "options", command: "NVDA OPT", title: "Options terminal", detail: "Chain, Greeks, and research analytics", group: "FUNCTIONS", source: "ATLAS", keywords: "options chain opt greeks" },
  { id: "events", command: "NVDA EVENTS", title: "Corporate events", detail: "TMX catalyst timeline", group: "FUNCTIONS", source: "ATLAS", keywords: "events earnings calendar tmx" },
  { id: "financials", command: "NVDA FIN", title: "Company financials", detail: "Statements, ratios, and calculated growth", group: "FUNCTIONS", source: "ATLAS", keywords: "fundamentals statements ratios" },
  { id: "earnings", command: "EARNINGS", title: "Earnings center", detail: "Upcoming reported earnings catalysts", group: "FUNCTIONS", source: "ATLAS", keywords: "earnings calendar" },
  { id: "compare", command: "COMPARE NVDA AMD AVGO", title: "Company comparison", detail: "Normalized performance and fundamentals", group: "FUNCTIONS", source: "ATLAS", keywords: "comparison relative performance" },
  { id: "research", command: "LAYOUT RESEARCH", title: "Research workspace", detail: "Three-panel research layout", group: "WORKSPACES", source: "ATLAS", keywords: "layout panels research" },
  { id: "monitor", command: "LAYOUT MONITOR", title: "Monitor workspace", detail: "Dashboard and movers layout", group: "WORKSPACES", source: "ATLAS", keywords: "layout monitor" },
  { id: "focus", command: "LAYOUT FOCUS", title: "Focus workspace", detail: "Single security context", group: "WORKSPACES", source: "ATLAS", keywords: "layout focus" },
  { id: "core", command: "WATCH", title: "CORE", detail: "Default research watchlist", group: "WATCHLISTS", source: "PERSONAL", keywords: "watchlist core" },
];

function scoreItem(item: CommandItem, query: string) {
  if (!query) return item.group === "FUNCTIONS" ? 80 : 50;
  const source = `${item.command} ${item.title} ${item.detail} ${item.keywords}`.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (item.command.toLowerCase() === needle) return 120;
  if (item.command.toLowerCase().startsWith(needle)) return 105;
  if (source.includes(needle)) return 85;
  let cursor = 0;
  for (const char of needle) {
    cursor = source.indexOf(char, cursor);
    if (cursor < 0) return -1;
    cursor += 1;
  }
  return 40 - Math.min(cursor, 30);
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onRun: (command: string) => void;
}

export function CommandPalette({ open, onClose, onRun }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 180);
  const tickerSearch = useResearchData<readonly TickerSearchResult[]>("search", { q: debouncedQuery }, { enabled: debouncedQuery.length >= 2 });
  const securityResults: readonly CommandItem[] = (tickerSearch.data ?? []).map((item) => ({
    id: `security:${item.symbol}:${item.exchange ?? "unknown"}`,
    command: item.symbol,
    title: item.symbol,
    detail: item.name,
    group: "SECURITIES",
    source: tickerSearch.meta?.mode === "mock" ? "MOCK" : tickerSearch.meta ? "MASSIVE" : "ATLAS",
    keywords: `${item.name} ${item.exchange ?? ""} ${item.assetType ?? ""}`,
  }));

  const results = useMemo(() => [...securityResults, ...COMMANDS]
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 8)
    .map((entry) => entry.item), [query, securityResults]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  const run = (command?: string) => {
    const value = (command ?? query).trim();
    if (!value) return;
    onRun(value);
    onClose();
  };

  return (
    <div className="command-overlay" role="presentation" onPointerDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="ATLAS command bar">
        <div className="command-input-row">
          <span className="command-prefix"><TerminalSquare size={16} /><b>{BRAND.shortName}</b></span>
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.toUpperCase());
              setActiveIndex(0);
            }}
            placeholder="Ticker, company, function, workspace…"
            aria-label="Enter ticker or command"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                run(results[activeIndex]?.command ?? query);
              }
            }}
          />
          <button type="button" onClick={onClose} aria-label="Close command bar"><X size={15} /></button>
        </div>

        {query && (
          <button className="run-raw-command" type="button" onClick={() => run()}>
            <span><Command size={13} /> RUN COMMAND</span>
            <strong>{query}</strong>
            <kbd><CornerDownLeft size={11} /> ENTER</kbd>
          </button>
        )}

        <div className="command-results" role="listbox" aria-label="Command suggestions">
          {results.length === 0 ? (
            <div className="command-empty"><strong>NO MATCH</strong><span>Press Enter to validate the command grammar.</span></div>
          ) : results.map((item, index) => {
            const Icon = item.group === "SECURITIES" ? Star : item.group === "WORKSPACES" ? LayoutDashboard : Command;
            return (
              <button
                key={item.id}
                className={index === activeIndex ? "command-result is-selected" : "command-result"}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => run(item.command)}
              >
                <span className="result-icon"><Icon size={15} /></span>
                <span className="result-main"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span className="result-command">{item.command}</span>
                <span className="phase-badge is-ready">{item.source}</span>
                <ArrowRight size={13} />
              </button>
            );
          })}
        </div>
        <footer className="command-footer">
          <span><kbd>↑ ↓</kbd> NAVIGATE</span><span><kbd>↵</kbd> EXECUTE</span><span><kbd>ESC</kbd> CLOSE</span>
          <strong>EXAMPLES: NVDA · TSLA CHART · AMD OPT · META FIN</strong>
        </footer>
      </section>
    </div>
  );
}
