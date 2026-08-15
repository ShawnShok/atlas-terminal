"use client";

import type { CorporateEvent, CorporateEventType } from "@/types";
import { formatCurrency, formatDate, formatDateTime, formatTime } from "@/lib/research";
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
];

const EVENT_TYPES: readonly SelectOption<CorporateEventType | "all">[] = [
  { value: "all", label: "All event types" },
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

export interface EventFilterBarProps {
  readonly value: EventFiltersValue;
  readonly sectors: readonly string[];
  readonly onChange: (value: EventFiltersValue) => void;
}

export function EventFilterBar({ value, sectors, onChange }: EventFilterBarProps) {
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
          <span>WATCHLIST ONLY</span>
        </label>
        <label>
          <span>TICKER</span>
          <input
            value={value.ticker}
            maxLength={10}
            placeholder="ALL"
            onChange={(event) => update("ticker", event.target.value.toUpperCase())}
          />
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
        <label>
          <span>DATE</span>
          <input type="date" value={value.date} onChange={(event) => update("date", event.target.value)} />
        </label>
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
          <time dateTime={countdown.startsAt}>{formatDateTime(countdown.startsAt)}</time>
        </button>
      ))}
    </div>
  );
}

export interface EventCalendarProps {
  readonly days: readonly EventCalendarDay[];
  readonly selectedEventId: string | null;
  readonly onEventSelect: (event: CorporateEvent) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function EventCalendar({ days, selectedEventId, onEventSelect, onTickerSelect }: EventCalendarProps) {
  if (days.length === 0 || days.every((day) => day.events.length === 0)) {
    return <EmptyResearchState title="NO EVENTS" detail="No corporate events match the active filters." />;
  }
  return (
    <div className="research-event-calendar">
      {days.map((day) => (
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
                  <th scope="col">TIME</th>
                  <th scope="col">TICKER</th>
                  <th scope="col">COMPANY / EVENT</th>
                  <th scope="col">EVENT TYPE</th>
                  <th scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {day.events.map((event) => (
                  <tr key={event.id} className={selectedEventId === event.id ? "is-selected" : ""}>
                    <td>
                      <button
                        className="research-row-select"
                        type="button"
                        onClick={() => onEventSelect(event)}
                        aria-label={`Open ${event.title}`}
                      >
                        {event.allDay ? "ALL DAY" : formatTime(event.startsAt)}
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
  readonly onTickerSelect?: (ticker: string) => void;
}

export function EventDetail({ event, onTickerSelect }: EventDetailProps) {
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
        <div><dt>START</dt><dd><time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time></dd></div>
        <div><dt>END</dt><dd>{event.endsAt ? <time dateTime={event.endsAt}>{formatDateTime(event.endsAt)}</time> : "—"}</dd></div>
        <div><dt>SESSION</dt><dd>{event.allDay ? "ALL DAY" : "TIMED EVENT"}</dd></div>
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
  readonly onSelect?: (event: CorporateEvent) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function EarningsCenter({ earnings, onSelect, onTickerSelect }: EarningsCenterProps) {
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
            <thead><tr><th>DATE</th><th>SYMBOL</th><th>PERIOD</th><th>TIMING</th><th>EPS EST.</th><th>REV. EST.</th></tr></thead>
            <tbody>
              {earnings.map((item) => (
                <tr key={item.event.id}>
                  <td><button type="button" className="research-row-select" onClick={() => onSelect?.(item.event)}>{formatDate(item.event.startsAt)}</button></td>
                  <td><button type="button" className="research-symbol-button" onClick={() => onTickerSelect?.(item.event.symbol)}>{item.event.symbol}</button></td>
                  <td>{item.fiscalPeriod ?? "—"}</td>
                  <td>{item.timing.replaceAll("-", " ")}</td>
                  <td>{formatCurrency(item.epsEstimate)}</td>
                  <td>{formatCurrency(item.revenueEstimate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      <EventFilterBar value={filters} sectors={sectors} onChange={onFiltersChange} />
      <div className="research-master-detail research-events-layout">
        <EventCalendar days={days} selectedEventId={selectedEvent?.id ?? null} onEventSelect={onEventSelect} onTickerSelect={onTickerSelect} />
        <EventDetail event={selectedEvent} onTickerSelect={onTickerSelect} />
      </div>
      <EarningsCenter earnings={earnings} onSelect={onEventSelect} onTickerSelect={onTickerSelect} />
    </ResearchFrame>
  );
}

