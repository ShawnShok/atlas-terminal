export interface PerformancePoint {
  readonly timestamp: string;
  readonly price: number;
}

export interface PerformanceSeries {
  readonly symbol: string;
  readonly points: readonly PerformancePoint[];
}

export interface NormalizedPerformancePoint extends PerformancePoint {
  readonly percentReturn: number;
}

export interface NormalizedPerformanceSeries {
  readonly symbol: string;
  readonly baselineTimestamp: string;
  readonly baselinePrice: number;
  readonly points: readonly NormalizedPerformancePoint[];
}

export interface PerformanceComparison {
  readonly baselineTimestamp: string;
  readonly series: readonly NormalizedPerformanceSeries[];
}

function prepareSeries(series: PerformanceSeries): PerformancePoint[] {
  if (!series.symbol.trim()) throw new RangeError("symbol cannot be empty");
  const sorted = [...series.points].sort((left, right) =>
    Date.parse(left.timestamp) - Date.parse(right.timestamp));
  sorted.forEach((point, index) => {
    if (!Number.isFinite(Date.parse(point.timestamp))) {
      throw new TypeError("points[" + index + "].timestamp must be valid");
    }
    if (!Number.isFinite(point.price) || point.price <= 0) {
      throw new RangeError("points[" + index + "].price must be positive and finite");
    }
  });
  return sorted;
}

export function normalizePerformance(
  series: PerformanceSeries,
  baselineTimestamp?: string,
): NormalizedPerformanceSeries {
  const points = prepareSeries(series);
  if (points.length === 0) throw new RangeError("performance series cannot be empty");
  const baseline = baselineTimestamp === undefined
    ? points[0]
    : points.find((point) => point.timestamp === baselineTimestamp);
  if (!baseline) throw new RangeError("baselineTimestamp must exist in the performance series");

  const baselineIndex = points.indexOf(baseline);
  return {
    symbol: series.symbol.trim().toUpperCase(),
    baselineTimestamp: baseline.timestamp,
    baselinePrice: baseline.price,
    points: points.slice(baselineIndex).map((point) => ({
      ...point,
      percentReturn: (point.price / baseline.price - 1) * 100,
    })),
  };
}

/** Uses the first timestamp shared by every series so comparisons have the same base. */
export function compareNormalizedPerformance(
  series: readonly PerformanceSeries[],
): PerformanceComparison {
  if (series.length < 2) throw new RangeError("comparison requires at least two series");
  const prepared = series.map((item) => ({ item, points: prepareSeries(item) }));
  if (prepared.some(({ points }) => points.length === 0)) {
    throw new RangeError("comparison series cannot be empty");
  }

  const timestampSets = prepared.map(({ points }) => new Set(points.map((point) => point.timestamp)));
  const baselineTimestamp = prepared[0].points
    .map((point) => point.timestamp)
    .find((timestamp) => timestampSets.every((set) => set.has(timestamp)));
  if (!baselineTimestamp) throw new RangeError("comparison series do not share a timestamp");

  return {
    baselineTimestamp,
    series: series.map((item) => normalizePerformance(item, baselineTimestamp)),
  };
}
