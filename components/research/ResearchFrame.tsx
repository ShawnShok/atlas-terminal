import type { ReactNode } from "react";

import { dataStatusTone } from "@/lib/research";
import { formatDateTime } from "@/lib/research/format";
import type { ResearchDataStatus } from "@/lib/research/types";

export interface ResearchFrameProps {
  readonly title: string;
  readonly eyebrow: string;
  readonly status: ResearchDataStatus;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

export function ResearchFrame({
  title,
  eyebrow,
  status,
  actions,
  children,
  footer,
  className = "",
}: ResearchFrameProps) {
  const tone = dataStatusTone(status);

  return (
    <section className={`research-frame ${className}`.trim()} aria-label={title}>
      <header className="research-frame-header">
        <div className="research-frame-title">
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="research-frame-actions">{actions}</div>
        <div
          className={`research-source-status research-tone-${tone}`}
          role="status"
          aria-label={`Data status: ${status.label}`}
        >
          <i aria-hidden="true" />
          <strong>{status.label}</strong>
          <time dateTime={status.asOf ?? undefined}>{formatDateTime(status.asOf)}</time>
        </div>
      </header>
      {status.message ? (
        <div className={`research-status-message research-tone-${tone}`}>
          {status.message}
        </div>
      ) : null}
      <div className="research-frame-body">{children}</div>
      {footer ? <footer className="research-frame-footer">{footer}</footer> : null}
    </section>
  );
}

export interface EmptyResearchStateProps {
  readonly title: string;
  readonly detail: string;
}

export function EmptyResearchState({ title, detail }: EmptyResearchStateProps) {
  return (
    <div className="research-empty" role="status">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export interface MetricCellProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: ReactNode;
  readonly tone?: "positive" | "negative" | "warning" | "neutral";
}

export function MetricCell({ label, value, detail, tone = "neutral" }: MetricCellProps) {
  return (
    <div className={`research-metric research-tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

