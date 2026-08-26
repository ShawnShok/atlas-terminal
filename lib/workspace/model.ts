export type PanelView =
  | "dashboard"
  | "security"
  | "chart"
  | "financials"
  | "market"
  | "movers"
  | "watchlist"
  | "news"
  | "events"
  | "earnings"
  | "options"
  | "scanner"
  | "analytics"
  | "timeline"
  | "alerts"
  | "notes"
  | "settings"
  | "activity"
  | "system"
  | "shortcuts";

export interface WorkspacePanel {
  type: "panel";
  id: string;
  title: string;
  ticker: string;
  view: PanelView;
}

export interface WorkspaceSplit {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  ratio: number;
  first: WorkspaceNode;
  second: WorkspaceNode;
}

export type WorkspaceNode = WorkspacePanel | WorkspaceSplit;

export interface WorkspaceLayout {
  version: 1;
  id: string;
  name: string;
  root: WorkspaceNode;
}

export interface WorkspaceCommandTarget {
  readonly sequence: number;
  readonly watchlistName?: string;
  readonly scannerPresetId?: string;
}

export type WorkspaceAction =
  | { type: "load"; layout: WorkspaceLayout }
  | {
      type: "split";
      panelId: string;
      direction: WorkspaceSplit["direction"];
      panel: WorkspacePanel;
    }
  | { type: "close"; panelId: string }
  | { type: "resize"; splitId: string; ratio: number }
  | { type: "set-ticker"; panelId: string; ticker: string }
  | { type: "set-view"; panelId: string; view: PanelView };

const clampRatio = (ratio: number) => Math.min(76, Math.max(24, ratio));

function mapNode(
  node: WorkspaceNode,
  predicate: (candidate: WorkspaceNode) => boolean,
  update: (candidate: WorkspaceNode) => WorkspaceNode,
): WorkspaceNode {
  if (predicate(node)) return update(node);
  if (node.type === "panel") return node;

  return {
    ...node,
    first: mapNode(node.first, predicate, update),
    second: mapNode(node.second, predicate, update),
  };
}

function removePanel(
  node: WorkspaceNode,
  panelId: string,
): WorkspaceNode | null {
  if (node.type === "panel") return node.id === panelId ? null : node;

  const first = removePanel(node.first, panelId);
  const second = removePanel(node.second, panelId);

  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function getPanels(node: WorkspaceNode): WorkspacePanel[] {
  if (node.type === "panel") return [node];
  return [...getPanels(node.first), ...getPanels(node.second)];
}

export function workspaceReducer(
  state: WorkspaceLayout,
  action: WorkspaceAction,
): WorkspaceLayout {
  switch (action.type) {
    case "load":
      return action.layout;
    case "split":
      return {
        ...state,
        root: mapNode(
          state.root,
          (node) => node.type === "panel" && node.id === action.panelId,
          (node) => ({
            type: "split",
            id: `split-${action.panel.id}`,
            direction: action.direction,
            ratio: 50,
            first: node,
            second: action.panel,
          }),
        ),
      };
    case "close": {
      if (getPanels(state.root).length === 1) return state;
      return { ...state, root: removePanel(state.root, action.panelId) ?? state.root };
    }
    case "resize":
      return {
        ...state,
        root: mapNode(
          state.root,
          (node) => node.type === "split" && node.id === action.splitId,
          (node) =>
            node.type === "split"
              ? { ...node, ratio: clampRatio(action.ratio) }
              : node,
        ),
      };
    case "set-ticker":
      return {
        ...state,
        root: mapNode(
          state.root,
          (node) => node.type === "panel" && node.id === action.panelId,
          (node) =>
            node.type === "panel"
              ? { ...node, ticker: action.ticker.toUpperCase().slice(0, 15) }
              : node,
        ),
      };
    case "set-view":
      return {
        ...state,
        root: mapNode(
          state.root,
          (node) => node.type === "panel" && node.id === action.panelId,
          (node) =>
            node.type === "panel" ? { ...node, view: action.view } : node,
        ),
      };
    default:
      return state;
  }
}

const panel = (
  id: string,
  title: string,
  view: PanelView,
  ticker = "NVDA",
): WorkspacePanel => ({ type: "panel", id, title, view, ticker });

export const DEFAULT_WORKSPACES: WorkspaceLayout[] = [
  {
    version: 1,
    id: "research",
    name: "Research",
    root: {
      type: "split",
      id: "research-primary",
      direction: "horizontal",
      ratio: 66,
      first: panel("research-security", "Security workspace", "security"),
      second: {
        type: "split",
        id: "research-secondary",
        direction: "vertical",
        ratio: 52,
        first: panel("research-market", "Live news", "news"),
        second: panel("research-system", "Core watchlist", "watchlist"),
      },
    },
  },
  {
    version: 1,
    id: "monitor",
    name: "Monitor",
    root: {
      type: "split",
      id: "monitor-root",
      direction: "vertical",
      ratio: 58,
      first: panel("monitor-market", "Market dashboard", "dashboard"),
      second: panel("monitor-activity", "Market movers", "movers"),
    },
  },
  {
    version: 1,
    id: "focus",
    name: "Focus",
    root: panel("focus-security", "Security workspace", "security"),
  },
];

export function createPanel(ticker: string): WorkspacePanel {
  const id = `panel-${Date.now().toString(36)}`;
  return panel(id, "New panel", "security", ticker);
}
