import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  ACTIVE_TERMINAL_ALERT_LIMIT,
  ACTIVE_TERMINAL_ALERT_POLL_MS,
  ACTIVE_TERMINAL_DELIVERY_HISTORY_LIMIT,
  ACTIVE_TERMINAL_PENDING_DELIVERY,
  ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT,
  activeTerminalMonitorState,
} from "@/lib/alerts/active-terminal";
import { evaluateAlertDelivery } from "@/lib/alerts/evaluator";
import { getServerEnv } from "@/lib/env";
import { AppError, normalizeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const ACTIVE_TERMINAL_DELIVERY_RETRY_MS = ACTIVE_TERMINAL_ALERT_POLL_MS * 2;

const tickerSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,14}$/);
const resourceSchema = z.enum(["status", "settings", "notes", "alerts", "read-news", "watchlists", "workspaces", "scanners"]);
const identifierSchema = z.string().trim().min(1).max(64);
const jsonObjectSchema = z.record(z.string(), z.unknown());

const noteSchema = z.object({
  symbol: tickerSchema,
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().max(100_000),
});

const deliveryChannelsSchema = z.array(z.enum(["browser", "sound"])).max(2).superRefine((channels, context) => {
  if (new Set(channels).size !== channels.length) {
    context.addIssue({ code: "custom", message: "Alert delivery channels must be unique." });
  }
});

const alertSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  type: z.enum(["PRICE", "PERCENT_CHANGE", "RELATIVE_VOLUME", "NEWS", "EVENT", "OPTIONS", "TECHNICAL"]),
  symbol: tickerSchema.nullable().optional(),
  watchlistId: identifierSchema.nullable().optional(),
  configuration: jsonObjectSchema,
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().int().min(0).max(10_080).default(0),
  deliveryChannels: deliveryChannelsSchema.default([]),
}).strict();

const alertPatchSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  type: z.enum(["PRICE", "PERCENT_CHANGE", "RELATIVE_VOLUME", "NEWS", "EVENT", "OPTIONS", "TECHNICAL"]).optional(),
  symbol: tickerSchema.nullable().optional(),
  watchlistId: identifierSchema.nullable().optional(),
  configuration: jsonObjectSchema.optional(),
  enabled: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
  deliveryChannels: deliveryChannelsSchema.optional(),
}).strict().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "At least one alert field must be supplied.",
});

const corporateEventStatusSchema = z.enum([
  "confirmed",
  "pending",
  "canceled",
  "rescheduled",
  "completed",
  "unknown",
]);
const alertEventStatusesSchema = z.record(
  z.string().trim().min(1).max(700).regex(/^event:/),
  corporateEventStatusSchema,
).superRefine((statuses, context) => {
  if (Object.keys(statuses).length > ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT) {
    context.addIssue({ code: "custom", message: "Alert event status history exceeds its safety limit." });
  }
});
const alertMonitorEvaluationSchema = z.object({
  id: identifierSchema,
  matched: z.boolean(),
  deliveryKey: z.string().trim().min(1).max(1_000).regex(/^(?:news|event):/).nullable(),
  eventStatuses: alertEventStatusesSchema.optional(),
}).strict().superRefine((evaluation, context) => {
  if (evaluation.matched !== Boolean(evaluation.deliveryKey)) {
    context.addIssue({ code: "custom", message: "Matched alert evaluations require exactly one delivery key." });
  }
});
const alertMonitorEvaluationBatchSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  evaluations: z.array(alertMonitorEvaluationSchema).min(1).max(100),
}).strict().superRefine((batch, context) => {
  if (new Set(batch.evaluations.map((evaluation) => evaluation.id)).size !== batch.evaluations.length) {
    context.addIssue({ code: "custom", message: "Each alert may be evaluated only once per monitor cycle." });
  }
});
const alertMonitorDeliverySchema = z.object({
  id: identifierSchema,
  deliveryKey: z.string().trim().min(1).max(1_000).regex(/^(?:news|event):/),
  delivered: z.boolean(),
  error: z.string().trim().min(1).max(500).nullable(),
}).strict();
const alertMonitorDeliveryBatchSchema = z.object({
  deliveries: z.array(alertMonitorDeliverySchema).min(1).max(20),
}).strict().superRefine((batch, context) => {
  if (new Set(batch.deliveries.map((delivery) => delivery.id)).size !== batch.deliveries.length) {
    context.addIssue({ code: "custom", message: "Each claimed alert may be acknowledged only once per request." });
  }
});

const readNewsArticleSchema = z.object({
  source: z.string().trim().toLowerCase().min(1).max(40),
  articleId: z.string().trim().min(1).max(1_000),
}).strict();

const settingsSchema = z.object({
  timezone: z.string().trim().min(1).max(80).optional(),
  defaultWatchlistId: identifierSchema.nullable().optional(),
  defaultWorkspaceId: identifierSchema.nullable().optional(),
  chartDefaults: jsonObjectSchema.optional(),
  preferredIndicators: z.array(z.string().max(40)).max(30).optional(),
  scannerDefaults: jsonObjectSchema.optional(),
  newsFilters: jsonObjectSchema.optional(),
  eventFilters: jsonObjectSchema.optional(),
  refreshPreferences: jsonObjectSchema.optional(),
});

const watchlistSymbolsSchema = z.array(tickerSchema).max(100).superRefine((symbols, context) => {
  const firstIndexBySymbol = new Map<string, number>();
  symbols.forEach((symbol, index) => {
    const firstIndex = firstIndexBySymbol.get(symbol);
    if (firstIndex === undefined) {
      firstIndexBySymbol.set(symbol, index);
      return;
    }
    context.addIssue({
      code: "custom",
      message: `${symbol} is duplicated; each watchlist symbol must be unique.`,
      path: [index],
      params: { firstIndex },
    });
  });
});

const watchlistSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  symbols: watchlistSymbolsSchema.default([]),
}).strict();

const watchlistPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  symbols: watchlistSymbolsSchema.optional(),
}).strict().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "At least one watchlist field must be supplied.",
});

const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  layout: jsonObjectSchema,
});

const scannerFields = [
  "price", "market-cap", "volume", "average-volume", "relative-volume", "daily-change",
  "weekly-change", "monthly-change", "sma-distance", "ema-distance", "vwap-distance", "rsi",
  "distance-52w-high", "distance-52w-low", "gap-percent", "recent-news-minutes",
  "daily-relative-volume", "intraday-relative-volume", "distance-recent-high",
  "volume-acceleration", "distance-day-high", "distance-day-low", "new-intraday-high", "new-intraday-low",
  "price-vs-vwap", "price-vs-sma20", "price-vs-sma50", "price-vs-sma200", "price-vs-ema20", "price-vs-ema50",
  "price-vs-recent-high", "price-vs-recent-low", "news-headline", "news-category", "news-keyword",
  "event-within-days", "earnings-within-days", "confirmed-event-within-days", "investor-event-within-days",
  "option-volume", "option-open-interest", "option-volume-oi", "option-call-volume", "option-put-volume",
  "option-call-open-interest", "option-put-open-interest", "option-call-put-volume", "option-call-put-open-interest",
  "option-average-iv", "option-min-dte", "option-max-dte",
  "option-highest-contract-volume", "option-highest-contract-open-interest", "option-volume-relative-underlying",
] as const;
const scannerOperators = ["greater-than", "greater-than-or-equal", "less-than", "less-than-or-equal", "equal", "between", "in"] as const;
const scannerNumericRuleFields = new Set([
  "price", "marketCap", "volume", "averageVolume", "relativeVolume", "dailyChangePercent",
  "weeklyChangePercent", "monthlyChangePercent", "rsi", "gapPercent", "percentBelow52WeekHigh",
  "percentAbove52WeekLow", "percentBelowRecentHigh20", "distanceFromVwapPercent", "dailyRelativeVolume",
  "intradayRelativeVolume", "optionVolume", "optionOpenInterest", "optionVolumeToOpenInterest",
  "percentBelowDayHigh", "percentAboveDayLow", "volumeAccelerationRatio", "newIntradayHigh", "newIntradayLow",
  "optionCallVolume", "optionPutVolume", "optionCallOpenInterest", "optionPutOpenInterest",
  "optionCallToPutVolumeRatio", "optionCallToPutOpenInterestRatio", "optionAverageImpliedVolatility",
  "optionMinimumDte", "optionMaximumDte",
  "optionHighestContractVolume", "optionHighestContractOpenInterest", "optionVolumeRelativeToUnderlying",
]);
const scannerNumericRuleOperators = new Set(["gt", "gte", "lt", "lte", "eq", "between", "absolute-gte"]);
const scannerPriceReferences = new Set(["sma20", "sma50", "sma200", "ema20", "ema50", "vwap", "recentHigh20", "recentLow20"]);
const scannerPriceRelations = new Set(["above", "at-or-above", "below", "at-or-below"]);
const scannerMarketCapBuckets = new Set(["micro", "small", "mid", "large", "mega"]);
const maxScannerScalarMagnitude = 1_000_000_000_000_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyObjectKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedScannerNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= maxScannerScalarMagnitude;
}

function isBoundedScannerStringList(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 20
    && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 80);
}

function isValidSerializedScannerRule(
  value: unknown,
  depth = 0,
  budget: { nodes: number } = { nodes: 0 },
): boolean {
  if (!isPlainObject(value) || depth > 4 || budget.nodes >= 40) return false;
  budget.nodes += 1;

  if (value.kind === "numeric") {
    if (!hasOnlyObjectKeys(value, ["kind", "field", "operator", "value", "upperValue"])
      || !scannerNumericRuleFields.has(String(value.field))
      || !scannerNumericRuleOperators.has(String(value.operator))
      || !isBoundedScannerNumber(value.value)) return false;
    if (value.operator === "between") {
      return isBoundedScannerNumber(value.upperValue) && value.upperValue >= value.value;
    }
    return value.upperValue === undefined;
  }
  if (value.kind === "price-relation") {
    return hasOnlyObjectKeys(value, ["kind", "reference", "relation"])
      && scannerPriceReferences.has(String(value.reference))
      && scannerPriceRelations.has(String(value.relation));
  }
  if (value.kind === "market-cap") {
    return hasOnlyObjectKeys(value, ["kind", "buckets"])
      && Array.isArray(value.buckets)
      && value.buckets.length >= 1
      && value.buckets.length <= 5
      && value.buckets.every((bucket) => scannerMarketCapBuckets.has(String(bucket)))
      && new Set(value.buckets).size === value.buckets.length;
  }
  if (value.kind === "recent-news") {
    return hasOnlyObjectKeys(value, ["kind", "withinMinutes", "calendarDay", "headlineIncludes", "categories", "keywords"])
      && isBoundedScannerNumber(value.withinMinutes)
      && value.withinMinutes >= 0
      && value.withinMinutes <= 525_600
      && (value.calendarDay === undefined || value.calendarDay === "today")
      && (value.headlineIncludes === undefined || (typeof value.headlineIncludes === "string" && value.headlineIncludes.trim().length > 0 && value.headlineIncludes.length <= 120))
      && (value.categories === undefined || isBoundedScannerStringList(value.categories))
      && (value.keywords === undefined || isBoundedScannerStringList(value.keywords));
  }
  if (value.kind === "catalyst-window") {
    if (!hasOnlyObjectKeys(value, ["kind", "withinDays", "catalystTypes", "statuses"])
      || !isBoundedScannerNumber(value.withinDays) || value.withinDays < 0 || value.withinDays > 3_650) return false;
    return (value.catalystTypes === undefined || isBoundedScannerStringList(value.catalystTypes))
      && (value.statuses === undefined || isBoundedScannerStringList(value.statuses));
  }
  if (value.kind === "all" || value.kind === "any") {
    return hasOnlyObjectKeys(value, ["kind", "rules"])
      && Array.isArray(value.rules)
      && value.rules.length >= 1
      && value.rules.length <= 12
      && value.rules.every((rule) => isValidSerializedScannerRule(rule, depth + 1, budget));
  }
  if (value.kind === "not") {
    return hasOnlyObjectKeys(value, ["kind", "rule"])
      && isValidSerializedScannerRule(value.rule, depth + 1, budget);
  }
  return false;
}

const scannerConditionValueSchema = z.union([
  z.number().finite().min(-maxScannerScalarMagnitude).max(maxScannerScalarMagnitude),
  z.string().trim().min(1).max(200),
]);
const scannerConditionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  field: z.enum(scannerFields),
  operator: z.enum(scannerOperators),
  value: scannerConditionValueSchema,
  secondaryValue: scannerConditionValueSchema.optional(),
  unit: z.string().trim().min(1).max(24).optional(),
}).strict();
const scannerRuleSchema = jsonObjectSchema.superRefine((rule, context) => {
  if (!isValidSerializedScannerRule(rule)) {
    context.addIssue({ code: "custom", message: "The serialized scanner rule is invalid or exceeds its depth and size limits." });
  }
});
const scannerScoreWeightsSchema = z.object({
  priceMovement: z.number().finite().min(0).max(1_000_000),
  relativeVolume: z.number().finite().min(0).max(1_000_000),
  technicalConfirmation: z.number().finite().min(0).max(1_000_000),
  newsRecency: z.number().finite().min(0).max(1_000_000),
  eventProximity: z.number().finite().min(0).max(1_000_000),
  optionsActivity: z.number().finite().min(0).max(1_000_000),
}).strict().refine((weights) => Object.values(weights).some((weight) => weight > 0), {
  message: "At least one research-priority weight must be positive.",
});
const scannerDefinitionSchema = z.object({
  version: z.literal(1),
  logic: z.enum(["all", "any"]),
  conditions: z.array(scannerConditionSchema).min(1).max(12),
  rule: scannerRuleSchema.optional(),
  scoreWeights: scannerScoreWeightsSchema.optional(),
  watchlistId: identifierSchema.nullable().optional(),
}).strict();
const scannerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  definition: scannerDefinitionSchema,
}).strict();
const scannerPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  definition: scannerDefinitionSchema.optional(),
}).strict().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "At least one saved scanner field must be supplied.",
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function configurationObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function monitorConfiguration(
  configuration: unknown,
  eventStatuses: Readonly<Record<string, z.infer<typeof corporateEventStatusSchema>>> | undefined,
  claimedDeliveryKey: string | null,
): Prisma.InputJsonValue | undefined {
  if (!eventStatuses && !claimedDeliveryKey) return undefined;
  const root = configurationObject(configuration);
  const current = activeTerminalMonitorState(root);
  const mergedStatuses = Object.fromEntries([
    ...Object.entries(eventStatuses ?? {}),
    ...Object.entries(current.eventStatuses).filter(([key]) => !eventStatuses || !(key in eventStatuses)),
  ].slice(0, ACTIVE_TERMINAL_STATUS_HISTORY_LIMIT));
  const recentDeliveryKeys = claimedDeliveryKey
    ? [claimedDeliveryKey, ...current.recentDeliveryKeys.filter((key) => key !== claimedDeliveryKey)]
        .slice(0, ACTIVE_TERMINAL_DELIVERY_HISTORY_LIMIT)
    : current.recentDeliveryKeys;
  return jsonValue({
    ...root,
    activeTerminalMonitor: {
      version: 1,
      eventStatuses: mergedStatuses,
      recentDeliveryKeys,
    },
  });
}

function unavailable() {
  return NextResponse.json({
    ok: false,
    error: {
      code: "DATABASE_UNCONFIGURED",
      message: "PostgreSQL persistence requires a server-side DATABASE_URL.",
      retryable: false,
      requestId: crypto.randomUUID(),
    },
  }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}

function unauthorized() {
  return NextResponse.json({
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Sign in with the private ATLAS owner account to access personal research data.",
      retryable: false,
      requestId: crypto.randomUUID(),
    },
  }, { status: 401, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

async function requestOwnerId(): Promise<string | null> {
  const user = await getChatGPTUser();
  if (!user) return process.env.NODE_ENV === "production" ? null : "primary";
  const bytes = new TextEncoder().encode(user.email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const suffix = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `chatgpt-${suffix}`;
}

async function database() {
  if (!getServerEnv().DATABASE_URL) return null;
  const { getPrismaClient } = await import("@/lib/prisma");
  return getPrismaClient();
}

async function ensureOwner(db: NonNullable<Awaited<ReturnType<typeof database>>>, ownerId: string) {
  await db.userSettings.upsert({ where: { id: ownerId }, update: {}, create: { id: ownerId } });
}

async function assertOwnedSettingsReferences(
  db: NonNullable<Awaited<ReturnType<typeof database>>>,
  ownerId: string,
  input: z.infer<typeof settingsSchema>,
) {
  if (input.defaultWatchlistId) {
    const watchlist = await db.watchlist.findFirst({
      where: { id: input.defaultWatchlistId, ownerId },
      select: { id: true },
    });
    if (!watchlist) {
      throw new AppError("VALIDATION_ERROR", "The selected default watchlist is not available to this account.");
    }
  }
  if (input.defaultWorkspaceId) {
    const workspace = await db.savedWorkspace.findFirst({
      where: { id: input.defaultWorkspaceId, ownerId },
      select: { id: true },
    });
    if (!workspace) {
      throw new AppError("VALIDATION_ERROR", "The selected default workspace is not available to this account.");
    }
  }
}

async function assertOwnedAlertWatchlist(
  db: NonNullable<Awaited<ReturnType<typeof database>>>,
  ownerId: string,
  watchlistId: string | null | undefined,
) {
  if (!watchlistId) return;
  const watchlist = await db.watchlist.findFirst({
    where: { id: watchlistId, ownerId },
    select: { id: true },
  });
  if (!watchlist) {
    throw new AppError("VALIDATION_ERROR", "The selected alert watchlist is not available to this account.");
  }
}

function requestResource(request: NextRequest) {
  return resourceSchema.parse(request.nextUrl.searchParams.get("resource") ?? "status");
}

function success(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The personal research request is invalid.",
        retryable: false,
        requestId: crypto.randomUUID(),
      },
    }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const normalized = normalizeError(error);
  return NextResponse.json({
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      requestId: crypto.randomUUID(),
    },
  }, { status: normalized.statusCode, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const ownerId = await requestOwnerId();
    if (!ownerId) return unauthorized();
    const resource = requestResource(request);
    if (resource === "status") {
      if (!getServerEnv().DATABASE_URL) {
        return success({ configured: false, provider: "PostgreSQL / Prisma", detail: "DATABASE_URL is not configured." });
      }
      try {
        const db = await database();
        if (!db) return success({ configured: false, provider: "PostgreSQL / Prisma", detail: "Database client is unavailable." });
        await db.$queryRaw`SELECT 1`;
        return success({ configured: true, provider: "PostgreSQL / Prisma", detail: "Connection verified." });
      } catch {
        return success({ configured: false, provider: "PostgreSQL / Prisma", detail: "The configured database could not be reached from this runtime." });
      }
    }
    const db = await database();
    if (!db) return unavailable();
    await ensureOwner(db, ownerId);
    if (resource === "settings") return success(await db.userSettings.findUnique({ where: { id: ownerId } }));
    if (resource === "notes") {
      const symbol = request.nextUrl.searchParams.get("symbol");
      return success(await db.notes.findMany({
        where: { ownerId, ...(symbol ? { symbol: tickerSchema.parse(symbol) } : {}) },
        orderBy: { updatedAt: "desc" },
      }));
    }
    if (resource === "alerts") {
      const monitor = request.nextUrl.searchParams.get("monitor") === "active-terminal";
      if (monitor) {
        const alerts = await db.alert.findMany({
          where: { ownerId, enabled: true, type: { in: ["NEWS", "EVENT"] } },
          orderBy: { createdAt: "asc" },
          take: ACTIVE_TERMINAL_ALERT_LIMIT + 1,
        });
        return success({
          alerts: alerts.slice(0, ACTIVE_TERMINAL_ALERT_LIMIT),
          limit: ACTIVE_TERMINAL_ALERT_LIMIT,
          truncated: alerts.length > ACTIVE_TERMINAL_ALERT_LIMIT,
        });
      }
      return success(await db.alert.findMany({
        where: {
          ownerId,
        },
        orderBy: { updatedAt: "desc" },
      }));
    }
    if (resource === "read-news") return success(await db.readNewsArticle.findMany({
      where: { ownerId },
      select: { source: true, articleId: true, readAt: true },
      orderBy: { readAt: "desc" },
      take: 5_000,
    }));
    if (resource === "watchlists") return success(await db.watchlist.findMany({ where: { ownerId }, include: { tickers: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } }));
    if (resource === "workspaces") return success(await db.savedWorkspace.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }));
    return success(await db.savedScanner.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = await requestOwnerId();
    if (!ownerId) return unauthorized();
    const resource = requestResource(request);
    const db = await database();
    if (!db) return unavailable();
    await ensureOwner(db, ownerId);
    const body: unknown = await request.json();
    if (resource === "notes") {
      const input = noteSchema.parse(body);
      return success(await db.notes.create({ data: { ownerId, ...input } }), 201);
    }
    if (resource === "alerts") {
      const input = alertSchema.parse(body);
      await assertOwnedAlertWatchlist(db, ownerId, input.watchlistId);
      return success(await db.alert.create({ data: { ownerId, ...input, configuration: jsonValue(input.configuration) } }), 201);
    }
    if (resource === "read-news") {
      const input = readNewsArticleSchema.parse(body);
      return success(await db.readNewsArticle.upsert({
        where: { ownerId_source_articleId: { ownerId, source: input.source, articleId: input.articleId } },
        create: { ownerId, source: input.source, articleId: input.articleId },
        update: { readAt: new Date() },
      }), 201);
    }
    if (resource === "settings") {
      const input = settingsSchema.parse(body);
      await assertOwnedSettingsReferences(db, ownerId, input);
      const data = {
        ...input,
        chartDefaults: input.chartDefaults === undefined ? undefined : jsonValue(input.chartDefaults),
        preferredIndicators: input.preferredIndicators === undefined ? undefined : jsonValue(input.preferredIndicators),
        scannerDefaults: input.scannerDefaults === undefined ? undefined : jsonValue(input.scannerDefaults),
        newsFilters: input.newsFilters === undefined ? undefined : jsonValue(input.newsFilters),
        eventFilters: input.eventFilters === undefined ? undefined : jsonValue(input.eventFilters),
        refreshPreferences: input.refreshPreferences === undefined ? undefined : jsonValue(input.refreshPreferences),
      };
      return success(await db.userSettings.upsert({ where: { id: ownerId }, create: { id: ownerId, ...data }, update: data }));
    }
    if (resource === "watchlists") {
      const input = watchlistSchema.parse(body);
      return success(await db.watchlist.create({
        data: {
          ownerId,
          name: input.name,
          description: input.description,
          tickers: { create: input.symbols.map((symbol, position) => ({ symbol, position })) },
        },
        include: { tickers: { orderBy: { position: "asc" } } },
      }), 201);
    }
    if (resource === "workspaces") {
      const input = workspaceSchema.parse(body);
      return success(await db.savedWorkspace.upsert({
        where: { ownerId_name: { ownerId, name: input.name } },
        create: { ownerId, name: input.name, layout: jsonValue(input.layout) },
        update: { layout: jsonValue(input.layout) },
      }), 201);
    }
    if (resource === "scanners") {
      const input = scannerSchema.parse(body);
      await assertOwnedAlertWatchlist(db, ownerId, input.definition.watchlistId);
      return success(await db.savedScanner.upsert({
        where: { ownerId_name: { ownerId, name: input.name } },
        create: { ownerId, name: input.name, description: input.description, definition: jsonValue(input.definition) },
        update: { description: input.description, definition: jsonValue(input.definition) },
      }));
    }
    return NextResponse.json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "This resource cannot be created.", retryable: false, requestId: crypto.randomUUID() } }, { status: 405 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ownerId = await requestOwnerId();
    if (!ownerId) return unauthorized();
    const resource = requestResource(request);
    const db = await database();
    if (!db) return unavailable();
    const body: unknown = await request.json();
    const action = request.nextUrl.searchParams.get("action");
    if (resource === "alerts" && action === "active-terminal-evaluate") {
      const input = alertMonitorEvaluationBatchSchema.parse(body);
      const now = new Date();
      const observedAt = new Date(input.observedAt);
      if (observedAt.getTime() > now.getTime() + 60_000 || observedAt.getTime() < now.getTime() - 10 * 60_000) {
        throw new AppError("VALIDATION_ERROR", "The alert monitor observation time is outside the accepted request window.");
      }
      const nextEvaluationAt = new Date(now.getTime() + ACTIVE_TERMINAL_ALERT_POLL_MS);
      const records = await db.alert.findMany({
        where: {
          ownerId,
          enabled: true,
          type: { in: ["NEWS", "EVENT"] },
          id: { in: input.evaluations.map((evaluation) => evaluation.id) },
        },
      });
      const recordById = new Map(records.map((record) => [record.id, record]));
      const decisions = await db.$transaction(async (transaction) => {
        const results: Array<{ id: string; claimed: boolean; reason: string; deliveryKey: string | null }> = [];
        for (const evaluation of input.evaluations) {
          const alert = recordById.get(evaluation.id);
          if (!alert) continue;
          const expectedDeliveryPrefix = alert.type === "NEWS" ? "news:" : "event:";
          const matched = evaluation.matched && Boolean(evaluation.deliveryKey?.startsWith(expectedDeliveryPrefix));
          const evaluationWatermark = alert.lastEvaluatedAt && alert.lastEvaluatedAt > observedAt
            ? alert.lastEvaluatedAt
            : observedAt;
          const pendingDeliveryRetry = matched
            && evaluation.deliveryKey === alert.lastDeliveryKey
            && alert.lastDeliveryError === ACTIVE_TERMINAL_PENDING_DELIVERY
            && alert.lastTriggeredAt !== null
            && now.getTime() - alert.lastTriggeredAt.getTime() >= ACTIVE_TERMINAL_DELIVERY_RETRY_MS;
          const decision = evaluateAlertDelivery({
            enabled: alert.enabled,
            matched,
            eventKey: evaluation.deliveryKey ?? `evaluation:${alert.id}`,
            lastDeliveryKey: pendingDeliveryRetry ? null : alert.lastDeliveryKey,
            lastTriggeredAt: pendingDeliveryRetry ? null : alert.lastTriggeredAt?.toISOString() ?? null,
            cooldownSeconds: pendingDeliveryRetry ? 0 : alert.cooldownMinutes * 60,
            observedAt: now.toISOString(),
          });
          const nextConfiguration = monitorConfiguration(
            alert.configuration,
            alert.type === "EVENT" ? evaluation.eventStatuses : undefined,
            null,
          );
          if (decision.shouldNotify && decision.deliveryKey) {
            const claimed = await transaction.alert.updateMany({
              where: {
                id: alert.id,
                ownerId,
                enabled: true,
                type: { in: ["NEWS", "EVENT"] },
                lastDeliveryKey: alert.lastDeliveryKey,
                lastTriggeredAt: alert.lastTriggeredAt,
                lastDeliveryError: alert.lastDeliveryError,
                updatedAt: alert.updatedAt,
              },
              data: {
                lastEvaluatedAt: evaluationWatermark,
                nextEvaluationAt,
                lastTriggeredAt: now,
                lastDeliveryKey: decision.deliveryKey,
                lastDeliveryError: ACTIVE_TERMINAL_PENDING_DELIVERY,
                configuration: nextConfiguration,
              },
            });
            results.push({
              id: alert.id,
              claimed: claimed.count === 1,
              reason: claimed.count === 1 ? decision.reason : "duplicate",
              deliveryKey: claimed.count === 1 ? decision.deliveryKey : null,
            });
            continue;
          }
          await transaction.alert.updateMany({
            where: {
              id: alert.id,
              ownerId,
              enabled: true,
              type: { in: ["NEWS", "EVENT"] },
              updatedAt: alert.updatedAt,
            },
            data: {
              lastEvaluatedAt: evaluationWatermark,
              nextEvaluationAt,
              configuration: nextConfiguration,
            },
          });
          results.push({ id: alert.id, claimed: false, reason: decision.reason, deliveryKey: null });
        }
        return results;
      });
      return success({ evaluatedAt: observedAt.toISOString(), decisions });
    }
    if (resource === "alerts" && action === "active-terminal-delivery") {
      const input = alertMonitorDeliveryBatchSchema.parse(body);
      const deliveredAt = new Date();
      const records = await db.alert.findMany({
        where: {
          ownerId,
          id: { in: input.deliveries.map((delivery) => delivery.id) },
          type: { in: ["NEWS", "EVENT"] },
        },
      });
      const recordById = new Map(records.map((record) => [record.id, record]));
      const results = await db.$transaction(async (transaction) => {
        const updates: number[] = [];
        for (const delivery of input.deliveries) {
          const alert = recordById.get(delivery.id);
          if (!alert || alert.lastDeliveryKey !== delivery.deliveryKey) continue;
          const updated = await transaction.alert.updateMany({
            where: {
              id: delivery.id,
              ownerId,
              type: { in: ["NEWS", "EVENT"] },
              lastDeliveryKey: delivery.deliveryKey,
              updatedAt: alert.updatedAt,
            },
            data: {
              lastDeliveredAt: delivery.delivered ? deliveredAt : undefined,
              lastDeliveryError: delivery.error ?? (delivery.delivered ? null : "No active-terminal notification channel completed."),
              configuration: delivery.delivered
                ? monitorConfiguration(alert.configuration, undefined, delivery.deliveryKey)
                : undefined,
            },
          });
          updates.push(updated.count);
        }
        return updates;
      });
      return success({
        deliveredAt: deliveredAt.toISOString(),
        updated: results.reduce((total, count) => total + count, 0),
      });
    }
    const id = identifierSchema.parse(request.nextUrl.searchParams.get("id"));
    if (resource === "notes") {
      const input = noteSchema.partial().parse(body);
      return success(await db.notes.update({ where: { id, ownerId }, data: input }));
    }
    if (resource === "alerts") {
      const input = alertPatchSchema.parse(body);
      await assertOwnedAlertWatchlist(db, ownerId, input.watchlistId);
      return success(await db.alert.update({ where: { id, ownerId }, data: { ...input, configuration: input.configuration ? jsonValue(input.configuration) : undefined } }));
    }
    if (resource === "watchlists") {
      const input = watchlistPatchSchema.parse(body);
      const updated = await db.$transaction(async (transaction) => {
        const ownedWatchlist = await transaction.watchlist.findFirst({
          where: { id, ownerId },
          select: { id: true },
        });
        if (!ownedWatchlist) {
          throw new AppError("NOT_FOUND", "The selected watchlist is not available to this account.");
        }

        if (input.symbols !== undefined) {
          await transaction.watchlistTicker.deleteMany({
            where: {
              watchlistId: id,
              ...(input.symbols.length > 0 ? { symbol: { notIn: input.symbols } } : {}),
            },
          });
          for (const [position, symbol] of input.symbols.entries()) {
            await transaction.watchlistTicker.upsert({
              where: { watchlistId_symbol: { watchlistId: id, symbol } },
              create: { watchlistId: id, symbol, position },
              update: { position },
            });
          }
        }

        return transaction.watchlist.update({
          where: { id_ownerId: { id, ownerId } },
          data: {
            name: input.name,
            description: input.description,
          },
          include: { tickers: { orderBy: { position: "asc" } } },
        });
      });
      return success(updated);
    }
    if (resource === "scanners") {
      const input = scannerPatchSchema.parse(body);
      await assertOwnedAlertWatchlist(db, ownerId, input.definition?.watchlistId);
      const ownedScanner = await db.savedScanner.findFirst({
        where: { id, ownerId },
        select: { id: true },
      });
      if (!ownedScanner) {
        throw new AppError("NOT_FOUND", "The selected saved scanner is not available to this account.");
      }
      return success(await db.savedScanner.update({
        where: { id, ownerId },
        data: {
          name: input.name,
          description: input.description,
          definition: input.definition === undefined ? undefined : jsonValue(input.definition),
        },
      }));
    }
    return NextResponse.json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "This resource cannot be updated through this operation.", retryable: false, requestId: crypto.randomUUID() } }, { status: 405 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ownerId = await requestOwnerId();
    if (!ownerId) return unauthorized();
    const resource = requestResource(request);
    const id = identifierSchema.parse(request.nextUrl.searchParams.get("id"));
    const db = await database();
    if (!db) return unavailable();
    if (resource === "notes") await db.notes.delete({ where: { id, ownerId } });
    else if (resource === "alerts") await db.alert.delete({ where: { id, ownerId } });
    else if (resource === "watchlists") await db.watchlist.delete({ where: { id, ownerId } });
    else if (resource === "workspaces") await db.savedWorkspace.delete({ where: { id, ownerId } });
    else if (resource === "scanners") await db.savedScanner.delete({ where: { id, ownerId } });
    else return NextResponse.json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "This resource cannot be deleted.", retryable: false, requestId: crypto.randomUUID() } }, { status: 405 });
    return success({ id, deleted: true });
  } catch (error) {
    return failure(error);
  }
}
