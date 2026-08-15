"use client";

import { Command, Search, Wifi, WifiOff } from "lucide-react";

import { useResearchData } from "@/hooks/useResearchData";
import { BRAND } from "@/lib/brand";
import type { MarketSnapshotRow } from "@/types";

interface TopBarProps {
  activeTicker: string;
  easternTime: string;
  marketStatus: string;
  onOpenCommand: () => void;
}

interface TopBarDashboard {
  readonly snapshots: readonly MarketSnapshotRow[];
}

const PROXIES = [
  { symbol: "SPY", label: "S&P · SPY" },
  { symbol: "QQQ", label: "NASDAQ · QQQ" },
  { symbol: "DIA", label: "DOW · DIA" },
  { symbol: "IWM", label: "RUSSELL · IWM" },
] as const;

function price(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TopBar({ activeTicker, easternTime, marketStatus, onOpenCommand }: TopBarProps) {
  const dashboard = useResearchData<TopBarDashboard>("dashboard", {}, { refreshMs: 30_000 });
  const connection = dashboard.error ? "OFFLINE" : dashboard.meta?.mode === "mock" ? "MOCK" : dashboard.meta ? "CONNECTED" : "CONNECTING";

  return (
    <header className="terminal-topbar">
      <div className="terminal-brand" aria-label="ATLAS Terminal home">
        <span className="brand-mark" aria-hidden="true">A</span>
        <span className="brand-copy"><strong>{BRAND.shortName}</strong><small>TERMINAL</small></span>
      </div>

      <div className="market-session" title="Market status is based on Eastern Time">
        <span className={`status-dot ${marketStatus === "MARKET OPEN" ? "status-dot-green" : "status-dot-amber"}`} />
        <span>{marketStatus}</span>
        <strong>{easternTime} ET</strong>
      </div>

      <div className="market-strip" aria-label="ETF market proxies and index availability">
        {PROXIES.map((item) => {
          const row = dashboard.data?.snapshots.find((candidate) => candidate.symbol === item.symbol);
          return <div className="market-strip-item" key={item.symbol} title={`${item.label} is an ETF proxy, not a direct index value.`}><span>{item.label}</span><strong>{price(row?.lastPrice)}</strong><em className={(row?.changePercent ?? 0) >= 0 ? "positive" : "negative"}>{row?.changePercent === null || row?.changePercent === undefined ? "—" : `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(2)}%`}</em></div>;
        })}
        <div className="market-strip-item is-unavailable" title="Direct VIX data requires the Massive Indices product."><span>VIX</span><strong>N/A</strong><em>INDEX PLAN</em></div>
      </div>

      <div className="active-security" title="Active workspace ticker"><span>ACTIVE</span><strong>{activeTicker}</strong></div>

      <button className="command-trigger" type="button" onClick={onOpenCommand}>
        <Search size={14} strokeWidth={1.8} aria-hidden="true" />
        <span>Search ticker or enter command…</span>
        <kbd><Command size={10} aria-hidden="true" /> K</kbd>
      </button>

      <div className={`connection-state is-${connection.toLowerCase()}`} title={dashboard.error?.message ?? dashboard.meta?.source ?? "Connecting to the server research boundary"}>
        {dashboard.error ? <WifiOff size={13} strokeWidth={2} aria-hidden="true" /> : <Wifi size={13} strokeWidth={2} aria-hidden="true" />}
        <span>{connection}</span>
      </div>
    </header>
  );
}
