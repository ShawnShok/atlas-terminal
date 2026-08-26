import type { CorporateEventType } from "@/types";

export type EventAlertScope = "ticker" | "watchlist";

/** "earnings" intentionally matches both normalized earnings event classes. */
export type EventAlertEventType = CorporateEventType | "earnings";

export type EventAlertStatusTransition =
  | "none"
  | "any-status-change"
  | "pending-to-confirmed"
  | "canceled-or-rescheduled";

export interface EventAlertDraft {
  readonly scope: EventAlertScope;
  readonly ticker: string;
  readonly watchlistId: string | null;
  readonly watchlistName: string | null;
  readonly eventType?: EventAlertEventType | null;
  readonly leadDays: number;
  readonly statusTransition: EventAlertStatusTransition;
  readonly cooldownMinutes: number;
  readonly browserNotification?: boolean;
  readonly sound?: boolean;
  readonly notificationPermission?: "default" | "denied" | "granted" | "unsupported" | "not-requested";
}

export interface EventAlertRequest {
  readonly name: string;
  readonly type: "EVENT";
  readonly symbol: string | null;
  readonly watchlistId: string | null;
  readonly cooldownMinutes: number;
  readonly deliveryChannels: readonly ("browser" | "sound")[];
  readonly configuration: {
    readonly version: 1;
    readonly kind: "corporate-event";
    readonly scope: EventAlertScope;
    readonly leadDays: number;
    readonly ticker: string | null;
    readonly watchlistId: string | null;
    readonly watchlistName: string | null;
    readonly eventType: EventAlertEventType | null;
    readonly statusTransition: EventAlertStatusTransition;
    readonly cooldownMinutes: number;
    readonly browserNotification: boolean;
    readonly sound: boolean;
    readonly notificationPermission: "default" | "denied" | "granted" | "unsupported" | "not-requested";
    readonly deliveryKeyStrategy: "event-id-status";
    readonly timezone: "America/New_York";
    readonly rule: string;
  };
  readonly enabled: true;
}

const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const STATUS_TRANSITIONS = new Set<EventAlertStatusTransition>([
  "none",
  "any-status-change",
  "pending-to-confirmed",
  "canceled-or-rescheduled",
]);
const EVENT_TYPES = new Set<EventAlertEventType>([
  "earnings",
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

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function transitionLabel(value: EventAlertStatusTransition): string {
  if (value === "none") return "no status transition";
  return value.replaceAll("-", " ");
}

function eventTypeLabel(value: EventAlertEventType | null): string {
  if (value === null) return "any event";
  return value.replaceAll("-", " ");
}

/** Builds the schema-compatible payload consumed by the existing generic alert endpoint. */
export function buildEventAlertRequest(draft: EventAlertDraft): EventAlertRequest {
  if (draft.scope !== "ticker" && draft.scope !== "watchlist") throw new TypeError("Unsupported event alert scope.");
  const ticker = draft.ticker.trim().toUpperCase();
  const eventType = draft.eventType ?? null;
  const leadDays = boundedInteger(draft.leadDays, "Lead days", 0, 365);
  const cooldownMinutes = boundedInteger(draft.cooldownMinutes, "Cooldown minutes", 0, 10_080);
  const notificationPermission = draft.notificationPermission ?? "not-requested";
  if (!["default", "denied", "granted", "unsupported", "not-requested"].includes(notificationPermission)) {
    throw new TypeError("Unsupported browser notification permission state.");
  }
  const browserNotification = Boolean(draft.browserNotification);
  const sound = Boolean(draft.sound);
  const deliveryChannels: Array<"browser" | "sound"> = [];
  if (browserNotification && notificationPermission === "granted") deliveryChannels.push("browser");
  if (sound) deliveryChannels.push("sound");
  if (!STATUS_TRANSITIONS.has(draft.statusTransition)) throw new TypeError("Unsupported event status transition.");
  if (eventType !== null && !EVENT_TYPES.has(eventType)) throw new TypeError("Unsupported event alert event type.");
  if (draft.scope === "ticker" && !TICKER_PATTERN.test(ticker)) {
    throw new TypeError("A valid ticker is required for a ticker event alert.");
  }
  const watchlistId = draft.watchlistId?.trim() || null;
  const watchlistName = draft.watchlistName?.trim() || null;
  if (draft.scope === "watchlist" && (!watchlistId || !watchlistName)) {
    throw new TypeError("A selected watchlist is required for a watchlist event alert.");
  }
  const target = draft.scope === "ticker" ? ticker : watchlistName!;
  const leadLabel = leadDays === 0 ? "event day" : `${leadDays} day${leadDays === 1 ? "" : "s"} before`;
  const typeLabel = eventTypeLabel(eventType);
  const rule = `${typeLabel} · ${leadLabel} · ${transitionLabel(draft.statusTransition)}`;
  return {
    name: `${target} ${eventType === null ? "EVENT" : typeLabel.toUpperCase()} · ${leadLabel.toUpperCase()}`,
    type: "EVENT",
    symbol: draft.scope === "ticker" ? ticker : null,
    watchlistId: draft.scope === "watchlist" ? watchlistId : null,
    cooldownMinutes,
    deliveryChannels,
    configuration: {
      version: 1,
      kind: "corporate-event",
      scope: draft.scope,
      leadDays,
      ticker: draft.scope === "ticker" ? ticker : null,
      watchlistId: draft.scope === "watchlist" ? watchlistId : null,
      watchlistName: draft.scope === "watchlist" ? watchlistName : null,
      eventType,
      statusTransition: draft.statusTransition,
      cooldownMinutes,
      browserNotification,
      sound,
      notificationPermission,
      deliveryKeyStrategy: "event-id-status",
      timezone: "America/New_York",
      rule,
    },
    enabled: true,
  };
}
