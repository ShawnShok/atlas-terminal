import "server-only";

import { z } from "zod";

import type { CacheTtlConfig } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import type {
  AggregateBar,
  NewsArticle,
  Snapshot,
  TickerDetails,
} from "@/types";

import {
  adaptAggregateBars,
  adaptNews,
  adaptSnapshot,
  adaptTickerDetails,
} from "./adapters";
import type { MassiveClient } from "./client";
import {
  massiveAggregatesResponseSchema,
  massiveNewsResponseSchema,
  massiveSnapshotResponseSchema,
  massiveTickerDetailsResponseSchema,
} from "./schemas";

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9.-]{0,9}$/,
    "Ticker must contain 1-10 letters, numbers, dots, or hyphens.",
  );
const optionTickerSchema = z.string().trim().toUpperCase().regex(
  /^O:[A-Z0-9.-]{1,15}[0-9]{6}[CP][0-9]{8}$/,
  "Option ticker format is invalid.",
);
const aggregateSymbolSchema = z.union([tickerSchema, optionTickerSchema]);

const dateSchema = z.iso.date();

const aggregatesInputSchema = z
  .object({
    symbol: aggregateSymbolSchema,
    multiplier: z.number().int().positive().max(50_000),
    timespan: z.enum([
      "minute",
      "hour",
      "day",
      "week",
      "month",
      "quarter",
      "year",
    ]),
    from: dateSchema,
    to: dateSchema,
    adjusted: z.boolean().default(true),
    sort: z.enum(["asc", "desc"]).default("asc"),
    limit: z.number().int().positive().max(50_000).default(5_000),
  })
  .refine((input) => input.from <= input.to, {
    message: "Aggregate start date must be on or before the end date.",
    path: ["from"],
  });

const newsInputSchema = z.object({
  symbol: tickerSchema.optional(),
  publishedAfter: z.iso.datetime({ offset: true }).optional(),
  limit: z.number().int().positive().max(1_000).default(50),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export interface AggregateBarsInput {
  readonly symbol: string;
  readonly multiplier: number;
  readonly timespan:
    | "minute"
    | "hour"
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year";
  readonly from: string;
  readonly to: string;
  readonly adjusted?: boolean;
  readonly sort?: "asc" | "desc";
  readonly limit?: number;
}

export interface NewsQuery {
  readonly symbol?: string;
  readonly publishedAfter?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
}

export interface MarketDataService {
  getSnapshot(symbol: string): Promise<Snapshot>;
  getTickerDetails(symbol: string): Promise<TickerDetails>;
  getAggregateBars(input: AggregateBarsInput): Promise<readonly AggregateBar[]>;
  getNews(input?: NewsQuery): Promise<readonly NewsArticle[]>;
}

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Market data request is invalid.", {
      details: {
        fields: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  return result.data;
}

function intervalFor(
  multiplier: number,
  timespan: AggregateBarsInput["timespan"],
): AggregateBar["interval"] {
  switch (timespan) {
    case "minute":
      return `${multiplier}m`;
    case "hour":
      return `${multiplier}h`;
    case "day":
      return `${multiplier}D`;
    case "week":
      return `${multiplier}W`;
    case "month":
      return `${multiplier}M`;
    case "quarter":
      return `${multiplier * 3}M`;
    case "year":
      return `${multiplier * 12}M`;
  }
}

export class MassiveMarketDataService implements MarketDataService {
  readonly #client: MassiveClient;
  readonly #ttls: CacheTtlConfig;

  constructor(client: MassiveClient, ttls: CacheTtlConfig) {
    this.#client = client;
    this.#ttls = ttls;
  }

  async getSnapshot(symbolInput: string): Promise<Snapshot> {
    const symbol = validate(tickerSchema, symbolInput);
    const response = await this.#client.request({
      path: `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}`,
      schema: massiveSnapshotResponseSchema,
      cacheTtlMs: this.#ttls.snapshot,
      staleIfErrorMs: this.#ttls.staleIfError,
    });
    return adaptSnapshot(response, symbol);
  }

  async getTickerDetails(symbolInput: string): Promise<TickerDetails> {
    const symbol = validate(tickerSchema, symbolInput);
    const response = await this.#client.request({
      path: `/v3/reference/tickers/${encodeURIComponent(symbol)}`,
      schema: massiveTickerDetailsResponseSchema,
      cacheTtlMs: this.#ttls.reference,
      staleIfErrorMs: this.#ttls.staleIfError,
    });
    return adaptTickerDetails(response, symbol);
  }

  async getAggregateBars(
    input: AggregateBarsInput,
  ): Promise<readonly AggregateBar[]> {
    const parsed = validate(aggregatesInputSchema, input);
    const response = await this.#client.request({
      path: `/v2/aggs/ticker/${encodeURIComponent(parsed.symbol)}/range/${parsed.multiplier}/${parsed.timespan}/${parsed.from}/${parsed.to}`,
      query: {
        adjusted: parsed.adjusted,
        sort: parsed.sort,
        limit: parsed.limit,
      },
      schema: massiveAggregatesResponseSchema,
      cacheTtlMs: this.#ttls.historical,
      staleIfErrorMs: this.#ttls.staleIfError,
    });

    return adaptAggregateBars(response, {
      symbol: parsed.symbol,
      interval: intervalFor(parsed.multiplier, parsed.timespan),
      quality: "historical",
    });
  }

  async getNews(input: NewsQuery = {}): Promise<readonly NewsArticle[]> {
    const parsed = validate(newsInputSchema, input);
    const response = await this.#client.request({
      path: "/v2/reference/news",
      query: {
        ticker: parsed.symbol,
        "published_utc.gte": parsed.publishedAfter,
        limit: parsed.limit,
        order: parsed.order,
        sort: "published_utc",
      },
      schema: massiveNewsResponseSchema,
      cacheTtlMs: this.#ttls.news,
      staleIfErrorMs: this.#ttls.staleIfError,
    });
    return adaptNews(response);
  }
}
