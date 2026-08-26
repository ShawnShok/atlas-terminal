import type { ScannerRule } from "./engine";

export type ScannerPresetId =
  | "momentum"
  | "catalyst-momentum"
  | "breakout-watch"
  | "earnings-soon"
  | "news-movers"
  | "high-relative-volume"
  | "unusual-options-research"
  | "watchlist-catalyst-feed"
  | "near-52-week-high"
  | "gap-up"
  | "gap-down";

export interface ScannerPreset {
  readonly id: ScannerPresetId;
  readonly name: string;
  readonly description: string;
  readonly rule: ScannerRule;
}

export interface ScannerPresetConfiguration {
  readonly relativeVolumeThreshold?: number;
  readonly momentumChangePercent?: number;
  readonly earningsWithinDays?: number;
  readonly newsWithinMinutes?: number;
  readonly newsMovePercent?: number;
  readonly optionVolumeToOpenInterest?: number;
  readonly breakoutNearPercent?: number;
  readonly nearHighPercent?: number;
  readonly gapPercent?: number;
}

export function createScannerPresets(
  configuration: ScannerPresetConfiguration = {},
): readonly ScannerPreset[] {
  const relativeVolume = configuration.relativeVolumeThreshold ?? 2;
  const momentumChange = configuration.momentumChangePercent ?? 2;
  const earningsDays = configuration.earningsWithinDays ?? 14;
  const newsMinutes = configuration.newsWithinMinutes ?? 1_440;
  const newsWindow = configuration.newsWithinMinutes === undefined
    ? { withinMinutes: newsMinutes, calendarDay: "today" as const }
    : { withinMinutes: newsMinutes };
  const newsMove = configuration.newsMovePercent ?? 3;
  const optionRatio = configuration.optionVolumeToOpenInterest ?? 2;
  const breakoutNear = configuration.breakoutNearPercent ?? 1;
  const nearHigh = configuration.nearHighPercent ?? 5;
  const gap = configuration.gapPercent ?? 4;

  return [
    {
      id: "momentum",
      name: "Momentum",
      description: "Elevated relative volume with positive daily price movement.",
      rule: { kind: "all", rules: [
        { kind: "numeric", field: "relativeVolume", operator: "gte", value: relativeVolume },
        { kind: "numeric", field: "dailyChangePercent", operator: "gte", value: momentumChange },
      ] },
    },
    {
      id: "catalyst-momentum",
      name: "Catalyst Momentum",
      description: "An upcoming catalyst with positive movement and elevated relative volume.",
      rule: { kind: "all", rules: [
        { kind: "catalyst-window", withinDays: 14 },
        { kind: "numeric", field: "dailyChangePercent", operator: "gt", value: 0 },
        { kind: "numeric", field: "relativeVolume", operator: "gte", value: Math.max(1.5, relativeVolume) },
      ] },
    },
    {
      id: "breakout-watch",
      name: "Breakout Watch",
      description: "Price near or above the recent 20-session high with elevated daily or intraday relative volume.",
      rule: { kind: "all", rules: [
        { kind: "any", rules: [
          { kind: "price-relation", reference: "recentHigh20", relation: "at-or-above" },
          { kind: "numeric", field: "percentBelowRecentHigh20", operator: "lte", value: breakoutNear },
        ] },
        { kind: "any", rules: [
          { kind: "numeric", field: "dailyRelativeVolume", operator: "gte", value: Math.max(1.5, relativeVolume) },
          { kind: "numeric", field: "intradayRelativeVolume", operator: "gte", value: Math.max(1.5, relativeVolume) },
        ] },
      ] },
    },
    {
      id: "earnings-soon",
      name: "Earnings Soon",
      description: "A confirmed reported earnings catalyst falls within the configured window.",
      rule: {
        kind: "catalyst-window",
        withinDays: earningsDays,
        catalystTypes: ["earnings", "earnings-release", "earnings-call"],
        statuses: ["confirmed"],
      },
    },
    {
      id: "news-movers",
      name: "News Movers",
      description: "Recent news, a material absolute price move, and elevated relative volume; no causation is inferred.",
      rule: { kind: "all", rules: [
        { kind: "numeric", field: "dailyChangePercent", operator: "absolute-gte", value: newsMove },
        { kind: "recent-news", ...newsWindow },
        { kind: "any", rules: [
          { kind: "numeric", field: "dailyRelativeVolume", operator: "gte", value: Math.max(1.5, relativeVolume) },
          { kind: "numeric", field: "intradayRelativeVolume", operator: "gte", value: Math.max(1.5, relativeVolume) },
        ] },
      ] },
    },
    {
      id: "high-relative-volume",
      name: "High Relative Volume",
      description: "Reported daily or time-adjusted intraday relative volume is at or above the configured threshold.",
      rule: { kind: "any", rules: [
        { kind: "numeric", field: "dailyRelativeVolume", operator: "gte", value: relativeVolume },
        { kind: "numeric", field: "intradayRelativeVolume", operator: "gte", value: relativeVolume },
      ] },
    },
    {
      id: "unusual-options-research",
      name: "Unusual Options Research",
      description: "Elevated option volume relative to open interest; direction and intent are unknown.",
      rule: { kind: "any", rules: [
        { kind: "numeric", field: "optionVolume", operator: "gte", value: 100 },
        { kind: "numeric", field: "optionVolumeToOpenInterest", operator: "gte", value: optionRatio },
      ] },
    },
    {
      id: "watchlist-catalyst-feed",
      name: "Watchlist Catalyst Feed",
      description: "Recent news or an upcoming event inside the selected watchlist universe.",
      rule: { kind: "any", rules: [
        { kind: "recent-news", ...newsWindow },
        { kind: "catalyst-window", withinDays: 14 },
      ] },
    },
    {
      id: "near-52-week-high",
      name: "Near 52-Week High",
      description: "Price is within the configured percentage of its reported 52-week high.",
      rule: { kind: "numeric", field: "percentBelow52WeekHigh", operator: "lte", value: nearHigh },
    },
    {
      id: "gap-up",
      name: "Gap Up",
      description: "Reported opening or premarket gap is at or above the configured threshold.",
      rule: { kind: "numeric", field: "gapPercent", operator: "gte", value: gap },
    },
    {
      id: "gap-down",
      name: "Gap Down",
      description: "Reported opening or premarket gap is at or below the configured negative threshold.",
      rule: { kind: "numeric", field: "gapPercent", operator: "lte", value: -Math.abs(gap) },
    },
  ];
}
