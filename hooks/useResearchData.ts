"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TerminalApiMeta, TerminalApiResponse } from "@/types";

interface CachedResponse<T> {
  readonly data: T;
  readonly meta: TerminalApiMeta;
  readonly storedAt: number;
}

interface ResearchState<T> {
  readonly url: string;
  readonly data: T | null;
  readonly meta: TerminalApiMeta | null;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: { code: string; message: string; retryable: boolean; requestId: string } | null;
}

interface ResearchOptions {
  readonly enabled?: boolean;
  readonly refreshMs?: number;
  readonly retainMs?: number;
}

const responseCache = new Map<string, CachedResponse<unknown>>();
const RESPONSE_CACHE_MAX_ENTRIES = 200;
const RESPONSE_CACHE_MAX_AGE_MS = 30 * 60_000;

function pruneResponseCache(now = Date.now()): void {
  for (const [key, cached] of responseCache) {
    if (now - cached.storedAt > RESPONSE_CACHE_MAX_AGE_MS) responseCache.delete(key);
  }
  while (responseCache.size > RESPONSE_CACHE_MAX_ENTRIES) {
    const leastRecentlyUsed = responseCache.keys().next().value;
    if (leastRecentlyUsed === undefined) break;
    responseCache.delete(leastRecentlyUsed);
  }
}

function storeResponse<T>(url: string, response: CachedResponse<T>): void {
  responseCache.delete(url);
  responseCache.set(url, response as CachedResponse<unknown>);
  pruneResponseCache(response.storedAt);
}

function cachedResponse<T>(url: string, retainMs: number | undefined): CachedResponse<T> | undefined {
  const now = Date.now();
  pruneResponseCache(now);
  const cached = responseCache.get(url) as CachedResponse<T> | undefined;
  if (!cached) return undefined;
  const requestedRetention = retainMs !== undefined && retainMs >= 0
    ? Math.min(retainMs, RESPONSE_CACHE_MAX_AGE_MS)
    : RESPONSE_CACHE_MAX_AGE_MS;
  if (now - cached.storedAt > requestedRetention) {
    responseCache.delete(url);
    return undefined;
  }
  // Map insertion order is the LRU order. Touch a valid entry on hydration.
  responseCache.delete(url);
  responseCache.set(url, cached as CachedResponse<unknown>);
  return cached;
}

function stateForUrl<T>(
  url: string,
  cached: CachedResponse<T> | undefined,
  enabled: boolean,
): ResearchState<T> {
  return {
    url,
    data: cached?.data ?? null,
    meta: cached?.meta ?? null,
    loading: enabled && !cached,
    refreshing: enabled && Boolean(cached),
    error: null,
  };
}

function buildUrl(kind: string, params: Readonly<Record<string, string | number | boolean | null | undefined>>): string {
  const search = new URLSearchParams({ kind });
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  return `/api/research?${search.toString()}`;
}

export function useResearchData<T>(
  kind: string,
  params: Readonly<Record<string, string | number | boolean | null | undefined>> = {},
  options: ResearchOptions = {},
) {
  const url = useMemo(() => buildUrl(kind, params), [kind, params]);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef(0);
  const enabled = options.enabled !== false;
  const initialCache = cachedResponse<T>(url, options.retainMs);
  const [state, setState] = useState<ResearchState<T>>(() =>
    stateForUrl(url, initialCache, enabled));
  // Effects run after paint. Scope the returned state during render as well so a
  // new ticker or query can never be paired with the previous URL's payload.
  const visibleState = state.url === url
    ? state
    : stateForUrl(url, cachedResponse<T>(url, options.retainMs), enabled);

  const reload = useCallback(() => {
    setState((current) => {
      const scoped = current.url === url
        ? current
        : stateForUrl(url, cachedResponse<T>(url, options.retainMs), enabled);
      return {
        ...scoped,
        loading: enabled && !scoped.data,
        refreshing: enabled && Boolean(scoped.data),
        error: null,
      };
    });
    setRevision((value) => value + 1);
  }, [enabled, options.retainMs, url]);

  useEffect(() => {
    const requestNumber = activeRequest.current + 1;
    activeRequest.current = requestNumber;
    const cached = cachedResponse<T>(url, options.retainMs);
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as TerminalApiResponse<T>;
        if (activeRequest.current !== requestNumber) return;
        if (!payload.ok) {
          setState((current) => {
            const scoped = current.url === url
              ? current
              : stateForUrl(url, cached, enabled);
            return { ...scoped, loading: false, refreshing: false, error: payload.error };
          });
          return;
        }
        storeResponse(url, { data: payload.data, meta: payload.meta, storedAt: Date.now() });
        setState({ url, data: payload.data, meta: payload.meta, loading: false, refreshing: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeRequest.current !== requestNumber) return;
        setState((current) => {
          const scoped = current.url === url
            ? current
            : stateForUrl(url, cached, enabled);
          return {
            ...scoped,
            loading: false,
            refreshing: false,
            error: {
              code: "NETWORK_ERROR",
              message: error instanceof Error ? error.message : "The research request failed.",
              retryable: true,
              requestId: "client",
            },
          };
        });
      });

    return () => controller.abort();
  }, [enabled, options.retainMs, revision, url]);

  useEffect(() => {
    if (!enabled || !options.refreshMs || options.refreshMs < 1_000) return;
    const timer = window.setInterval(reload, options.refreshMs);
    return () => window.clearInterval(timer);
  }, [enabled, options.refreshMs, reload]);

  return { ...visibleState, reload, url };
}
