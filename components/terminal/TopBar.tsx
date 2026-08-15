"use client";

import { Command, Search, Wifi } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { MOCK_MARKET_STRIP } from "./terminal-data";

interface TopBarProps {
  activeTicker: string;
  easternTime: string;
  marketStatus: string;
  onOpenCommand: () => void;
}

export function TopBar({
  activeTicker,
  easternTime,
  marketStatus,
  onOpenCommand,
}: TopBarProps) {
  return (
    <header className="terminal-topbar">
      <div className="terminal-brand" aria-label="ATLAS Terminal home">
        <span className="brand-mark" aria-hidden="true">A</span>
        <span className="brand-copy">
          <strong>{BRAND.shortName}</strong>
          <small>TERMINAL</small>
        </span>
      </div>

      <div className="market-session" title="Market status is based on Eastern Time">
        <span className="status-dot status-dot-amber" />
        <span>{marketStatus}</span>
        <strong>{easternTime} ET</strong>
      </div>

      <div className="market-strip" aria-label="Mock market index strip">
        {MOCK_MARKET_STRIP.map((item) => (
          <div className="market-strip-item" key={item.symbol}>
            <span>{item.symbol}</span>
            <strong>{item.value}</strong>
            <em className={item.change >= 0 ? "positive" : "negative"}>
              {item.change >= 0 ? "+" : ""}{item.change.toFixed(2)}%
            </em>
          </div>
        ))}
      </div>

      <div className="active-security" title="Active workspace ticker">
        <span>ACTIVE</span>
        <strong>{activeTicker}</strong>
      </div>

      <button className="command-trigger" type="button" onClick={onOpenCommand}>
        <Search size={14} strokeWidth={1.8} aria-hidden="true" />
        <span>Search ticker or enter command…</span>
        <kbd><Command size={10} aria-hidden="true" /> K</kbd>
      </button>

      <div className="connection-state" title="Mock mode is enabled">
        <Wifi size={13} strokeWidth={2} aria-hidden="true" />
        <span>MOCK</span>
      </div>
    </header>
  );
}
