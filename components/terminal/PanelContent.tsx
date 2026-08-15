"use client";

import { ArrowUpRight, CheckCircle2, CircleDot, Database, ServerCog } from "lucide-react";
import type { PanelView } from "@/lib/workspace/model";
import { FOUNDATION_EVENTS, MOCK_MARKET_ROWS } from "./terminal-data";

interface PanelContentProps {
  view: PanelView;
  ticker: string;
  activity: string[];
}

const phaseItems = [
  ["Quote header + chart", "Phase 2"],
  ["Ticker news + filters", "Phase 3"],
  ["Corporate catalyst timeline", "Phase 4"],
  ["Options chain + Greeks", "Phase 5"],
] as const;

function SecurityFoundation({ ticker }: { ticker: string }) {
  return (
    <div className="security-foundation">
      <div className="security-kicker">
        <span className="mock-pill">MOCK MODE</span>
        <span>SECURITY CONTEXT</span>
      </div>
      <div className="security-heading">
        <div>
          <strong>{ticker}</strong>
          <span>Security workspace foundation</span>
        </div>
        <div className="phase-marker">
          <small>IMPLEMENTATION</small>
          <b>PHASE 01 / 08</b>
        </div>
      </div>

      <div className="foundation-grid">
        <section className="foundation-card">
          <div className="foundation-card-title">
            <ServerCog size={15} aria-hidden="true" />
            <span>Runtime boundary</span>
            <em>READY</em>
          </div>
          <p>Private market credentials remain in server-only modules. The browser receives normalized data, never provider secrets.</p>
          <div className="flow-line" aria-label="Data flow">
            <span>COMMAND</span><b>→</b><span>SERVICE</span><b>→</b><span>PROVIDER</span><b>→</b><span>CACHE</span>
          </div>
        </section>
        <section className="foundation-card">
          <div className="foundation-card-title">
            <Database size={15} aria-hidden="true" />
            <span>Research persistence</span>
            <em>SCHEMA READY</em>
          </div>
          <p>PostgreSQL models cover settings, watchlists, scanners, alerts, workspaces, security metadata, and private notes.</p>
          <div className="metric-pair">
            <span><small>MODELS</small><strong>8</strong></span>
            <span><small>STORE</small><strong>POSTGRES</strong></span>
          </div>
        </section>
      </div>

      <div className="phase-table" role="table" aria-label="Future implementation phases">
        <div className="phase-table-head" role="row">
          <span role="columnheader">MODULE</span>
          <span role="columnheader">STATUS</span>
          <span role="columnheader">ROADMAP</span>
        </div>
        {phaseItems.map(([module, phase]) => (
          <div className="phase-table-row" role="row" key={module}>
            <span role="cell"><CircleDot size={10} aria-hidden="true" /> {module}</span>
            <span role="cell">NOT ENABLED</span>
            <strong role="cell">{phase}</strong>
          </div>
        ))}
      </div>
      <p className="research-disclaimer">No live prices are shown in this Phase 1 build. Mock values are labeled throughout and are not investment recommendations.</p>
    </div>
  );
}

function MarketPulse() {
  return (
    <div className="table-panel">
      <div className="panel-subbar">
        <span><span className="status-dot status-dot-blue" /> DEVELOPMENT FIXTURE</span>
        <span>AS OF 09:42:12 ET</span>
      </div>
      <div className="dense-table market-table" role="table" aria-label="Mock market pulse">
        <div className="dense-row dense-head" role="row">
          <span role="columnheader">INDEX</span>
          <span role="columnheader">LAST</span>
          <span role="columnheader">MOVE</span>
          <span role="columnheader">CHG%</span>
          <span role="columnheader">ADV / DEC</span>
        </div>
        {MOCK_MARKET_ROWS.map((row) => {
          const positive = row.pct.startsWith("+");
          return (
            <div className="dense-row" role="row" key={row.symbol}>
              <strong role="cell">{row.symbol}</strong>
              <span role="cell">{row.last}</span>
              <span className={positive ? "positive" : "negative"} role="cell">{row.move}</span>
              <span className={positive ? "positive" : "negative"} role="cell">{row.pct}</span>
              <span role="cell">{row.breadth}</span>
            </div>
          );
        })}
      </div>
      <div className="mock-callout">
        <strong>MOCK DATA</strong>
        <span>Connect MASSIVE_API_KEY and set USE_MOCK_DATA=false to enable the provider path in a compatible server runtime.</span>
      </div>
    </div>
  );
}

function SystemStatus() {
  const rows = [
    ["Application shell", "ONLINE", "Client workspace"],
    ["Command grammar", "READY", "12 intents indexed"],
    ["Massive adapter", "STANDBY", "Mock selected"],
    ["PostgreSQL", "UNCONFIGURED", "DATABASE_URL required"],
    ["Distributed cache", "OPTIONAL", "Memory adapter active"],
  ] as const;

  return (
    <div className="system-status">
      <div className="system-score">
        <div>
          <small>FOUNDATION HEALTH</small>
          <strong>04 / 05</strong>
        </div>
        <span><CheckCircle2 size={16} /> BUILD READY</span>
      </div>
      <div className="system-list">
        {rows.map(([label, state, detail]) => (
          <div key={label}>
            <span><span className={state === "UNCONFIGURED" ? "status-dot status-dot-amber" : "status-dot status-dot-green"} /> {label}</span>
            <strong>{state}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="safe-note">
        <strong>PRIVATE BY DEFAULT</strong>
        <p>There are no trade controls, external note syncs, or client-side API credentials.</p>
      </div>
    </div>
  );
}

function Activity({ activity }: { activity: string[] }) {
  const rows = activity.length
    ? activity.map((event, index) => ({ time: `09:${String(43 + index).padStart(2, "0")}:${String(9 + index).padStart(2, "0")}`, event, detail: "Command accepted" }))
    : FOUNDATION_EVENTS;

  return (
    <div className="table-panel">
      <div className="panel-subbar"><span>LOCAL SESSION LOG</span><span>{rows.length} ENTRIES</span></div>
      <div className="dense-table activity-table" role="table" aria-label="Local session activity">
        <div className="dense-row dense-head" role="row">
          <span role="columnheader">TIME</span><span role="columnheader">EVENT</span><span role="columnheader">DETAIL</span>
        </div>
        {rows.map((row, index) => (
          <div className="dense-row" role="row" key={`${row.time}-${index}`}>
            <span role="cell">{row.time}</span><strong role="cell">{row.event}</strong><span role="cell">{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shortcuts() {
  const shortcuts = [
    ["⌘ / Ctrl + K", "Open command bar"],
    ["/", "Focus command bar"],
    ["Esc", "Close active overlay"],
    ["M", "Open market panel"],
    ["N · S · W · E · O", "Queue future module"],
    ["?", "Show this reference"],
  ] as const;
  return (
    <div className="shortcut-grid">
      <div className="shortcut-intro"><span>KEYBOARD MAP</span><strong>Work without leaving the keys.</strong><p>Shortcuts pause while you are typing in a field.</p></div>
      {shortcuts.map(([key, action]) => <div className="shortcut-row" key={key}><kbd>{key}</kbd><span>{action}</span><ArrowUpRight size={12} /></div>)}
    </div>
  );
}

export function PanelContent({ view, ticker, activity }: PanelContentProps) {
  switch (view) {
    case "market": return <MarketPulse />;
    case "system": return <SystemStatus />;
    case "activity": return <Activity activity={activity} />;
    case "shortcuts": return <Shortcuts />;
    case "security":
    default: return <SecurityFoundation ticker={ticker} />;
  }
}
