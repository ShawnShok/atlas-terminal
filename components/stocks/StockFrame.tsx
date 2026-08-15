import type { ReactNode } from "react";

import { stockDateTime } from "@/lib/stocks";
import type { StockDataStatus } from "@/lib/stocks";

export interface StockStatusBadgeProps {
  readonly status: StockDataStatus;
}

export function StockStatusBadge({ status }: StockStatusBadgeProps) {
  const tone = status.state === "error"
    ? "negative"
    : status.state === "loading"
      ? "pending"
      : status.meta?.mode === "mock" || status.meta?.quality === "delayed"
        ? "warning"
        : status.state === "ready"
          ? "positive"
          : "neutral";
  return (
    <div className={`stock-status-badge tone-${tone}`} role="status" aria-label={`Data status: ${status.label}`}>
      <i aria-hidden="true" />
      <strong>{status.label}</strong>
      <span>{status.meta ? `${status.meta.source} · ${status.meta.quality}` : status.state}</span>
      <time dateTime={status.meta?.asOf}>{stockDateTime(status.meta?.asOf ?? null)}</time>
    </div>
  );
}

export interface StockFrameProps {
  readonly title: string;
  readonly eyebrow: string;
  readonly status: StockDataStatus;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function StockFrame({ title, eyebrow, status, actions, children, className = "" }: StockFrameProps) {
  return (
    <section className={`stock-frame ${className}`.trim()} aria-label={title}>
      <header className="stock-frame-header">
        <div className="stock-frame-title"><span>{eyebrow}</span><h2>{title}</h2></div>
        <div className="stock-frame-actions">{actions}</div>
        <StockStatusBadge status={status} />
      </header>
      {status.message ? <div className={`stock-status-message state-${status.state}`}>{status.message}</div> : null}
      <div className="stock-frame-body">{children}</div>
    </section>
  );
}

export interface StockEmptyStateProps {
  readonly title: string;
  readonly detail: string;
}

export function StockEmptyState({ title, detail }: StockEmptyStateProps) {
  return <div className="stock-empty" role="status"><strong>{title}</strong><span>{detail}</span></div>;
}

