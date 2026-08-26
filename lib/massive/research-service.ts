import "server-only";

import { z } from "zod";

import type { CacheTtlConfig } from "@/lib/cache";
import { AppError, isAppError } from "@/lib/errors";
import {
  dedupeCorporateEvents,
  dedupeNewsArticles,
} from "@/lib/research/deduplication";
import type {
  BenzingaNewsQuery,
  CorporateEventsQuery,
  OptionChainQuery,
  ResearchService,
} from "@/lib/services";
import type {
  EventsResearchBundle,
  FinancialResearchBundle,
  MarketMovers,
  MarketSnapshotRow,
  NewsResearchBundle,
  OptionChainBundle,
  TickerSearchResult,
} from "@/types";

import {
  adaptBenzingaNews,
  adaptFinancialPeriods,
  adaptFinancialRatios,
  adaptOptionChain,
  adaptSnapshotList,
  adaptTickerSearch,
  adaptTmxEvents,
} from "./research-adapters";
import {
  massiveBenzingaNewsResponseSchema,
  massiveFinancialsResponseSchema,
  massiveOptionChainResponseSchema,
  massiveOptionContractsResponseSchema,
  massiveRatiosResponseSchema,
  massiveSnapshotListResponseSchema,
  massiveTickerSearchResponseSchema,
  massiveTmxEventsResponseSchema,
  type MassiveFinancialsResponse,
  type MassiveBenzingaNewsResponse,
  type MassiveOptionChainResponse,
  type MassiveRatiosResponse,
  type MassiveTmxEventsResponse,
} from "./research-schemas";
import type { MassiveClient, MassiveQueryValue } from "./client";
import { collectBoundedProviderPages } from "./pagination";

export type {
  BenzingaNewsQuery,
  CorporateEventsQuery,
  OptionChainQuery,
} from "@/lib/services";

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9.-]{0,14}$/);
const dateSchema = z.iso.date();
const MAX_BENZINGA_NEWS_PAGES = 5;
const MAX_TMX_EVENT_PAGES = 8;
const BENZINGA_NEWS_PAGE_SIZE = 100;
const TMX_EVENT_PAGE_SIZE = 250;

const DEFAULT_RESEARCH_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA",
  "BRK.B", "JPM", "LLY", "V", "WMT", "XOM", "UNH", "MA", "ORCL",
  "COST", "NFLX", "HD", "PG", "JNJ", "ABBV", "BAC", "KO", "CRM",
  "AMD", "CSCO", "CVX", "IBM", "GE", "CAT", "NOW", "MCD", "INTC",
  "MU", "QCOM", "AMAT", "PLTR", "PANW", "ARM", "SMCI", "UBER",
  "SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLE", "XLV", "XLY",
] as const;

type PagedResponse<T> = {
  readonly next_url?: string;
  readonly results?: readonly T[];
};

function normalizeTicker(value: string): string {
  const result = tickerSchema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Ticker format is invalid.", {
      details: { field: "ticker" },
    });
  }
  return result.data;
}

function normalizeDate(value: string, field: string): string {
  const result = dateSchema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", `${field} must use YYYY-MM-DD.`, {
      details: { field },
    });
  }
  return result.data;
}

function normalizeSymbols(values: readonly string[]): readonly string[] {
  const unique = [...new Set(values.map(normalizeTicker))];
  if (unique.length > 100) {
    throw new AppError("VALIDATION_ERROR", "At most 100 tickers may be requested together.");
  }
  return unique;
}

export class MassiveResearchService implements ResearchService {
  readonly #baseOrigin: string;
  readonly #client: MassiveClient;
  readonly #ttls: CacheTtlConfig;

  constructor(client: MassiveClient, ttls: CacheTtlConfig, baseUrl: string) {
    this.#client = client;
    this.#ttls = ttls;
    this.#baseOrigin = new URL(baseUrl).origin;
  }

  async searchTickers(queryInput: string, limitInput = 20): Promise<readonly TickerSearchResult[]> {
    const query = queryInput.trim().slice(0, 60);
    if (!query) return [];
    const limit = Math.min(50, Math.max(1, Math.trunc(limitInput)));
    const response = await this.#client.request({
      path: "/v3/reference/tickers",
      query: {
        search: query,
        market: "stocks",
        active: true,
        limit,
        order: "asc",
        sort: "ticker",
      },
      schema: massiveTickerSearchResponseSchema,
      cacheTtlMs: this.#ttls.reference,
      staleIfErrorMs: this.#ttls.staleIfError,
    });
    return adaptTickerSearch(response);
  }

  async getSnapshots(
    symbolsInput: readonly string[] = DEFAULT_RESEARCH_UNIVERSE,
  ): Promise<readonly MarketSnapshotRow[]> {
    const symbols = normalizeSymbols(symbolsInput);
    if (!symbols.length) return [];
    const response = await this.#client.request({
      path: "/v2/snapshot/locale/us/markets/stocks/tickers",
      query: { tickers: symbols.join(","), include_otc: false },
      schema: massiveSnapshotListResponseSchema,
      cacheTtlMs: this.#ttls.snapshot,
      staleIfErrorMs: this.#ttls.staleIfError,
    });
    return adaptSnapshotList(response, "unknown");
  }

  async getMovers(): Promise<MarketMovers> {
    const [gainersResponse, losersResponse] = await Promise.all([
      this.#client.request({
        path: "/v2/snapshot/locale/us/markets/stocks/gainers",
        query: { include_otc: false },
        schema: massiveSnapshotListResponseSchema,
        cacheTtlMs: this.#ttls.snapshot,
        staleIfErrorMs: this.#ttls.staleIfError,
      }),
      this.#client.request({
        path: "/v2/snapshot/locale/us/markets/stocks/losers",
        query: { include_otc: false },
        schema: massiveSnapshotListResponseSchema,
        cacheTtlMs: this.#ttls.snapshot,
        staleIfErrorMs: this.#ttls.staleIfError,
      }),
    ]);
    const gainers = adaptSnapshotList(gainersResponse, "unknown");
    const losers = adaptSnapshotList(losersResponse, "unknown");
    const asOf = [...gainers, ...losers]
      .map((row) => row.asOf)
      .sort()
      .at(-1) ?? new Date().toISOString();
    return { gainers, losers, asOf, quality: "unknown" };
  }

  async getBenzingaNews(input: BenzingaNewsQuery = {}): Promise<NewsResearchBundle> {
    const ticker = input.ticker ? normalizeTicker(input.ticker) : undefined;
    const limit = Math.min(500, Math.max(1, Math.trunc(input.limit ?? 120)));
    const pageLimit = Math.min(BENZINGA_NEWS_PAGE_SIZE, limit);
    const first = await this.#client.request({
      path: "/benzinga/v2/news",
      query: {
        tickers: ticker,
        "published.gte": input.publishedAfter,
        "published.lte": input.publishedBefore,
        limit: pageLimit,
        sort: "published.desc",
      },
      schema: massiveBenzingaNewsResponseSchema,
      cacheTtlMs: this.#ttls.news,
      // Headlines must never be labeled live after a stale-if-error fallback.
      // Fresh cache hits remain bounded by the short news TTL.
      staleIfErrorMs: 0,
    });
    const keyword = input.keyword?.trim().toLowerCase();
    const articlesFromPages = (pages: readonly MassiveBenzingaNewsResponse[]) => {
      const combined: MassiveBenzingaNewsResponse = {
        ...first,
        next_url: undefined,
        results: pages.flatMap((page) => page.results ?? []),
      };
      return dedupeNewsArticles(adaptBenzingaNews(combined)).filter((article) => {
        if (input.category && !article.categories.includes(input.category as typeof article.categories[number])) return false;
        if (!keyword) return true;
        return [article.title, article.summary ?? "", article.body ?? "", ...article.keywords]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
    };
    const pages = await this.#collectPages(
      first,
      massiveBenzingaNewsResponseSchema,
      MAX_BENZINGA_NEWS_PAGES,
      this.#ttls.news,
      (collected) => articlesFromPages(collected).length >= limit,
    );
    const articles = articlesFromPages(pages).slice(0, limit);
    return { articles, filterTicker: ticker ?? null };
  }

  async getCorporateEvents(input: CorporateEventsQuery): Promise<EventsResearchBundle> {
    const ticker = input.ticker ? normalizeTicker(input.ticker) : undefined;
    const from = normalizeDate(input.from, "from");
    const to = normalizeDate(input.to, "to");
    if (from > to) {
      throw new AppError("VALIDATION_ERROR", "Event start date must precede the end date.");
    }
    const limit = Math.min(1_000, Math.max(1, Math.trunc(input.limit ?? 500)));
    const pageLimit = Math.min(TMX_EVENT_PAGE_SIZE, limit);
    const first = await this.#client.request({
      path: "/tmx/v1/corporate-events",
      query: {
        ticker,
        "date.gte": from,
        "date.lte": to,
        type: input.type,
        limit: pageLimit,
        sort: "date.asc",
      },
      schema: massiveTmxEventsResponseSchema,
      cacheTtlMs: this.#ttls.event,
      // TMX does not expose a feed-update timestamp in this response. Avoid
      // serving stale fallback data that could be labeled as newly fetched.
      staleIfErrorMs: 0,
    });
    const eventsFromPages = (pages: readonly MassiveTmxEventsResponse[]) => {
      const combined: MassiveTmxEventsResponse = {
        ...first,
        next_url: undefined,
        results: pages.flatMap((page) => page.results ?? []),
      };
      return dedupeCorporateEvents(adaptTmxEvents(combined));
    };
    const pages = await this.#collectPages(
      first,
      massiveTmxEventsResponseSchema,
      MAX_TMX_EVENT_PAGES,
      this.#ttls.event,
      (collected) => eventsFromPages(collected).length >= limit,
    );
    return {
      events: eventsFromPages(pages).slice(0, limit),
      filterTicker: ticker ?? null,
      from,
      to,
    };
  }

  async getOptionExpirations(symbolInput: string): Promise<readonly string[]> {
    const symbol = normalizeTicker(symbolInput);
    const today = new Date().toISOString().slice(0, 10);
    const response = await this.#client.request({
      path: "/v3/reference/options/contracts",
      query: {
        underlying_ticker: symbol,
        expired: false,
        "expiration_date.gte": today,
        limit: 1_000,
        sort: "expiration_date",
        order: "asc",
      },
      schema: massiveOptionContractsResponseSchema,
      cacheTtlMs: this.#ttls.reference,
      staleIfErrorMs: 0,
    });
    const pages = await this.#collectPages(response, massiveOptionContractsResponseSchema, 2, this.#ttls.reference);
    return [...new Set(pages.flatMap((page) => page.results ?? []).flatMap((contract) =>
      contract.expiration_date ? [contract.expiration_date] : [],
    ))].sort();
  }

  async getOptionChain(input: OptionChainQuery): Promise<OptionChainBundle> {
    const symbol = normalizeTicker(input.symbol);
    const expirations = await this.getOptionExpirations(symbol);
    const expiration = input.expiration
      ? normalizeDate(input.expiration, "expiration")
      : expirations[0];
    const response = await this.#client.request({
      path: `/v3/snapshot/options/${encodeURIComponent(symbol)}`,
      query: {
        expiration_date: expiration,
        "strike_price.gte": input.strikeMin,
        "strike_price.lte": input.strikeMax,
        limit: 250,
        sort: "strike_price",
        order: "asc",
      },
      schema: massiveOptionChainResponseSchema,
      cacheTtlMs: this.#ttls.option,
      // Option snapshots carry provider freshness labels. Do not serve a stale
      // fallback that could preserve an outdated LIVE badge during an outage.
      staleIfErrorMs: 0,
    });
    const pages = await this.#collectPages(response, massiveOptionChainResponseSchema, 4, this.#ttls.option);
    const combined: MassiveOptionChainResponse = {
      ...response,
      next_url: undefined,
      results: pages.flatMap((page) => page.results ?? []),
    };
    const contractsComplete = !pages.at(-1)?.next_url;
    const bundle = adaptOptionChain(combined, symbol, expiration, contractsComplete);
    return { ...bundle, expirations };
  }

  async getFinancials(symbolInput: string): Promise<FinancialResearchBundle> {
    const symbol = normalizeTicker(symbolInput);
    const financialQuery = {
      tickers: symbol,
      limit: 16,
      sort: "period_end.desc",
    } as const;
    const results = await Promise.allSettled([
      this.#client.request({
        path: "/stocks/financials/v1/income-statements",
        query: financialQuery,
        schema: massiveFinancialsResponseSchema,
        cacheTtlMs: this.#ttls.financial,
        staleIfErrorMs: this.#ttls.staleIfError,
      }),
      this.#client.request({
        path: "/stocks/financials/v1/balance-sheets",
        query: financialQuery,
        schema: massiveFinancialsResponseSchema,
        cacheTtlMs: this.#ttls.financial,
        staleIfErrorMs: this.#ttls.staleIfError,
      }),
      this.#client.request({
        path: "/stocks/financials/v1/cash-flow-statements",
        query: financialQuery,
        schema: massiveFinancialsResponseSchema,
        cacheTtlMs: this.#ttls.financial,
        staleIfErrorMs: this.#ttls.staleIfError,
      }),
      this.#client.request({
        path: "/stocks/financials/v1/ratios",
        query: { ticker: symbol, limit: 1 },
        schema: massiveRatiosResponseSchema,
        cacheTtlMs: this.#ttls.financial,
        staleIfErrorMs: this.#ttls.staleIfError,
      }),
    ]);

    const unavailableSections: string[] = [];
    const unwrap = <T>(result: PromiseSettledResult<T>, section: string, empty: T): T => {
      if (result.status === "fulfilled") return result.value;
      if (isAppError(result.reason) && ["ENTITLEMENT_REQUIRED", "FORBIDDEN", "NOT_FOUND"].includes(result.reason.code)) {
        unavailableSections.push(section);
        return empty;
      }
      throw result.reason;
    };
    const emptyFinancials: MassiveFinancialsResponse = { results: [] };
    const emptyRatios: MassiveRatiosResponse = { results: [] };
    const income = unwrap(results[0], "income statements", emptyFinancials);
    const balance = unwrap(results[1], "balance sheets", emptyFinancials);
    const cashFlow = unwrap(results[2], "cash-flow statements", emptyFinancials);
    const ratios = unwrap(results[3], "financial ratios", emptyRatios);

    return {
      symbol,
      incomeStatements: adaptFinancialPeriods(income, symbol, "income"),
      balanceSheets: adaptFinancialPeriods(balance, symbol, "balance-sheet"),
      cashFlowStatements: adaptFinancialPeriods(cashFlow, symbol, "cash-flow"),
      ratios: adaptFinancialRatios(ratios),
      asOf: new Date().toISOString(),
      unavailableSections,
    };
  }

  async #collectPages<T extends PagedResponse<unknown>>(
    first: T,
    schema: z.ZodType<T>,
    maxPages: number,
    cacheTtlMs: number,
    isComplete?: (pages: readonly T[]) => boolean,
  ): Promise<readonly T[]> {
    return collectBoundedProviderPages(first, {
      maxPages,
      isComplete,
      loadNext: async (nextUrl) => {
        const next = this.#safeNextRequest(nextUrl);
        return this.#client.request({
          path: next.path,
          query: next.query,
          schema,
          cacheTtlMs,
          // News, event, and option pages all carry time-sensitive records. A
          // stale page must never be merged into an otherwise fresh response.
          staleIfErrorMs: 0,
        });
      },
    });
  }

  #safeNextRequest(nextUrl: string): {
    readonly path: `/${string}`;
    readonly query: Readonly<Record<string, MassiveQueryValue>>;
  } {
    const url = new URL(nextUrl);
    if (url.origin !== this.#baseOrigin) {
      throw new AppError("UPSTREAM_RESPONSE_INVALID", "Massive returned an unsafe pagination URL.");
    }
    const query: Record<string, MassiveQueryValue> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key.toLowerCase() === "apikey" || key.toLowerCase() === "authorization") continue;
      const current = query[key];
      if (current === undefined) query[key] = value;
      else query[key] = [...(Array.isArray(current) ? current : [current]), value];
    }
    return { path: url.pathname as `/${string}`, query };
  }
}

export { DEFAULT_RESEARCH_UNIVERSE };
