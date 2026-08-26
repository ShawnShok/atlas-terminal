import { scannerFieldValue, type ScannerSecurity } from "./engine";

export type ResearchPriorityComponent =
  | "priceMovement"
  | "relativeVolume"
  | "technicalConfirmation"
  | "newsRecency"
  | "eventProximity"
  | "optionsActivity";

export type ResearchPriorityWeights = Readonly<Record<ResearchPriorityComponent, number>>;

export interface ResearchPriorityContribution {
  readonly component: ResearchPriorityComponent;
  readonly label: string;
  readonly available: boolean;
  readonly normalizedValue: number | null;
  readonly weight: number;
  readonly points: number;
  readonly explanation: string;
}

export interface ResearchPriorityScore {
  readonly score: number;
  readonly coveragePercent: number;
  readonly contributions: readonly ResearchPriorityContribution[];
  readonly label: "RESEARCH PRIORITY";
  readonly disclaimer: string;
}

export const DEFAULT_RESEARCH_PRIORITY_WEIGHTS: ResearchPriorityWeights = {
  priceMovement: 20,
  relativeVolume: 20,
  technicalConfirmation: 15,
  newsRecency: 20,
  eventProximity: 10,
  optionsActivity: 15,
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function component(
  name: ResearchPriorityComponent,
  label: string,
  normalizedValue: number | null,
  weight: number,
  explanation: string,
): ResearchPriorityContribution {
  const available = normalizedValue !== null && Number.isFinite(normalizedValue);
  const bounded = available ? clamp(normalizedValue) : null;
  return {
    component: name,
    label,
    available,
    normalizedValue: bounded,
    weight,
    points: bounded === null ? 0 : bounded * weight,
    explanation,
  };
}

function validateWeights(weights: ResearchPriorityWeights): number {
  const values = Object.values(weights);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("Research-priority weights must be finite and non-negative.");
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) throw new RangeError("At least one research-priority weight must be positive.");
  return total;
}

export function calculateResearchPriority(
  security: ScannerSecurity,
  now: string,
  weights: ResearchPriorityWeights = DEFAULT_RESEARCH_PRIORITY_WEIGHTS,
): ResearchPriorityScore {
  const nowMs = timestamp(now);
  if (nowMs === null) throw new TypeError("Research-priority evaluation time must be valid ISO time.");
  const totalWeight = validateWeights(weights);

  const dailyMove = scannerFieldValue(security, "dailyChangePercent");
  const intradayRelativeVolume = scannerFieldValue(security, "intradayRelativeVolume");
  const dailyRelativeVolume = scannerFieldValue(security, "dailyRelativeVolume");
  const relativeVolume = intradayRelativeVolume ?? dailyRelativeVolume ?? scannerFieldValue(security, "relativeVolume");
  const relativeVolumeLabel = intradayRelativeVolume !== null ? "Intraday" : "Daily";
  const vwapDistance = scannerFieldValue(security, "distanceFromVwapPercent");
  const latestNewsMs = security.newsPublishedAt
    ?.map(timestamp)
    .filter((value): value is number => value !== null && value <= nowMs)
    .sort((left, right) => right - left)[0] ?? null;
  const nextCatalystMs = security.catalysts
    ?.map((item) => timestamp(item.occursAt))
    .filter((value): value is number => value !== null && value >= nowMs)
    .sort((left, right) => left - right)[0] ?? null;
  const optionRatio = scannerFieldValue(security, "optionVolumeToOpenInterest");

  const contributions: readonly ResearchPriorityContribution[] = [
    component(
      "priceMovement",
      "Price movement",
      dailyMove === null ? null : Math.abs(dailyMove) / 8,
      weights.priceMovement,
      dailyMove === null ? "Daily change is unavailable." : `Absolute daily change is ${Math.abs(dailyMove).toFixed(2)}%.`,
    ),
    component(
      "relativeVolume",
      "Relative volume",
      relativeVolume === null ? null : (relativeVolume - 1) / 3,
      weights.relativeVolume,
      relativeVolume === null ? "Daily and time-adjusted intraday relative volume are unavailable." : `${relativeVolumeLabel} relative volume is ${relativeVolume.toFixed(2)}x.`,
    ),
    component(
      "technicalConfirmation",
      "VWAP distance",
      vwapDistance === null ? null : Math.abs(vwapDistance) / 5,
      weights.technicalConfirmation,
      vwapDistance === null ? "VWAP distance is unavailable." : `Price is ${Math.abs(vwapDistance).toFixed(2)}% ${vwapDistance >= 0 ? "above" : "below"} VWAP.`,
    ),
    component(
      "newsRecency",
      "News recency",
      latestNewsMs === null ? null : 1 - (nowMs - latestNewsMs) / 3_600_000,
      weights.newsRecency,
      latestNewsMs === null ? "No timestamped article is available." : `Latest timestamped article is ${Math.max(0, Math.round((nowMs - latestNewsMs) / 60_000))} minutes old.`,
    ),
    component(
      "eventProximity",
      "Event proximity",
      nextCatalystMs === null ? null : 1 - (nextCatalystMs - nowMs) / (30 * 86_400_000),
      weights.eventProximity,
      nextCatalystMs === null ? "No upcoming timestamped event is available." : `Next event is in ${Math.max(0, Math.ceil((nextCatalystMs - nowMs) / 86_400_000))} days.`,
    ),
    component(
      "optionsActivity",
      "Options volume / open interest",
      optionRatio === null ? null : (optionRatio - 1) / 4,
      weights.optionsActivity,
      optionRatio === null ? "Options volume/open-interest data is unavailable." : `Aggregate options volume/open-interest is ${optionRatio.toFixed(2)}x.`,
    ),
  ];

  const points = contributions.reduce((sum, item) => sum + item.points, 0);
  const availableWeight = contributions.reduce((sum, item) => sum + (item.available ? item.weight : 0), 0);
  return {
    score: Math.round(clamp(points / totalWeight) * 100),
    coveragePercent: Math.round(clamp(availableWeight / totalWeight) * 100),
    contributions,
    label: "RESEARCH PRIORITY",
    disclaimer: "Transparent research-priority score; not a buy score, return forecast, or probability.",
  };
}
