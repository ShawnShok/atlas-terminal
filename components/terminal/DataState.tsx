"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import type { TerminalApiMeta } from "@/types";
import { formatTime } from "@/lib/format";
import { freshnessLabel } from "@/lib/freshness";

export function DataState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: { code: string; message: string; retryable: boolean; requestId: string } | null;
  onRetry: () => void;
}) {
  if (loading) {
    return <div className="data-state" role="status"><span className="data-spinner" /> LOADING RESEARCH DATA…</div>;
  }
  if (!error) return null;
  return (
    <div className="data-state is-error" role="alert">
      <AlertTriangle size={15} />
      <div><strong>{error.code.replaceAll("_", " ")}</strong><span>{error.message}</span><small>REQUEST {error.requestId.slice(0, 8).toUpperCase()}</small></div>
      {error.retryable && <button type="button" onClick={onRetry}><RefreshCw size={12} /> RETRY</button>}
    </div>
  );
}

export function FreshnessStrip({ meta, refreshing }: { meta: TerminalApiMeta | null; refreshing?: boolean }) {
  if (!meta) return null;
  const quality = meta.mode === "mock" ? "MOCK DATA" : freshnessLabel(meta.freshness);
  const badgeState = meta.mode === "mock" ? "mock" : meta.freshness.status;
  return (
    <div className="freshness-strip">
      <span className={`data-badge is-${badgeState}`}><i />{quality}</span>
      <span>{meta.source.toUpperCase()}</span>
      <span>UPDATED {formatTime(meta.asOf)} ET</span>
      {refreshing && <span className="freshness-refreshing"><RefreshCw size={10} /> REFRESHING</span>}
    </div>
  );
}
