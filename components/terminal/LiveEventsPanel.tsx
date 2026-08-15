"use client";

import { useEffect, useMemo, useState } from "react";

import { EventsTerminal } from "@/components/research";
import { useResearchData } from "@/hooks/useResearchData";
import {
  formatCountdown,
  marketCapBand,
  type EarningsEvent,
  type EventCalendarDay,
  type EventCountdown,
  type EventFiltersValue,
} from "@/lib/research";
import type { CorporateEvent, EventsResearchBundle, SecurityClassification } from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

const CORE_WATCHLIST = new Set(["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "META", "PLTR", "TSLA"]);
const EMPTY_CLASSIFICATIONS: readonly SecurityClassification[] = [];

function toDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function horizonDates(horizon: EventFiltersValue["horizon"], nowIso: string): { from: string; to: string } {
  const now = new Date(nowIso);
  const start = new Date(now);
  const end = new Date(now);
  if (horizon === "tomorrow") {
    start.setUTCDate(start.getUTCDate() + 1);
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (horizon === "this-week") end.setUTCDate(end.getUTCDate() + 7);
  else if (horizon === "next-week") {
    start.setUTCDate(start.getUTCDate() + 7);
    end.setUTCDate(end.getUTCDate() + 14);
  } else if (horizon === "this-month") end.setUTCDate(end.getUTCDate() + 31);
  return { from: toDate(start), to: toDate(end) };
}

function groupDays(events: readonly CorporateEvent[], nowIso: string): readonly EventCalendarDay[] {
  const groups = new Map<string, CorporateEvent[]>();
  for (const event of events) {
    const date = event.startsAt.slice(0, 10);
    groups.set(date, [...(groups.get(date) ?? []), event]);
  }
  const today = nowIso.slice(0, 10);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({
    date,
    label: new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).toUpperCase(),
    isToday: date === today,
    events: items,
  }));
}

function LiveEventsPanelInner({ ticker, earningsOnly = false, onTickerSelect }: { ticker: string; earningsOnly?: boolean; onTickerSelect: (ticker: string) => void }) {
  const [filters, setFilters] = useState<EventFiltersValue>({
    horizon: earningsOnly ? "this-week" : "this-month",
    watchlistOnly: false,
    ticker,
    type: earningsOnly ? "earnings-release" : "all",
    marketCap: "all",
    sector: "",
    date: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dates = horizonDates(filters.horizon, nowIso);
  const requestedTicker = filters.ticker.trim().toUpperCase();
  const from = filters.date || dates.from;
  const to = filters.date || dates.to;
  const params = useMemo(() => ({
    ticker: requestedTicker || ticker,
    all: filters.watchlistOnly || !requestedTicker,
    from,
    to,
    type: filters.type === "all" ? undefined : filters.type,
  }), [filters.type, filters.watchlistOnly, from, requestedTicker, ticker, to]);
  const result = useResearchData<EventsResearchBundle>(earningsOnly ? "earnings" : "events", params, { refreshMs: 15 * 60_000, retainMs: 5 * 60_000 });
  const candidateEvents = useMemo(() => (result.data?.events ?? []).filter((event) => {
    const symbol = event.symbol.trim().toUpperCase();
    const eventDate = event.startsAt.slice(0, 10);
    if (!filters.watchlistOnly && requestedTicker && symbol !== requestedTicker) return false;
    if (filters.watchlistOnly && !CORE_WATCHLIST.has(symbol)) return false;
    if (eventDate < from || eventDate > to) return false;
    if (filters.type !== "all" && event.type !== filters.type) return false;
    return true;
  }), [filters.type, filters.watchlistOnly, from, requestedTicker, result.data?.events, to]);
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
  const countdowns: EventCountdown[] = events.slice(0, 8).map((event) => {
    const days = (Date.parse(event.startsAt) - Date.parse(nowIso)) / 86_400_000;
    return { eventId: event.id, symbol: event.symbol, label: formatCountdown(event.startsAt, nowIso), startsAt: event.startsAt, urgency: days <= 1 ? "imminent" : days <= 3 ? "soon" : "normal" };
  });
  const earnings: EarningsEvent[] = events.filter((event) => event.type === "earnings-release" || event.type === "earnings-call").map((event) => ({
    event,
    fiscalPeriod: null,
    timing: "unknown",
    epsEstimate: null,
    revenueEstimate: null,
    previousEps: null,
  }));

  if (!result.data) return <DataState loading={result.loading} error={result.error} onRetry={result.reload} />;
  const baseStatus = researchStatus(result.meta, result.error);
  const classificationMessages: string[] = [];
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
      days={groupDays(events, nowIso)}
      countdowns={countdowns}
      selectedEvent={selected}
      earnings={earnings}
      onFiltersChange={setFilters}
      onEventSelect={(event) => setSelectedId(event.id)}
      onTickerSelect={onTickerSelect}
    />
  );
}

export function LiveEventsPanel(props: { ticker: string; earningsOnly?: boolean; onTickerSelect: (ticker: string) => void }) {
  return <LiveEventsPanelInner key={`${props.ticker}:${props.earningsOnly ? "earnings" : "events"}`} {...props} />;
}
