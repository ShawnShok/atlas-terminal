"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { CircleHelp, Database, Keyboard, Link2, Unlink2 } from "lucide-react";
import { parseCommand } from "@/lib/commands/parser";
import { BRAND } from "@/lib/brand";
import {
  createPanel,
  DEFAULT_WORKSPACES,
  getPanels,
  workspaceReducer,
  type PanelView,
} from "@/lib/workspace/model";
import { CommandPalette } from "./CommandPalette";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";
import { Workspace } from "./Workspace";

interface ToastState {
  title: string;
  message: string;
}

const PHASE_BY_INTENT: Record<string, number> = {
  security: 2,
  chart: 2,
  news: 3,
  events: 4,
  options: 5,
  financials: 2,
  movers: 2,
  scanner: 6,
  watchlist: 2,
  earnings: 4,
  compare: 7,
};

function easternClock(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function easternSession(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  const weekday = value("weekday");
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  if (["Sat", "Sun"].includes(weekday)) return "MARKET CLOSED";
  if (minutes >= 570 && minutes < 960) return "MARKET OPEN";
  if (minutes >= 240 && minutes < 570) return "PRE-MARKET";
  if (minutes >= 960 && minutes < 1_200) return "AFTER HOURS";
  return "MARKET CLOSED";
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

export function TerminalShell() {
  const [layout, dispatch] = useReducer(workspaceReducer, DEFAULT_WORKSPACES[0]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePanelId, setActivePanelId] = useState("research-security");
  const [maximizedPanelId, setMaximizedPanelId] = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState("NVDA");
  const [syncTicker, setSyncTicker] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);

  const panels = useMemo(() => getPanels(layout.root), [layout.root]);

  const notify = useCallback((title: string, message: string) => {
    setToast({ title, message });
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const setPanelView = useCallback((panelId: string, view: PanelView) => {
    dispatch({ type: "set-view", panelId, view });
  }, []);

  const setTickerForWorkspace = useCallback((ticker: string, targetPanelId = activePanelId) => {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;
    setActiveTicker(normalized);
    if (syncTicker) {
      for (const panel of panels) dispatch({ type: "set-ticker", panelId: panel.id, ticker: normalized });
    } else {
      dispatch({ type: "set-ticker", panelId: targetPanelId, ticker: normalized });
    }
  }, [activePanelId, panels, syncTicker]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    const next = DEFAULT_WORKSPACES.find((workspace) => workspace.id === workspaceId);
    if (!next) return;
    dispatch({ type: "load", layout: next });
    const first = getPanels(next.root)[0];
    setActivePanelId(first.id);
    setMaximizedPanelId(null);
    setActiveTicker(first.ticker);
    setActivity((events) => [`Loaded ${next.name} workspace`, ...events].slice(0, 12));
  }, []);

  const executeCommand = useCallback((input: string) => {
    const normalized = input.trim().toUpperCase().replace(/\s+/g, " ");
    if (normalized.startsWith("LAYOUT ")) {
      const workspaceId = normalized.slice(7).toLowerCase();
      const workspace = DEFAULT_WORKSPACES.find((candidate) => candidate.id === workspaceId);
      if (!workspace) {
        notify("UNKNOWN WORKSPACE", `No default workspace matches “${workspaceId}”.`);
        return;
      }
      selectWorkspace(workspace.id);
      notify("WORKSPACE LOADED", `${workspace.name} layout is active.`);
      return;
    }

    const result = parseCommand(normalized);
    if (!result.ok) {
      notify(result.error.code.replaceAll("_", " "), result.error.message);
      return;
    }

    const intent = result.intent;
    setActivity((events) => [`${intent.normalizedInput}`, ...events].slice(0, 12));

    if ("ticker" in intent) setTickerForWorkspace(intent.ticker);
    if (intent.kind === "market") {
      setPanelView(activePanelId, "market");
      notify("MARKET PULSE OPENED", "Phase 1 is displaying an explicitly labeled deterministic fixture.");
      return;
    }

    const phase = PHASE_BY_INTENT[intent.kind] ?? 2;
    if (intent.kind === "security") setPanelView(activePanelId, "security");
    notify(
      `${intent.kind.toUpperCase()} · PHASE ${phase}`,
      phase === 1
        ? "Command executed."
        : "The command parsed successfully. This research module is intentionally not enabled in Phase 1.",
    );
  }, [activePanelId, notify, selectWorkspace, setPanelView, setTickerForWorkspace]);

  const openShortcutView = useCallback((view: PanelView, message: string) => {
    setPanelView(activePanelId, view);
    notify("KEYBOARD COMMAND", message);
  }, [activePanelId, notify, setPanelView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && commandOpen) {
        event.preventDefault();
        setCommandOpen(false);
        return;
      }
      if (isTypingTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        openShortcutView("shortcuts", "Shortcut reference opened in the active panel.");
        return;
      }

      const shortcut = event.key.toLowerCase();
      if (shortcut === "m") openShortcutView("market", "Market pulse opened in the active panel.");
      if (["n", "s", "w", "e", "o"].includes(shortcut)) {
        const command = ({ n: "NEWS", s: "SCAN", w: "WATCH", e: "EVENTS", o: "OPT" } as const)[shortcut as "n" | "s" | "w" | "e" | "o"];
        const phase = ({ n: 3, s: 6, w: 2, e: 4, o: 5 } as const)[shortcut as "n" | "s" | "w" | "e" | "o"];
        notify(`${command} · PHASE ${phase}`, "Shortcut recognized. The module is not enabled in the Phase 1 scope.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandOpen, notify, openShortcutView]);

  const closePanel = (panelId: string) => {
    const remaining = panels.filter((panel) => panel.id !== panelId);
    dispatch({ type: "close", panelId });
    if (activePanelId === panelId && remaining[0]) setActivePanelId(remaining[0].id);
    if (maximizedPanelId === panelId) setMaximizedPanelId(null);
  };

  const splitPanel = (panelId: string, direction: "horizontal" | "vertical") => {
    const next = createPanel(activeTicker);
    dispatch({ type: "split", panelId, direction, panel: next });
    setActivePanelId(next.id);
    setActivity((events) => [`Split panel ${direction}`, ...events].slice(0, 12));
  };

  return (
    <main className="terminal-shell">
      <TopBar
        activeTicker={activeTicker}
        easternTime={now ? easternClock(now) : "--:--:--"}
        marketStatus={now ? easternSession(now) : "SESSION STATUS"}
        onOpenCommand={() => setCommandOpen(true)}
      />

      <div className="terminal-main">
        <NavRail
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
          onNavigate={(item) => {
            if (item.id === "home") {
              selectWorkspace("research");
              return;
            }
            if (item.id === "markets") {
              setPanelView(activePanelId, "market");
              notify("MARKETS · PHASE 2", "Phase 1 provides only the labeled market-data fixture and provider foundation.");
              return;
            }
            if (item.id === "settings") {
              setPanelView(activePanelId, "system");
              notify("SYSTEM STATUS", "Runtime configuration is visible; editable settings arrive in Phase 8.");
              return;
            }
            notify(`${item.label.toUpperCase()} · PHASE ${item.phase}`, "Navigation is mapped, but this module is intentionally not enabled in Phase 1.");
          }}
        />

        <section className="terminal-workarea" aria-label="Terminal workspace">
          <div className="workspace-toolbar">
            <div className="workspace-tabset" aria-label="Default workspaces">
              {DEFAULT_WORKSPACES.map((workspace) => (
                <button
                  type="button"
                  key={workspace.id}
                  className={layout.id === workspace.id ? "workspace-tab is-active" : "workspace-tab"}
                  onClick={() => selectWorkspace(workspace.id)}
                >
                  {workspace.name.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="workspace-toolbar-spacer" />
            <button
              type="button"
              className={syncTicker ? "sync-toggle is-on" : "sync-toggle"}
              onClick={() => setSyncTicker((enabled) => !enabled)}
              aria-pressed={syncTicker}
            >
              {syncTicker ? <Link2 size={12} /> : <Unlink2 size={12} />}
              <span>SYNC TICKER</span><i />
            </button>
            <button type="button" className="toolbar-button" onClick={() => setPanelView(activePanelId, "shortcuts")}><Keyboard size={12} /> SHORTCUTS</button>
          </div>

          <Workspace
            root={layout.root}
            activePanelId={activePanelId}
            maximizedPanelId={maximizedPanelId}
            activity={activity}
            onActivate={setActivePanelId}
            onClose={closePanel}
            onMaximize={setMaximizedPanelId}
            onResize={(splitId, ratio) => dispatch({ type: "resize", splitId, ratio })}
            onSplit={splitPanel}
            onTickerChange={(panelId, ticker) => setTickerForWorkspace(ticker, panelId)}
            onViewChange={(panelId, view) => setPanelView(panelId, view)}
          />
        </section>
      </div>

      <footer className="terminal-statusbar">
        <span><i className="status-dot status-dot-green" /><strong>{BRAND.shortName} CORE</strong> ONLINE</span>
        <span><Database size={10} /><strong>DATA</strong> MOCK / NORMALIZED</span>
        <span><Link2 size={10} /><strong>PANELS</strong> {panels.length} ACTIVE</span>
        <span className="status-spacer" />
        <span><CircleHelp size={10} /> <kbd>?</kbd> HELP</span>
        <span><strong>PHASE 1</strong> FOUNDATION</span>
      </footer>

      {commandOpen && <CommandPalette open onClose={() => setCommandOpen(false)} onRun={executeCommand} />}
      {toast && <aside className="terminal-toast" role="status"><div><strong>{toast.title}</strong><span>{toast.message}</span></div></aside>}
    </main>
  );
}
