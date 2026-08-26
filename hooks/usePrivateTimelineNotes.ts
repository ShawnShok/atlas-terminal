"use client";

import { useCallback, useEffect, useState } from "react";

import type { PrivateTimelineNote } from "@/lib/research/client-timeline";

export type PrivateTimelineNotesStatus =
  | "idle"
  | "checking"
  | "unavailable"
  | "loading"
  | "ready"
  | "error";

export interface PrivateTimelineNotesState {
  readonly status: PrivateTimelineNotesStatus;
  readonly configured: boolean | null;
  readonly notes: readonly PrivateTimelineNote[];
  readonly message: string | null;
  readonly reload: () => void;
}

interface PersonalStatusData {
  readonly configured: boolean;
  readonly provider: string;
  readonly detail?: string;
}

interface PersonalResponse<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly message?: string };
}

interface InternalState extends Omit<PrivateTimelineNotesState, "reload"> {
  readonly symbol: string | null;
}

const IDLE_STATE: InternalState = {
  symbol: null,
  status: "idle",
  configured: null,
  notes: [],
  message: null,
};

function isPrivateTimelineNote(value: unknown): value is PrivateTimelineNote {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string"
    && typeof record.symbol === "string"
    && (record.title === null || typeof record.title === "string")
    && typeof record.body === "string"
    && typeof record.updatedAt === "string";
}

async function personalGet<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await response.json() as PersonalResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Personal research request failed.");
  }
  return payload.data;
}

/**
 * Loads owner-scoped notes only while the catalyst view is active. The status
 * request is intentionally completed first so an unconfigured database never
 * receives a notes query.
 */
export function usePrivateTimelineNotes(ticker: string, enabled: boolean): PrivateTimelineNotesState {
  const symbol = ticker.trim().toUpperCase();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<InternalState>(IDLE_STATE);
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!enabled || !symbol) return;
    const controller = new AbortController();
    let current = true;

    void (async () => {
      try {
        // Yield once so the effect only schedules asynchronous state work.
        await Promise.resolve();
        if (!current) return;
        setState({
          symbol,
          status: "checking",
          configured: null,
          notes: [],
          message: "Checking PostgreSQL before requesting private notes.",
        });
        const status = await personalGet<PersonalStatusData>("/api/personal?resource=status", controller.signal);
        if (!current) return;
        if (!status.configured) {
          setState({
            symbol,
            status: "unavailable",
            configured: false,
            notes: [],
            message: `PostgreSQL is not configured; private notes were not requested.${status.detail ? ` ${status.detail}` : ""}`,
          });
          return;
        }

        setState({
          symbol,
          status: "loading",
          configured: true,
          notes: [],
          message: "Loading private notes from PostgreSQL.",
        });
        const records = await personalGet<unknown>(
          `/api/personal?resource=notes&symbol=${encodeURIComponent(symbol)}`,
          controller.signal,
        );
        if (!current) return;
        if (!Array.isArray(records)) throw new Error("The private-note response was invalid.");
        const notes = records.filter(isPrivateTimelineNote);
        setState({
          symbol,
          status: "ready",
          configured: true,
          notes,
          message: notes.length === 0
            ? `No private notes are saved for ${symbol}.`
            : `${notes.length} private ${notes.length === 1 ? "note" : "notes"} merged locally from PostgreSQL.`,
        });
      } catch (error) {
        if (!current || controller.signal.aborted) return;
        setState({
          symbol,
          status: "error",
          configured: null,
          notes: [],
          message: `Private notes unavailable: ${error instanceof Error ? error.message : "The request failed."}`,
        });
      }
    })();

    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, revision, symbol]);

  const visibleState = enabled && state.symbol === symbol ? state : IDLE_STATE;
  return { ...visibleState, reload };
}
