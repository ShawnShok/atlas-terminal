"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Bell, CircleHelp, Database, FolderOpen, Keyboard, Link2, Save, Unlink2 } from "lucide-react";
import { useActiveAlertMonitor } from "@/hooks/useActiveAlertMonitor";
import { parseAtlasCommand } from "@/lib/commands/parser";
import { BRAND } from "@/lib/brand";
import {
  createPanel,
  DEFAULT_WORKSPACES,
  getPanels,
  workspaceReducer,
  type PanelResearchScope,
  type PanelView,
  type WorkspaceCommandTarget,
  type WorkspaceLayout,
  type WorkspaceNode,
} from "@/lib/workspace/model";
import { CommandPalette } from "./CommandPalette";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";
import { Workspace } from "./Workspace";

interface ToastState {
  title: string;
  message: string;
}

function easternClock(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
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

const PANEL_VIEWS = new Set<PanelView>([
  "dashboard", "security", "chart", "financials", "market", "movers", "watchlist",
  "news", "events", "earnings", "options", "scanner", "analytics", "alerts", "notes",
  "timeline",
  "settings", "activity", "system", "shortcuts",
]);

function isWorkspaceNode(value: unknown): value is WorkspaceNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.type === "panel") {
    return typeof node.id === "string" && typeof node.title === "string" && typeof node.ticker === "string"
      && typeof node.view === "string" && PANEL_VIEWS.has(node.view as PanelView);
  }
  return node.type === "split" && typeof node.id === "string"
    && (node.direction === "horizontal" || node.direction === "vertical")
    && typeof node.ratio === "number" && node.ratio >= 10 && node.ratio <= 90
    && isWorkspaceNode(node.first) && isWorkspaceNode(node.second);
}

function isWorkspaceLayout(value: unknown): value is WorkspaceLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Record<string, unknown>;
  return layout.version === 1 && typeof layout.id === "string" && typeof layout.name === "string" && isWorkspaceNode(layout.root);
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
  const [recentTickers, setRecentTickers] = useState<string[]>([]);
  const [comparisonSymbols, setComparisonSymbols] = useState<readonly string[]>([]);
  const [commandTarget, setCommandTarget] = useState<WorkspaceCommandTarget | null>(null);
  const [panelResearchScopes, setPanelResearchScopes] = useState<Readonly<Record<string, PanelResearchScope>>>({});
  const [now, setNow] = useState<Date | null>(null);

  const panels = useMemo(() => getPanels(layout.root), [layout.root]);
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];

  const activatePanel = useCallback((panelId: string) => {
    setActivePanelId(panelId);
    const panel = panels.find((candidate) => candidate.id === panelId);
    if (panel?.ticker) setActiveTicker(panel.ticker);
  }, [panels]);

  const notify = useCallback((title: string, message: string) => {
    setToast({ title, message });
  }, []);
  const alertMonitor = useActiveAlertMonitor(notify);

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

  useEffect(() => {
    if (!activePanel || ["dashboard", "market", "movers", "watchlist", "scanner", "activity", "system", "settings", "shortcuts"].includes(activePanel.view)) return;
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(activePanel.ticker)) return;
    const timer = window.setTimeout(() => {
      setRecentTickers((current) => [activePanel.ticker, ...current.filter((symbol) => symbol !== activePanel.ticker)].slice(0, 8));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activePanel]);

  const setPanelView = useCallback((panelId: string, view: PanelView, scope: PanelResearchScope = "ticker") => {
    dispatch({ type: "set-view", panelId, view });
    setPanelResearchScopes((current) => {
      if (scope === "all") return { ...current, [panelId]: scope };
      if (!(panelId in current)) return current;
      const next = { ...current };
      delete next[panelId];
      return next;
    });
  }, []);

  const setTickerForWorkspace = useCallback((ticker: string, targetPanelId = activePanelId) => {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;
    setActiveTicker(normalized);
    setPanelResearchScopes((current) => {
      const affected = new Set(syncTicker ? panels.map((panel) => panel.id) : [targetPanelId]);
      if (![...affected].some((panelId) => panelId in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([panelId]) => !affected.has(panelId)));
    });
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
    setPanelResearchScopes({});
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

    const result = parseAtlasCommand(normalized);
    if (!result.ok) {
      notify(result.error.code.replaceAll("_", " "), result.error.message);
      return;
    }

    const intent = result.intent;
    setActivity((events) => [`${intent.normalizedInput}`, ...events].slice(0, 12));

    if (intent.kind === "watchlist" && "watchlistName" in intent) {
      setCommandTarget((current) => ({
        sequence: (current?.sequence ?? 0) + 1,
        watchlistName: intent.watchlistName,
      }));
    } else if (intent.kind === "scanner" && "scannerPresetId" in intent) {
      setCommandTarget((current) => ({
        sequence: (current?.sequence ?? 0) + 1,
        scannerPresetId: intent.scannerPresetId,
      }));
    }

    if (intent.kind === "compare") {
      setComparisonSymbols(intent.tickers);
      setTickerForWorkspace(intent.tickers[0]);
      setPanelView(activePanelId, "analytics", "ticker");
      notify("COMPARISON OPENED", `${intent.tickers.join(" · ")} normalized research is loading.`);
      return;
    }

    setComparisonSymbols([]);
    if ("ticker" in intent) setTickerForWorkspace(intent.ticker);
    const viewByIntent: Readonly<Record<Exclude<typeof intent.kind, "compare">, PanelView>> = {
      security: "security",
      chart: "chart",
      news: "news",
      events: "events",
      options: "options",
      financials: "financials",
      market: "market",
      movers: "movers",
      scanner: "scanner",
      watchlist: "watchlist",
      earnings: "earnings",
    };
    const nextView = viewByIntent[intent.kind];
    const scope: PanelResearchScope = !("ticker" in intent)
      && (intent.kind === "news" || intent.kind === "events" || intent.kind === "earnings")
      ? "all"
      : "ticker";
    setPanelView(activePanelId, nextView, scope);
    notify(`${intent.kind.toUpperCase()} OPENED`, "Normalized research data is loading in the active panel.");
  }, [activePanelId, notify, selectWorkspace, setPanelView, setTickerForWorkspace]);

  const openShortcutView = useCallback((view: PanelView, message: string) => {
    setPanelView(activePanelId, view, view === "news" || view === "events" ? "all" : "ticker");
    notify("KEYBOARD COMMAND", message);
  }, [activePanelId, notify, setPanelView]);

  const saveWorkspace = useCallback(() => {
    void fetch("/api/personal?resource=workspaces", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ name: layout.name, layout }),
    }).then(async (response) => {
      const payload = await response.json() as { ok: boolean; error?: { message: string } };
      if (!payload.ok) throw new Error(payload.error?.message ?? "Workspace could not be saved.");
      notify("WORKSPACE SAVED", `${layout.name} is stored in PostgreSQL.`);
    }).catch((error: unknown) => notify("WORKSPACE NOT SAVED", error instanceof Error ? error.message : "PostgreSQL is unavailable."));
  }, [layout, notify]);

  const loadSavedWorkspace = useCallback(() => {
    void fetch("/api/personal?resource=workspaces", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json() as { ok: boolean; data?: readonly { name: string; layout: unknown }[]; error?: { message: string } };
        if (!payload.ok) throw new Error(payload.error?.message ?? "Saved workspaces are unavailable.");
        const saved = payload.data?.find((candidate) => candidate.name === layout.name) ?? payload.data?.[0];
        if (!saved || !isWorkspaceLayout(saved.layout)) throw new Error("No valid saved workspace is available.");
        dispatch({ type: "load", layout: saved.layout });
        const first = getPanels(saved.layout.root)[0];
        setActivePanelId(first.id);
        setActiveTicker(first.ticker);
        setMaximizedPanelId(null);
        setPanelResearchScopes({});
        notify("WORKSPACE RESTORED", `${saved.name} was loaded from PostgreSQL.`);
      })
      .catch((error: unknown) => notify("WORKSPACE NOT LOADED", error instanceof Error ? error.message : "PostgreSQL is unavailable."));
  }, [layout.name, notify]);

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
      const shortcutViews: Readonly<Record<string, PanelView>> = { n: "news", s: "scanner", w: "watchlist", e: "events", o: "options" };
      const shortcutView = shortcutViews[shortcut];
      if (shortcutView) openShortcutView(shortcutView, `${shortcutView.toUpperCase()} opened in the active panel.`);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandOpen, notify, openShortcutView]);

  const closePanel = (panelId: string) => {
    const remaining = panels.filter((panel) => panel.id !== panelId);
    dispatch({ type: "close", panelId });
    if (activePanelId === panelId && remaining[0]) {
      setActivePanelId(remaining[0].id);
      setActiveTicker(remaining[0].ticker);
    }
    if (maximizedPanelId === panelId) setMaximizedPanelId(null);
    setPanelResearchScopes((current) => {
      if (!(panelId in current)) return current;
      const next = { ...current };
      delete next[panelId];
      return next;
    });
  };

  const splitPanel = (panelId: string, direction: "horizontal" | "vertical") => {
    const sourceTicker = panels.find((panel) => panel.id === panelId)?.ticker || activeTicker;
    const next = createPanel(sourceTicker);
    dispatch({ type: "split", panelId, direction, panel: next });
    setActivePanelId(next.id);
    setActiveTicker(next.ticker);
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
          activeId={(() => {
            const view = panels.find((panel) => panel.id === activePanelId)?.view;
            if (view === "dashboard") return "home";
            if (view === "market" || view === "movers" || view === "analytics") return "markets";
            if (view === "scanner") return "scanner";
            if (view === "news") return "news";
            if (view === "events" || view === "earnings") return "events";
            if (view === "watchlist") return "watchlists";
            if (view === "security" || view === "chart" || view === "financials" || view === "notes") return "stocks";
            if (view === "options") return "options";
            if (view === "alerts") return "alerts";
            if (view === "settings" || view === "system") return "settings";
            return "home";
          })()}
          onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
          onNavigate={(item) => {
            const navigation: Readonly<Record<string, PanelView>> = {
              home: "dashboard",
              markets: "market",
              scanner: "scanner",
              news: "news",
              events: "events",
              watchlists: "watchlist",
              stocks: "security",
              options: "options",
              portfolio: "system",
              alerts: "alerts",
              screens: "scanner",
              settings: "settings",
            };
            setComparisonSymbols([]);
            const nextView = navigation[item.id] ?? "dashboard";
            setPanelView(activePanelId, nextView, item.id === "news" || item.id === "events" ? "all" : "ticker");
            notify(`${item.label.toUpperCase()} OPENED`, item.id === "portfolio" ? "No brokerage or holdings source is configured; capability status is shown instead." : "The module is active in the current panel.");
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
            <button type="button" className="toolbar-button" onClick={saveWorkspace}><Save size={12} /> SAVE LAYOUT</button>
            <button type="button" className="toolbar-button" onClick={loadSavedWorkspace}><FolderOpen size={12} /> RESTORE</button>
          </div>

          <Workspace
            root={layout.root}
            activePanelId={activePanelId}
            maximizedPanelId={maximizedPanelId}
            activity={activity}
            recentTickers={recentTickers}
            comparisonSymbols={comparisonSymbols}
            commandTarget={commandTarget}
            researchScopeByPanel={panelResearchScopes}
            onActivate={activatePanel}
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
        <span><i className="status-dot status-dot-green" /><strong>{BRAND.shortName} RESEARCH</strong> READY</span>
        <span><Database size={10} /><strong>DATA</strong> SERVER NORMALIZED</span>
        <span><Link2 size={10} /><strong>PANELS</strong> {panels.length} ACTIVE</span>
        <span title={alertMonitor.message}><Bell size={10} /><strong>ALERTS</strong> {alertMonitor.label}</span>
        <span className="status-spacer" />
        <span><CircleHelp size={10} /> <kbd>?</kbd> HELP</span>
        <span><strong>READ ONLY</strong> NO TRADE EXECUTION</span>
      </footer>

      {commandOpen && <CommandPalette open onClose={() => setCommandOpen(false)} onRun={executeCommand} />}
      {toast && <aside className="terminal-toast" role="status"><div><strong>{toast.title}</strong><span>{toast.message}</span></div></aside>}
    </main>
  );
}
