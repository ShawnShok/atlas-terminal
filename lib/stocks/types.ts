import type { TerminalApiMeta } from "@/types/research";

export type StockLoadState = "loading" | "ready" | "empty" | "error";

/** Status is explicit so stale, mock, delayed, and unavailable data never look live. */
export interface StockDataStatus {
  readonly state: StockLoadState;
  readonly label: string;
  readonly meta: TerminalApiMeta | null;
  readonly message?: string;
}

export type PriceSeriesType = "candlestick" | "line" | "area";
export type ChartPriceScaleMode = "linear" | "logarithmic";

export type ChartTimeframe =
  | "1D"
  | "5D"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "3Y"
  | "5Y"
  | "MAX";

export type ChartInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";

export type ChartIndicatorId =
  | "sma"
  | "ema"
  | "vwap"
  | "rsi"
  | "macd"
  | "bollinger"
  | "atr"
  | "relative-volume";

export interface ChartIndicatorPoint {
  readonly timestamp: string;
  readonly value: number;
  readonly color?: string;
}

export interface ChartIndicatorSeries {
  readonly id: string;
  readonly indicator: ChartIndicatorId;
  readonly label: string;
  readonly color: string;
  readonly kind: "line" | "histogram";
  readonly pane: "price" | "separate";
  readonly points: readonly ChartIndicatorPoint[];
}

export interface ChartDisplaySettings {
  readonly timeframe: ChartTimeframe;
  readonly interval: ChartInterval;
  readonly seriesType: PriceSeriesType;
  readonly volumeVisible: boolean;
  readonly activeIndicators: readonly ChartIndicatorId[];
  /** Optional for backward compatibility with saved chart settings. */
  readonly priceScaleMode?: ChartPriceScaleMode;
  /** Effective only when every supplied bar has usable session classification. */
  readonly includeExtendedHours?: boolean;
}

export type WatchlistSortKey =
  | "symbol"
  | "companyName"
  | "lastPrice"
  | "change"
  | "changePercent"
  | "bid"
  | "ask"
  | "dayHigh"
  | "dayLow"
  | "previousClose"
  | "volume"
  | "averageVolume"
  | "relativeVolume"
  | "intradayRvol"
  | "marketCap"
  | "vwap"
  | "distanceFromVwapPercent"
  | "latestNewsAt"
  | "nextEventAt"
  | "daysUntilEvent"
  | "optionsActivity"
  | "freshness";

export type WatchlistColumnId =
  | "ticker"
  | "companyName"
  | "price"
  | "change"
  | "changePercent"
  | "bidAsk"
  | "dayRange"
  | "previousClose"
  | "volume"
  | "averageVolume"
  | "dailyRvol"
  | "intradayRvol"
  | "marketCap"
  | "vwap"
  | "distanceFromVwap"
  | "latestNews"
  | "nextEvent"
  | "optionsActivity"
  | "freshness";

export type MarketMoverSide = "gainers" | "losers";

export type StockTerminalView = "overview" | "chart";

export interface WatchlistRowSupplement {
  readonly relativeVolume: number | null;
  readonly marketCap: number | null;
}
