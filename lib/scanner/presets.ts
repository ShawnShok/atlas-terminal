import type { ScannerRule } from "./engine";

export type ScannerPresetId =
  | "momentum"
  | "breakout"
  | "earnings-soon"
  | "news-movers"
  | "high-relative-volume"
  | "unusual-options"
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
  const newsMove = configuration.newsMovePercent ?? 3;
  const optionRatio = configuration.optionVolumeToOpenInterest ?? 2;
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
      id: "breakout",
      name: "Breakout",
      description: "Price at or above the recent 20-session high with elevated volume.",
      rule: { kind: "all", rules: [
        { kind: "price-relation", reference: "recentHigh20", relation: "at-or-above" },
        { kind: "numeric", field: "relativeVolume", operator: "gte", value: Math.max(1.5, relativeVolume) },
      ] },
    },
    {
      id: "earnings-soon",
      name: "Earnings Soon",
      description: "A reported earnings catalyst falls within the configured window.",
      rule: { kind: "catalyst-window", withinDays: earningsDays, catalystTypes: ["earnings", "earnings-release"] },
    },
    {
      id: "news-movers",
      name: "News Movers",
      description: "A material absolute price move with a recent news timestamp; no causation is inferred.",
      rule: { kind: "all", rules: [
        { kind: "numeric", field: "dailyChangePercent", operator: "absolute-gte", value: newsMove },
        { kind: "recent-news", withinMinutes: newsMinutes },
      ] },
    },
    {
      id: "high-relative-volume",
      name: "High Relative Volume",
      description: "Relative volume is at or above the configured threshold.",
      rule: { kind: "numeric", field: "relativeVolume", operator: "gte", value: relativeVolume },
    },
    {
      id: "unusual-options",
      name: "Unusual Options",
      description: "Elevated option volume relative to open interest; direction and intent are unknown.",
      rule: { kind: "all", rules: [
        { kind: "numeric", field: "optionVolume", operator: "gte", value: 100 },
        { kind: "numeric", field: "optionVolumeToOpenInterest", operator: "gte", value: optionRatio },
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
