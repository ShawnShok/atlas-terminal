import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const monitor = await loadTypeScriptModule(new URL("../lib/alerts/active-terminal.ts", import.meta.url));
const eventAlerts = await loadTypeScriptModule(new URL("../lib/alerts/event-alert.ts", import.meta.url));
const observedAt = "2026-08-19T16:00:00.000Z";

function newsAlert(overrides = {}) {
  return {
    id: "news-alert", name: "NVDA GUIDANCE", type: "NEWS", symbol: "NVDA", watchlistId: "wl-core",
    configuration: {
      schemaVersion: 1, ticker: "NVDA", watchlistId: "wl-core", keyword: "guidance", category: "guidance",
      browserNotification: true, sound: true, notificationPermission: "granted",
    },
    enabled: true, cooldownMinutes: 15, deliveryChannels: ["browser", "sound"],
    createdAt: "2026-08-19T15:00:00.000Z", lastEvaluatedAt: null, lastTriggeredAt: null, lastDeliveryKey: null,
    ...overrides,
  };
}

function article(overrides = {}) {
  return {
    id: "story-1", title: "NVIDIA raises guidance after strong demand", summary: null, body: null,
    articleUrl: "https://example.test/story-1", imageUrl: null, publishedAt: "2026-08-19T15:30:00.000Z",
    updatedAt: null, tickers: ["NVDA"], categories: ["guidance"], keywords: ["outlook"],
    publisher: { name: "Newsdesk", homepageUrl: null, logoUrl: null, faviconUrl: null },
    asOf: "2026-08-19T15:31:00.000Z", quality: "live", source: "benzinga", ...overrides,
  };
}

function eventAlert(configurationOverrides = {}, recordOverrides = {}) {
  return {
    id: "event-alert", name: "NVDA EARNINGS", type: "EVENT", symbol: "NVDA", watchlistId: null,
    configuration: {
      version: 1, kind: "corporate-event", scope: "ticker", leadDays: 1, ticker: "NVDA", watchlistId: null,
      watchlistName: null, eventType: "earnings", statusTransition: "none", cooldownMinutes: 60,
      deliveryKeyStrategy: "event-id-status", timezone: "America/New_York", rule: "earnings · 1 day before",
      ...configurationOverrides,
    },
    enabled: true, cooldownMinutes: 60, deliveryChannels: ["browser"],
    createdAt: "2026-08-19T15:00:00.000Z", lastEvaluatedAt: null, lastTriggeredAt: null, lastDeliveryKey: null,
    ...recordOverrides,
  };
}

function corporateEvent(overrides = {}) {
  return {
    id: "event-1", symbol: "NVDA", companyName: "NVIDIA", title: "Quarterly results",
    type: "earnings-release", status: "confirmed", startsAt: "2026-08-20T20:00:00.000Z", endsAt: null,
    allDay: false, description: null, eventUrl: "https://example.test/event-1", asOf: observedAt,
    quality: "delayed", source: "tmx", ...overrides,
  };
}

const watchlists = [{ id: "wl-core", name: "CORE", tickers: [{ symbol: "NVDA" }, { symbol: "AMD" }] }];

test("structured news alerts match every configured filter after the durable watermark", () => {
  const [result] = monitor.evaluateActiveTerminalAlerts({
    alerts: [newsAlert()], articles: [article({ id: "wrong", categories: ["analyst"] }), article()],
    events: [], watchlists, observedAt,
  });
  assert.equal(result.matched, true);
  assert.equal(result.deliveryKey, "news:benzinga:story-1");
  assert.deepEqual(result.notification.channels, ["browser", "sound"]);
  assert.match(result.notification.body, /raises guidance/i);

  const [afterWatermark] = monitor.evaluateActiveTerminalAlerts({
    alerts: [newsAlert({ lastEvaluatedAt: "2026-08-19T15:45:00.000Z" })],
    articles: [article()], events: [], watchlists, observedAt,
  });
  assert.equal(afterWatermark.matched, false);
  assert.equal(afterWatermark.reason, "no-new-observation");

  const [pendingRetry] = monitor.evaluateActiveTerminalAlerts({
    alerts: [newsAlert({
      lastEvaluatedAt: "2026-08-19T15:45:00.000Z",
      lastDeliveryKey: "news:benzinga:story-1",
      lastDeliveryError: monitor.ACTIVE_TERMINAL_PENDING_DELIVERY,
    })],
    articles: [article()], events: [], watchlists, observedAt,
  });
  assert.equal(pendingRetry.matched, true);
});

test("legacy or inconsistent news definitions fail closed", () => {
  const results = monitor.evaluateActiveTerminalAlerts({
    alerts: [
      newsAlert({ configuration: { rule: "ANY NEW STORY" } }),
      newsAlert({ symbol: "AMD" }),
      newsAlert({ watchlistId: "missing", configuration: { ...newsAlert().configuration, watchlistId: "missing" } }),
    ],
    articles: [article()], events: [], watchlists, observedAt,
  });
  assert.deepEqual(results.map((result) => result.reason), [
    "unsupported-definition", "unsupported-definition", "watchlist-unavailable",
  ]);
  assert.equal(results.some((result) => result.matched), false);
});

test("lead-time event alerts honor earnings aliases and New York calendar days", () => {
  const [result] = monitor.evaluateActiveTerminalAlerts({
    alerts: [eventAlert()], articles: [],
    events: [corporateEvent({ id: "conference", type: "conference" }), corporateEvent()],
    watchlists: [], observedAt,
  });
  assert.equal(result.matched, true);
  assert.equal(result.deliveryKey, "event:tmx:event-1:confirmed");
  assert.equal(result.eventStatuses["event:tmx:event-1"], "confirmed");
  assert.deepEqual(monitor.activeTerminalEventRange([eventAlert({ leadDays: 3 })], "2026-03-07T17:00:00.000Z"), {
    from: "2026-03-07", to: "2026-03-10",
  });
});

test("event status transitions establish a baseline before matching", () => {
  const baselineAlert = eventAlert({ statusTransition: "pending-to-confirmed" });
  const [baseline] = monitor.evaluateActiveTerminalAlerts({
    alerts: [baselineAlert], articles: [], events: [corporateEvent({ status: "pending" })], watchlists: [], observedAt,
  });
  assert.equal(baseline.matched, false);
  assert.equal(baseline.reason, "awaiting-status-baseline");
  assert.equal(baseline.eventStatuses["event:tmx:event-1"], "pending");

  const [transition] = monitor.evaluateActiveTerminalAlerts({
    alerts: [eventAlert({
      statusTransition: "pending-to-confirmed",
      activeTerminalMonitor: { version: 1, eventStatuses: baseline.eventStatuses, recentDeliveryKeys: [] },
    })],
    articles: [], events: [corporateEvent({ status: "confirmed" })], watchlists: [], observedAt,
  });
  assert.equal(transition.matched, true);
  assert.equal(transition.deliveryKey, "event:tmx:event-1:confirmed");

  const [alreadyDelivered] = monitor.evaluateActiveTerminalAlerts({
    alerts: [eventAlert({
      activeTerminalMonitor: {
        version: 1, eventStatuses: { "event:tmx:event-1": "confirmed" },
        recentDeliveryKeys: ["event:tmx:event-1:confirmed"],
      },
    })],
    articles: [], events: [corporateEvent()], watchlists: [], observedAt,
  });
  assert.equal(alreadyDelivered.matched, false);
  assert.equal(alreadyDelivered.reason, "already-observed");
});

test("event delivery channels are persisted only after explicit permission state", () => {
  const request = eventAlerts.buildEventAlertRequest({
    scope: "ticker",
    ticker: "NVDA",
    watchlistId: null,
    watchlistName: null,
    eventType: "earnings",
    leadDays: 1,
    statusTransition: "none",
    cooldownMinutes: 60,
    browserNotification: true,
    sound: true,
    notificationPermission: "granted",
  });
  assert.deepEqual(request.deliveryChannels, ["browser", "sound"]);
  assert.equal(request.configuration.browserNotification, true);
  assert.equal(request.configuration.notificationPermission, "granted");
  const denied = eventAlerts.buildEventAlertRequest({
    scope: "ticker",
    ticker: "NVDA",
    watchlistId: null,
    watchlistName: null,
    leadDays: 1,
    statusTransition: "none",
    cooldownMinutes: 0,
    browserNotification: true,
    sound: false,
    notificationPermission: "denied",
  });
  assert.deepEqual(denied.deliveryChannels, []);
});

test("monitor inputs and provider delivery keys remain bounded", () => {
  const evaluations = monitor.evaluateActiveTerminalAlerts({
    alerts: Array.from({ length: 101 }, (_, index) => newsAlert({
      id: `alert-${index}`,
      symbol: null,
      watchlistId: null,
      configuration: { ...newsAlert().configuration, ticker: null, watchlistId: null },
    })),
    articles: [article({ id: "x".repeat(1_001) })],
    events: [],
    watchlists: [],
    observedAt,
  });
  assert.equal(evaluations.length, 100);
  assert.equal(evaluations.some((evaluation) => evaluation.matched), false);
});

test("the active-terminal monitor is single-mounted, server-gated, and honestly disclosed", async () => {
  const [hook, shell, route, news, events, alertsPanel, readme] = await Promise.all([
    readFile(new URL("../hooks/useActiveAlertMonitor.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/terminal/TerminalShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/personal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/terminal/LiveNewsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/terminal/LiveEventsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/terminal/PersonalResearchPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.equal((shell.match(/useActiveAlertMonitor\(notify\)/g) ?? []).length, 1);
  assert.equal((hook.match(/setInterval\(/g) ?? []).length, 1);
  assert.doesNotMatch(hook, /Notification\.requestPermission/);
  assert.match(hook, /configured[\s\S]*resource=alerts&monitor=active-terminal/);
  assert.match(route, /active-terminal-evaluate/);
  assert.match(route, /active-terminal-delivery/);
  assert.match(route, /evaluateAlertDelivery/);
  assert.match(route, /lastDeliveryKey: alert\.lastDeliveryKey[\s\S]*lastTriggeredAt: alert\.lastTriggeredAt/);
  assert.match(route, /updatedAt: alert\.updatedAt/);
  assert.match(route, /ACTIVE_TERMINAL_PENDING_DELIVERY/);
  assert.match(route, /ACTIVE_TERMINAL_DELIVERY_RETRY_MS/);
  assert.match(route, /ACTIVE_TERMINAL_ALERT_LIMIT \+ 1/);
  assert.match(hook, /ACTIVE_TERMINAL_REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(news, /every 60 seconds while this ATLAS terminal is open/);
  assert.match(events, /Notification\.requestPermission/);
  assert.match(alertsPanel, /only while this ATLAS terminal remains open/);
  assert.match(readme, /not an off-browser scheduler/i);
});
