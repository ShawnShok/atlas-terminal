"use client";

import { useState } from "react";

import type { EventAlertDraft, EventAlertEventType, EventAlertStatusTransition } from "@/lib/alerts";
import {
  DEFAULT_EVENT_CALENDAR_SORT,
  formatDate,
  formatDateTime,
  formatMarketEventCountdown,
  formatTime,
  marketCalendarDaysUntil,
  sortEventCalendarDays,
  type EventCalendarSort,
  type EventCalendarSortKey,
} from "@/lib/research";
import type { CorporateEvent, CorporateEventStatus, CorporateEventType } from "@/types";
import type {
  EarningsEvent,
  EventCalendarDay,
  EventCountdown,
  EventFiltersValue,
  EventHorizon,
  ResearchDataStatus,
  SelectOption,
} from "@/lib/research/types";
import { EmptyResearchState, ResearchFrame } from "./ResearchFrame";

const EVENT_HORIZONS: readonly SelectOption<EventHorizon>[] = [
  { value: "today", label: "TODAY" },
  { value: "tomorrow", label: "TOMORROW" },
  { value: "this-week", label: "THIS WEEK" },
  { value: "next-week", label: "NEXT WEEK" },
  { value: "this-month", label: "THIS MONTH" },
  { value: "custom", label: "CUSTOM RANGE" },
];

const CORPORATE_EVENT_TYPES: readonly SelectOption<CorporateEventType>[] = [
  { value: "earnings-release", label: "Earnings release" },
  { value: "earnings-call", label: "Earnings call" },
  { value: "investor-day", label: "Investor day" },
  { value: "analyst-day", label: "Analyst day" },
  { value: "shareholder-meeting", label: "Shareholder meeting" },
  { value: "conference", label: "Conference" },
  { value: "presentation", label: "Presentation" },
  { value: "dividend", label: "Dividend" },
  { value: "stock-split", label: "Stock split" },
  { value: "company-update", label: "Company update" },
  { value: "industry-event", label: "Industry event" },
  { value: "summit", label: "Summit" },
  { value: "other", label: "Other" },
];

const EVENT_TYPES: readonly SelectOption<CorporateEventType | "all">[] = [
  { value: "all", label: "All event types" },
  ...CORPORATE_EVENT_TYPES,
];

const EVENT_STATUSES: readonly SelectOption<CorporateEventStatus | "all">[] = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "canceled", label: "Canceled" },
  { value: "completed", label: "Completed" },
  { value: "unknown", label: "Unknown" },
];

export interface EventWatchlistChoice {
  readonly id: string;
  readonly name: string;
}

export interface EventFilterBarProps {
  readonly value: EventFiltersValue;
  readonly sectors: readonly string[];
  readonly watchlists: readonly EventWatchlistChoice[];
  readonly selectedWatchlistId: string;
  readonly onSelectedWatchlistChange: (id: string) => void;
  readonly onChange: (value: EventFiltersValue) => void;
}

export function EventFilterBar({
  value,
  sectors,
  watchlists,
  selectedWatchlistId,
  onSelectedWatchlistChange,
  onChange,
}: EventFilterBarProps) {
  const update = <Key extends keyof EventFiltersValue,>(
    key: Key,
    next: EventFiltersValue[Key],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="research-filter-stack">
      <div className="research-segmented" role="group" aria-label="Event date range">
        {EVENT_HORIZONS.map((horizon) => (
          <button
            type="button"
            key={horizon.value}
            className={value.horizon === horizon.value ? "is-active" : ""}
            aria-pressed={value.horizon === horizon.value}
            onClick={() => update("horizon", horizon.value)}
          >
            {horizon.label}
          </button>
        ))}
      </div>
      <form className="research-filter-grid" onSubmit={(event) => event.preventDefault()}>
        <label className="research-check-filter">
          <input
            type="checkbox"
            checked={value.watchlistOnly}
            onChange={(event) => update("watchlistOnly", event.target.checked)}
          />
          <span>SELECTED WATCHLIST ONLY</span>
        </label>
        <label>
          <span>WATCHLIST</span>
          <select
            value={selectedWatchlistId}
            disabled={!watchlists.length}
            onChange={(event) => onSelectedWatchlistChange(event.target.value)}
          >
            {watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}
          </select>
        </label>
        <label>
          <span>TICKER</span>
          <input
            value={value.ticker}
            maxLength={10}
            placeholder="ALL"
            disabled={value.watchlistOnly}
            onChange={(event) => update("ticker", event.target.value.toUpperCase())}
          />
        </label>
        <label>
          <span>STATUS</span>
          <select
            value={value.status}
            onChange={(event) => {
              const status = event.target.value as EventFiltersValue["status"];
              onChange({ ...value, status, confirmedOnly: status === "confirmed" ? value.confirmedOnly : false });
            }}
          >
            {EVENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        <label className="research-check-filter">
          <input
            type="checkbox"
            checked={value.confirmedOnly}
            onChange={(event) => onChange({
              ...value,
              confirmedOnly: event.target.checked,
              status: event.target.checked ? "confirmed" : value.status === "confirmed" ? "all" : value.status,
            })}
          />
          <span>ONLY CONFIRMED</span>
        </label>
        <label className="research-check-filter">
          <input type="checkbox" checked={value.earningsOnly} onChange={(event) => update("earningsOnly", event.target.checked)} />
          <span>ONLY EARNINGS</span>
        </label>
        <label>
          <span>EVENT TYPE</span>
          <select
            value={value.type}
            onChange={(event) => update("type", event.target.value as CorporateEventType | "all")}
          >
            {EVENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>MARKET CAP</span>
          <select
            value={value.marketCap}
            onChange={(event) => update("marketCap", event.target.value as EventFiltersValue["marketCap"])}
          >
            <option value="all">All caps</option>
            <option value="micro">Micro</option>
            <option value="small">Small</option>
            <option value="mid">Mid</option>
            <option value="large">Large</option>
            <option value="mega">Mega</option>
          </select>
        </label>
        <label>
          <span>SECTOR</span>
          <select value={value.sector} onChange={(event) => update("sector", event.target.value)}>
            <option value="">All sectors</option>
            {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
          </select>
        </label>
        {value.horizon === "custom" ? (
          <>
            <label>
              <span>FROM</span>
              <input type="date" value={value.customFrom} max={value.customTo || undefined} onChange={(event) => {
                const customFrom = event.target.value;
                onChange({ ...value, customFrom, customTo: value.customTo && value.customTo >= customFrom ? value.customTo : customFrom });
              }} />
            </label>
            <label>
              <span>TO</span>
              <input type="date" value={value.customTo} min={value.customFrom || undefined} onChange={(event) => {
                const customTo = event.target.value;
                onChange({ ...value, customTo, customFrom: value.customFrom && value.customFrom <= customTo ? value.customFrom : customTo });
              }} />
            </label>
          </>
        ) : null}
      </form>
    </div>
  );
}

export interface EventCountdownStripProps {
  readonly countdowns: readonly EventCountdown[];
  readonly onSelect?: (eventId: string) => void;
}

export function EventCountdownStrip({ countdowns, onSelect }: EventCountdownStripProps) {
  if (countdowns.length === 0) return null;
  return (
    <div className="research-countdown-strip" aria-label="Upcoming catalyst countdowns">
      {countdowns.map((countdown) => (
        <button
          type="button"
          key={countdown.eventId}
          className={`urgency-${countdown.urgency}`}
          onClick={() => onSelect?.(countdown.eventId)}
        >
          <span>{countdown.symbol}</span>
          <strong>{countdown.label}</strong>
          <time dateTime={countdown.startsAt}>{countdown.allDay ? `${formatDate(countdown.startsAt)} · DATE ONLY` : formatDateTime(countdown.startsAt)}</time>
        </button>
      ))}
    </div>
  );
}

export interface EventCalendarProps {
  readonly days: readonly EventCalendarDay[];
  readonly referenceTime: string;
  readonly selectedEventId: string | null;
  readonly onEventSelect: (event: CorporateEvent) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

interface EventSortHeaderProps {
  readonly label: string;
  readonly sortKey: EventCalendarSortKey;
  readonly sort: EventCalendarSort;
  readonly onSort: (key: EventCalendarSortKey) => void;
}

function EventSortHeader({ label, sortKey, sort, onSort }: EventSortHeaderProps) {
  const active = sort.key === sortKey;
  const nextDirection = active && sort.direction === "ascending" ? "descending" : "ascending";
  return (
    <th scope="col" aria-sort={active ? sort.direction : "none"}>
      <button
        type="button"
        className={`research-table-sort${active ? " is-active" : ""}`}
        aria-label={`Sort events by ${label.toLowerCase()} ${nextDirection}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        <span aria-hidden="true">{active ? sort.direction === "ascending" ? "▲" : "▼" : "↕"}</span>
      </button>
    </th>
  );
}

function daysUntilDisplay(startsAt: string, referenceTime: string): string {
  const days = marketCalendarDaysUntil(startsAt, referenceTime);
  if (days === null) return "UNAVAILABLE";
  if (days < 0) return "STARTED";
  return `${days} · ${formatMarketEventCountdown(startsAt, referenceTime)}`;
}

export function EventCalendar({ days, referenceTime, selectedEventId, onEventSelect, onTickerSelect }: EventCalendarProps) {
  const [sort, setSort] = useState<EventCalendarSort>(DEFAULT_EVENT_CALENDAR_SORT);
  const sortedDays = sortEventCalendarDays(days, sort);
  const updateSort = (key: EventCalendarSortKey) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "ascending" ? "descending" : "ascending",
  }));
  if (days.length === 0 || days.every((day) => day.events.length === 0)) {
    return <EmptyResearchState title="NO EVENTS" detail="No corporate events match the active filters." />;
  }
  return (
    <div className="research-event-calendar">
      {sortedDays.map((day) => (
        <section key={day.date} className={day.isToday ? "is-today" : ""} aria-label={day.label}>
          <header>
            <time dateTime={day.date}>{day.label}</time>
            <span>{day.events.length} EVENT{day.events.length === 1 ? "" : "S"}</span>
          </header>
          <div className="research-table-wrap">
            <table className="research-table research-events-table">
              <caption className="research-sr-only">Events for {day.label}</caption>
              <thead>
                <tr>
                  <th scope="col">DATE</th>
                  <EventSortHeader label="TIME" sortKey="time" sort={sort} onSort={updateSort} />
                  <EventSortHeader label="TICKER" sortKey="ticker" sort={sort} onSort={updateSort} />
                  <EventSortHeader label="COMPANY / EVENT" sortKey="event" sort={sort} onSort={updateSort} />
                  <EventSortHeader label="EVENT TYPE" sortKey="type" sort={sort} onSort={updateSort} />
                  <EventSortHeader label="STATUS" sortKey="status" sort={sort} onSort={updateSort} />
                  <th scope="col">IMPORTANCE</th>
                  <th scope="col">DAYS UNTIL</th>
                </tr>
              </thead>
              <tbody>
                {day.events.map((event) => (
                  <tr key={event.id} className={selectedEventId === event.id ? "is-selected" : ""}>
                    <td><time dateTime={event.startsAt}>{formatDate(event.startsAt)}</time></td>
                    <td>
                      <button
                        className="research-row-select"
                        type="button"
                        onClick={() => onEventSelect(event)}
                        aria-label={`Open ${event.title}`}
                      >
                        {event.allDay ? "DATE ONLY" : `${formatTime(event.startsAt)} ET`}
                      </button>
                    </td>
                    <td>
                      <button className="research-symbol-button" type="button" onClick={() => onTickerSelect?.(event.symbol)}>
                        {event.symbol}
                      </button>
                    </td>
                    <td>
                      <button className="research-event-title" type="button" onClick={() => onEventSelect(event)}>
                        <strong>{event.companyName}</strong>
                        <span>{event.title}</span>
                      </button>
                    </td>
                    <td>{event.type.replaceAll("-", " ")}</td>
                    <td><span className={`research-event-status status-${event.status}`}>{event.status}</span></td>
                    <td><span className="research-event-unavailable" title="The normalized TMX event does not provide an importance field.">UNAVAILABLE</span></td>
                    <td>{daysUntilDisplay(event.startsAt, referenceTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export interface EventDetailProps {
  readonly event: CorporateEvent | null;
  readonly referenceTime: string;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function EventDetail({ event, referenceTime, onTickerSelect }: EventDetailProps) {
  if (!event) return <EmptyResearchState title="SELECT AN EVENT" detail="Inspect timing, status, and source details." />;
  return (
    <article className="research-event-detail">
      <div className="research-detail-meta">
        <span className={`research-event-status status-${event.status}`}>{event.status}</span>
        <span>{event.type.replaceAll("-", " ")}</span>
      </div>
      <button className="research-detail-symbol" type="button" onClick={() => onTickerSelect?.(event.symbol)}>
        {event.symbol}
      </button>
      <h3>{event.title}</h3>
      <p className="research-detail-company">{event.companyName}</p>
      <dl className="research-detail-list">
        <div><dt>DATE</dt><dd><time dateTime={event.startsAt}>{formatDate(event.startsAt)}</time></dd></div>
        <div><dt>TIME</dt><dd>{event.allDay ? "UNAVAILABLE · DATE ONLY" : <time dateTime={event.startsAt}>{formatTime(event.startsAt)} ET</time>}</dd></div>
        <div><dt>END</dt><dd>{event.endsAt ? <time dateTime={event.endsAt}>{event.allDay ? formatDate(event.endsAt) : formatDateTime(event.endsAt)}</time> : "—"}</dd></div>
        <div><dt>STATUS</dt><dd>{event.status.toUpperCase()}</dd></div>
        <div><dt>IMPORTANCE</dt><dd>UNAVAILABLE · NOT SUPPLIED</dd></div>
        <div><dt>DAYS UNTIL</dt><dd>{daysUntilDisplay(event.startsAt, referenceTime)}</dd></div>
        <div><dt>SOURCE</dt><dd>{event.source.toUpperCase()} · {event.quality.replaceAll("-", " ").toUpperCase()}</dd></div>
        <div><dt>UPDATED</dt><dd><time dateTime={event.asOf}>{formatDateTime(event.asOf)}</time></dd></div>
      </dl>
      {event.description ? <p className="research-detail-description">{event.description}</p> : null}
      {event.eventUrl ? (
        <a className="research-external-link" href={event.eventUrl} target="_blank" rel="noreferrer">
          OPEN EVENT SOURCE <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </article>
  );
}

export interface EarningsCenterProps {
  readonly earnings: readonly EarningsEvent[];
  readonly referenceTime: string;
  readonly onSelect?: (event: CorporateEvent) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function EarningsCenter({ earnings, referenceTime, onSelect, onTickerSelect }: EarningsCenterProps) {
  return (
    <section className="research-subpanel" aria-label="Earnings center">
      <header className="research-subpanel-header">
        <div><span>CATALYST DESK</span><h3>EARNINGS CENTER</h3></div>
        <strong>{earnings.length} UPCOMING</strong>
      </header>
      {earnings.length === 0 ? (
        <EmptyResearchState title="NO EARNINGS" detail="No earnings releases were supplied for this range." />
      ) : (
        <div className="research-table-wrap">
          <table className="research-table research-earnings-table">
            <caption className="research-sr-only">Upcoming company earnings</caption>
            <thead><tr><th>DATE</th><th>TIME</th><th>SYMBOL</th><th>EVENT</th><th>STATUS</th><th>DAYS UNTIL</th><th>IMPORTANCE</th></tr></thead>
            <tbody>
              {earnings.map((item) => (
                <tr key={item.event.id}>
                  <td><button type="button" className="research-row-select" onClick={() => onSelect?.(item.event)}>{formatDate(item.event.startsAt)}</button></td>
                  <td>{item.event.allDay ? "DATE ONLY" : `${formatTime(item.event.startsAt)} ET`}</td>
                  <td><button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(item.event.symbol)}>{item.event.symbol}</button></td>
                  <td>{item.event.type.replaceAll("-", " ")}</td>
                  <td><span className={`research-event-status status-${item.event.status}`}>{item.event.status}</span></td>
                  <td>{daysUntilDisplay(item.event.startsAt, referenceTime)}</td>
                  <td><span className="research-event-unavailable">UNAVAILABLE</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export interface EventAlertBuilderProps {
  readonly defaultTicker: string;
  readonly selectedWatchlist: EventWatchlistChoice | null;
  readonly persistenceAvailable: boolean | null;
  readonly saveState: "idle" | "saving" | "saved" | "error";
  readonly message: string | null;
  readonly onCreate: (draft: EventAlertDraft) => void;
}

const ALERT_TRANSITIONS: readonly SelectOption<EventAlertStatusTransition>[] = [
  { value: "none", label: "No status transition" },
  { value: "any-status-change", label: "Any status change" },
  { value: "pending-to-confirmed", label: "Pending → confirmed" },
  { value: "canceled-or-rescheduled", label: "Canceled or rescheduled" },
];

const ALERT_EVENT_TYPES: readonly SelectOption<EventAlertEventType | "all">[] = [
  { value: "all", label: "Any event" },
  { value: "earnings", label: "Earnings (release or call)" },
  ...CORPORATE_EVENT_TYPES,
];

export function EventAlertBuilder({
  defaultTicker,
  selectedWatchlist,
  persistenceAvailable,
  saveState,
  message,
  onCreate,
}: EventAlertBuilderProps) {
  const [scope, setScope] = useState<EventAlertDraft["scope"]>("ticker");
  const [ticker, setTicker] = useState(defaultTicker);
  const [eventType, setEventType] = useState<EventAlertEventType | "all">("all");
  const [leadDays, setLeadDays] = useState("1");
  const [statusTransition, setStatusTransition] = useState<EventAlertStatusTransition>("none");
  const [cooldownMinutes, setCooldownMinutes] = useState("60");
  const [browserNotification, setBrowserNotification] = useState(true);
  const [sound, setSound] = useState(false);
  const validTicker = /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker.trim().toUpperCase());
  const parsedLeadDays = Number(leadDays);
  const parsedCooldownMinutes = Number(cooldownMinutes);
  const canSave = persistenceAvailable === true
    && saveState !== "saving"
    && Number.isInteger(parsedLeadDays)
    && parsedLeadDays >= 0
    && parsedLeadDays <= 365
    && Number.isInteger(parsedCooldownMinutes)
    && parsedCooldownMinutes >= 0
    && parsedCooldownMinutes <= 10_080
    && (scope === "ticker" ? validTicker : Boolean(selectedWatchlist));

  return (
    <section className="research-event-alert-builder" aria-label="Create corporate event alert">
      <header className="research-subpanel-header">
        <div><span>INTERNAL RESEARCH AUTOMATION</span><h3>EVENT ALERT</h3></div>
        <strong>{persistenceAvailable === true ? "POSTGRESQL" : persistenceAvailable === null ? "CHECKING STORAGE" : "STORAGE UNAVAILABLE"}</strong>
      </header>
      <div className="research-event-alert-fields">
        <label>
          <span>SCOPE</span>
          <select value={scope} onChange={(event) => setScope(event.target.value as EventAlertDraft["scope"])}>
            <option value="ticker">Ticker</option>
            <option value="watchlist" disabled={!selectedWatchlist}>Selected watchlist</option>
          </select>
        </label>
        {scope === "ticker" ? (
          <label>
            <span>TICKER</span>
            <input value={ticker} maxLength={15} onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))} />
          </label>
        ) : (
          <label>
            <span>WATCHLIST</span>
            <input value={selectedWatchlist?.name ?? "NO WATCHLIST SELECTED"} readOnly />
          </label>
        )}
        <label>
          <span>EVENT TYPE</span>
          <select value={eventType} onChange={(event) => setEventType(event.target.value as EventAlertEventType | "all")}>
            {ALERT_EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label>
          <span>LEAD DAYS</span>
          <input type="number" min="0" max="365" step="1" value={leadDays} onChange={(event) => setLeadDays(event.target.value)} />
        </label>
        <label className="research-event-alert-transition">
          <span>STATUS TRANSITION</span>
          <select value={statusTransition} onChange={(event) => setStatusTransition(event.target.value as EventAlertStatusTransition)}>
            {ALERT_TRANSITIONS.map((transition) => <option key={transition.value} value={transition.value}>{transition.label}</option>)}
          </select>
        </label>
        <label>
          <span>COOLDOWN MINUTES</span>
          <input type="number" min="0" max="10080" step="1" value={cooldownMinutes} onChange={(event) => setCooldownMinutes(event.target.value)} />
        </label>
        <label className="research-check-filter">
          <input type="checkbox" checked={browserNotification} onChange={(event) => setBrowserNotification(event.target.checked)} />
          <span>BROWSER</span>
        </label>
        <label className="research-check-filter">
          <input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} />
          <span>SOUND</span>
        </label>
        <button
          type="button"
          className="research-primary-button"
          disabled={!canSave}
          onClick={() => onCreate({
            scope,
            ticker,
            watchlistId: selectedWatchlist?.id ?? null,
            watchlistName: selectedWatchlist?.name ?? null,
            eventType: eventType === "all" ? null : eventType,
            leadDays: parsedLeadDays,
            statusTransition,
            cooldownMinutes: parsedCooldownMinutes,
            browserNotification,
            sound,
          })}
        >
          {saveState === "saving" ? "SAVING…" : "CREATE EVENT ALERT"}
        </button>
      </div>
      <p className={`research-event-alert-message is-${saveState}`} role="status" aria-live="polite">
        {message ?? (persistenceAvailable === false
          ? "Configure PostgreSQL to save event alerts. Session-only alerts are intentionally not implied to be active."
          : "While ATLAS is open, one terminal monitor evaluates saved alerts every 60 seconds. A separate worker is still required while the browser is closed; alerts never place orders.")}
      </p>
    </section>
  );
}

export interface EventsTerminalProps {
  readonly status: ResearchDataStatus;
  readonly filters: EventFiltersValue;
  readonly sectors: readonly string[];
  readonly days: readonly EventCalendarDay[];
  readonly countdowns: readonly EventCountdown[];
  readonly selectedEvent: CorporateEvent | null;
  readonly earnings: readonly EarningsEvent[];
  readonly referenceTime: string;
  readonly watchlists: readonly EventWatchlistChoice[];
  readonly selectedWatchlistId: string;
  readonly onSelectedWatchlistChange: (id: string) => void;
  readonly alert: EventAlertBuilderProps;
  readonly onFiltersChange: (value: EventFiltersValue) => void;
  readonly onEventSelect: (event: CorporateEvent) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function EventsTerminal({
  status,
  filters,
  sectors,
  days,
  countdowns,
  selectedEvent,
  earnings,
  referenceTime,
  watchlists,
  selectedWatchlistId,
  onSelectedWatchlistChange,
  alert,
  onFiltersChange,
  onEventSelect,
  onTickerSelect,
}: EventsTerminalProps) {
  return (
    <ResearchFrame title="CORPORATE EVENTS" eyebrow="TMX CORPORATE EVENTS" status={status} className="research-events-terminal">
      <EventCountdownStrip countdowns={countdowns} onSelect={(id) => {
        const event = days.flatMap((day) => day.events).find((candidate) => candidate.id === id);
        if (event) onEventSelect(event);
      }} />
      <EventFilterBar
        value={filters}
        sectors={sectors}
        watchlists={watchlists}
        selectedWatchlistId={selectedWatchlistId}
        onSelectedWatchlistChange={onSelectedWatchlistChange}
        onChange={onFiltersChange}
      />
      <div className="research-master-detail research-events-layout">
        <EventCalendar days={days} referenceTime={referenceTime} selectedEventId={selectedEvent?.id ?? null} onEventSelect={onEventSelect} onTickerSelect={onTickerSelect} />
        <EventDetail event={selectedEvent} referenceTime={referenceTime} onTickerSelect={onTickerSelect} />
      </div>
      <EarningsCenter earnings={earnings} referenceTime={referenceTime} onSelect={onEventSelect} onTickerSelect={onTickerSelect} />
      <EventAlertBuilder key={`${alert.defaultTicker}:${alert.selectedWatchlist?.id ?? "none"}`} {...alert} />
      <p className="research-disclaimer">TMX event timing and status are displayed as returned and normalized. Importance is unavailable because the normalized source does not supply it. Alerts are research notifications, never trade orders.</p>
    </ResearchFrame>
  );
}
