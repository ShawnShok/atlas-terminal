"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NewsTerminal } from "@/components/research";
import { useResearchData } from "@/hooks/useResearchData";
import { useWatchlists } from "@/hooks/useWatchlists";
import {
  easternInclusiveDateUpperBound,
  matchesNewsFilters,
  newsReadKey,
  newsSourceLabel,
  parseNewsTickers,
  sortNewsArticles,
} from "@/lib/research";
import type {
  NewsAlertDraft,
  NewsFiltersValue,
  NewsSortDirection,
  NewsSortKey,
} from "@/lib/research";
import type {
  NewsArticle,
  NewsCategory,
  NewsResearchBundle,
  SecurityClassification,
} from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

interface LiveNewsBundle extends NewsResearchBundle {
  readonly providerNote?: string | null;
}

const EMPTY_NEWS_ARTICLES: readonly NewsArticle[] = [];
const MAX_TARGETED_NEWS_SYMBOLS = 12;

interface PersonalPayload<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly code: string; readonly message: string };
}

interface PersonalStatus {
  readonly configured: boolean;
  readonly detail?: string;
}

interface ReadNewsRecord {
  readonly source: string;
  readonly articleId: string;
  readonly readAt: string;
}

class PersonalNewsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PersonalNewsError";
    this.code = code;
  }
}

async function personalNewsRequest<T>(resource: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/personal?resource=${encodeURIComponent(resource)}`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
  });
  const payload = await response.json() as PersonalPayload<T>;
  if (!payload.ok || payload.data === undefined) {
    throw new PersonalNewsError(
      payload.error?.code ?? `HTTP_${response.status}`,
      payload.error?.message ?? "The personal news request failed.",
    );
  }
  return payload.data;
}

type ReadTrackingMode = "checking" | "durable" | "session" | "unavailable";

function LiveNewsPanelInner({
  ticker,
  allSymbols = false,
  initialArticleId = null,
  onTickerSelect,
}: {
  ticker: string;
  allSymbols?: boolean;
  initialArticleId?: string | null;
  onTickerSelect: (ticker: string) => void;
}) {
  const watchlists = useWatchlists();
  const [filters, setFilters] = useState<NewsFiltersValue>({
    scope: allSymbols ? "all" : "ticker",
    tickers: allSymbols ? "" : ticker,
    sector: "",
    category: "all",
    dateFrom: "",
    dateTo: "",
    timeFrom: "",
    timeTo: "",
    source: "",
    recent: "all",
    unreadOnly: false,
    keyword: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(initialArticleId);
  const [sortKey, setSortKey] = useState<NewsSortKey>("age");
  const [sortDirection, setSortDirection] = useState<NewsSortDirection>("asc");
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [readMode, setReadMode] = useState<ReadTrackingMode>("checking");
  const [readArticleKeys, setReadArticleKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [readMessage, setReadMessage] = useState<string | null>(null);
  const pendingReadArticles = useRef(new Map<string, NewsArticle>());
  const [personalConfigured, setPersonalConfigured] = useState<boolean | null>(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void personalNewsRequest<PersonalStatus>("status", { signal: controller.signal })
      .then(async (status) => {
        if (controller.signal.aborted) return;
        setPersonalConfigured(status.configured);
        if (!status.configured) {
          setReadMode("session");
          setReadMessage(status.detail ?? "PostgreSQL is unavailable.");
          return;
        }
        try {
          const records = await personalNewsRequest<readonly ReadNewsRecord[]>("read-news", { signal: controller.signal });
          if (controller.signal.aborted) return;
          setReadArticleKeys((current) => new Set([
            ...current,
            ...records.map((record) => `${record.source.trim().toLowerCase()}:${record.articleId.trim()}`),
          ]));
          setReadMode("durable");
          setReadMessage(null);
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof PersonalNewsError && error.code === "DATABASE_UNCONFIGURED") {
            setPersonalConfigured(false);
            setReadMode("session");
            setReadMessage(error.message);
          } else {
            setReadMode("unavailable");
            setReadMessage(error instanceof Error ? error.message : "Read state could not be loaded.");
          }
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersonalConfigured(null);
        setReadMode("unavailable");
        setReadMessage(error instanceof Error ? error.message : "Read-state persistence could not be checked.");
      });
    return () => controller.abort();
  }, []);

  const persistReadArticle = useCallback(async (article: NewsArticle) => {
    await personalNewsRequest<ReadNewsRecord>("read-news", {
      method: "POST",
      body: JSON.stringify({ source: article.source, articleId: article.id }),
    });
  }, []);

  useEffect(() => {
    if (readMode === "checking" || pendingReadArticles.current.size === 0) return;
    const pending = [...pendingReadArticles.current.entries()];
    pendingReadArticles.current.clear();
    if (readMode === "session") return;
    if (readMode === "unavailable") {
      setReadArticleKeys((current) => {
        const next = new Set(current);
        pending.forEach(([key]) => next.delete(key));
        return next;
      });
      return;
    }
    void Promise.allSettled(pending.map(async ([key, article]) => {
      try {
        await persistReadArticle(article);
      } catch (error) {
        setReadArticleKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        throw error;
      }
    })).then((results) => {
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) setReadMessage(rejected.reason instanceof Error ? rejected.reason.message : "A read marker could not be saved.");
    });
  }, [persistReadArticle, readMode]);

  const selectedWatchlistTickers = useMemo(() => (watchlists.selected?.tickers ?? [])
    .map((item) => item.symbol.trim().toUpperCase())
    .filter(Boolean), [watchlists.selected]);
  const requestedTickers = useMemo(() => {
    const parsed = parseNewsTickers(filters.tickers);
    return filters.scope === "ticker" && parsed.length === 0 ? [ticker] : parsed;
  }, [filters.scope, filters.tickers, ticker]);
  const unboundedScopeTickers = filters.scope === "watchlist" ? selectedWatchlistTickers : requestedTickers;
  const scopeTickers = useMemo(
    () => unboundedScopeTickers.slice(0, MAX_TARGETED_NEWS_SYMBOLS),
    [unboundedScopeTickers],
  );
  const directTicker = filters.scope === "ticker" && scopeTickers.length === 1
    ? scopeTickers[0]
    : null;
  const params = useMemo(() => ({
    ticker: directTicker ?? undefined,
    symbols: !directTicker && filters.scope !== "all" && scopeTickers.length > 0
      ? scopeTickers.join(",")
      : undefined,
    all: filters.scope === "all" ? true : undefined,
    // Sending an earlier UTC boundary can fetch a few extra records around DST,
    // while the exact Eastern date range is enforced locally below.
    after: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : undefined,
    before: filters.dateTo ? easternInclusiveDateUpperBound(filters.dateTo) ?? undefined : undefined,
  }), [directTicker, filters.dateFrom, filters.dateTo, filters.scope, scopeTickers]);
  const result = useResearchData<LiveNewsBundle>("news", params, { refreshMs: 30_000, retainMs: 20_000 });
  const returnedArticles = result.data?.articles ?? EMPTY_NEWS_ARTICLES;
  const availableCategories = useMemo(() => [...new Set(returnedArticles.flatMap((article) => article.categories))]
    .sort((left, right) => left.localeCompare(right)) as NewsCategory[], [returnedArticles]);
  const availableSources = useMemo(() => [...new Set(returnedArticles.map(newsSourceLabel))]
    .sort((left, right) => left.localeCompare(right)), [returnedArticles]);
  const allArticleSymbols = useMemo(() => [...new Set(returnedArticles.flatMap((article) =>
    article.tickers.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)))].sort(), [returnedArticles]);
  // The shared API ticker parser intentionally caps one request at 100 symbols.
  const classificationSymbols = useMemo(() => allArticleSymbols.slice(0, 100), [allArticleSymbols]);
  const classificationParams = useMemo(() => ({
    symbols: classificationSymbols.join(","),
  }), [classificationSymbols]);
  const classifications = useResearchData<readonly SecurityClassification[]>(
    "classifications",
    classificationParams,
    {
      enabled: classificationSymbols.length > 0,
      refreshMs: 5 * 60_000,
      retainMs: 5 * 60_000,
    },
  );
  const classificationBySymbol = useMemo(() => new Map(
    (classifications.data ?? []).map((classification) => [classification.symbol.toUpperCase(), classification]),
  ), [classifications.data]);
  const availableSectors = useMemo(() => [...new Set((classifications.data ?? [])
    .map((classification) => classification.sector?.trim())
    .filter((sector): sector is string => Boolean(sector)))]
    .sort((left, right) => left.localeCompare(right)), [classifications.data]);
  const selectedWatchlistSymbols = useMemo(() => new Set(selectedWatchlistTickers), [selectedWatchlistTickers]);
  const requestedTickerSet = useMemo(() => new Set(scopeTickers), [scopeTickers]);

  const filteredArticles = useMemo(() => returnedArticles.filter((article) => {
    const articleSymbols = article.tickers.map((symbol) => symbol.trim().toUpperCase());
    if (filters.scope === "watchlist" && !articleSymbols.some((symbol) => selectedWatchlistSymbols.has(symbol))) {
      return false;
    }
    if (requestedTickerSet.size > 0 && !articleSymbols.some((symbol) => requestedTickerSet.has(symbol))) {
      return false;
    }
    if (!matchesNewsFilters(article, filters, nowIso)) return false;
    if (filters.sector && !articleSymbols.some((symbol) =>
      classificationBySymbol.get(symbol)?.sector === filters.sector)) return false;
    if (filters.unreadOnly && readArticleKeys.has(newsReadKey(article)) && article.id !== selectedId) return false;
    return true;
  }), [
    classificationBySymbol,
    filters,
    nowIso,
    readArticleKeys,
    requestedTickerSet,
    returnedArticles,
    selectedId,
    selectedWatchlistSymbols,
  ]);
  const articles = useMemo(() => sortNewsArticles(
    filteredArticles,
    sortKey,
    sortDirection,
    nowIso,
  ), [filteredArticles, nowIso, sortDirection, sortKey]);
  const selected = articles.find((article) => article.id === selectedId) ?? articles[0] ?? null;

  const markArticleRead = useCallback((article: NewsArticle) => {
    const key = newsReadKey(article);
    if (readArticleKeys.has(key)) return;
    if (readMode === "unavailable") {
      setReadMessage((current) => current ?? "Read tracking is unavailable, so this story was not marked read.");
      return;
    }
    setReadArticleKeys((current) => new Set([...current, key]));
    if (readMode === "checking") {
      pendingReadArticles.current.set(key, article);
      return;
    }
    if (readMode === "session") return;
    void persistReadArticle(article).catch((error: unknown) => {
      if (error instanceof PersonalNewsError && error.code === "DATABASE_UNCONFIGURED") {
        setPersonalConfigured(false);
        setReadMode("session");
        setReadMessage(error.message);
        return;
      }
      setReadArticleKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setReadMessage(error instanceof Error ? error.message : "The story could not be marked read.");
    });
  }, [persistReadArticle, readArticleKeys, readMode]);

  const createNewsAlert = useCallback(async (draft: NewsAlertDraft) => {
    if (personalConfigured !== true) {
      setAlertMessage("PostgreSQL is required to save an alert definition.");
      return;
    }
    const normalizedTicker = parseNewsTickers(draft.ticker, 1)[0] ?? null;
    if (draft.ticker.trim() && !normalizedTicker) {
      setAlertMessage("Enter a valid ticker or leave the ticker field blank.");
      return;
    }
    if (draft.watchlistId && !watchlists.lists.some((list) => list.id === draft.watchlistId)) {
      setAlertMessage("Select an available watchlist.");
      return;
    }

    setAlertBusy(true);
    setAlertMessage(null);
    let notificationPermission: NotificationPermission | "unsupported" | "not-requested" = "not-requested";
    const deliveryChannels: Array<"browser" | "sound"> = [];
    try {
      // This permission request is deliberately inside the CREATE button's call path.
      if (draft.browserNotification) {
        if (typeof Notification === "undefined") {
          notificationPermission = "unsupported";
        } else {
          notificationPermission = Notification.permission;
          if (notificationPermission === "default") {
            notificationPermission = await Notification.requestPermission();
          }
          if (notificationPermission === "granted") deliveryChannels.push("browser");
        }
      }
      if (draft.sound) deliveryChannels.push("sound");

      const selectedWatchlist = watchlists.lists.find((list) => list.id === draft.watchlistId);
      const conditionLabel = normalizedTicker
        || selectedWatchlist?.name
        || draft.keyword.trim()
        || (draft.category === "all" ? "ANY ARTICLE" : draft.category.toUpperCase());
      await personalNewsRequest("alerts", {
        method: "POST",
        body: JSON.stringify({
          name: `NEWS · ${conditionLabel || "ANY ARTICLE"}`,
          type: "NEWS",
          symbol: normalizedTicker,
          watchlistId: draft.watchlistId || null,
          configuration: {
            schemaVersion: 1,
            ticker: normalizedTicker,
            watchlistId: draft.watchlistId || null,
            keyword: draft.keyword.trim() || null,
            category: draft.category === "all" ? null : draft.category,
            browserNotification: draft.browserNotification,
            sound: draft.sound,
            notificationPermission,
          },
          enabled: draft.enabled,
          cooldownMinutes: draft.cooldownMinutes,
          deliveryChannels,
        }),
      });
      const permissionNote = draft.browserNotification && notificationPermission !== "granted"
        ? ` Browser notifications are ${notificationPermission}; that channel was not enabled.`
        : "";
      setAlertMessage(`Alert saved in PostgreSQL.${permissionNote} One shared monitor evaluates it every 60 seconds while this ATLAS terminal is open; a separate worker is required after the browser closes.`);
    } catch (error) {
      setAlertMessage(error instanceof Error ? error.message : "The news alert could not be saved.");
    } finally {
      setAlertBusy(false);
    }
  }, [personalConfigured, watchlists.lists]);

  const handleSort = useCallback((nextKey: NewsSortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "age" ? "asc" : nextKey === "publishedAt" ? "desc" : "asc");
  }, [sortKey]);

  if (!result.data) return <DataState loading={result.loading} error={result.error} onRetry={result.reload} />;
  const baseStatus = researchStatus(result.meta, result.error);
  const enrichmentMessages: string[] = result.data.providerNote ? [result.data.providerNote] : [];
  if (scopeTickers.length > 1) {
    enrichmentMessages.push(`Multi-ticker results combine targeted feeds for ${scopeTickers.length} symbols (${returnedArticles.length} deduplicated articles).`);
  }
  if (unboundedScopeTickers.length > scopeTickers.length) {
    enrichmentMessages.push(`Targeted news retrieval is limited to the first ${scopeTickers.length} symbols in this view.`);
  }
  if (filters.scope === "watchlist") {
    enrichmentMessages.push(watchlists.selected
      ? `${watchlists.selected.name}: ${watchlists.selected.tickers.length} ticker${watchlists.selected.tickers.length === 1 ? "" : "s"}.`
      : "No watchlist is selected.");
  }
  if (allArticleSymbols.length > classificationSymbols.length) {
    enrichmentMessages.push(`Sector enrichment is limited to ${classificationSymbols.length} of ${allArticleSymbols.length} article symbols.`);
  }
  if (classifications.error) {
    enrichmentMessages.push(`Sector classification enrichment unavailable: ${classifications.error.message}`);
  } else if (classifications.loading && !classifications.data) {
    enrichmentMessages.push("Sector classification enrichment is loading.");
  } else if (classifications.data) {
    const enrichedSymbols = new Set(classifications.data
      .filter((classification) => Boolean(classification.sector))
      .map((classification) => classification.symbol.toUpperCase()));
    const missingCount = classificationSymbols.filter((symbol) => !enrichedSymbols.has(symbol)).length;
    if (missingCount > 0) {
      enrichmentMessages.push(`${missingCount} article symbol${missingCount === 1 ? " has" : "s have"} no sector classification and ${missingCount === 1 ? "is" : "are"} excluded from sector-filtered results.`);
    }
  }
  const status = enrichmentMessages.length > 0
    ? {
        ...baseStatus,
        message: [baseStatus.message, ...enrichmentMessages].filter(Boolean).join(" · "),
      }
    : baseStatus;
  const readTrackingLabel = readMode === "durable"
    ? `DURABLE READ STATE — PostgreSQL${readMessage ? ` · ${readMessage}` : ""}`
    : readMode === "session"
      ? `SESSION READ STATE — PostgreSQL unavailable; read markers clear when this panel closes.${readMessage ? ` ${readMessage}` : ""}`
      : readMode === "checking"
        ? "READ STATE — checking PostgreSQL persistence…"
        : `READ STATE UNAVAILABLE — ${readMessage ?? "the persistence check failed"}`;
  const watchlistOptions = watchlists.lists.map((list) => ({ id: list.id, label: list.name }));

  return (
    <NewsTerminal
      status={status}
      providerLabel={result.meta?.mode === "mock"
        ? "MOCK NEWS FIXTURE"
        : result.meta?.source.includes("benzinga")
          ? "BENZINGA DATASET"
          : "MASSIVE STOCK NEWS"}
      filters={filters}
      sectors={availableSectors}
      categories={availableCategories}
      sources={availableSources}
      watchlists={watchlistOptions}
      selectedWatchlistId={watchlists.selectedId}
      articles={articles}
      selectedArticle={selected}
      readArticleKeys={readArticleKeys}
      readTrackingLabel={readTrackingLabel}
      readTrackingAvailable={readMode === "durable" || readMode === "session"}
      nowIso={nowIso}
      sortKey={sortKey}
      sortDirection={sortDirection}
      alertBusy={alertBusy}
      alertMessage={alertMessage ?? (personalConfigured === false
        ? "ALERT PERSISTENCE UNAVAILABLE — configure DATABASE_URL to save definitions."
        : personalConfigured === null
          ? "Checking alert persistence…"
          : null)}
      alertPersistenceAvailable={personalConfigured === true}
      headlineMode
      onFiltersChange={setFilters}
      onSelectedWatchlistChange={watchlists.setSelectedId}
      onSort={handleSort}
      onArticleSelect={(article: NewsArticle) => {
        setSelectedId(article.id);
        markArticleRead(article);
      }}
      onCreateNewsAlert={(draft) => { void createNewsAlert(draft); }}
      onTickerSelect={onTickerSelect}
      onRefresh={() => {
        result.reload();
        classifications.reload();
        void watchlists.reload();
      }}
    />
  );
}

export function LiveNewsPanel(props: { ticker: string; allSymbols?: boolean; initialArticleId?: string | null; onTickerSelect: (ticker: string) => void }) {
  return <LiveNewsPanelInner key={`${props.ticker}:${props.allSymbols ? "all" : "ticker"}:${props.initialArticleId ?? "latest"}`} {...props} />;
}
