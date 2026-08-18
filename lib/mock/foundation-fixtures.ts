import type {
  CatalystScannerResult,
  DataFreshnessState,
  WatchlistQuote,
} from "@/types";

export const MOCK_FOUNDATION_FRESHNESS = {
  status: "indicative",
  delayMinutes: null,
  lastUpdatedAt: "2026-08-15T14:45:00.000Z",
  source: "mock",
  marketSession: "regular",
} as const satisfies DataFreshnessState;

export const MOCK_WATCHLIST_QUOTES = [
  {
    ticker: "NVDA",
    companyName: "NVIDIA Corporation",
    price: 123.86,
    change: 3.55,
    changePercent: 2.95,
    bid: 123.84,
    ask: 123.88,
    dayHigh: 124.2,
    dayLow: 119.9,
    previousClose: 120.31,
    volume: 228_360_000,
    averageVolume: 204_730_000,
    dailyRvol: 1.12,
    intradayRvol: 1.08,
    vwap: 122.48,
    distanceFromVwapPercent: 1.13,
    marketCap: 2_850_000_000_000,
    latestNews: {
      id: "mock-news-nvda-1",
      title: "MOCK · NVDA research headline",
      publishedAt: "2026-08-15T14:36:00.000Z",
      articleUrl: null,
      publisher: "ATLAS mock feed",
    },
    nextEvent: {
      id: "mock-event-nvda-1",
      type: "earnings-release",
      status: "confirmed",
      title: "MOCK · Earnings announcement",
      startsAt: "2026-08-26T21:00:00.000Z",
      daysUntil: 11,
    },
    optionsActivity: {
      observed: true,
      label: "Elevated contract volume",
      highestVolumeContract: "O:NVDA260918C00125000",
      volumeToOpenInterest: 1.42,
      asOf: "2026-08-15T14:45:00.000Z",
    },
    freshness: MOCK_FOUNDATION_FRESHNESS,
  },
] as const satisfies readonly WatchlistQuote[];

export const MOCK_CATALYST_SCANNER_RESULTS = [
  {
    ticker: "NVDA",
    researchPriority: 78,
    reasons: [
      {
        category: "volume",
        title: "Relative volume above baseline",
        explanation: "Synthetic fixture volume is 1.12× its comparison baseline.",
        observedValue: 1.12,
        threshold: 1,
        timestamp: "2026-08-15T14:45:00.000Z",
      },
      {
        category: "event",
        title: "Upcoming earnings event",
        explanation: "A confirmed synthetic earnings event is inside the research window.",
        observedValue: 11,
        threshold: 14,
        timestamp: "2026-08-26T21:00:00.000Z",
      },
    ],
    freshness: MOCK_FOUNDATION_FRESHNESS,
  },
] as const satisfies readonly CatalystScannerResult[];
