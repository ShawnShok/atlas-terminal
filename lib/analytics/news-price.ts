import type { NewsArticle } from "@/types";

export interface PriceObservation {
  readonly timestamp: string;
  readonly price: number;
}

export interface NewsPriceMove {
  readonly horizonSeconds: number;
  readonly observationTimestamp: string | null;
  readonly price: number | null;
  readonly absoluteChange: number | null;
  readonly percentChange: number | null;
}

export interface NewsPriceAssociation {
  readonly label: "Price Movement Following News";
  readonly articleId: string;
  readonly headline: string;
  readonly publishedAt: string;
  readonly baselineTimestamp: string | null;
  readonly baselinePrice: number | null;
  readonly moves: readonly NewsPriceMove[];
  readonly dataSufficient: boolean;
  readonly disclaimer: string;
}

function preparePrices(prices: readonly PriceObservation[]): PriceObservation[] {
  return [...prices].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .map((point, index) => {
      if (!Number.isFinite(Date.parse(point.timestamp))) {
        throw new TypeError("prices[" + index + "].timestamp must be valid");
      }
      if (!Number.isFinite(point.price) || point.price <= 0) {
        throw new RangeError("prices[" + index + "].price must be positive and finite");
      }
      return point;
    });
}

export function associateNewsWithPriceMovement(
  symbol: string,
  articles: readonly NewsArticle[],
  prices: readonly PriceObservation[],
  options: {
    readonly horizonsSeconds?: readonly number[];
    readonly maximumBaselineAgeSeconds?: number;
  } = {},
): readonly NewsPriceAssociation[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) throw new RangeError("symbol cannot be empty");
  const sortedPrices = preparePrices(prices);
  const horizons = [...new Set(options.horizonsSeconds ?? [30, 60, 300, 900])]
    .sort((left, right) => left - right);
  if (horizons.some((horizon) => !Number.isInteger(horizon) || horizon <= 0)) {
    throw new RangeError("horizonsSeconds must contain positive integers");
  }
  const maximumBaselineAge = options.maximumBaselineAgeSeconds ?? 300;
  if (!Number.isFinite(maximumBaselineAge) || maximumBaselineAge < 0) {
    throw new RangeError("maximumBaselineAgeSeconds cannot be negative");
  }

  return articles
    .filter((article) => article.tickers.some((ticker) => ticker.toUpperCase() === normalizedSymbol))
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt))
    .map((article) => {
      const publishedTimestamp = Date.parse(article.publishedAt);
      if (!Number.isFinite(publishedTimestamp)) throw new TypeError("article publishedAt must be valid");
      const baseline = [...sortedPrices].reverse().find((point) => {
        const timestamp = Date.parse(point.timestamp);
        return timestamp <= publishedTimestamp
          && publishedTimestamp - timestamp <= maximumBaselineAge * 1_000;
      }) ?? null;

      const moves = horizons.map((horizonSeconds): NewsPriceMove => {
        if (!baseline) {
          return { horizonSeconds, observationTimestamp: null, price: null, absoluteChange: null, percentChange: null };
        }
        const target = publishedTimestamp + horizonSeconds * 1_000;
        const observation = [...sortedPrices].reverse().find((point) => {
          const timestamp = Date.parse(point.timestamp);
          return timestamp >= publishedTimestamp && timestamp <= target;
        }) ?? null;
        if (!observation) {
          return { horizonSeconds, observationTimestamp: null, price: null, absoluteChange: null, percentChange: null };
        }
        const absoluteChange = observation.price - baseline.price;
        return {
          horizonSeconds,
          observationTimestamp: observation.timestamp,
          price: observation.price,
          absoluteChange,
          percentChange: absoluteChange / baseline.price * 100,
        };
      });

      return {
        label: "Price Movement Following News",
        articleId: article.id,
        headline: article.title,
        publishedAt: article.publishedAt,
        baselineTimestamp: baseline?.timestamp ?? null,
        baselinePrice: baseline?.price ?? null,
        moves,
        dataSufficient: baseline !== null && moves.some((move) => move.price !== null),
        disclaimer: "Temporal association only. This calculation does not establish that the news caused the price movement.",
      };
    });
}
