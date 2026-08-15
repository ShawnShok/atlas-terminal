"use client";

import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import type { PanelView, WorkspaceNode } from "@/lib/workspace/model";
import { getPanels } from "@/lib/workspace/model";
import { WorkspacePanel } from "./WorkspacePanel";

interface WorkspaceProps {
  root: WorkspaceNode;
  activePanelId: string;
  maximizedPanelId: string | null;
  activity: string[];
  recentTickers: readonly string[];
  comparisonSymbols?: readonly string[];
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
  const maximized = props.maximizedPanelId
    ? panels.find((panel) => panel.id === props.maximizedPanelId)
    : null;

  if (maximized) {
    return (
      <div className="workspace-root is-maximized">
        <WorkspacePanel
          key={`${maximized.id}:${maximized.ticker}`}
          panel={maximized}
          active
          maximized
          canClose={panels.length > 1}
          activity={props.activity}
          recentTickers={props.recentTickers}
          comparisonSymbols={props.comparisonSymbols}
          onActivate={() => props.onActivate(maximized.id)}
          onClose={() => props.onClose(maximized.id)}
          onMaximize={() => props.onMaximize(null)}
          onSplit={(direction) => props.onSplit(maximized.id, direction)}
          onTickerChange={(ticker) => props.onTickerChange(maximized.id, ticker)}
          onViewChange={(view) => props.onViewChange(maximized.id, view)}
        />
      </div>
    );
  }

  return (
    <div className="workspace-root">
      <WorkspaceNodeView node={props.root} panelCount={panels.length} {...props} />
    </div>
  );
}

function WorkspaceNodeView({
  node,
  panelCount,
  ...props
}: WorkspaceProps & { node: WorkspaceNode; panelCount: number }) {
  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (node.type !== "split") return;
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;

    const move = (pointerEvent: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const ratio = node.direction === "horizontal"
        ? ((pointerEvent.clientX - bounds.left) / bounds.width) * 100
        : ((pointerEvent.clientY - bounds.top) / bounds.height) * 100;
      props.onResize(node.id, ratio);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [node, props]);

  if (node.type === "panel") {
    return (
      <WorkspacePanel
        key={`${node.id}:${node.ticker}`}
        panel={node}
        active={props.activePanelId === node.id}
        maximized={false}
        canClose={panelCount > 1}
        activity={props.activity}
        recentTickers={props.recentTickers}
        comparisonSymbols={props.comparisonSymbols}
        onActivate={() => props.onActivate(node.id)}
        onClose={() => props.onClose(node.id)}
        onMaximize={() => props.onMaximize(node.id)}
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

  return (
    <div className={`workspace-split split-${node.direction}`} style={style}>
      <WorkspaceNodeView node={node.first} panelCount={panelCount} {...props} />
      <div
        className="workspace-resizer"
        role="separator"
        aria-label={`Resize ${node.direction} split`}
        aria-orientation={node.direction === "horizontal" ? "vertical" : "horizontal"}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowUp"].includes(event.key)) props.onResize(node.id, node.ratio - 3);
          if (["ArrowRight", "ArrowDown"].includes(event.key)) props.onResize(node.id, node.ratio + 3);
        }}
      />
      <WorkspaceNodeView node={node.second} panelCount={panelCount} {...props} />
    </div>
  );
}
