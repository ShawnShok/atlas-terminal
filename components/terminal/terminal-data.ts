export interface MarketStripItem {
  symbol: string;
  label: string;
  value: string;
  change: number;
}

export const MOCK_MARKET_STRIP: MarketStripItem[] = [
  { symbol: "SPX", label: "S&P 500", value: "6,412.17", change: 0.42 },
  { symbol: "NDX", label: "Nasdaq 100", value: "23,684.90", change: 0.71 },
  { symbol: "DJI", label: "Dow", value: "44,981.30", change: -0.18 },
  { symbol: "VIX", label: "Volatility", value: "16.84", change: -2.31 },
];

export const MOCK_MARKET_ROWS = [
  { symbol: "SPX", last: "6,412.17", move: "+26.88", pct: "+0.42%", breadth: "356 / 144" },
  { symbol: "NDX", last: "23,684.90", move: "+167.08", pct: "+0.71%", breadth: "71 / 29" },
  { symbol: "DJI", last: "44,981.30", move: "-81.24", pct: "-0.18%", breadth: "12 / 18" },
  { symbol: "RUT", last: "2,286.42", move: "+7.51", pct: "+0.33%", breadth: "1,284 / 716" },
  { symbol: "VIX", last: "16.84", move: "-0.40", pct: "-2.31%", breadth: "—" },
] as const;

export const FOUNDATION_EVENTS = [
  { time: "09:42:11", event: "Workspace initialized", detail: "Research layout · 3 panels" },
  { time: "09:42:11", event: "Provider selected", detail: "Deterministic mock adapter" },
  { time: "09:42:12", event: "Cache ready", detail: "In-memory · namespaced TTL" },
  { time: "09:42:12", event: "Command index ready", detail: "Ticker + function grammar" },
] as const;
