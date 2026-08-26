import type { AggregateBar, MarketSession } from "@/types/market";

const USABLE_BAR_SESSIONS = new Set<MarketSession>([
  "pre-market",
  "regular",
  "after-hours",
]);

export type ExtendedHoursAvailabilityState =
  | "available"
  | "no-bars"
  | "unclassified"
  | "regular-only"
  | "extended-only";

export interface ExtendedHoursAvailability {
  readonly available: boolean;
  readonly state: ExtendedHoursAvailabilityState;
  readonly label: string;
  readonly reason: string;
}

/**
 * Extended-hours filtering is safe only when every bar identifies its session.
 * Partial or unknown classification is treated as unavailable rather than guessed.
 */
export function getExtendedHoursAvailability(
  bars: readonly AggregateBar[],
): ExtendedHoursAvailability {
  if (bars.length === 0) {
    return {
      available: false,
      state: "no-bars",
      label: "NO BARS",
      reason: "Extended-hours display requires classified intraday bars.",
    };
  }

  if (bars.some((bar) => !bar.session || !USABLE_BAR_SESSIONS.has(bar.session))) {
    return {
      available: false,
      state: "unclassified",
      label: "NO SESSION TAGS",
      reason: "The supplied bars do not distinguish regular, pre-market, and after-hours sessions.",
    };
  }

  const hasRegular = bars.some((bar) => bar.session === "regular");
  const hasExtended = bars.some(
    (bar) => bar.session === "pre-market" || bar.session === "after-hours",
  );
  if (!hasExtended) {
    return {
      available: false,
      state: "regular-only",
      label: "REGULAR ONLY",
      reason: "No classified pre-market or after-hours bars are present in this range.",
    };
  }
  if (!hasRegular) {
    return {
      available: false,
      state: "extended-only",
      label: "EXTENDED ONLY",
      reason: "No classified regular-session bars are present in this range.",
    };
  }
  return {
    available: true,
    state: "available",
    label: "AVAILABLE",
    reason: "Show or hide classified pre-market and after-hours bars.",
  };
}

/** Keeps all input when classification is incomplete; silently guessing is less honest. */
export function selectChartBars(
  bars: readonly AggregateBar[],
  includeExtendedHours: boolean,
  availability = getExtendedHoursAvailability(bars),
): readonly AggregateBar[] {
  if (!availability.available || includeExtendedHours) return bars;
  return bars.filter((bar) => bar.session === "regular");
}
