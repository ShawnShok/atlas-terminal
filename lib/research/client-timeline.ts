import type { CatalystTimelineBundle, CatalystTimelineEntry, TerminalApiMeta } from "@/types";

import type { CatalystTimelineItem } from "./types";

export interface PrivateTimelineNote {
  readonly id: string;
  readonly symbol: string;
  readonly title: string | null;
  readonly body: string;
  readonly updatedAt: string;
}

export interface MergeCatalystTimelineInput {
  readonly symbol: string;
  readonly entries: CatalystTimelineBundle["entries"];
  readonly notes: readonly PrivateTimelineNote[];
  readonly meta: TerminalApiMeta | null;
}

const NOTE_EXCERPT_LENGTH = 320;

function providerIsAvailable(meta: TerminalApiMeta | null, provider: string): boolean {
  return meta?.source.toLowerCase().split(/\s*\+\s*/).includes(provider) ?? false;
}

export function catalystSourceLabel(
  kind: CatalystTimelineEntry["kind"],
  meta: TerminalApiMeta | null,
): string {
  if (kind === "note") return "PRIVATE NOTE · POSTGRESQL";
  if (meta?.mode === "mock") return `MOCK · ${kind.replaceAll("-", " ").toUpperCase()}`;
  if (kind === "news") {
    if (providerIsAvailable(meta, "benzinga")) return "BENZINGA NEWS";
    if (providerIsAvailable(meta, "massive")) return "MASSIVE NEWS";
    return "NEWS SOURCE UNAVAILABLE";
  }
  if (kind === "event") {
    return providerIsAvailable(meta, "tmx") ? "TMX CORPORATE EVENTS" : "EVENT SOURCE UNAVAILABLE";
  }
  if (kind === "options-activity") {
    return providerIsAvailable(meta, "options developer") ? "MASSIVE OPTIONS DATA" : "OPTIONS SOURCE UNAVAILABLE";
  }
  if (kind === "volume-spike") {
    return providerIsAvailable(meta, "massive") ? "MASSIVE STOCK VOLUME" : "VOLUME SOURCE UNAVAILABLE";
  }
  return providerIsAvailable(meta, "massive") ? "MASSIVE STOCK DATA" : "PRICE SOURCE UNAVAILABLE";
}

function normalizedExcerpt(body: string): string | null {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= NOTE_EXCERPT_LENGTH) return normalized;
  return `${normalized.slice(0, NOTE_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function marketItem(
  entry: CatalystTimelineEntry,
  meta: TerminalApiMeta | null,
): CatalystTimelineItem {
  return {
    id: `market:${entry.kind}:${entry.id}`,
    symbol: entry.symbol.trim().toUpperCase(),
    occurredAt: entry.at,
    type: entry.kind,
    title: entry.title,
    description: entry.detail,
    sourceLabel: catalystSourceLabel(entry.kind, meta),
    href: entry.url,
    importance: "medium",
  };
}

function privateNoteItem(note: PrivateTimelineNote): CatalystTimelineItem {
  return {
    id: `note:${note.id}`,
    symbol: note.symbol.trim().toUpperCase(),
    occurredAt: note.updatedAt,
    type: "note",
    title: note.title?.trim() || "PRIVATE RESEARCH NOTE",
    description: normalizedExcerpt(note.body),
    sourceLabel: catalystSourceLabel("note", null),
    href: null,
    importance: "low",
  };
}

/**
 * Joins market observations and owner-scoped notes in the browser. The result is
 * oldest-first so the displayed sequence remains chronological; it does not
 * imply that an earlier item caused a later one.
 */
export function mergeCatalystTimeline({
  symbol,
  entries,
  notes,
  meta,
}: MergeCatalystTimelineInput): readonly CatalystTimelineItem[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const marketItems = entries
    // Notes are accepted only from the owner-scoped personal endpoint above;
    // never render a note-shaped value returned by the market-data endpoint.
    .filter((entry) => entry.kind !== "note"
      && entry.symbol.trim().toUpperCase() === normalizedSymbol
      && validTimestamp(entry.at))
    .map((entry) => marketItem(entry, meta));
  const privateItems = notes
    .filter((note) => note.symbol.trim().toUpperCase() === normalizedSymbol && validTimestamp(note.updatedAt))
    .map(privateNoteItem);

  return [...marketItems, ...privateItems].sort((left, right) => {
    const timeDifference = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return timeDifference || left.id.localeCompare(right.id);
  });
}
