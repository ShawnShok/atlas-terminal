"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ACTIVE_TERMINAL_ALERT_POLL_MS,
  ACTIVE_TERMINAL_PENDING_DELIVERY,
  activeTerminalEventRange,
  evaluateActiveTerminalAlerts,
  type ActiveTerminalAlertEvaluation,
  type ActiveTerminalAlertRecord,
  type ActiveTerminalNotification,
  type ActiveTerminalWatchlist,
} from "@/lib/alerts";
import type { EventsResearchBundle, NewsResearchBundle, TerminalApiResponse } from "@/types";

const MAX_NOTIFICATIONS_PER_CYCLE = 8;
const ACTIVE_TERMINAL_REQUEST_TIMEOUT_MS = 20_000;

interface PersonalResponse<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly code: string; readonly message: string };
}

interface PersonalStatus {
  readonly configured: boolean;
  readonly detail?: string;
}

interface MonitorDecision {
  readonly id: string;
  readonly claimed: boolean;
  readonly reason: string;
  readonly deliveryKey: string | null;
}

interface MonitorDecisionBatch {
  readonly evaluatedAt: string;
  readonly decisions: readonly MonitorDecision[];
}

interface MonitorAlertSet {
  readonly alerts: readonly ActiveTerminalAlertRecord[];
  readonly limit: number;
  readonly truncated: boolean;
}

interface DeliveryOutcome {
  readonly id: string;
  readonly deliveryKey: string;
  readonly delivered: boolean;
  readonly error: string | null;
}

interface MonitorDeliveryAcknowledgement {
  readonly deliveredAt: string;
  readonly updated: number;
}

export interface ActiveAlertMonitorStatus {
  readonly phase: "checking" | "monitoring" | "inactive" | "error";
  readonly configured: boolean | null;
  readonly enabledAlertCount: number;
  readonly truncated: boolean;
  readonly lastCheckedAt: string | null;
  readonly message: string;
  readonly label: string;
}

async function personalRequest<T>(
  path: string,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/personal?${path}`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
    signal,
  });
  const payload = await response.json() as PersonalResponse<T>;
  if (!payload.ok || payload.data === undefined) {
    const error = new Error(payload.error?.message ?? "The active-terminal alert request failed.");
    error.name = payload.error?.code ?? `HTTP_${response.status}`;
    throw error;
  }
  return payload.data;
}

async function researchRequest<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await response.json() as TerminalApiResponse<T>;
  if (!payload.ok) throw new Error(payload.error.message);
  return payload.data;
}

function earliestNewsWatermark(alerts: readonly ActiveTerminalAlertRecord[]): string | null {
  return alerts
    .filter((alert) => alert.type === "NEWS")
    .map((alert) => alert.lastDeliveryError === ACTIVE_TERMINAL_PENDING_DELIVERY
      && alert.lastDeliveryKey?.startsWith("news:")
      ? alert.createdAt
      : alert.lastEvaluatedAt ?? alert.createdAt)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()[0] ?? null;
}

function monitorEvaluationBody(
  evaluations: readonly ActiveTerminalAlertEvaluation[],
  observedAt: string,
): string {
  return JSON.stringify({
    observedAt,
    evaluations: evaluations.map((evaluation) => ({
      id: evaluation.alertId,
      matched: evaluation.matched,
      deliveryKey: evaluation.deliveryKey,
      ...(evaluation.eventStatuses ? { eventStatuses: evaluation.eventStatuses } : {}),
    })),
  });
}

async function playAlertTone(): Promise<void> {
  const context = new AudioContext();
  try {
    if (context.state === "suspended") await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.17);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 190));
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function deliverNotification(
  notification: ActiveTerminalNotification,
  deliveryKey: string,
  onTerminalNotification: (title: string, message: string) => void,
): Promise<{ delivered: boolean; error: string | null }> {
  const errors: string[] = [];
  onTerminalNotification(notification.title, notification.body);

  if (notification.channels.includes("browser")) {
    if (typeof Notification === "undefined") {
      errors.push("Browser notifications are unsupported.");
    } else if (Notification.permission !== "granted") {
      errors.push(`Browser notification permission is ${Notification.permission}.`);
    } else {
      try {
        const browserNotification = new Notification(notification.title, {
          body: notification.body,
          tag: deliveryKey,
        });
        browserNotification.onclick = () => window.focus();
      } catch {
        errors.push("The browser notification could not be displayed.");
      }
    }
  }

  if (notification.channels.includes("sound")) {
    try {
      await playAlertTone();
    } catch {
      errors.push("The alert sound was blocked by the browser.");
    }
  }

  // The in-terminal toast is always a completed active-terminal delivery.
  return { delivered: true, error: errors.length ? errors.join(" ").slice(0, 500) : null };
}

export function useActiveAlertMonitor(
  onTerminalNotification: (title: string, message: string) => void,
): ActiveAlertMonitorStatus {
  const [status, setStatus] = useState<Omit<ActiveAlertMonitorStatus, "label">>({
    phase: "checking",
    configured: null,
    enabledAlertCount: 0,
    truncated: false,
    lastCheckedAt: null,
    message: "Checking PostgreSQL before starting the active-terminal alert monitor.",
  });

  useEffect(() => {
    let stopped = false;
    let running = false;
    let configured: boolean | null = null;
    let controller: AbortController | null = null;

    const poll = async () => {
      if (stopped || running) return;
      running = true;
      controller = new AbortController();
      const { signal } = controller;
      const requestTimeout = window.setTimeout(() => controller?.abort(), ACTIVE_TERMINAL_REQUEST_TIMEOUT_MS);
      try {
        if (configured !== true) {
          const persistence = await personalRequest<PersonalStatus>("resource=status", signal);
          configured = persistence.configured;
          if (!configured) {
            if (!stopped) setStatus({
              phase: "inactive",
              configured: false,
              enabledAlertCount: 0,
              truncated: false,
              lastCheckedAt: new Date().toISOString(),
              message: persistence.detail ?? "PostgreSQL is unavailable, so no alert context is fetched.",
            });
            return;
          }
        }

        const alertSet = await personalRequest<MonitorAlertSet>(
          "resource=alerts&monitor=active-terminal",
          signal,
        );
        const alerts = alertSet.alerts;
        if (alerts.length === 0) {
          if (!stopped) setStatus({
            phase: "monitoring",
            configured: true,
            enabledAlertCount: 0,
            truncated: false,
            lastCheckedAt: new Date().toISOString(),
            message: "The active-terminal monitor is ready; no enabled NEWS or EVENT alerts are saved.",
          });
          return;
        }

        const observedAt = new Date().toISOString();
        const needsWatchlists = alerts.some((alert) => Boolean(alert.watchlistId));
        const newsAlerts = alerts.filter((alert) => alert.type === "NEWS");
        const eventAlerts = alerts.filter((alert) => alert.type === "EVENT");
        const watermark = earliestNewsWatermark(newsAlerts);
        const newsParams = new URLSearchParams({ kind: "news", all: "true" });
        if (watermark) newsParams.set("after", watermark);
        const eventRange = activeTerminalEventRange(eventAlerts, observedAt);
        const eventParams = new URLSearchParams({ kind: "events", all: "true" });
        if (eventRange) {
          eventParams.set("from", eventRange.from);
          eventParams.set("to", eventRange.to);
        }

        const [watchlistResult, newsResult, eventResult] = await Promise.allSettled([
          needsWatchlists
            ? personalRequest<readonly ActiveTerminalWatchlist[]>("resource=watchlists", signal)
            : Promise.resolve([] as readonly ActiveTerminalWatchlist[]),
          newsAlerts.length
            ? researchRequest<NewsResearchBundle>(`/api/research?${newsParams.toString()}`, signal)
            : Promise.resolve({ articles: [], filterTicker: null } as NewsResearchBundle),
          eventAlerts.length && eventRange
            ? researchRequest<EventsResearchBundle>(`/api/research?${eventParams.toString()}`, signal)
            : Promise.resolve({ events: [], filterTicker: null, from: "", to: "" } as EventsResearchBundle),
        ]);

        const watchlistsAvailable = watchlistResult.status === "fulfilled";
        const newsAvailable = newsResult.status === "fulfilled";
        const eventsAvailable = eventResult.status === "fulfilled";
        const eligibleAlerts = alerts.filter((alert) => {
          if (alert.watchlistId && !watchlistsAvailable) return false;
          if (alert.type === "NEWS") return newsAvailable;
          if (alert.type === "EVENT") return eventsAvailable;
          return false;
        });
        const evaluations = evaluateActiveTerminalAlerts({
          alerts: eligibleAlerts,
          articles: newsResult.status === "fulfilled" ? newsResult.value.articles : [],
          events: eventResult.status === "fulfilled" ? eventResult.value.events : [],
          watchlists: watchlistResult.status === "fulfilled" ? watchlistResult.value : [],
          observedAt,
        });
        let candidateCount = 0;
        const boundedEvaluations = evaluations.filter((evaluation) => {
          if (!evaluation.matched) return true;
          candidateCount += 1;
          return candidateCount <= MAX_NOTIFICATIONS_PER_CYCLE;
        });
        if (boundedEvaluations.length === 0) {
          if (!stopped) setStatus({
            phase: "error",
            configured: true,
            enabledAlertCount: alerts.length,
            truncated: alertSet.truncated,
            lastCheckedAt: observedAt,
            message: "Alert definitions are enabled, but their required shared context is unavailable.",
          });
          return;
        }

        const decisionBatch = await personalRequest<MonitorDecisionBatch>(
          "resource=alerts&action=active-terminal-evaluate",
          signal,
          { method: "PATCH", body: monitorEvaluationBody(boundedEvaluations, observedAt) },
        );
        const evaluationById = new Map(boundedEvaluations.map((evaluation) => [evaluation.alertId, evaluation]));
        const claimed = decisionBatch.decisions.filter((decision) => decision.claimed && decision.deliveryKey);
        const deliveryOutcomes = (await Promise.all(claimed.map(async (decision): Promise<DeliveryOutcome | null> => {
          const evaluation = evaluationById.get(decision.id);
          if (!evaluation?.notification || !decision.deliveryKey) return null;
          const outcome = await deliverNotification(
            evaluation.notification,
            decision.deliveryKey,
            onTerminalNotification,
          );
          return { id: decision.id, deliveryKey: decision.deliveryKey, ...outcome };
        }))).filter((outcome): outcome is DeliveryOutcome => outcome !== null);

        if (deliveryOutcomes.length > 0) {
          const deliveryBody = JSON.stringify({ deliveries: deliveryOutcomes });
          const acknowledgement = await personalRequest<MonitorDeliveryAcknowledgement>(
            "resource=alerts&action=active-terminal-delivery",
            signal,
            { method: "PATCH", body: deliveryBody },
          );
          if (acknowledgement.updated < deliveryOutcomes.length) {
            await personalRequest<MonitorDeliveryAcknowledgement>(
              "resource=alerts&action=active-terminal-delivery",
              signal,
              { method: "PATCH", body: deliveryBody },
            );
          }
        }
        if (!stopped) setStatus({
          phase: "monitoring",
          configured: true,
          enabledAlertCount: alerts.length,
          truncated: alertSet.truncated,
          lastCheckedAt: decisionBatch.evaluatedAt,
          message: alertSet.truncated
            ? `The active-terminal monitor checked its ${alertSet.limit}-alert safety limit; additional enabled NEWS/EVENT alerts are not monitored in this browser cycle.`
            : `${alerts.length} enabled NEWS/EVENT alert${alerts.length === 1 ? "" : "s"} checked by the active-terminal-only monitor.`,
        });
      } catch (error) {
        if (stopped) return;
        if (error instanceof Error && error.name === "DATABASE_UNCONFIGURED") configured = null;
        setStatus((current) => ({
          ...current,
          phase: "error",
          configured,
          lastCheckedAt: new Date().toISOString(),
          message: signal.aborted
            ? "The active-terminal alert cycle exceeded its 20-second request limit. No incomplete context was evaluated."
            : error instanceof Error ? error.message : "The active-terminal alert monitor failed.",
        }));
      } finally {
        window.clearTimeout(requestTimeout);
        running = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => { void poll(); }, ACTIVE_TERMINAL_ALERT_POLL_MS);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [onTerminalNotification]);

  return useMemo(() => ({
    ...status,
    label: status.phase === "monitoring"
      ? `OPEN-TERMINAL ONLY · ${status.enabledAlertCount}${status.truncated ? "+" : ""}`
      : status.phase === "inactive"
        ? "OFF · POSTGRESQL REQUIRED"
        : status.phase === "error"
          ? "MONITOR DEGRADED"
          : "CHECKING",
  }), [status]);
}
