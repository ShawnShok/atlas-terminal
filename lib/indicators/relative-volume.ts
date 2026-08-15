export interface IntradayVolumePoint {
  readonly elapsedMinutes: number;
  readonly cumulativeVolume: number;
}

export interface HistoricalVolumeSession {
  readonly sessionDate: string;
  readonly points?: readonly IntradayVolumePoint[];
  readonly totalVolume?: number | null;
}

export interface RelativeVolumeInput {
  readonly currentCumulativeVolume: number;
  readonly elapsedMinutes?: number | null;
  readonly historicalSessions: readonly HistoricalVolumeSession[];
  readonly minimumComparableSessions?: number;
}

export interface RelativeVolumeResult {
  readonly value: number | null;
  readonly currentVolume: number;
  readonly expectedVolume: number | null;
  readonly comparableSessions: number;
  readonly method: "time-adjusted" | "full-session" | "unavailable";
  readonly elapsedMinutes: number | null;
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(label + " must be a non-negative finite number");
  }
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Basic RVOL. Zero expected volume has no meaningful ratio and returns null. */
export function relativeVolume(currentVolume: number, expectedVolume: number): number | null {
  assertNonNegativeFinite(currentVolume, "currentVolume");
  assertNonNegativeFinite(expectedVolume, "expectedVolume");
  return expectedVolume === 0 ? null : currentVolume / expectedVolume;
}

function cumulativeAt(
  points: readonly IntradayVolumePoint[],
  elapsedMinutes: number,
): number | null {
  const sorted = [...points].sort((left, right) => left.elapsedMinutes - right.elapsedMinutes);
  sorted.forEach((point, index) => {
    assertNonNegativeFinite(point.elapsedMinutes, "points[" + index + "].elapsedMinutes");
    assertNonNegativeFinite(point.cumulativeVolume, "points[" + index + "].cumulativeVolume");
  });
  if (sorted.length === 0 || elapsedMinutes < sorted[0].elapsedMinutes) return null;

  const exact = sorted.find((point) => point.elapsedMinutes === elapsedMinutes);
  if (exact) return exact.cumulativeVolume;

  let lower = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const upper = sorted[index];
    if (elapsedMinutes < upper.elapsedMinutes) {
      const span = upper.elapsedMinutes - lower.elapsedMinutes;
      if (span === 0) return upper.cumulativeVolume;
      const weight = (elapsedMinutes - lower.elapsedMinutes) / span;
      return lower.cumulativeVolume + (upper.cumulativeVolume - lower.cumulativeVolume) * weight;
    }
    lower = upper;
  }

  return lower.elapsedMinutes === elapsedMinutes ? lower.cumulativeVolume : null;
}

/**
 * Prefers like-for-like intraday cumulative volume. If there is not enough intraday
 * history, falls back to average completed-session volume and identifies that method.
 */
export function calculateRelativeVolume(input: RelativeVolumeInput): RelativeVolumeResult {
  assertNonNegativeFinite(input.currentCumulativeVolume, "currentCumulativeVolume");
  const minimum = input.minimumComparableSessions ?? 3;
  if (!Number.isInteger(minimum) || minimum <= 0) {
    throw new RangeError("minimumComparableSessions must be a positive integer");
  }

  if (input.elapsedMinutes !== undefined && input.elapsedMinutes !== null) {
    assertNonNegativeFinite(input.elapsedMinutes, "elapsedMinutes");
    const comparable = input.historicalSessions.flatMap((session) => {
      if (!session.points) return [];
      const value = cumulativeAt(session.points, input.elapsedMinutes as number);
      return value === null ? [] : [value];
    });
    if (comparable.length >= minimum) {
      const expectedVolume = average(comparable);
      return {
        value: expectedVolume === null ? null : relativeVolume(input.currentCumulativeVolume, expectedVolume),
        currentVolume: input.currentCumulativeVolume,
        expectedVolume,
        comparableSessions: comparable.length,
        method: "time-adjusted",
        elapsedMinutes: input.elapsedMinutes,
      };
    }
  }

  const completedVolumes = input.historicalSessions.flatMap((session, index) => {
    if (session.totalVolume === undefined || session.totalVolume === null) return [];
    assertNonNegativeFinite(session.totalVolume, "historicalSessions[" + index + "].totalVolume");
    return [session.totalVolume];
  });

  if (completedVolumes.length >= minimum) {
    const expectedVolume = average(completedVolumes);
    return {
      value: expectedVolume === null ? null : relativeVolume(input.currentCumulativeVolume, expectedVolume),
      currentVolume: input.currentCumulativeVolume,
      expectedVolume,
      comparableSessions: completedVolumes.length,
      method: "full-session",
      elapsedMinutes: input.elapsedMinutes ?? null,
    };
  }

  return {
    value: null,
    currentVolume: input.currentCumulativeVolume,
    expectedVolume: null,
    comparableSessions: Math.max(
      completedVolumes.length,
      input.historicalSessions.filter((session) => session.points && session.points.length > 0).length,
    ),
    method: "unavailable",
    elapsedMinutes: input.elapsedMinutes ?? null,
  };
}
