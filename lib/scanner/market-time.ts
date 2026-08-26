import type { AggregateBar } from "@/types";

const NEW_YORK_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const REGULAR_SESSION_OPEN_MINUTE = 9 * 60 + 30;
const REGULAR_SESSION_CLOSE_MINUTE = 16 * 60;
const MINIMUM_BASELINE_SESSIONS = 5;
const MAXIMUM_BASELINE_SESSIONS = 20;
const MINIMUM_BAR_COVERAGE = 0.8;
const SCANNER_SIGNAL_INTERVAL_MINUTES = 5;
const MINIMUM_EXTREME_HISTORY_BARS = 6;

interface NewYorkMoment {
  readonly calendarDate: string;
  readonly minuteOfDay: number;
}

export interface IntradayRelativeVolumeObservation {
  readonly value: number;
  readonly currentVolume: number;
  readonly averageComparableVolume: number;
  readonly baselineSessionCount: number;
  readonly intervalMinutes: number;
  readonly throughMinuteEastern: number;
}

export interface IntradayScannerSignals {
  /** Latest three completed bars' average volume divided by the prior three. */
  readonly volumeAccelerationRatio: number | null;
  /** True only when the latest completed bar exceeds every prior session high. */
  readonly newIntradayHigh: boolean | null;
  /** True only when the latest completed bar falls below every prior session low. */
  readonly newIntradayLow: boolean | null;
  readonly completedBarCount: number;
  readonly intervalMinutes: number;
  readonly latestCompletedAt: string;
}

function newYorkMoment(value: string): NewYorkMoment | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(NEW_YORK_PARTS.formatToParts(date)
    .filter((part) => ["year", "month", "day", "hour", "minute"].includes(part.type))
    .map((part) => [part.type, Number(part.value)]));
  if (![parts.year, parts.month, parts.day, parts.hour, parts.minute].every(Number.isFinite)) return null;
  return {
    calendarDate: `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    minuteOfDay: parts.hour * 60 + parts.minute,
  };
}

export function newYorkCalendarDate(value: string): string | null {
  return newYorkMoment(value)?.calendarDate ?? null;
}

function intervalMinutes(bars: readonly AggregateBar[]): number | null {
  const intervals = [...new Set(bars.map((bar) => /^(\d+)m$/.exec(bar.interval)?.[1] ?? null)
    .filter((value): value is string => value !== null)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))];
  return intervals.length === 1 ? intervals[0] : null;
}

/**
 * Derives short-horizon signals from completed regular-session bars only.
 * It never treats a still-forming bar, extended-hours print, or prior session
 * as evidence of a current-session acceleration or new extreme.
 */
export function calculateIntradayScannerSignals(
  bars: readonly AggregateBar[],
  now: string,
): IntradayScannerSignals | null {
  const currentMoment = newYorkMoment(now);
  const currentTimestamp = Date.parse(now);
  const interval = intervalMinutes(bars);
  if (!currentMoment || !Number.isFinite(currentTimestamp)
    || interval !== SCANNER_SIGNAL_INTERVAL_MINUTES) return null;

  const latestExpectedMinute = currentMoment.minuteOfDay >= REGULAR_SESSION_CLOSE_MINUTE
    ? REGULAR_SESSION_CLOSE_MINUTE - interval
    : REGULAR_SESSION_OPEN_MINUTE
      + Math.floor((currentMoment.minuteOfDay - REGULAR_SESSION_OPEN_MINUTE) / interval) * interval
      - interval;
  if (latestExpectedMinute < REGULAR_SESSION_OPEN_MINUTE) return null;

  const completedByTimestamp = new Map<number, AggregateBar>();
  for (const bar of bars) {
    const timestamp = Date.parse(bar.timestamp);
    const moment = newYorkMoment(bar.timestamp);
    if (!moment || !Number.isFinite(timestamp)
      || moment.calendarDate !== currentMoment.calendarDate
      || moment.minuteOfDay < REGULAR_SESSION_OPEN_MINUTE
      || moment.minuteOfDay >= REGULAR_SESSION_CLOSE_MINUTE
      || timestamp + interval * 60_000 > currentTimestamp
      || !Number.isFinite(bar.high) || !Number.isFinite(bar.low)
      || !Number.isFinite(bar.volume) || bar.volume < 0) continue;
    completedByTimestamp.set(timestamp, bar);
  }
  const completed = [...completedByTimestamp.values()]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const expectedBarCount = Math.floor(
    (latestExpectedMinute - REGULAR_SESSION_OPEN_MINUTE) / interval,
  ) + 1;
  const hasContinuousSessionHistory = completed.length === expectedBarCount
    && completed.every((bar, index) => {
      const moment = newYorkMoment(bar.timestamp);
      const previousTimestamp = index > 0 ? Date.parse(completed[index - 1].timestamp) : null;
      return moment?.minuteOfDay === REGULAR_SESSION_OPEN_MINUTE + index * interval
        && (previousTimestamp === null
          || Date.parse(bar.timestamp) - previousTimestamp === interval * 60_000);
    });
  if (!hasContinuousSessionHistory) return null;

  const latest = completed.at(-1)!;
  const prior = completed.slice(0, -1);
  let volumeAccelerationRatio: number | null = null;
  if (completed.length >= 6) {
    const previousWindow = completed.slice(-6, -3);
    const latestWindow = completed.slice(-3);
    const previousAverage = previousWindow.reduce((sum, bar) => sum + bar.volume, 0) / previousWindow.length;
    const latestAverage = latestWindow.reduce((sum, bar) => sum + bar.volume, 0) / latestWindow.length;
    if (Number.isFinite(previousAverage) && previousAverage > 0 && Number.isFinite(latestAverage)) {
      volumeAccelerationRatio = latestAverage / previousAverage;
    }
  }

  return {
    volumeAccelerationRatio,
    newIntradayHigh: completed.length >= MINIMUM_EXTREME_HISTORY_BARS
      ? latest.high > Math.max(...prior.map((bar) => bar.high))
      : null,
    newIntradayLow: completed.length >= MINIMUM_EXTREME_HISTORY_BARS
      ? latest.low < Math.min(...prior.map((bar) => bar.low))
      : null,
    completedBarCount: completed.length,
    intervalMinutes: interval,
    latestCompletedAt: latest.timestamp,
  };
}

/**
 * Compares completed regular-session volume with the same elapsed portion of
 * prior New York sessions. Sparse or incomplete histories deliberately return
 * null so scanner rules fail closed instead of presenting a misleading RVOL.
 */
export function calculateIntradayRelativeVolume(
  bars: readonly AggregateBar[],
  now: string,
): IntradayRelativeVolumeObservation | null {
  const currentMoment = newYorkMoment(now);
  const interval = intervalMinutes(bars);
  if (!currentMoment || !interval) return null;

  const throughMinute = currentMoment.minuteOfDay >= REGULAR_SESSION_CLOSE_MINUTE
    ? REGULAR_SESSION_CLOSE_MINUTE - interval
    : REGULAR_SESSION_OPEN_MINUTE
      + Math.floor((currentMoment.minuteOfDay - REGULAR_SESSION_OPEN_MINUTE) / interval) * interval
      - interval;
  if (throughMinute < REGULAR_SESSION_OPEN_MINUTE) return null;

  const bySession = new Map<string, Map<string, AggregateBar>>();
  for (const bar of bars) {
    const moment = newYorkMoment(bar.timestamp);
    if (!moment || moment.minuteOfDay < REGULAR_SESSION_OPEN_MINUTE
      || moment.minuteOfDay >= REGULAR_SESSION_CLOSE_MINUTE || moment.minuteOfDay > throughMinute
      || !Number.isFinite(bar.volume) || bar.volume < 0) continue;
    const session = bySession.get(moment.calendarDate) ?? new Map<string, AggregateBar>();
    session.set(bar.timestamp, bar);
    bySession.set(moment.calendarDate, session);
  }

  const expectedBars = Math.floor((throughMinute - REGULAR_SESSION_OPEN_MINUTE) / interval) + 1;
  const minimumBars = Math.max(1, Math.ceil(expectedBars * MINIMUM_BAR_COVERAGE));
  const comparableVolume = (session: Map<string, AggregateBar> | undefined): number | null => {
    if (!session) return null;
    const comparable = [...session.values()].map((bar) => ({ bar, moment: newYorkMoment(bar.timestamp)! }));
    if (comparable.length < minimumBars
      || Math.min(...comparable.map(({ moment }) => moment.minuteOfDay)) > REGULAR_SESSION_OPEN_MINUTE + interval
      || Math.max(...comparable.map(({ moment }) => moment.minuteOfDay)) < throughMinute - interval) return null;
    return comparable.reduce((sum, { bar }) => sum + bar.volume, 0);
  };

  const currentVolume = comparableVolume(bySession.get(currentMoment.calendarDate));
  if (currentVolume === null) return null;
  const baselineVolumes = [...bySession.entries()]
    .filter(([calendarDate]) => calendarDate < currentMoment.calendarDate)
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([, session]) => {
      const volume = comparableVolume(session);
      return volume === null ? [] : [volume];
    })
    .slice(0, MAXIMUM_BASELINE_SESSIONS);
  if (baselineVolumes.length < MINIMUM_BASELINE_SESSIONS) return null;
  const averageComparableVolume = baselineVolumes.reduce((sum, value) => sum + value, 0) / baselineVolumes.length;
  if (!Number.isFinite(averageComparableVolume) || averageComparableVolume <= 0) return null;
  return {
    value: currentVolume / averageComparableVolume,
    currentVolume,
    averageComparableVolume,
    baselineSessionCount: baselineVolumes.length,
    intervalMinutes: interval,
    throughMinuteEastern: throughMinute,
  };
}
