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

interface CommandItem {
  id: string;
  command: string;
  title: string;
  detail: string;
  group: "SECURITIES" | "FUNCTIONS" | "WORKSPACES" | "WATCHLISTS";
  phase: number;
  keywords: string;
}

const COMMANDS: CommandItem[] = [
  { id: "nvda", command: "NVDA", title: "NVDA", detail: "NVIDIA Corporation", group: "SECURITIES", phase: 2, keywords: "nvidia ai semis stock" },
  { id: "aapl", command: "AAPL", title: "AAPL", detail: "Apple Inc.", group: "SECURITIES", phase: 2, keywords: "apple stock" },
  { id: "tsla", command: "TSLA", title: "TSLA", detail: "Tesla, Inc.", group: "SECURITIES", phase: 2, keywords: "tesla automotive stock" },
  { id: "amd", command: "AMD", title: "AMD", detail: "Advanced Micro Devices", group: "SECURITIES", phase: 2, keywords: "semiconductors stock" },
  { id: "market", command: "MARKET", title: "Market pulse", detail: "Open the Phase 1 mock market monitor", group: "FUNCTIONS", phase: 1, keywords: "market indices breadth movers" },
  { id: "scan", command: "SCAN", title: "Stock scanner", detail: "Configurable research scanner", group: "FUNCTIONS", phase: 6, keywords: "scanner momentum breakout" },
  { id: "news", command: "NVDA NEWS", title: "Ticker news", detail: "Benzinga ticker headline feed", group: "FUNCTIONS", phase: 3, keywords: "news benzinga headlines" },
  { id: "options", command: "NVDA OPT", title: "Options terminal", detail: "Chain, Greeks, and research analytics", group: "FUNCTIONS", phase: 5, keywords: "options chain opt greeks" },
  { id: "events", command: "NVDA EVENTS", title: "Corporate events", detail: "TMX catalyst timeline", group: "FUNCTIONS", phase: 4, keywords: "events earnings calendar tmx" },
  { id: "research", command: "LAYOUT RESEARCH", title: "Research workspace", detail: "Three-panel default layout", group: "WORKSPACES", phase: 1, keywords: "layout panels research" },
  { id: "monitor", command: "LAYOUT MONITOR", title: "Monitor workspace", detail: "Market and activity layout", group: "WORKSPACES", phase: 1, keywords: "layout monitor" },
  { id: "focus", command: "LAYOUT FOCUS", title: "Focus workspace", detail: "Single security context", group: "WORKSPACES", phase: 1, keywords: "layout focus" },
  { id: "core", command: "WATCH", title: "CORE", detail: "Example personal watchlist · not created", group: "WATCHLISTS", phase: 2, keywords: "watchlist core" },
];

function scoreItem(item: CommandItem, query: string) {
  if (!query) return item.phase === 1 ? 80 : 40;
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

  const results = useMemo(() => COMMANDS
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 8)
    .map((entry) => entry.item), [query]);

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
                run(query || results[activeIndex]?.command);
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
                <span className={item.phase === 1 ? "phase-badge is-ready" : "phase-badge"}>{item.phase === 1 ? "READY" : `P${item.phase}`}</span>
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
