"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { PanelResearchScope, PanelView, WorkspaceCommandTarget, WorkspaceNode } from "@/lib/workspace/model";
import { getPanels } from "@/lib/workspace/model";
import { WorkspacePanel } from "./WorkspacePanel";

interface WorkspaceProps {
  root: WorkspaceNode;
  activePanelId: string;
  maximizedPanelId: string | null;
  activity: string[];
  recentTickers: readonly string[];
  comparisonSymbols?: readonly string[];
  commandTarget?: WorkspaceCommandTarget | null;
  researchScopeByPanel: Readonly<Record<string, PanelResearchScope>>;
  onActivate: (panelId: string) => void;
  onClose: (panelId: string) => void;
  onMaximize: (panelId: string | null) => void;
  onResize: (splitId: string, ratio: number) => void;
  onSplit: (panelId: string, direction: "horizontal" | "vertical") => void;
  onTickerChange: (panelId: string, ticker: string) => void;
  onViewChange: (panelId: string, view: PanelView) => void;
}

export function Workspace(props: WorkspaceProps) {
  const panels = getPanels(props.root);
  const maximizedPanelId = props.maximizedPanelId
    && panels.some((panel) => panel.id === props.maximizedPanelId)
    ? props.maximizedPanelId
    : null;

  return (
    <div className={maximizedPanelId ? "workspace-root is-maximized" : "workspace-root"}>
      <WorkspaceNodeView
        node={props.root}
        panelCount={panels.length}
        hiddenByMaximize={false}
        {...props}
        maximizedPanelId={maximizedPanelId}
      />
    </div>
  );
}

function containsPanel(node: WorkspaceNode, panelId: string): boolean {
  if (node.type === "panel") return node.id === panelId;
  return containsPanel(node.first, panelId) || containsPanel(node.second, panelId);
}

function WorkspaceNodeView({
  node,
  panelCount,
  hiddenByMaximize,
  ...props
}: WorkspaceProps & { node: WorkspaceNode; panelCount: number; hiddenByMaximize: boolean }) {
  const resizePointerId = useRef<number | null>(null);
  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (node.type !== "split") return;
    event.preventDefault();
    resizePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [node]);

  const moveResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (node.type !== "split" || resizePointerId.current !== event.pointerId) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const ratio = node.direction === "horizontal"
      ? ((event.clientX - bounds.left) / bounds.width) * 100
      : ((event.clientY - bounds.top) / bounds.height) * 100;
    props.onResize(node.id, ratio);
  }, [node, props]);

  const stopResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerId.current !== event.pointerId) return;
    resizePointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (node.type === "panel") {
    return (
      <WorkspacePanel
        key={node.id}
        panel={node}
        active={props.activePanelId === node.id}
        maximized={props.maximizedPanelId === node.id}
        hiddenByMaximize={hiddenByMaximize}
        canClose={panelCount > 1}
        activity={props.activity}
        recentTickers={props.recentTickers}
        comparisonSymbols={props.comparisonSymbols}
        commandTarget={props.commandTarget}
        researchScope={props.researchScopeByPanel[node.id] ?? "ticker"}
        onActivate={() => props.onActivate(node.id)}
        onClose={() => props.onClose(node.id)}
        onMaximize={() => props.onMaximize(props.maximizedPanelId === node.id ? null : node.id)}
        onSplit={(direction) => props.onSplit(node.id, direction)}
        onTickerChange={(ticker) => props.onTickerChange(node.id, ticker)}
        onViewChange={(view) => props.onViewChange(node.id, view)}
      />
    );
  }

  const template = `${node.ratio}fr 4px ${100 - node.ratio}fr`;
  const style = node.direction === "horizontal"
    ? { gridTemplateColumns: template, gridTemplateRows: "minmax(0, 1fr)" }
    : { gridTemplateRows: template, gridTemplateColumns: "minmax(0, 1fr)" };
  const firstHidden = hiddenByMaximize || Boolean(
    props.maximizedPanelId && !containsPanel(node.first, props.maximizedPanelId),
  );
  const secondHidden = hiddenByMaximize || Boolean(
    props.maximizedPanelId && !containsPanel(node.second, props.maximizedPanelId),
  );

  return (
    <div className={`workspace-split split-${node.direction}${hiddenByMaximize ? " is-maximized-hidden" : ""}`} style={style}>
      <WorkspaceNodeView node={node.first} panelCount={panelCount} hiddenByMaximize={firstHidden} {...props} />
      <div
        className="workspace-resizer"
        role="separator"
        aria-label={`Resize ${node.direction} split`}
        aria-orientation={node.direction === "horizontal" ? "vertical" : "horizontal"}
        tabIndex={props.maximizedPanelId ? -1 : 0}
        aria-hidden={props.maximizedPanelId ? true : undefined}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        onLostPointerCapture={() => { resizePointerId.current = null; }}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowUp"].includes(event.key)) props.onResize(node.id, node.ratio - 3);
          if (["ArrowRight", "ArrowDown"].includes(event.key)) props.onResize(node.id, node.ratio + 3);
        }}
      />
      <WorkspaceNodeView node={node.second} panelCount={panelCount} hiddenByMaximize={secondHidden} {...props} />
    </div>
  );
}
