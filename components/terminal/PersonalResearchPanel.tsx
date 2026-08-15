"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, LockKeyhole, RefreshCw } from "lucide-react";

import { useResearchData } from "@/hooks/useResearchData";
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
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    void personalRequest<readonly NoteRecord[]>("notes", undefined, undefined, { symbol: ticker }).then(setNotes).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load notes."));
  }, [ticker]);

  useEffect(load, [load]);
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  return (
    <div className="notes-workspace">
      <aside><header><span>{ticker}</span><strong>RESEARCH NOTES</strong></header>{notes.length ? notes.map((note) => <button type="button" key={note.id} className={selected?.id === note.id ? "is-active" : ""} onClick={() => { setSelectedId(note.id); setTitle(note.title ?? ""); setBody(note.body); }}><strong>{note.title || "Untitled note"}</strong><span>{new Date(note.updatedAt).toLocaleDateString()}</span></button>) : <p>No saved notes for {ticker}.</p>}</aside>
      <section>
        <label><span>TITLE</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={`${ticker} thesis / level / catalyst`} /></label>
        <label><span>MARKDOWN NOTE</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={`# ${ticker}\n\n- Research observation\n- Risk / invalidation\n- Upcoming catalyst`} /></label>
        {message && <p className="personal-message">{message}</p>}
        <div className="personal-actions">
          <button type="button" disabled={!body.trim()} onClick={() => {
            const method = selected ? "PATCH" : "POST";
            void personalRequest<NoteRecord>("notes", { method, body: JSON.stringify({ symbol: ticker, title: title.trim() || null, body }) }, selected?.id).then(() => { setMessage("Note saved privately in PostgreSQL."); setSelectedId(null); setTitle(""); setBody(""); load(); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to save note."));
          }}>{selected ? "UPDATE NOTE" : "SAVE NOTE"}</button>
          {selected && <button type="button" className="is-danger" onClick={() => void personalRequest<{ deleted: boolean }>("notes", { method: "DELETE" }, selected.id).then(() => { setSelectedId(null); setTitle(""); setBody(""); load(); })}>DELETE</button>}
          <button type="button" onClick={() => { setSelectedId(null); setTitle(""); setBody(""); }}>NEW</button>
        </div>
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
      <section className="alert-builder"><header><span>INTERNAL RESEARCH AUTOMATION</span><strong>NEW ALERT</strong></header><div className="alert-fields"><label><span>TYPE</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="PRICE">Price</option><option value="PERCENT_CHANGE">Percent move</option><option value="RELATIVE_VOLUME">Relative volume</option><option value="NEWS">New Benzinga story</option><option value="EVENT">Corporate event</option><option value="TECHNICAL">Technical condition</option></select></label><label><span>SYMBOL</span><input value={symbol} maxLength={15} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))} /></label><label><span>THRESHOLD / RULE</span><input value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder={type === "NEWS" ? "ANY NEW STORY" : "e.g. > 200"} /></label></div><button type="button" disabled={!symbol || !threshold.trim()} onClick={() => void personalRequest<AlertRecord>("alerts", { method: "POST", body: JSON.stringify({ name: `${symbol} ${type.replaceAll("_", " ")}`, type, symbol, configuration: { rule: threshold.trim() }, enabled: true }) }).then(() => { setThreshold(""); setMessage("Alert saved. Evaluation workers must be scheduled separately."); load(); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to save alert."))}>SAVE ALERT</button>{message && <p className="personal-message">{message}</p>}</section>
      <section className="alert-list"><header><span>ALERT CENTER</span><strong>{alerts.length} DEFINITIONS</strong></header>{alerts.length ? <table><thead><tr><th>STATE</th><th>SYMBOL</th><th>TYPE</th><th>RULE</th><th>UPDATED</th><th /></tr></thead><tbody>{alerts.map((alert) => <tr key={alert.id}><td>{alert.enabled ? "ENABLED" : "PAUSED"}</td><td>{alert.symbol ?? "ALL"}</td><td>{alert.type.replaceAll("_", " ")}</td><td>{String(alert.configuration.rule ?? "—")}</td><td>{new Date(alert.updatedAt).toLocaleString()}</td><td><button type="button" onClick={() => void personalRequest<{ deleted: boolean }>("alerts", { method: "DELETE" }, alert.id).then(load)}>DELETE</button></td></tr>)}</tbody></table> : <p>No alert definitions saved.</p>}</section>
      <p className="research-disclaimer">Alerts are research notifications, not orders. Saving a definition does not execute trades. Continuous evaluation requires a separately deployed scheduler/worker.</p>
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
