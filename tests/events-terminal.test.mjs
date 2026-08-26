import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const eventModel = await loadTypeScriptModule(new URL("../lib/research/events.ts", import.meta.url));
const eventAlerts = await loadTypeScriptModule(new URL("../lib/alerts/event-alert.ts", import.meta.url));

test("event calendar presets and countdowns follow the New York calendar", () => {
  const now = "2026-08-19T16:00:00.000Z";
  assert.equal(eventModel.marketDateKey("2026-08-20T02:30:00.000Z"), "2026-08-19");
  assert.deepEqual(eventModel.eventHorizonRange("today", now), { from: "2026-08-19", to: "2026-08-19" });
  assert.deepEqual(eventModel.eventHorizonRange("tomorrow", now), { from: "2026-08-20", to: "2026-08-20" });
  assert.deepEqual(eventModel.eventHorizonRange("this-week", now), { from: "2026-08-19", to: "2026-08-23" });
  assert.deepEqual(eventModel.eventHorizonRange("next-week", now), { from: "2026-08-24", to: "2026-08-30" });
  assert.deepEqual(eventModel.eventHorizonRange("this-month", now), { from: "2026-08-19", to: "2026-08-31" });
  assert.deepEqual(eventModel.eventHorizonRange("custom", now, "2026-09-02", "2026-09-09"), { from: "2026-09-02", to: "2026-09-09" });
  assert.equal(eventModel.eventHorizonRange("custom", now, "2026-09-09", "2026-09-02"), null);
});

test("event day math is DST-safe and grouping uses the Eastern date", () => {
  assert.equal(
    eventModel.marketCalendarDaysUntil("2026-03-09T16:00:00.000Z", "2026-03-07T17:00:00.000Z"),
    2,
  );
  assert.equal(eventModel.formatMarketEventCountdown("2026-03-09T16:00:00.000Z", "2026-03-07T17:00:00.000Z"), "IN 2 DAYS");
  const grouped = eventModel.groupEventsByMarketDay([
    { id: "late", startsAt: "2026-08-20T02:30:00.000Z" },
    { id: "day", startsAt: "2026-08-19T14:00:00.000Z" },
  ], "2026-08-19T16:00:00.000Z");
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].date, "2026-08-19");
  assert.equal(grouped[0].isToday, true);
  assert.deepEqual(grouped[0].events.map(({ id }) => id), ["day", "late"]);
});

test("event sorting preserves market-day groups and defaults to chronological rows", () => {
  const days = [
    {
      date: "2026-08-19",
      label: "WED, AUG 19",
      isToday: true,
      events: [
        { id: "late", startsAt: "2026-08-19T19:00:00.000Z", symbol: "AAPL", companyName: "Zebra", title: "Conference", type: "conference", status: "pending" },
        { id: "early", startsAt: "2026-08-19T13:00:00.000Z", symbol: "NVDA", companyName: "Alpha", title: "Earnings", type: "earnings-release", status: "confirmed" },
        { id: "middle", startsAt: "2026-08-19T16:00:00.000Z", symbol: "MSFT", companyName: "Beta", title: "Investor day", type: "investor-day", status: "canceled" },
      ],
    },
    {
      date: "2026-08-20",
      label: "THU, AUG 20",
      isToday: false,
      events: [
        { id: "next", startsAt: "2026-08-20T14:00:00.000Z", symbol: "AMD", companyName: "AMD", title: "Update", type: "company-update", status: "confirmed" },
      ],
    },
  ];

  const chronological = eventModel.sortEventCalendarDays(days);
  assert.deepEqual(chronological.map(({ date }) => date), ["2026-08-19", "2026-08-20"]);
  assert.deepEqual(chronological[0].events.map(({ id }) => id), ["early", "middle", "late"]);
  assert.deepEqual(
    eventModel.sortEventCalendarDays(days, { key: "ticker", direction: "ascending" })[0].events.map(({ id }) => id),
    ["late", "middle", "early"],
  );
  assert.deepEqual(
    eventModel.sortEventCalendarDays(days, { key: "event", direction: "descending" })[0].events.map(({ id }) => id),
    ["late", "middle", "early"],
  );
  assert.deepEqual(
    eventModel.sortEventCalendarDays(days, { key: "type", direction: "ascending" })[0].events.map(({ id }) => id),
    ["late", "early", "middle"],
  );
  assert.deepEqual(
    eventModel.sortEventCalendarDays(days, { key: "status", direction: "ascending" })[0].events.map(({ id }) => id),
    ["middle", "early", "late"],
  );
  assert.deepEqual(days[0].events.map(({ id }) => id), ["late", "early", "middle"]);
});

test("event alert requests preserve scope, optional event type, lead time, transitions, and cooldown", () => {
  const tickerAlert = eventAlerts.buildEventAlertRequest({
    scope: "ticker",
    ticker: " nvda ",
    watchlistId: null,
    watchlistName: null,
    eventType: "earnings",
    leadDays: 1,
    statusTransition: "pending-to-confirmed",
    cooldownMinutes: 60,
  });
  assert.equal(tickerAlert.type, "EVENT");
  assert.equal(tickerAlert.symbol, "NVDA");
  assert.equal(tickerAlert.watchlistId, null);
  assert.equal(tickerAlert.cooldownMinutes, 60);
  assert.deepEqual(
    {
      scope: tickerAlert.configuration.scope,
      leadDays: tickerAlert.configuration.leadDays,
      transition: tickerAlert.configuration.statusTransition,
      cooldown: tickerAlert.configuration.cooldownMinutes,
      eventType: tickerAlert.configuration.eventType,
    },
    { scope: "ticker", leadDays: 1, transition: "pending-to-confirmed", cooldown: 60, eventType: "earnings" },
  );
  assert.match(tickerAlert.name, /NVDA EARNINGS/);
  assert.match(tickerAlert.configuration.rule, /earnings/);

  const watchlistAlert = eventAlerts.buildEventAlertRequest({
    scope: "watchlist",
    ticker: "",
    watchlistId: "wl-core",
    watchlistName: "CORE",
    leadDays: 7,
    statusTransition: "canceled-or-rescheduled",
    cooldownMinutes: 1_440,
  });
  assert.equal(watchlistAlert.symbol, null);
  assert.equal(watchlistAlert.watchlistId, "wl-core");
  assert.equal(watchlistAlert.cooldownMinutes, 1_440);
  assert.equal(watchlistAlert.configuration.watchlistId, "wl-core");
  assert.equal(watchlistAlert.configuration.watchlistName, "CORE");
  assert.equal(watchlistAlert.configuration.eventType, null);
  assert.equal(watchlistAlert.configuration.deliveryKeyStrategy, "event-id-status");
  assert.throws(() => eventAlerts.buildEventAlertRequest({
    scope: "watchlist",
    ticker: "",
    watchlistId: null,
    watchlistName: null,
    leadDays: 1,
    statusTransition: "none",
    cooldownMinutes: 0,
  }), /selected watchlist/i);
  assert.throws(() => eventAlerts.buildEventAlertRequest({
    scope: "ticker",
    ticker: "NVDA",
    watchlistId: null,
    watchlistName: null,
    eventType: "rumor",
    leadDays: 1,
    statusTransition: "none",
    cooldownMinutes: 0,
  }), /unsupported event alert event type/i);
});

test("events UI is selected-watchlist based and exposes honest event fields plus an explicit alert action", async () => {
  const [liveSource, terminalSource] = await Promise.all([
    readFile(new URL("../components/terminal/LiveEventsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/research/EventsTerminal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(liveSource, /useWatchlists\(\)/);
  assert.doesNotMatch(liveSource, /CORE_WATCHLIST/);
  for (const label of ["CUSTOM RANGE", "ONLY CONFIRMED", "ONLY EARNINGS", "DATE ONLY", "IMPORTANCE", "DAYS UNTIL", "CREATE EVENT ALERT"]) {
    assert.match(terminalSource, new RegExp(label));
  }
  assert.match(terminalSource, /UNAVAILABLE · NOT SUPPLIED/);
  assert.match(terminalSource, /aria-sort=/);
  for (const sortKey of ["time", "ticker", "event", "type", "status"]) {
    assert.match(terminalSource, new RegExp(`sortKey="${sortKey}"`));
  }
  assert.match(terminalSource, /Earnings \(release or call\)/);
});
