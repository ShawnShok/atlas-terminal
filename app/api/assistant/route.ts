import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { buildAssistantReply, type AssistantResearchContext } from "@/lib/assistant/research";
import { getServerEnv } from "@/lib/env";
import { normalizeError } from "@/lib/errors";
import { getMassiveMarketDataService, getMassiveResearchService } from "@/lib/massive";
import { getMockResearchService } from "@/lib/mock";
import type { NewsArticle } from "@/types";

export const dynamic = "force-dynamic";

const CHATGPT_USER_EMAIL_HEADER = "oai-authenticated-user-email";
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;
const requestSchema = z.object({
  message: z.string().trim().min(2).max(600),
  ticker: z.string().trim().toUpperCase().regex(TICKER_PATTERN),
  activeView: z.string().trim().max(40).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1_200),
  }).strict()).max(10).default([]),
}).strict();

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

async function liveNews(ticker: string): Promise<readonly NewsArticle[]> {
  const research = getMassiveResearchService();
  try {
    return (await research.getBenzingaNews({ ticker, limit: 12 })).articles;
  } catch {
    return getMassiveMarketDataService().getNews({ symbol: ticker, limit: 12, order: "desc" });
  }
}

function unauthorized(requestId: string) {
  return NextResponse.json({
    ok: false,
    error: { code: "UNAUTHORIZED", message: "Sign in to use ATLAS Copilot.", retryable: false, requestId },
  }, { status: 401, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  if (
    process.env.NODE_ENV === "production"
    && !process.env.NODE_TEST_CONTEXT
    && !request.headers.get(CHATGPT_USER_EMAIL_HEADER)?.trim()
  ) return unauthorized(requestId);

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Enter a question of 2–600 characters and a valid ticker.", retryable: false, requestId },
      }, { status: 400, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }

    const { ticker, message } = parsed.data;
    const environment = getServerEnv();
    const now = new Date();
    const from = isoDate(addDays(now, -280));
    const to = isoDate(now);
    const eventTo = isoDate(addDays(now, 120));
    const mockMode = environment.USE_MOCK_DATA;

    const tasks = mockMode
      ? (() => {
          const mock = getMockResearchService();
          return [
            mock.getSecurity(ticker, 260),
            mock.getBenzingaNews({ ticker, limit: 12 }),
            mock.getCorporateEvents({ ticker, from: isoDate(addDays(now, -7)), to: eventTo, limit: 30 }),
            mock.getOptionChain({ symbol: ticker }),
            mock.getFinancials(ticker),
          ] as const;
        })()
      : (() => {
          const market = getMassiveMarketDataService();
          const research = getMassiveResearchService();
          return [
            Promise.all([
              market.getSnapshot(ticker),
              market.getTickerDetails(ticker),
              market.getAggregateBars({ symbol: ticker, multiplier: 1, timespan: "day", from, to, adjusted: true, sort: "asc", limit: 400 }),
            ]).then(([snapshot, details, bars]) => ({ snapshot, details, bars })),
            liveNews(ticker).then((articles) => ({ articles, filterTicker: ticker })),
            research.getCorporateEvents({ ticker, from: isoDate(addDays(now, -7)), to: eventTo, limit: 30 }),
            research.getOptionChain({ symbol: ticker }),
            research.getFinancials(ticker),
          ] as const;
        })();

    const [securityResult, newsResult, eventsResult, optionsResult, financialsResult] = await Promise.allSettled(tasks);
    if (securityResult.status === "rejected") throw securityResult.reason;

    const security = securityResult.value;
    const unavailable = [
      newsResult.status === "rejected" ? "news" : null,
      eventsResult.status === "rejected" ? "events" : null,
      optionsResult.status === "rejected" ? "options" : null,
      financialsResult.status === "rejected" ? "financial ratios" : null,
    ].filter((value): value is string => value !== null);
    const context: AssistantResearchContext = {
      ticker,
      snapshot: security.snapshot,
      details: security.details,
      bars: security.bars,
      news: newsResult.status === "fulfilled" ? newsResult.value.articles : [],
      events: eventsResult.status === "fulfilled" ? eventsResult.value.events : [],
      options: optionsResult.status === "fulfilled" ? optionsResult.value : null,
      ratios: financialsResult.status === "fulfilled" ? financialsResult.value.ratios : [],
      unavailable,
      source: mockMode ? "ATLAS mock research" : "Massive + Benzinga/TMX where entitled",
      asOf: security.snapshot.asOf || now.toISOString(),
    };
    const reply = buildAssistantReply(message, context);
    return NextResponse.json({
      ok: true,
      data: reply,
      meta: {
        mode: mockMode ? "mock" : "live",
        source: reply.source,
        asOf: reply.asOf,
        requestId,
      },
    }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        requestId,
      },
    }, { status: normalized.statusCode, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
}
