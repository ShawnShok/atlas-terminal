"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { optionIvSurfaceContractSymbol, optionIvSurfaceValue } from "@/lib/options";
import { calculateDaysToExpiration, formatCurrency, formatDate, formatDateTime } from "@/lib/research";
import type {
  OptionIvSurfaceBundle,
  OptionIvSurfacePoint,
  OptionIvSurfaceSide,
} from "@/types";

import { EmptyResearchState, MetricCell } from "./ResearchFrame";

const MONEYNESS_BUCKETS = [-0.3, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3] as const;
const SIDE_OPTIONS: readonly { value: OptionIvSurfaceSide; label: string }[] = [
  { value: "blended", label: "BLENDED" },
  { value: "call", label: "CALLS" },
  { value: "put", label: "PUTS" },
];

interface SurfaceCell {
  readonly targetMoneyness: number;
  readonly point: OptionIvSurfacePoint | null;
  readonly value: number | null;
}

interface SurfaceRow {
  readonly expirationDate: string;
  readonly dte: number | null;
  readonly cells: readonly SurfaceCell[];
}

function nearestPoint(
  points: readonly OptionIvSurfacePoint[],
  target: number,
  side: OptionIvSurfaceSide,
): OptionIvSurfacePoint | null {
  const candidate = points
    .filter((point) => point.moneyness !== null && optionIvSurfaceValue(point, side) !== null)
    .sort((left, right) => Math.abs((left.moneyness as number) - target)
      - Math.abs((right.moneyness as number) - target)
      || left.strikePrice - right.strikePrice)[0] ?? null;
  if (!candidate || candidate.moneyness === null) return null;
  const bucketIndex = MONEYNESS_BUCKETS.indexOf(target as typeof MONEYNESS_BUCKETS[number]);
  const previous = MONEYNESS_BUCKETS[bucketIndex - 1];
  const next = MONEYNESS_BUCKETS[bucketIndex + 1];
  const neighborDistance = Math.min(
    previous === undefined ? Number.POSITIVE_INFINITY : target - previous,
    next === undefined ? Number.POSITIVE_INFINITY : next - target,
  );
  const tolerance = Number.isFinite(neighborDistance) ? neighborDistance * 0.7 : 0.075;
  return Math.abs(candidate.moneyness - target) <= tolerance ? candidate : null;
}

function buildRows(
  surface: OptionIvSurfaceBundle,
  side: OptionIvSurfaceSide,
  nowIso: string,
): readonly SurfaceRow[] {
  return surface.loadedExpirations.map((expirationDate) => {
    const points = surface.points.filter((point) => point.expirationDate === expirationDate);
    return {
      expirationDate,
      dte: calculateDaysToExpiration(expirationDate, nowIso),
      cells: MONEYNESS_BUCKETS.map((targetMoneyness) => {
        const point = nearestPoint(points, targetMoneyness, side);
        return {
          targetMoneyness,
          point,
          value: point ? optionIvSurfaceValue(point, side) : null,
        };
      }),
    };
  });
}

function formatIv(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatVolPointChange(value: number | null): string {
  if (value === null) return "—";
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} VOL PTS`;
}

function moneynessLabel(value: number): string {
  if (value === 0) return "ATM";
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
}

function cellStyle(value: number, minimum: number, maximum: number): CSSProperties {
  const normalized = maximum === minimum ? 0.55 : (value - minimum) / (maximum - minimum);
  const hue = 210 - normalized * 178;
  const lightness = 16 + normalized * 12;
  return {
    "--iv-cell-background": `hsl(${hue.toFixed(0)} 66% ${lightness.toFixed(0)}%)`,
    "--iv-cell-border": `hsl(${hue.toFixed(0)} 70% ${(lightness + 13).toFixed(0)}%)`,
  } as CSSProperties;
}

export interface ImpliedVolatilitySurfaceProps {
  readonly surface: OptionIvSurfaceBundle | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly nowIso: string;
  readonly onRetry: () => void;
  readonly onContractSelect: (expirationDate: string, contractSymbol: string) => void;
}

export function ImpliedVolatilitySurface({
  surface,
  loading,
  error,
  nowIso,
  onRetry,
  onContractSelect,
}: ImpliedVolatilitySurfaceProps) {
  const [side, setSide] = useState<OptionIvSurfaceSide>("blended");
  const rows = useMemo(() => surface ? buildRows(surface, side, nowIso) : [], [nowIso, side, surface]);
  const values = rows.flatMap((row) => row.cells.flatMap(({ value }) => value === null ? [] : [value]));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const firstRow = rows[0] ?? null;
  const lastRow = rows.at(-1) ?? null;
  const atmIndex = MONEYNESS_BUCKETS.indexOf(0);
  const downsideIndex = MONEYNESS_BUCKETS.indexOf(-0.1);
  const upsideIndex = MONEYNESS_BUCKETS.indexOf(0.1);
  const frontAtm = firstRow?.cells[atmIndex]?.value ?? null;
  const backAtm = lastRow?.cells[atmIndex]?.value ?? null;
  const termSlope = frontAtm === null || backAtm === null ? null : backAtm - frontAtm;
  const frontDownside = firstRow?.cells[downsideIndex]?.value ?? null;
  const frontUpside = firstRow?.cells[upsideIndex]?.value ?? null;
  const frontSkew = frontDownside === null || frontUpside === null ? null : frontDownside - frontUpside;
  const totalCells = rows.length * MONEYNESS_BUCKETS.length;
  const coverage = totalCells === 0 ? null : values.length / totalCells;

  return (
    <section className="research-subpanel research-iv-surface" aria-label="Implied volatility surface">
      <header className="research-subpanel-header research-iv-surface-header">
        <div>
          <span>PROVIDER-REPORTED VOLATILITY</span>
          <h3>IMPLIED VOLATILITY SURFACE</h3>
          <small>STRIKE MONEYNESS × DATED EXPIRATION · NEAREST LISTED STRIKE · EXTENDED TENOR · NO INTERPOLATION</small>
        </div>
        <div className="research-iv-side-switch" role="group" aria-label="Surface contract side">
          {SIDE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={side === option.value ? "is-active" : ""}
              aria-pressed={side === option.value}
              onClick={() => setSide(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {surface ? (
        <div className="research-metric-grid research-iv-surface-metrics">
          <MetricCell label="FRONT ATM IV" value={formatIv(frontAtm)} detail={firstRow ? `${formatDate(firstRow.expirationDate)} · ${firstRow.dte ?? "—"} DTE` : undefined} />
          <MetricCell label="TERM SLOPE" value={formatVolPointChange(termSlope)} detail="BACK ATM MINUS FRONT ATM" tone={termSlope !== null && termSlope > 0 ? "positive" : termSlope !== null && termSlope < 0 ? "negative" : "neutral"} />
          <MetricCell label="FRONT SKEW" value={formatVolPointChange(frontSkew)} detail="-10% MONEYNESS MINUS +10%" />
          <MetricCell label="SURFACE THROUGH" value={lastRow ? formatDate(lastRow.expirationDate) : "—"} detail={lastRow ? `${lastRow.dte ?? "—"} DTE · ${rows.length} DATED MATURITIES` : undefined} />
          <MetricCell label="GRID COVERAGE" value={coverage === null ? "—" : `${Math.round(coverage * 100)}%`} detail={`${values.length}/${totalCells} OBSERVATIONS`} tone={surface.contractsComplete ? "neutral" : "warning"} />
        </div>
      ) : null}

      {loading && !surface ? <div className="research-iv-surface-state" role="status">LOADING MULTI-EXPIRATION IV…</div> : null}
      {error && !surface ? (
        <div className="research-iv-surface-state is-error" role="alert">
          <strong>IV SURFACE UNAVAILABLE</strong>
          <span>{error}</span>
          <button type="button" className="research-action-button" onClick={onRetry}>RETRY</button>
        </div>
      ) : null}
      {surface && rows.length === 0 ? (
        <EmptyResearchState title="NO IV SURFACE" detail="No provider-reported implied-volatility observations were returned for this symbol." />
      ) : null}
      {surface && rows.length > 0 ? (
        <div className="research-iv-surface-wrap">
          <table className="research-iv-surface-table">
            <caption className="research-sr-only">Implied volatility by expiration and strike moneyness</caption>
            <thead>
              <tr>
                <th scope="col">EXPIRATION</th>
                {MONEYNESS_BUCKETS.map((bucket) => <th scope="col" key={bucket}>{moneynessLabel(bucket)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.expirationDate}>
                  <th scope="row">
                    <strong>{formatDate(row.expirationDate)}</strong>
                    <small>{row.dte ?? "—"} DTE</small>
                  </th>
                  {row.cells.map((cell) => {
                    const point = cell.point;
                    const symbol = point ? optionIvSurfaceContractSymbol(point, side) : null;
                    return (
                      <td key={cell.targetMoneyness}>
                        {point && cell.value !== null ? (
                          <button
                            type="button"
                            style={cellStyle(cell.value, minimum, maximum)}
                            title={`${formatDate(point.expirationDate)} · ${formatCurrency(point.strikePrice)} strike · ${formatIv(cell.value)} IV · ${point.reportedSideCount}/2 sides reported`}
                            onClick={() => symbol && onContractSelect(point.expirationDate, symbol)}
                            disabled={!symbol}
                          >
                            <strong>{formatIv(cell.value)}</strong>
                            <small>{formatCurrency(point.strikePrice)}</small>
                          </button>
                        ) : <span aria-label={`${moneynessLabel(cell.targetMoneyness)} unavailable`}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {surface ? (
        <footer className="research-iv-surface-footer">
          <div className="research-iv-legend"><span>LOW {formatIv(minimum)}</span><i /><span>HIGH {formatIv(maximum)}</span></div>
          <p>{surface.note} {surface.loadedExpirations.length}/{surface.requestedExpirations.length} representative expirations loaded · updated {formatDateTime(surface.asOf)}.</p>
        </footer>
      ) : null}
    </section>
  );
}
