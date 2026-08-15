import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getServerEnv } from "@/lib/env";
import { normalizeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const tickerSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,14}$/);
const resourceSchema = z.enum(["status", "settings", "notes", "alerts", "watchlists", "workspaces", "scanners"]);
const identifierSchema = z.string().trim().min(1).max(64);
const jsonObjectSchema = z.record(z.string(), z.unknown());

const noteSchema = z.object({
  symbol: tickerSchema,
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().max(100_000),
});

const alertSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  type: z.enum(["PRICE", "PERCENT_CHANGE", "RELATIVE_VOLUME", "NEWS", "EVENT", "TECHNICAL"]),
  symbol: tickerSchema.nullable().optional(),
  configuration: jsonObjectSchema,
  enabled: z.boolean().default(true),
});

const settingsSchema = z.object({
  timezone: z.string().trim().min(1).max(80).optional(),
  defaultWatchlistId: z.string().nullable().optional(),
  defaultWorkspaceId: z.string().nullable().optional(),
  chartDefaults: jsonObjectSchema.optional(),
  preferredIndicators: z.array(z.string().max(40)).max(30).optional(),
  scannerDefaults: jsonObjectSchema.optional(),
  newsFilters: jsonObjectSchema.optional(),
  eventFilters: jsonObjectSchema.optional(),
  refreshPreferences: jsonObjectSchema.optional(),
});

const watchlistSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  symbols: z.array(tickerSchema).max(500).default([]),
});

const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  layout: jsonObjectSchema,
});

const scannerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  definition: jsonObjectSchema,
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
    if (resource === "alerts") return success(await db.alert.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } }));
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
      return success(await db.alert.create({ data: { ownerId, ...input, configuration: jsonValue(input.configuration) } }), 201);
    }
    if (resource === "settings") {
      const input = settingsSchema.parse(body);
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
      const uniqueSymbols = [...new Set(input.symbols)];
      return success(await db.watchlist.create({
        data: {
          ownerId,
          name: input.name,
          description: input.description,
          tickers: { create: uniqueSymbols.map((symbol, position) => ({ symbol, position })) },
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
      return success(await db.savedScanner.create({ data: { ownerId, name: input.name, description: input.description, definition: jsonValue(input.definition) } }), 201);
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
    const id = identifierSchema.parse(request.nextUrl.searchParams.get("id"));
    const db = await database();
    if (!db) return unavailable();
    const body: unknown = await request.json();
    if (resource === "notes") {
      const input = noteSchema.partial().parse(body);
      return success(await db.notes.update({ where: { id, ownerId }, data: input }));
    }
    if (resource === "alerts") {
      const input = alertSchema.partial().parse(body);
      return success(await db.alert.update({ where: { id, ownerId }, data: { ...input, configuration: input.configuration ? jsonValue(input.configuration) : undefined } }));
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
