"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Database, LockKeyhole, RefreshCw } from "lucide-react";

import { useResearchData } from "@/hooks/useResearchData";
import { formatDateTime } from "@/lib/research/format";
import type { TerminalApiMeta, TickerSearchResult } from "@/types";

type PersonalView = "alerts" | "notes" | "settings" | "system";

interface PersonalStatusResponse {
  readonly ok: boolean;
  readonly data?: { configured: boolean; provider: string; detail?: string };
  readonly error?: { code: string; message: string };
}

interface NoteRecord {
  readonly id: string;
  readonly symbol: string;
  readonly title: string | null;
  readonly body: string;
  readonly updatedAt: string;
}

interface AlertRecord {
  readonly id: string;
  readonly name: string | null;
  readonly type: string;
  readonly symbol: string | null;
  readonly configuration: Record<string, unknown>;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

interface SettingsRecord {
  readonly timezone: string;
  readonly chartDefaults: unknown;
  readonly preferredIndicators: unknown;
  readonly refreshPreferences: unknown;
}

type NoteSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const NOTE_AUTOSAVE_DELAY_MS = 900;

function isMarkdownBlockStart(line: string): boolean {
  return /^(?:#{1,3}\s+|```|>\s?|[-*+]\s+|\d+\.\s+)/.test(line);
}

/**
 * Small local Markdown renderer. React escapes every text node, and raw HTML is
 * intentionally treated as text instead of being parsed or injected.
 */
function markdownPreview(markdown: string): readonly ReactNode[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const blockIndex = index;
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`code-${blockIndex}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const key = `heading-${index}`;
      const text = heading[2];
      blocks.push(heading[1].length === 1 ? <h3 key={key}>{text}</h3> : heading[1].length === 2 ? <h4 key={key}>{text}</h4> : <h5 key={key}>{text}</h5>);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const blockIndex = index;
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${blockIndex}`}>{quote.join(" ")}</blockquote>);
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const blockIndex = index;
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={`list-${blockIndex}`}>{items.map((item, itemIndex) => <li key={`${blockIndex}-${itemIndex}`}>{item}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const blockIndex = index;
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(<ol key={`ordered-${blockIndex}`}>{items.map((item, itemIndex) => <li key={`${blockIndex}-${itemIndex}`}>{item}</li>)}</ol>);
      continue;
    }

    const blockIndex = index;
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && (index === blockIndex || !isMarkdownBlockStart(lines[index]))) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${blockIndex}`}>{paragraph.join(" ")}</p>);
  }

  return blocks;
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <section className="notes-markdown-preview" aria-label="Safe Markdown preview">
      <header><span>LOCAL RENDER</span><strong>MARKDOWN PREVIEW</strong></header>
      <div>{markdown.trim() ? markdownPreview(markdown) : <p>Preview appears as the note is written.</p>}</div>
      <small>Raw HTML is displayed as text and is never executed.</small>
    </section>
  );
}

function upsertNote(notes: readonly NoteRecord[], saved: NoteRecord): readonly NoteRecord[] {
  return [saved, ...notes.filter((note) => note.id !== saved.id)]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

async function personalRequest<T>(resource: string, init?: RequestInit, id?: string, extra?: Readonly<Record<string, string>>): Promise<T> {
  const params = new URLSearchParams({ resource });
  if (id) params.set("id", id);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const response = await fetch(`/api/personal?${params.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...init,
  });
  const payload = await response.json() as { ok: boolean; data?: T; error?: { message: string } };
  if (!payload.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Personal research request failed.");
  return payload.data;
}

function DatabaseRequired({ view }: { view: PersonalView }) {
  return (
    <div className="personal-db-required">
      <Database size={28} />
      <strong>POSTGRESQL REQUIRED</strong>
      <p>{view === "notes" ? "Private Markdown notes" : view === "alerts" ? "Internal alert definitions and trigger state" : "Settings, watchlists, scanners, and saved workspaces"} are deliberately not stored in browser-only state.</p>
      <code>DATABASE_URL=postgresql://…</code>
      <small>Configure a pooled server-side PostgreSQL URL, apply the Prisma migration, and redeploy. No note content is sent to Massive or another third party.</small>
    </div>
  );
}

function NotesWorkspace({ ticker }: { ticker: string }) {
  const [notes, setNotes] = useState<readonly NoteRecord[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<NoteSaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const contextTokenRef = useRef(0);
  const persistedIdsRef = useRef(new Map<number, string | null>([[0, null]]));
  const revisionRef = useRef(0);
  const lastQueuedRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const flushLatestRef = useRef<() => void>(() => undefined);
  const load = useCallback(() => {
    void personalRequest<readonly NoteRecord[]>("notes", undefined, undefined, { symbol: ticker })
      .then((records) => {
        if (mountedRef.current) setNotes(records);
      })
      .catch((error: unknown) => {
        if (mountedRef.current) setMessage(error instanceof Error ? error.message : "Unable to load notes.");
      });
  }, [ticker]);

  useEffect(load, [load]);

  const beginDraft = useCallback((note: NoteRecord | null) => {
    const token = contextTokenRef.current + 1;
    contextTokenRef.current = token;
    persistedIdsRef.current.set(token, note?.id ?? null);
    revisionRef.current = 0;
    lastQueuedRevisionRef.current = 0;
    setSelectedId(note?.id ?? null);
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setLastEditedAt(note?.updatedAt ?? null);
    setSaveState(note ? "saved" : "idle");
    setMessage(null);
  }, []);

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setSaveState("dirty");
    setMessage(null);
  }, []);

  const enqueueSave = useCallback(() => {
    const token = contextTokenRef.current;
    const revision = revisionRef.current;
    const existingId = persistedIdsRef.current.get(token) ?? null;
    if (!existingId && !title.trim() && !body.trim()) {
      if (mountedRef.current && token === contextTokenRef.current) setSaveState("idle");
      return;
    }
    if (revision <= lastQueuedRevisionRef.current && saveState !== "error") return;
    lastQueuedRevisionRef.current = Math.max(lastQueuedRevisionRef.current, revision);
    const draft = { token, revision, ticker, title: title.trim() || null, body };

    saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
      const noteId = persistedIdsRef.current.get(draft.token) ?? null;
      if (mountedRef.current && draft.token === contextTokenRef.current) setSaveState("saving");
      try {
        const saved = await personalRequest<NoteRecord>("notes", {
          method: noteId ? "PATCH" : "POST",
          body: JSON.stringify({ symbol: draft.ticker, title: draft.title, body: draft.body }),
        }, noteId ?? undefined);
        persistedIdsRef.current.set(draft.token, saved.id);
        if (!mountedRef.current) return;
        setNotes((current) => upsertNote(current, saved));
        if (draft.token !== contextTokenRef.current) return;
        setSelectedId(saved.id);
        setLastEditedAt(saved.updatedAt);
        setMessage(null);
        setSaveState(revisionRef.current === draft.revision ? "saved" : "dirty");
      } catch (error: unknown) {
        if (!mountedRef.current || draft.token !== contextTokenRef.current) return;
        setSaveState("error");
        setMessage(error instanceof Error ? error.message : "Unable to autosave this note.");
      }
    });
  }, [body, saveState, ticker, title]);

  useEffect(() => {
    flushLatestRef.current = () => {
      if (saveState === "dirty" || saveState === "error") enqueueSave();
    };
  }, [enqueueSave, saveState]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(enqueueSave, NOTE_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [body, enqueueSave, saveState, title]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flushLatestRef.current();
    };
  }, []);

  const selectNote = (note: NoteRecord) => {
    flushLatestRef.current();
    beginDraft(note);
  };

  const newNote = () => {
    flushLatestRef.current();
    beginDraft(null);
  };

  const deleteNote = (id: string) => {
    const deleteToken = contextTokenRef.current + 1;
    contextTokenRef.current = deleteToken;
    persistedIdsRef.current.set(deleteToken, null);
    revisionRef.current = 0;
    lastQueuedRevisionRef.current = 0;
    setSelectedId(null);
    setTitle("");
    setBody("");
    setLastEditedAt(null);
    setSaveState("idle");
    setMessage(null);
    saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
      try {
        await personalRequest<{ deleted: boolean }>("notes", { method: "DELETE" }, id);
        if (!mountedRef.current) return;
        setNotes((current) => current.filter((note) => note.id !== id));
        if (contextTokenRef.current === deleteToken) setMessage("Note deleted from PostgreSQL.");
      } catch (error: unknown) {
        if (mountedRef.current && contextTokenRef.current === deleteToken) {
          setMessage(error instanceof Error ? error.message : "Unable to delete this note.");
        }
      }
    });
  };

  const saveLabel = saveState === "dirty"
    ? "UNSAVED CHANGES — AUTOSAVE PENDING"
    : saveState === "saving"
      ? "SAVING TO POSTGRESQL…"
      : saveState === "saved"
        ? "SAVED TO POSTGRESQL"
        : saveState === "error"
          ? "AUTOSAVE FAILED — SAVE NOW TO RETRY"
          : "NEW DRAFT — AUTOSAVE STARTS WHEN YOU TYPE";
  const canSave = Boolean(selectedId || title.trim() || body.trim());
  return (
    <div className="notes-workspace">
      <aside><header><span>{ticker}</span><strong>RESEARCH NOTES</strong></header>{notes.length ? notes.map((note) => <button type="button" key={note.id} className={selectedId === note.id ? "is-active" : ""} onClick={() => selectNote(note)}><strong>{note.title || "Untitled note"}</strong><span><time dateTime={note.updatedAt}>{formatDateTime(note.updatedAt)}</time></span></button>) : <p>No saved notes for {ticker}.</p>}</aside>
      <section>
        <label><span>TITLE</span><input value={title} maxLength={120} onChange={(event) => { setTitle(event.target.value); markDirty(); }} placeholder={`${ticker} thesis / level / catalyst`} /></label>
        <label><span>MARKDOWN NOTE</span><textarea value={body} onChange={(event) => { setBody(event.target.value); markDirty(); }} placeholder={`# ${ticker}\n\n- Research observation\n- Risk / invalidation\n- Upcoming catalyst`} /></label>
        <div className={`notes-save-state is-${saveState}`} role="status" aria-live="polite"><strong>{saveLabel}</strong>{lastEditedAt ? <span>LAST EDITED <time dateTime={lastEditedAt}>{formatDateTime(lastEditedAt)}</time></span> : null}</div>
        <MarkdownPreview markdown={body} />
        {message && <p className="personal-message">{message}</p>}
        <div className="personal-actions">
          <button type="button" disabled={!canSave || saveState === "saving" || saveState === "saved"} onClick={enqueueSave}>SAVE NOW</button>
          {selectedId && <button type="button" className="is-danger" disabled={saveState === "saving"} onClick={() => deleteNote(selectedId)}>DELETE</button>}
          <button type="button" onClick={newNote}>NEW</button>
        </div>
        <p className="research-disclaimer">Notes autosave only to the configured PostgreSQL database. Note content is never sent to market-data providers.</p>
      </section>
    </div>
  );
}

function AlertsWorkspace({ ticker }: { ticker: string }) {
  const [alerts, setAlerts] = useState<readonly AlertRecord[]>([]);
  const [type, setType] = useState("PRICE");
  const [symbol, setSymbol] = useState(ticker);
  const [threshold, setThreshold] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    void personalRequest<readonly AlertRecord[]>("alerts").then(setAlerts).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load alerts."));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="alerts-workspace">
      <section className="alert-builder"><header><span>INTERNAL RESEARCH AUTOMATION</span><strong>NEW ALERT</strong></header><div className="alert-fields"><label><span>TYPE</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="PRICE">Price</option><option value="PERCENT_CHANGE">Percent move</option><option value="RELATIVE_VOLUME">Relative volume</option><option value="TECHNICAL">Technical condition</option></select></label><label><span>SYMBOL</span><input value={symbol} maxLength={15} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))} /></label><label><span>THRESHOLD / RULE</span><input value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="e.g. > 200" /></label></div><button type="button" disabled={!symbol || !threshold.trim()} onClick={() => void personalRequest<AlertRecord>("alerts", { method: "POST", body: JSON.stringify({ name: `${symbol} ${type.replaceAll("_", " ")}`, type, symbol, configuration: { rule: threshold.trim() }, enabled: true }) }).then(() => { setThreshold(""); setMessage("Alert saved. PRICE, VOLUME, and TECHNICAL definitions still require a separately deployed worker."); load(); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to save alert."))}>SAVE ALERT</button>{message && <p className="personal-message">{message}</p>}</section>
      <section className="alert-list"><header><span>ALERT CENTER</span><strong>{alerts.length} DEFINITIONS</strong></header>{alerts.length ? <table><thead><tr><th>STATE</th><th>SYMBOL</th><th>TYPE</th><th>RULE</th><th>UPDATED</th><th /></tr></thead><tbody>{alerts.map((alert) => <tr key={alert.id}><td>{alert.enabled ? "ENABLED" : "PAUSED"}</td><td>{alert.symbol ?? "ALL"}</td><td>{alert.type.replaceAll("_", " ")}</td><td>{String(alert.configuration.rule ?? "—")}</td><td>{new Date(alert.updatedAt).toLocaleString()}</td><td><button type="button" onClick={() => void personalRequest<{ deleted: boolean }>("alerts", { method: "DELETE" }, alert.id).then(load)}>DELETE</button></td></tr>)}</tbody></table> : <p>No alert definitions saved.</p>}</section>
      <p className="research-disclaimer">Structured NEWS and EVENT alerts are checked by one shared monitor every 60 seconds only while this ATLAS terminal remains open. Browser-closed or continuous evaluation—and all other alert types—still require a separately deployed scheduler/worker. Alerts are research notifications, never orders.</p>
    </div>
  );
}

function SettingsWorkspace() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [timezone, setTimezone] = useState("America/New_York");
  const [timeframe, setTimeframe] = useState("1Y");
  const [refresh, setRefresh] = useState("30");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void personalRequest<SettingsRecord>("settings").then((value) => {
      setSettings(value);
      setTimezone(value.timezone || "America/New_York");
      const chart = value.chartDefaults as { timeframe?: string } | null;
      const refreshValue = value.refreshPreferences as { seconds?: number } | null;
      setTimeframe(chart?.timeframe ?? "1Y");
      setRefresh(String(refreshValue?.seconds ?? 30));
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load settings."));
  }, []);
  return (
    <div className="settings-workspace">
      <header><span>PRIMARY PROFILE</span><strong>TERMINAL SETTINGS</strong></header>
      <div className="settings-grid"><label><span>MARKET TIMEZONE</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="UTC">UTC</option></select></label><label><span>DEFAULT CHART RANGE</span><select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>{["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>REFRESH INTERVAL</span><select value={refresh} onChange={(event) => setRefresh(event.target.value)}><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="300">5 minutes</option></select></label></div>
      <button type="button" disabled={!settings} onClick={() => void personalRequest<SettingsRecord>("settings", { method: "POST", body: JSON.stringify({ timezone, chartDefaults: { timeframe }, refreshPreferences: { seconds: Number(refresh) } }) }).then((value) => { setSettings(value); setMessage("Settings saved in PostgreSQL."); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to save settings."))}>SAVE SETTINGS</button>
      {message && <p className="personal-message">{message}</p>}
    </div>
  );
}

function SystemWorkspace({
  configured,
  databaseDetail,
  researchMeta,
  researchError,
}: {
  configured: boolean;
  databaseDetail: string | null;
  researchMeta: TerminalApiMeta | null;
  researchError: string | null;
}) {
  const providerStatus = researchError
    ? "UNAVAILABLE"
    : researchMeta?.mode === "mock"
      ? "MOCK"
      : researchMeta
        ? "ONLINE"
        : "CHECKING";
  const rows = [
    ["Massive server adapter", providerStatus, researchError ?? (researchMeta?.mode === "mock" ? "Synthetic development feed" : researchMeta ? "Credential-safe provider request succeeded" : "Checking the server boundary")],
    ["Benzinga News", "ON DEMAND", "Availability and entitlement are checked when the News module opens"],
    ["TMX Corporate Events", "ON DEMAND", "Availability and entitlement are checked when Events opens; timing is date-only"],
    ["Options Developer", "ON DEMAND", "Availability is plan-dependent; each response labels its known freshness"],
    ["PostgreSQL / Prisma", configured ? "ONLINE" : "UNCONFIGURED", databaseDetail ?? (configured ? "Connection verified" : "DATABASE_URL required")],
    ["Redis", "OPTIONAL", "Bounded in-memory cache adapter active"],
  ] as const;
  return <div className="system-workspace"><header><div><span>ATLAS RUNTIME</span><strong>CAPABILITY STATUS</strong></div>{configured && providerStatus === "ONLINE" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</header>{rows.map(([name, status, detail]) => <div key={name}><span><i className={status === "ONLINE" ? "status-dot status-dot-green" : "status-dot status-dot-amber"} />{name}</span><strong>{status}</strong><small>{detail}</small></div>)}<footer><LockKeyhole size={13} /><span>Credentials remain server-only. Personal notes never leave PostgreSQL.</span></footer></div>;
}

export function PersonalResearchPanel({ view, ticker }: { view: PersonalView; ticker: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [databaseDetail, setDatabaseDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providerProbe = useResearchData<readonly TickerSearchResult[]>("search", { q: "AAPL" }, { enabled: view === "system", retainMs: 60_000 });
  const check = useCallback(() => {
    void fetch("/api/personal?resource=status", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => response.json() as Promise<PersonalStatusResponse>)
      .then((payload) => {
        setConfigured(Boolean(payload.ok && payload.data?.configured));
        setDatabaseDetail(payload.data?.detail ?? payload.error?.message ?? null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Persistence status is unavailable."));
  }, []);
  useEffect(check, [check]);
  if (configured === null && !error) return <div className="data-state"><span className="data-spinner" /> CHECKING PRIVATE PERSISTENCE…</div>;
  if (error) return <div className="personal-db-required"><AlertTriangle size={28} /><strong>PERSISTENCE STATUS UNAVAILABLE</strong><p>{error}</p><button type="button" onClick={() => { setError(null); check(); }}><RefreshCw size={12} /> RETRY</button></div>;
  if (view === "system") return <SystemWorkspace configured={Boolean(configured)} databaseDetail={databaseDetail} researchMeta={providerProbe.meta} researchError={providerProbe.error?.message ?? null} />;
  if (!configured) return <DatabaseRequired view={view} />;
  if (view === "notes") return <NotesWorkspace ticker={ticker} />;
  if (view === "alerts") return <AlertsWorkspace ticker={ticker} />;
  return <SettingsWorkspace />;
}
