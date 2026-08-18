import { AppError } from "@/lib/errors";
import type {
  AggregateBarsInput,
  NewsQuery,
  StockMarketDataService,
} from "@/lib/services";
import type {
  AggregateBar,
  NewsArticle,
  Snapshot,
  TickerDetails,
} from "@/types";

import {
  MOCK_AGGREGATE_BARS,
  MOCK_NEWS,
  MOCK_SNAPSHOT,
  MOCK_TICKER_DETAILS,
} from "./market-data";

export class MockMarketDataService implements StockMarketDataService {
  async getSnapshot(symbol: string): Promise<Snapshot> {
    this.#assertSupported(symbol);
    return MOCK_SNAPSHOT;
  }

  async getTickerDetails(symbol: string): Promise<TickerDetails> {
    this.#assertSupported(symbol);
    return MOCK_TICKER_DETAILS;
  }

  async getAggregateBars(
    input: AggregateBarsInput,
  ): Promise<readonly AggregateBar[]> {
    this.#assertSupported(input.symbol);
    const bars = MOCK_AGGREGATE_BARS.filter(
      (bar) => bar.timestamp.slice(0, 10) >= input.from && bar.timestamp.slice(0, 10) <= input.to,
    );
    const ordered = input.sort === "desc" ? [...bars].reverse() : bars;
    return ordered.slice(0, input.limit ?? ordered.length);
  }

  async getNews(input: NewsQuery = {}): Promise<readonly NewsArticle[]> {
    const symbol = input.symbol?.trim().toUpperCase();
    const publishedAfter = input.publishedAfter ? Date.parse(input.publishedAfter) : null;
    const articles = MOCK_NEWS.filter((article) =>
      (!symbol || article.tickers.some((ticker) => ticker === symbol))
      && (publishedAfter === null
        || !Number.isFinite(publishedAfter)
        || Date.parse(article.publishedAt) >= publishedAfter));
    const ordered = [...articles].sort((left, right) =>
      (input.order === "asc" ? 1 : -1)
      * (Date.parse(left.publishedAt) - Date.parse(right.publishedAt)));
    return ordered.slice(0, input.limit ?? 50);
  }

  #assertSupported(symbol: string): void {
    if (symbol.trim().toUpperCase() !== MOCK_TICKER_DETAILS.symbol) {
      throw new AppError(
        "NOT_FOUND",
        `No mock market data is available for ${symbol.trim().toUpperCase()}.`,
      );
    }
  }
}
