import type {
  CorporateEvent,
  CorporateEventStatus,
  CorporateEventType,
  NewsArticle,
  NewsCategory,
} from "@/types";

export const ACTIVE_TERMINAL_ALERT_POLL_MS = 60_000;
export const ACTIVE_TERMINAL_ALERT_LIMIT = 100;
export const ACTIVE_TERMINAL_CONTEXT_LIMIT = 500;
export const ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT = 200;
export const ACTIVE_TERMINAL_DELIVERY_HISTORY_LIMIT = 100;
export const ACTIVE_TERMINAL_PENDING_DELIVERY = "Active-terminal delivery is pending acknowledgement.";

const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const EVENT_TYPES = new Set<CorporateEventType>([
  "earnings-release",
  "earnings-call",
  "investor-day",
  "analyst-day",
  "shareholder-meeting",
  "conference",
  "presentation",
  "dividend",
  "stock-split",
  "company-update",
  "industry-event",
  "summit",
  "other",
]);
const EVENT_STATUSES = new Set<CorporateEventStatus>([
  "confirmed",
  "pending",
  "canceled",
  "rescheduled",
  "completed",
  "unknown",
]);
const NEWS_CATEGORIES = new Set<NewsCategory>([
  "breaking",
  "earnings",
  "analyst",
  "mergers-acquisitions",
  "fda",
  "guidance",
  "macro",
  "company",
  "markets",
  "other",
]);

type MonitorAlertType = "NEWS" | "EVENT";
type MonitorChannel = "browser" | "sound";
type EventTypeFilter = CorporateEventType | "earnings" | null;
type EventTransition =
  | "none"
  | "any-status-change"
  | "pending-to-confirmed"
  | "canceled-or-rescheduled";

export interface ActiveTerminalAlertRecord {
  readonly id: string;
  readonly name: string | null;
  readonly type: string;
  readonly symbol: string | null;
  readonly watchlistId: string | null;
  readonly configuration: unknown;
  readonly enabled: boolean;
  readonly cooldownMinutes: number;
  readonly deliveryChannels: readonly string[];
  readonly createdAt: string;
  readonly lastEvaluatedAt: string | null;
  readonly lastTriggeredAt: string | null;
  readonly lastDeliveryKey: string | null;
  readonly lastDeliveryError?: string | null;
}

export interface ActiveTerminalWatchlist {
  readonly id: string;
  readonly name: string;
  readonly tickers: readonly ({ readonly symbol: string } | string)[];
}

export interface ActiveTerminalMonitorState {
  readonly version: 1;
  readonly eventStatuses: Readonly<Record<string, CorporateEventStatus>>;
  readonly recentDeliveryKeys: readonly string[];
}

export interface ActiveTerminalNotification {
  readonly title: string;
  readonly body: string;
  readonly url: string | null;
  readonly channels: readonly MonitorChannel[];
}

export interface ActiveTerminalAlertEvaluation {
  readonly alertId: string;
  readonly type: MonitorAlertType;
  readonly matched: boolean;
  readonly deliveryKey: string | null;
  readonly notification: ActiveTerminalNotification | null;
  readonly eventStatuses?: Readonly<Record<string, CorporateEventStatus>>;
  readonly reason:
    | "candidate"
    | "disabled"
    | "unsupported-definition"
    | "watchlist-unavailable"
    | "no-new-observation"
    | "awaiting-status-baseline"
    | "already-observed";
}

export interface ActiveTerminalEvaluationInput {
  readonly alerts: readonly ActiveTerminalAlertRecord[];
  readonly articles: readonly NewsArticle[];
  readonly events: readonly CorporateEvent[];
  readonly watchlists: readonly ActiveTerminalWatchlist[];
  readonly observedAt: string;
}

interface NewsConfiguration {
  readonly ticker: string | null;
  readonly watchlistId: string | null;
  readonly keyword: string | null;
  readonly category: NewsCategory | null;
}

interface EventConfiguration {
  readonly scope: "ticker" | "watchlist";
  readonly ticker: string | null;
  readonly watchlistId: string | null;
  readonly leadDays: number;
  readonly eventType: EventTypeFilter;
  readonly statusTransition: EventTransition;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown, maximum: number): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function optionalTicker(value: unknown): string | null | undefined {
  const normalized = optionalString(value, 15);
  if (normalized === undefined || normalized === null) return normalized;
  const ticker = normalized.toUpperCase();
  return TICKER_PATTERN.test(ticker) ? ticker : undefined;
}

function parseNewsConfiguration(alert: ActiveTerminalAlertRecord): NewsConfiguration | null {
  const value = objectValue(alert.configuration);
  if (!value || value.schemaVersion !== 1) return null;
  const ticker = optionalTicker(value.ticker);
  const watchlistId = optionalString(value.watchlistId, 64);
  const keyword = optionalString(value.keyword, 160);
  const categoryValue = optionalString(value.category, 40);
  if (ticker === undefined || watchlistId === undefined || keyword === undefined || categoryValue === undefined) return null;
  if (alert.symbol && ticker && alert.symbol !== ticker) return null;
  if (alert.watchlistId && watchlistId && alert.watchlistId !== watchlistId) return null;
  const category = categoryValue === null
    ? null
    : NEWS_CATEGORIES.has(categoryValue as NewsCategory) ? categoryValue as NewsCategory : undefined;
  if (category === undefined) return null;
  return {
    ticker: alert.symbol ?? ticker,
    watchlistId: alert.watchlistId ?? watchlistId,
    keyword,
    category,
  };
}

function parseEventConfiguration(alert: ActiveTerminalAlertRecord): EventConfiguration | null {
  const value = objectValue(alert.configuration);
  if (!value || value.version !== 1 || value.kind !== "corporate-event") return null;
  if (value.scope !== "ticker" && value.scope !== "watchlist") return null;
  const ticker = optionalTicker(value.ticker);
  const watchlistId = optionalString(value.watchlistId, 64);
  if (ticker === undefined || watchlistId === undefined) return null;
  if (!Number.isInteger(value.leadDays) || Number(value.leadDays) < 0 || Number(value.leadDays) > 365) return null;
  const eventTypeValue = optionalString(value.eventType, 40);
  if (eventTypeValue === undefined) return null;
  const eventType = eventTypeValue === null
    ? null
    : eventTypeValue === "earnings" || EVENT_TYPES.has(eventTypeValue as CorporateEventType)
      ? eventTypeValue as EventTypeFilter
      : undefined;
  if (eventType === undefined) return null;
  const transitions = new Set<EventTransition>([
    "none",
    "any-status-change",
    "pending-to-confirmed",
    "canceled-or-rescheduled",
  ]);
  if (typeof value.statusTransition !== "string" || !transitions.has(value.statusTransition as EventTransition)) return null;
  const resolvedTicker = alert.symbol ?? ticker;
  const resolvedWatchlistId = alert.watchlistId ?? watchlistId;
  if (value.scope === "ticker" && !resolvedTicker) return null;
  if (value.scope === "watchlist" && !resolvedWatchlistId) return null;
  if (alert.symbol && ticker && alert.symbol !== ticker) return null;
  if (alert.watchlistId && watchlistId && alert.watchlistId !== watchlistId) return null;
  return {
    scope: value.scope,
    ticker: value.scope === "ticker" ? resolvedTicker : null,
    watchlistId: value.scope === "watchlist" ? resolvedWatchlistId : null,
    leadDays: Number(value.leadDays),
    eventType,
    statusTransition: value.statusTransition as EventTransition,
  };
}

export function activeTerminalMonitorState(configuration: unknown): ActiveTerminalMonitorState {
  const root = objectValue(configuration);
  const value = objectValue(root?.activeTerminalMonitor);
  const statuses = objectValue(value?.eventStatuses);
  const eventStatuses: Record<string, CorporateEventStatus> = {};
  if (statuses) {
    for (const [key, status] of Object.entries(statuses).slice(0, ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT)) {
      const normalizedKey = key.trim();
      if (normalizedKey.startsWith("event:") && normalizedKey.length <= 700
        && EVENT_STATUSES.has(status as CorporateEventStatus)) {
        eventStatuses[normalizedKey] = status as CorporateEventStatus;
      }
    }
  }
  const recentDeliveryKeys = Array.isArray(value?.recentDeliveryKeys)
    ? [...new Set(value.recentDeliveryKeys
        .filter((key): key is string => typeof key === "string" && key.trim().length > 0 && key.length <= 1_000)
        .map((key) => key.trim()))].slice(0, ACTIVE_TERMINAL_DELIVERY_HISTORY_LIMIT)
    : [];
  return { version: 1, eventStatuses, recentDeliveryKeys };
}

function normalizedChannels(channels: readonly string[]): readonly MonitorChannel[] {
  return [...new Set(channels.filter((channel): channel is MonitorChannel => channel === "browser" || channel === "sound"))];
}

function watchlistSymbols(
  watchlistId: string | null,
  watchlists: readonly ActiveTerminalWatchlist[],
): ReadonlySet<string> | null {
  if (!watchlistId) return new Set();
  const watchlist = watchlists.find((candidate) => candidate.id === watchlistId);
  if (!watchlist) return null;
  return new Set(watchlist.tickers.flatMap((ticker) => {
    const symbol = typeof ticker === "string" ? ticker : ticker.symbol;
    const normalized = symbol.trim().toUpperCase();
    return TICKER_PATTERN.test(normalized) ? [normalized] : [];
  }));
}

function newsKey(article: NewsArticle): string {
  return `news:${article.source.trim().toLowerCase()}:${article.id.trim()}`;
}

function eventObservationKey(event: CorporateEvent): string {
  return `event:${event.source.trim().toLowerCase()}:${event.id.trim()}`;
}

function eventDeliveryKey(event: CorporateEvent): string {
  return `${eventObservationKey(event)}:${event.status}`;
}

function marketDateKey(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function dateNumber(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const result = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(result) ? result : null;
}

function calendarDaysUntil(startsAt: string, observedAt: string): number | null {
  const starts = marketDateKey(startsAt);
  const observed = marketDateKey(observedAt);
  const startsNumber = starts ? dateNumber(starts) : null;
  const observedNumber = observed ? dateNumber(observed) : null;
  return startsNumber === null || observedNumber === null
    ? null
    : Math.round((startsNumber - observedNumber) / 86_400_000);
}

function shiftDateKey(value: string, days: number): string {
  const timestamp = dateNumber(value);
  return timestamp === null ? value : new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

export function activeTerminalEventRange(
  alerts: readonly ActiveTerminalAlertRecord[],
  observedAt: string,
): { readonly from: string; readonly to: string } | null {
  const from = marketDateKey(observedAt);
  if (!from) return null;
  let maximumLeadDays = 0;
  for (const alert of alerts.slice(0, ACTIVE_TERMINAL_ALERT_LIMIT)) {
    if (alert.type !== "EVENT") continue;
    const configuration = parseEventConfiguration(alert);
    if (configuration) maximumLeadDays = Math.max(maximumLeadDays, configuration.leadDays);
  }
  return { from, to: shiftDateKey(from, Math.min(365, maximumLeadDays)) };
}

function matchesEventType(event: CorporateEvent, filter: EventTypeFilter): boolean {
  if (filter === null) return true;
  if (filter === "earnings") return event.type === "earnings-release" || event.type === "earnings-call";
  return event.type === filter;
}

function matchesTransition(
  previous: CorporateEventStatus | undefined,
  current: CorporateEventStatus,
  transition: EventTransition,
): boolean {
  if (transition === "none") return current !== "canceled" && current !== "completed";
  if (previous === undefined || previous === current) return false;
  if (transition === "any-status-change") return true;
  if (transition === "pending-to-confirmed") return previous === "pending" && current === "confirmed";
  return current === "canceled" || current === "rescheduled";
}

function noCandidate(
  alert: ActiveTerminalAlertRecord,
  type: MonitorAlertType,
  reason: ActiveTerminalAlertEvaluation["reason"],
  eventStatuses?: Readonly<Record<string, CorporateEventStatus>>,
): ActiveTerminalAlertEvaluation {
  return {
    alertId: alert.id,
    type,
    matched: false,
    deliveryKey: null,
    notification: null,
    eventStatuses,
    reason,
  };
}

function evaluateNews(
  alert: ActiveTerminalAlertRecord,
  articles: readonly NewsArticle[],
  watchlists: readonly ActiveTerminalWatchlist[],
  observedAt: string,
): ActiveTerminalAlertEvaluation {
  const configuration = parseNewsConfiguration(alert);
  if (!configuration) return noCandidate(alert, "NEWS", "unsupported-definition");
  const symbols = watchlistSymbols(configuration.watchlistId, watchlists);
  if (symbols === null) return noCandidate(alert, "NEWS", "watchlist-unavailable");
  const observedTimestamp = Date.parse(observedAt);
  const pendingDelivery = alert.lastDeliveryError === ACTIVE_TERMINAL_PENDING_DELIVERY
    && alert.lastDeliveryKey?.startsWith("news:");
  const watermark = Date.parse(pendingDelivery ? alert.createdAt : alert.lastEvaluatedAt ?? alert.createdAt);
  if (!Number.isFinite(observedTimestamp) || !Number.isFinite(watermark)) {
    return noCandidate(alert, "NEWS", "no-new-observation");
  }
  const state = activeTerminalMonitorState(alert.configuration);
  const article = articles
    .slice(0, ACTIVE_TERMINAL_CONTEXT_LIMIT)
    .filter((candidate) => {
      const publishedAt = Date.parse(candidate.publishedAt);
      if (!Number.isFinite(publishedAt) || publishedAt <= watermark || publishedAt > observedTimestamp) return false;
      const deliveryKey = newsKey(candidate);
      if (deliveryKey.length > 1_000 || !candidate.source.trim() || !candidate.id.trim()) return false;
      const articleTickers = new Set(candidate.tickers.map((ticker) => ticker.trim().toUpperCase()));
      if (configuration.ticker && !articleTickers.has(configuration.ticker)) return false;
      if (configuration.watchlistId && ![...symbols].some((symbol) => articleTickers.has(symbol))) return false;
      if (configuration.category && !candidate.categories.includes(configuration.category)) return false;
      if (configuration.keyword && !candidate.title.toLowerCase().includes(configuration.keyword.toLowerCase())) return false;
      return !state.recentDeliveryKeys.includes(newsKey(candidate));
    })
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id))[0];
  if (!article) return noCandidate(alert, "NEWS", "no-new-observation");
  const deliveryKey = newsKey(article);
  return {
    alertId: alert.id,
    type: "NEWS",
    matched: true,
    deliveryKey,
    notification: {
      title: alert.name?.trim() || `NEWS · ${article.tickers[0] ?? "MARKET"}`,
      body: article.title,
      url: article.articleUrl,
      channels: normalizedChannels(alert.deliveryChannels),
    },
    reason: "candidate",
  };
}

function evaluateEvent(
  alert: ActiveTerminalAlertRecord,
  events: readonly CorporateEvent[],
  watchlists: readonly ActiveTerminalWatchlist[],
  observedAt: string,
): ActiveTerminalAlertEvaluation {
  const configuration = parseEventConfiguration(alert);
  if (!configuration) return noCandidate(alert, "EVENT", "unsupported-definition");
  const symbols = watchlistSymbols(configuration.watchlistId, watchlists);
  if (symbols === null) return noCandidate(alert, "EVENT", "watchlist-unavailable");
  const state = activeTerminalMonitorState(alert.configuration);
  const relevant = events
    .slice(0, ACTIVE_TERMINAL_CONTEXT_LIMIT)
    .filter((event) => {
      const days = calendarDaysUntil(event.startsAt, observedAt);
      if (days === null || days < 0 || days > configuration.leadDays) return false;
      if (!event.source.trim() || !event.id.trim()
        || eventObservationKey(event).length > 700 || eventDeliveryKey(event).length > 1_000) return false;
      if (!matchesEventType(event, configuration.eventType)) return false;
      if (configuration.scope === "ticker" && event.symbol !== configuration.ticker) return false;
      if (configuration.scope === "watchlist" && !symbols.has(event.symbol)) return false;
      return true;
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id));

  const currentStatuses: Record<string, CorporateEventStatus> = {};
  for (const event of relevant.slice(0, ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT)) {
    currentStatuses[eventObservationKey(event)] = event.status;
  }
  const mergedStatuses = Object.fromEntries([
    ...Object.entries(currentStatuses),
    ...Object.entries(state.eventStatuses).filter(([key]) => !(key in currentStatuses)),
  ].slice(0, ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT)) as Record<string, CorporateEventStatus>;

  const candidate = relevant.find((event) => {
    const observationKey = eventObservationKey(event);
    const deliveryKey = eventDeliveryKey(event);
    return !state.recentDeliveryKeys.includes(deliveryKey)
      && matchesTransition(state.eventStatuses[observationKey], event.status, configuration.statusTransition);
  });
  if (!candidate) {
    const awaitingBaseline = configuration.statusTransition !== "none"
      && relevant.some((event) => state.eventStatuses[eventObservationKey(event)] === undefined);
    return noCandidate(
      alert,
      "EVENT",
      awaitingBaseline ? "awaiting-status-baseline" : state.recentDeliveryKeys.length ? "already-observed" : "no-new-observation",
      mergedStatuses,
    );
  }

  const deliveryKey = eventDeliveryKey(candidate);
  return {
    alertId: alert.id,
    type: "EVENT",
    matched: true,
    deliveryKey,
    notification: {
      title: alert.name?.trim() || `EVENT · ${candidate.symbol}`,
      body: `${candidate.title} · ${candidate.status.replaceAll("-", " ")} · ${candidate.startsAt.slice(0, 10)}`,
      url: candidate.eventUrl,
      channels: normalizedChannels(alert.deliveryChannels),
    },
    eventStatuses: mergedStatuses,
    reason: "candidate",
  };
}

/**
 * Produces bounded, deterministic candidates. The authenticated API remains the
 * final cooldown/dedup gate and must claim a candidate before delivery.
 */
export function evaluateActiveTerminalAlerts(
  input: ActiveTerminalEvaluationInput,
): readonly ActiveTerminalAlertEvaluation[] {
  return input.alerts.slice(0, ACTIVE_TERMINAL_ALERT_LIMIT).map((alert) => {
    if (alert.type !== "NEWS" && alert.type !== "EVENT") {
      return noCandidate(alert, "NEWS", "unsupported-definition");
    }
    if (!alert.enabled) return noCandidate(alert, alert.type, "disabled");
    return alert.type === "NEWS"
      ? evaluateNews(alert, input.articles, input.watchlists, input.observedAt)
      : evaluateEvent(alert, input.events, input.watchlists, input.observedAt);
  });
}
