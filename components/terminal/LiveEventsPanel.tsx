"use client";

import { useEffect, useMemo, useState } from "react";

import { EventsTerminal } from "@/components/research";
import { useResearchData } from "@/hooks/useResearchData";
import { useWatchlists } from "@/hooks/useWatchlists";
import { buildEventAlertRequest, type EventAlertDraft } from "@/lib/alerts";
import {
  eventHorizonRange,
  formatMarketEventCountdown,
  groupEventsByMarketDay,
  marketCalendarDaysUntil,
  marketDateKey,
  marketCapBand,
  type EarningsEvent,
  type EventCountdown,
  type EventFiltersValue,
} from "@/lib/research";
import type { EventsResearchBundle, SecurityClassification } from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

const EMPTY_CLASSIFICATIONS: readonly SecurityClassification[] = [];

interface PersonalAlertResponse<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly message: string };
}

async function saveEventAlert(draft: EventAlertDraft): Promise<void> {
  const request = buildEventAlertRequest(draft);
  const response = await fetch("/api/personal?resource=alerts", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = await response.json() as PersonalAlertResponse<unknown>;
  if (!payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "The event alert could not be saved.");
  }
}

function LiveEventsPanelInner({
  ticker,
  earningsOnly = false,
  initialEventId = null,
  initialEventStartsAt = null,
  onTickerSelect,
}: {
  ticker: string;
  earningsOnly?: boolean;
  initialEventId?: string | null;
  initialEventStartsAt?: string | null;
  onTickerSelect: (ticker: string) => void;
}) {
  const watchlists = useWatchlists();
  const initialEventDate = initialEventStartsAt ? marketDateKey(initialEventStartsAt) : null;
  const [filters, setFilters] = useState<EventFiltersValue>({
    horizon: initialEventDate ? "custom" : earningsOnly ? "this-week" : "this-month",
    watchlistOnly: false,
    ticker,
    type: earningsOnly ? "earnings-release" : "all",
    status: "all",
    confirmedOnly: false,
    earningsOnly,
    marketCap: "all",
    sector: "",
    customFrom: initialEventDate ?? marketDateKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10),
    customTo: initialEventDate ?? eventHorizonRange("this-month", new Date().toISOString())?.to ?? new Date().toISOString().slice(0, 10),
  });
  const [selectedId, setSelectedId] = useState<string | null>(initialEventId);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [alertSaveState, setAlertSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dates = eventHorizonRange(filters.horizon, nowIso, filters.customFrom, filters.customTo)
    ?? eventHorizonRange("today", nowIso)!;
  const requestedTicker = filters.ticker.trim().toUpperCase();
  const from = dates.from;
  const to = dates.to;
  const selectedWatchlistSymbols = useMemo(() => new Set(
    (watchlists.selected?.tickers ?? []).map((item) => item.symbol.trim().toUpperCase()),
  ), [watchlists.selected]);
  const queryAllSymbols = filters.watchlistOnly || !requestedTicker;
  const researchKind = earningsOnly || filters.earningsOnly ? "earnings" : "events";
  const params = useMemo(() => ({
    ticker: queryAllSymbols ? undefined : requestedTicker,
    all: queryAllSymbols,
    from,
    to,
    type: filters.type === "all" ? undefined : filters.type,
  }), [filters.type, from, queryAllSymbols, requestedTicker, to]);
  const result = useResearchData<EventsResearchBundle>(researchKind, params, { refreshMs: 15 * 60_000, retainMs: 5 * 60_000 });
  const candidateEvents = useMemo(() => (result.data?.events ?? []).filter((event) => {
    const symbol = event.symbol.trim().toUpperCase();
    const eventDate = marketDateKey(event.startsAt);
    if (!filters.watchlistOnly && requestedTicker && symbol !== requestedTicker) return false;
    if (filters.watchlistOnly && !selectedWatchlistSymbols.has(symbol)) return false;
    if (!eventDate || eventDate < from || eventDate > to) return false;
    if (filters.type !== "all" && event.type !== filters.type) return false;
    if ((earningsOnly || filters.earningsOnly) && event.type !== "earnings-release" && event.type !== "earnings-call") return false;
    if (filters.confirmedOnly && event.status !== "confirmed") return false;
    if (filters.status !== "all" && event.status !== filters.status) return false;
    return true;
  }), [earningsOnly, filters.confirmedOnly, filters.earningsOnly, filters.status, filters.type, filters.watchlistOnly, from, requestedTicker, result.data?.events, selectedWatchlistSymbols, to]);
  const allEventSymbols = useMemo(() => [...new Set(candidateEvents
    .map((event) => event.symbol.trim().toUpperCase())
    .filter(Boolean))].sort(), [candidateEvents]);
  // The shared API parser intentionally limits one classification request to 100 symbols.
  const classificationSymbols = useMemo(() => allEventSymbols.slice(0, 100), [allEventSymbols]);
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
  const classificationData = classificationSymbols.length > 0
    ? classifications.data ?? EMPTY_CLASSIFICATIONS
    : EMPTY_CLASSIFICATIONS;
  const classificationBySymbol = useMemo(() => new Map(
    classificationData.map((classification) => [classification.symbol.trim().toUpperCase(), classification]),
  ), [classificationData]);
  const sectors = useMemo(() => {
    const choices = [...new Set(classificationData
      .map((classification) => classification.sector?.trim())
      .filter((sector): sector is string => Boolean(sector)))];
    if (filters.sector && !choices.includes(filters.sector)) choices.push(filters.sector);
    return choices.sort((left, right) => left.localeCompare(right));
  }, [classificationData, filters.sector]);
  const events = useMemo(() => candidateEvents.filter((event) => {
    if (filters.marketCap === "all" && !filters.sector) return true;
    const classification = classificationBySymbol.get(event.symbol.trim().toUpperCase());
    if (filters.marketCap !== "all" && marketCapBand(classification?.marketCap) !== filters.marketCap) return false;
    if (filters.sector && classification?.sector?.trim() !== filters.sector) return false;
    return true;
  }), [candidateEvents, classificationBySymbol, filters.marketCap, filters.sector]);
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;
  const countdowns: EventCountdown[] = events
    .filter((event) => event.status !== "canceled" && event.status !== "completed")
    .flatMap((event): EventCountdown[] => {
      const days = marketCalendarDaysUntil(event.startsAt, nowIso);
      if (days === null || days < 0) return [];
      const earningsLabel = event.type === "earnings-release" || event.type === "earnings-call" ? "EARNINGS · " : "";
      return [{
        eventId: event.id,
        symbol: event.symbol,
        label: `${earningsLabel}${formatMarketEventCountdown(event.startsAt, nowIso)}`,
        startsAt: event.startsAt,
        allDay: event.allDay,
        urgency: days <= 1 ? "imminent" : days <= 3 ? "soon" : "normal",
      }];
    })
    .slice(0, 8);
  const earnings: EarningsEvent[] = events.filter((event) => {
    const days = marketCalendarDaysUntil(event.startsAt, nowIso);
    return (event.type === "earnings-release" || event.type === "earnings-call")
      && event.status !== "canceled"
      && event.status !== "completed"
      && days !== null
      && days >= 0;
  }).map((event) => ({
    event,
    fiscalPeriod: null,
    timing: "unknown",
    epsEstimate: null,
    revenueEstimate: null,
    previousEps: null,
  }));

  const createAlert = async (draft: EventAlertDraft) => {
    setAlertSaveState("saving");
    setAlertMessage(null);
    try {
      let notificationPermission: EventAlertDraft["notificationPermission"] = "not-requested";
      if (draft.browserNotification) {
        if (typeof Notification === "undefined") {
          notificationPermission = "unsupported";
        } else {
          notificationPermission = Notification.permission;
          if (notificationPermission === "default") {
            notificationPermission = await Notification.requestPermission();
          }
        }
      }
      await saveEventAlert({ ...draft, notificationPermission });
      setAlertSaveState("saved");
      const permissionNote = draft.browserNotification && notificationPermission !== "granted"
        ? ` Browser notifications are ${notificationPermission}; the in-terminal alert${draft.sound ? " and sound" : ""} remains active.`
        : "";
      setAlertMessage(`Event alert saved. It is evaluated every 60 seconds while this ATLAS terminal is open; a separate worker is required after the browser closes.${permissionNote}`);
    } catch (error) {
      setAlertSaveState("error");
      setAlertMessage(error instanceof Error ? error.message : "The event alert could not be saved.");
    }
  };

  if (!result.data) return <DataState loading={result.loading} error={result.error} onRetry={result.reload} />;
  const baseStatus = researchStatus(result.meta, result.error);
  const classificationMessages: string[] = [];
  if (filters.watchlistOnly && !watchlists.selected) {
    classificationMessages.push("No watchlist is selected, so the selected-watchlist filter cannot match events.");
  } else if (filters.watchlistOnly && selectedWatchlistSymbols.size === 0) {
    classificationMessages.push(`${watchlists.selected?.name ?? "The selected watchlist"} has no symbols, so no events can match.`);
  } else if (filters.watchlistOnly && watchlists.selected) {
    classificationMessages.push(`Filtering against selected watchlist ${watchlists.selected.name} (${selectedWatchlistSymbols.size} symbols).`);
  }
  if (watchlists.message) classificationMessages.push(watchlists.message);
  const omittedSymbolCount = allEventSymbols.length - classificationSymbols.length;
  if (omittedSymbolCount > 0) {
    classificationMessages.push(`Security classification is limited to ${classificationSymbols.length} of ${allEventSymbols.length} event symbols; the remainder are excluded by sector or market-cap filters.`);
  }
  if (classificationSymbols.length > 0) {
    if (classifications.error) {
      classificationMessages.push(classifications.data
        ? `Security classification refresh unavailable: ${classifications.error.message}. Retained metadata is being used.`
        : `Security classifications unavailable: ${classifications.error.message}. Sector and market-cap filters cannot be evaluated.`);
    } else if (classifications.loading && !classifications.data) {
      classificationMessages.push("Security classifications are loading; sector and market-cap filtered results will update when metadata is available.");
    } else if (classifications.data) {
      const classificationFilterActive = filters.marketCap !== "all" || Boolean(filters.sector);
      if (classificationFilterActive) {
        const missingEventCount = candidateEvents.filter((event) => {
          const classification = classificationBySymbol.get(event.symbol.trim().toUpperCase());
          if (filters.marketCap !== "all" && marketCapBand(classification?.marketCap) === null) return true;
          return Boolean(filters.sector && !classification?.sector?.trim());
        }).length;
        if (missingEventCount > 0) {
          classificationMessages.push(`${missingEventCount} event${missingEventCount === 1 ? " is" : "s are"} excluded because required classification metadata is unavailable.`);
        }
      } else {
        const missingSymbolCount = classificationSymbols.filter((symbol) =>
          !classificationBySymbol.has(symbol)).length;
        if (missingSymbolCount > 0) {
          classificationMessages.push(`${missingSymbolCount} event symbol${missingSymbolCount === 1 ? " has" : "s have"} no security classification and will be excluded by sector or market-cap filters.`);
        }
      }
    }
  }
  const status = classificationMessages.length > 0
    ? {
        ...baseStatus,
        message: [baseStatus.message, ...classificationMessages].filter(Boolean).join(" · "),
      }
    : baseStatus;
  return (
    <EventsTerminal
      status={status}
      filters={filters}
      sectors={sectors}
      days={groupEventsByMarketDay(events, nowIso)}
      countdowns={countdowns}
      selectedEvent={selected}
      earnings={earnings}
      referenceTime={nowIso}
      watchlists={watchlists.lists.map((watchlist) => ({ id: watchlist.id, name: watchlist.name }))}
      selectedWatchlistId={watchlists.selectedId}
      onSelectedWatchlistChange={watchlists.setSelectedId}
      alert={{
        defaultTicker: selected?.symbol || requestedTicker || ticker,
        selectedWatchlist: watchlists.selected ? { id: watchlists.selected.id, name: watchlists.selected.name } : null,
        persistenceAvailable: watchlists.configured,
        saveState: alertSaveState,
        message: alertMessage,
        onCreate: (draft) => { void createAlert(draft); },
      }}
      onFiltersChange={setFilters}
      onEventSelect={(event) => setSelectedId(event.id)}
      onTickerSelect={onTickerSelect}
    />
  );
}

export function LiveEventsPanel(props: { ticker: string; earningsOnly?: boolean; initialEventId?: string | null; initialEventStartsAt?: string | null; onTickerSelect: (ticker: string) => void }) {
  return <LiveEventsPanelInner key={`${props.ticker}:${props.earningsOnly ? "earnings" : "events"}:${props.initialEventId ?? "next"}`} {...props} />;
}
