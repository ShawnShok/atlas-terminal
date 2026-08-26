import type { CorporateEvent } from "@/types";
import type { EventCalendarDay, EventHorizon } from "./types";

const DAY_MILLISECONDS = 86_400_000;
const MARKET_TIME_ZONE = "America/New_York";

function validDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateKeyNumber(value: string): number | null {
  if (!validDateKey(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function shiftDateKey(value: string, days: number): string {
  const dateNumber = dateKeyNumber(value);
  if (dateNumber === null) return value;
  return new Date(dateNumber + days * DAY_MILLISECONDS).toISOString().slice(0, 10);
}

/** Returns the calendar date observed in New York, not the timestamp's UTC date. */
export function marketDateKey(value: string): string | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(milliseconds));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export interface EventDateRange {
  readonly from: string;
  readonly to: string;
}

export type EventCalendarSortKey = "time" | "ticker" | "event" | "type" | "status";
export type EventCalendarSortDirection = "ascending" | "descending";

export interface EventCalendarSort {
  readonly key: EventCalendarSortKey;
  readonly direction: EventCalendarSortDirection;
}

export const DEFAULT_EVENT_CALENDAR_SORT: EventCalendarSort = {
  key: "time",
  direction: "ascending",
};

/** Resolves terminal calendar presets against the New York market date. */
export function eventHorizonRange(
  horizon: EventHorizon,
  nowIso: string,
  customFrom = "",
  customTo = "",
): EventDateRange | null {
  const today = marketDateKey(nowIso);
  if (!today) return null;
  if (horizon === "custom") {
    if (!validDateKey(customFrom) || !validDateKey(customTo) || customFrom > customTo) return null;
    return { from: customFrom, to: customTo };
  }
  if (horizon === "today") return { from: today, to: today };
  if (horizon === "tomorrow") {
    const tomorrow = shiftDateKey(today, 1);
    return { from: tomorrow, to: tomorrow };
  }
  const todayNumber = dateKeyNumber(today);
  if (todayNumber === null) return null;
  const weekday = new Date(todayNumber).getUTCDay();
  if (horizon === "this-week") return { from: today, to: shiftDateKey(today, (7 - weekday) % 7) };
  if (horizon === "next-week") {
    const daysToNextMonday = ((8 - weekday) % 7) || 7;
    const from = shiftDateKey(today, daysToNextMonday);
    return { from, to: shiftDateKey(from, 6) };
  }
  const [year, month] = today.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from: today, to: monthEnd };
}

/** Counts New York calendar-day boundaries so DST never turns a day into 23 or 25 hours. */
export function marketCalendarDaysUntil(startsAt: string, nowIso: string): number | null {
  const eventDate = marketDateKey(startsAt);
  const referenceDate = marketDateKey(nowIso);
  const eventNumber = eventDate ? dateKeyNumber(eventDate) : null;
  const referenceNumber = referenceDate ? dateKeyNumber(referenceDate) : null;
  if (eventNumber === null || referenceNumber === null) return null;
  return Math.round((eventNumber - referenceNumber) / DAY_MILLISECONDS);
}

export function formatMarketEventCountdown(startsAt: string, nowIso: string): string {
  const days = marketCalendarDaysUntil(startsAt, nowIso);
  if (days === null) return "DATE UNAVAILABLE";
  if (days < 0) return "STARTED";
  if (days === 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
}

export function groupEventsByMarketDay(
  events: readonly CorporateEvent[],
  nowIso: string,
): readonly EventCalendarDay[] {
  const groups = new Map<string, CorporateEvent[]>();
  for (const event of events) {
    const date = marketDateKey(event.startsAt);
    if (!date) continue;
    groups.set(date, [...(groups.get(date) ?? []), event]);
  }
  const today = marketDateKey(nowIso);
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, items]) => ({
      date,
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00.000Z`)).toUpperCase(),
      isToday: date === today,
      events: items.slice().sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id)),
    }));
}

function compareEventText(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
}

function compareEvents(
  left: CorporateEvent,
  right: CorporateEvent,
  key: EventCalendarSortKey,
): number {
  if (key === "time") return left.startsAt.localeCompare(right.startsAt);
  if (key === "ticker") return compareEventText(left.symbol, right.symbol);
  if (key === "event") {
    return compareEventText(`${left.companyName}\u0000${left.title}`, `${right.companyName}\u0000${right.title}`);
  }
  if (key === "type") return compareEventText(left.type, right.type);
  return compareEventText(left.status, right.status);
}

/**
 * Sorts rows inside each market-date group without flattening or reordering the
 * calendar sections. Chronological ascending order remains the terminal default.
 */
export function sortEventCalendarDays(
  days: readonly EventCalendarDay[],
  sort: EventCalendarSort = DEFAULT_EVENT_CALENDAR_SORT,
): readonly EventCalendarDay[] {
  const direction = sort.direction === "descending" ? -1 : 1;
  return days.map((day) => ({
    ...day,
    events: day.events.slice().sort((left, right) => {
      const primary = compareEvents(left, right, sort.key);
      if (primary !== 0) return primary * direction;
      const chronological = left.startsAt.localeCompare(right.startsAt);
      if (chronological !== 0) return chronological;
      return left.id.localeCompare(right.id);
    }),
  }));
}
