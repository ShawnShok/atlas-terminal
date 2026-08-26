"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { normalizeWatchlistSymbols } from "@/lib/stocks";

export interface PersonalWatchlistTicker {
  readonly id?: string;
  readonly symbol: string;
  readonly position: number;
}

export interface PersonalWatchlist {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly position: number;
  readonly tickers: readonly PersonalWatchlistTicker[];
  readonly updatedAt?: string;
}

interface PersonalSettings {
  readonly defaultWatchlistId: string | null;
}

interface PersonalPayload<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly code: string; readonly message: string };
}

const SESSION_LISTS: readonly PersonalWatchlist[] = [
  {
    id: "session-core",
    name: "CORE",
    description: "Primary liquid research list",
    position: 0,
    tickers: ["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "META", "PLTR", "TSLA"].map((symbol, position) => ({ symbol, position })),
  },
  {
    id: "session-ai",
    name: "AI",
    description: "AI infrastructure and applications",
    position: 1,
    tickers: ["NVDA", "MSFT", "GOOGL", "META", "AVGO", "AMD", "PLTR"].map((symbol, position) => ({ symbol, position })),
  },
  {
    id: "session-semiconductors",
    name: "SEMICONDUCTORS",
    description: "Semiconductor research universe",
    position: 2,
    tickers: ["NVDA", "AMD", "AVGO", "MU", "QCOM", "AMAT", "INTC", "ARM"].map((symbol, position) => ({ symbol, position })),
  },
] as const;

interface SessionWatchlistStore {
  readonly lists: readonly PersonalWatchlist[];
  readonly selectedId: string;
  readonly defaultId: string | null;
}

const WATCHLIST_SESSION_STORAGE_KEY = "atlas.watchlists.session.v1";
const INITIAL_SESSION_STORE: SessionWatchlistStore = {
  lists: SESSION_LISTS,
  selectedId: SESSION_LISTS[0].id,
  defaultId: SESSION_LISTS[0].id,
};
let sessionStore = INITIAL_SESSION_STORE;
let sessionStoreHydrated = false;
const sessionStoreListeners = new Set<() => void>();
const durableReloadListeners = new Set<() => Promise<void>>();

function sessionStoreSnapshot(): SessionWatchlistStore {
  return sessionStore;
}

function subscribeSessionStore(listener: () => void): () => void {
  sessionStoreListeners.add(listener);
  return () => sessionStoreListeners.delete(listener);
}

function parseSessionStore(value: unknown): SessionWatchlistStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.lists)) return null;
  const lists = candidate.lists.flatMap((item, position): PersonalWatchlist[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const list = item as Record<string, unknown>;
    if (typeof list.id !== "string" || !list.id.trim() || list.id.length > 128
      || typeof list.name !== "string" || !list.name.trim() || list.name.length > 80
      || !Array.isArray(list.tickers)) return [];
    const symbols = normalizeWatchlistSymbols(list.tickers.flatMap((ticker) => {
      if (!ticker || typeof ticker !== "object" || Array.isArray(ticker)) return [];
      const symbol = (ticker as Record<string, unknown>).symbol;
      return typeof symbol === "string" ? [symbol] : [];
    }));
    return [{
      id: list.id.trim(),
      name: list.name.trim().toUpperCase(),
      description: typeof list.description === "string" ? list.description.slice(0, 500) : null,
      position,
      tickers: symbols.map((symbol, tickerPosition) => ({ symbol, position: tickerPosition })),
      updatedAt: typeof list.updatedAt === "string" ? list.updatedAt : undefined,
    }];
  });
  if (lists.length === 0 || lists.length !== candidate.lists.length) return null;
  const selectedId = typeof candidate.selectedId === "string"
    && lists.some((list) => list.id === candidate.selectedId)
    ? candidate.selectedId
    : lists[0].id;
  const defaultId = typeof candidate.defaultId === "string"
    && lists.some((list) => list.id === candidate.defaultId)
    ? candidate.defaultId
    : null;
  return { lists, selectedId, defaultId };
}

function publishSessionStore(next: SessionWatchlistStore): void {
  sessionStore = next;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(WATCHLIST_SESSION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The in-memory external store remains the fallback when storage is blocked.
    }
  }
  sessionStoreListeners.forEach((listener) => listener());
}

function updateSessionStore(updater: (current: SessionWatchlistStore) => SessionWatchlistStore): void {
  publishSessionStore(updater(sessionStore));
}

function hydrateSessionStore(): void {
  if (sessionStoreHydrated || typeof window === "undefined") return;
  sessionStoreHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(WATCHLIST_SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = parseSessionStore(JSON.parse(raw) as unknown);
    if (parsed) publishSessionStore(parsed);
  } catch {
    // Ignore malformed or inaccessible storage and keep the safe defaults.
  }
}

function refreshOtherDurableHooks(origin: () => Promise<void>): void {
  durableReloadListeners.forEach((listener) => {
    if (listener !== origin) void listener();
  });
}

async function request<T>(resource: string, init?: RequestInit, id?: string): Promise<T> {
  const params = new URLSearchParams({ resource });
  if (id) params.set("id", id);
  const response = await fetch(`/api/personal?${params.toString()}`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
  });
  const payload = await response.json() as PersonalPayload<T>;
  if (!payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Personal watchlist request failed.");
  }
  return payload.data;
}

function withSymbols(list: PersonalWatchlist, symbols: readonly string[]): PersonalWatchlist {
  return {
    ...list,
    tickers: normalizeWatchlistSymbols(symbols).map((symbol, position) => ({ symbol, position })),
  };
}

export function useWatchlists() {
  const session = useSyncExternalStore(subscribeSessionStore, sessionStoreSnapshot, sessionStoreSnapshot);
  const [durableLists, setDurableLists] = useState<readonly PersonalWatchlist[]>([]);
  const [durableSelectedId, setDurableSelectedId] = useState("");
  const [durableDefaultId, setDurableDefaultId] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const status = await request<{ configured: boolean }>("status");
      if (!status.configured) {
        setConfigured(false);
        return;
      }
      const [savedLists, settings] = await Promise.all([
        request<readonly PersonalWatchlist[]>("watchlists"),
        request<PersonalSettings>("settings"),
      ]);
      const next = savedLists.length > 0 ? savedLists : [];
      setDurableLists(next);
      setDurableDefaultId(settings.defaultWatchlistId);
      setDurableSelectedId((current) => next.some((list) => list.id === current)
        ? current
        : settings.defaultWatchlistId && next.some((list) => list.id === settings.defaultWatchlistId)
          ? settings.defaultWatchlistId
          : next[0]?.id ?? "");
      setConfigured(true);
      setMessage(null);
    } catch (error) {
      setConfigured(false);
      setMessage(error instanceof Error ? error.message : "Saved watchlists are unavailable; session lists remain active.");
    }
  }, []);

  useEffect(() => {
    hydrateSessionStore();
    durableReloadListeners.add(load);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      durableReloadListeners.delete(load);
      window.clearTimeout(timer);
    };
  }, [load]);

  const lists = configured === true ? durableLists : session.lists;
  const selectedId = configured === true ? durableSelectedId : session.selectedId;
  const defaultId = configured === true ? durableDefaultId : session.defaultId;
  const setSelectedId = useCallback((id: string) => {
    if (configured === true) {
      setDurableSelectedId(id);
      return;
    }
    updateSessionStore((current) => current.lists.some((list) => list.id === id)
      ? { ...current, selectedId: id }
      : current);
  }, [configured]);
  const selected = useMemo(() => lists.find((list) => list.id === selectedId) ?? lists[0] ?? null, [lists, selectedId]);

  const mutate = useCallback(async (
    sessionUpdate: (current: readonly PersonalWatchlist[]) => readonly PersonalWatchlist[],
    persisted: () => Promise<void>,
    successMessage: string,
  ): Promise<boolean> => {
    if (configured === null) {
      setMessage("Watchlist persistence is still being checked. Try again in a moment.");
      return false;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (configured === true) {
        await persisted();
        await load();
        refreshOtherDurableHooks(load);
      } else {
        updateSessionStore((current) => {
          const lists = sessionUpdate(current.lists);
          const selectedId = lists.some((list) => list.id === current.selectedId)
            ? current.selectedId
            : lists[0]?.id ?? "";
          const defaultId = current.defaultId && lists.some((list) => list.id === current.defaultId)
            ? current.defaultId
            : lists[0]?.id ?? null;
          return { lists, selectedId, defaultId };
        });
      }
      setMessage(configured ? successMessage : `${successMessage} Session only until PostgreSQL is connected.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The watchlist change could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [configured, load]);

  const create = useCallback(async (name: string) => {
    const normalized = name.trim().toUpperCase();
    if (!normalized) return;
    const sessionId = `session-${crypto.randomUUID()}`;
    const changed = await mutate(
      (current) => [...current, { id: sessionId, name: normalized, description: null, position: current.length, tickers: [] }],
      async () => {
        const created = await request<PersonalWatchlist>("watchlists", {
          method: "POST",
          body: JSON.stringify({ name: normalized, symbols: [] }),
        });
        setSelectedId(created.id);
      },
      `${normalized} created.`,
    );
    if (changed && configured === false) setSelectedId(sessionId);
  }, [configured, mutate, setSelectedId]);

  const rename = useCallback(async (id: string, name: string) => {
    const normalized = name.trim().toUpperCase();
    if (!normalized) return;
    await mutate(
      (current) => current.map((list) => list.id === id ? { ...list, name: normalized } : list),
      async () => { await request<PersonalWatchlist>("watchlists", { method: "PATCH", body: JSON.stringify({ name: normalized }) }, id); },
      `Watchlist renamed ${normalized}.`,
    );
  }, [mutate]);

  const remove = useCallback(async (id: string) => {
    const fallback = lists.find((list) => list.id !== id)?.id ?? "";
    const changed = await mutate(
      (current) => current.filter((list) => list.id !== id),
      async () => { await request<{ deleted: boolean }>("watchlists", { method: "DELETE" }, id); },
      "Watchlist deleted.",
    );
    if (changed) setSelectedId(fallback);
  }, [lists, mutate, setSelectedId]);

  const setSymbols = useCallback(async (id: string, symbols: readonly string[]) => {
    const normalized = normalizeWatchlistSymbols(symbols);
    await mutate(
      (current) => current.map((list) => list.id === id ? withSymbols(list, normalized) : list),
      async () => { await request<PersonalWatchlist>("watchlists", { method: "PATCH", body: JSON.stringify({ symbols: normalized }) }, id); },
      "Watchlist order saved.",
    );
  }, [mutate]);

  const makeDefault = useCallback(async (id: string) => {
    if (configured === null) {
      setMessage("Watchlist persistence is still being checked. Try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      if (configured === true) {
        await request<PersonalSettings>("settings", { method: "POST", body: JSON.stringify({ defaultWatchlistId: id }) });
        setDurableDefaultId(id);
        refreshOtherDurableHooks(load);
      } else {
        updateSessionStore((current) => ({ ...current, defaultId: id }));
      }
      setMessage(configured ? "Default watchlist saved." : "Default changed for this session; PostgreSQL is not connected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The default watchlist could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [configured, load]);

  return {
    lists,
    selected,
    selectedId,
    defaultId,
    configured,
    busy: busy || configured === null,
    message,
    setSelectedId,
    create,
    rename,
    remove,
    setSymbols,
    makeDefault,
    reload: load,
  } as const;
}
