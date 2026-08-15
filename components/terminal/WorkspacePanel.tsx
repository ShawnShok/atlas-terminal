"use client";

import {
  Columns2,
  Expand,
  Minimize2,
  Rows2,
  X,
} from "lucide-react";
import type { PanelView, WorkspacePanel as PanelModel } from "@/lib/workspace/model";
import { PanelContent } from "./PanelContent";

interface WorkspacePanelProps {
  panel: PanelModel;
  active: boolean;
  maximized: boolean;
  canClose: boolean;
  activity: string[];
  onActivate: () => void;
  onClose: () => void;
  onMaximize: () => void;
  onSplit: (direction: "horizontal" | "vertical") => void;
  onTickerChange: (ticker: string) => void;
  onViewChange: (view: PanelView) => void;
}

const VIEW_LABELS: Record<PanelView, string> = {
  security: "Security",
  market: "Market pulse",
  activity: "Activity",
  system: "System",
  shortcuts: "Shortcuts",
};

export function WorkspacePanel({
  panel,
  active,
  maximized,
  canClose,
  activity,
  onActivate,
  onClose,
  onMaximize,
  onSplit,
  onTickerChange,
  onViewChange,
}: WorkspacePanelProps) {
  return (
    <section
      className={active ? "workspace-panel is-active" : "workspace-panel"}
      onPointerDown={onActivate}
    >
      <header className="panel-header">
        <span className="panel-index">{panel.id.slice(-2).toUpperCase()}</span>
        <input
          className="panel-ticker-input"
          value={panel.ticker}
          aria-label="Panel ticker"
          maxLength={8}
          onChange={(event) => onTickerChange(event.target.value.replace(/[^A-Za-z.-]/g, ""))}
          onFocus={(event) => event.currentTarget.select()}
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
        <PanelContent view={panel.view} ticker={panel.ticker || "—"} activity={activity} />
      </div>
    </section>
  );
}
