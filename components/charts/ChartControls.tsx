"use client";

import type {
  ChartDisplaySettings,
  ChartIndicatorId,
  ChartInterval,
  ChartPriceScaleMode,
  ChartTimeframe,
  PriceSeriesType,
} from "@/lib/stocks";
import type { ExtendedHoursAvailability } from "@/lib/stocks/chart-settings";

export const DEFAULT_TIMEFRAMES: readonly ChartTimeframe[] = [
  "1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX",
];

export const DEFAULT_INTERVALS: readonly ChartInterval[] = [
  "1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W",
];

const INDICATOR_OPTIONS: readonly { id: ChartIndicatorId; label: string }[] = [
  { id: "sma", label: "SMA" },
  { id: "ema", label: "EMA" },
  { id: "vwap", label: "VWAP" },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
  { id: "bollinger", label: "BOLLINGER" },
  { id: "atr", label: "ATR" },
  { id: "relative-volume", label: "RVOL" },
];

export interface ChartControlsProps {
  readonly settings: ChartDisplaySettings;
  readonly availableTimeframes?: readonly ChartTimeframe[];
  readonly availableIntervals?: readonly ChartInterval[];
  readonly extendedHoursAvailability?: ExtendedHoursAvailability;
  readonly onChange: (settings: ChartDisplaySettings) => void;
  readonly onResetView?: () => void;
}

const UNKNOWN_EXTENDED_HOURS: ExtendedHoursAvailability = {
  available: false,
  state: "unclassified",
  label: "NO SESSION TAGS",
  reason: "The supplied bars do not expose exchange-session classification.",
};

export function ChartControls({
  settings,
  availableTimeframes = DEFAULT_TIMEFRAMES,
  availableIntervals = DEFAULT_INTERVALS,
  extendedHoursAvailability = UNKNOWN_EXTENDED_HOURS,
  onChange,
  onResetView,
}: ChartControlsProps) {
  const update = <Key extends keyof ChartDisplaySettings,>(
    key: Key,
    value: ChartDisplaySettings[Key],
  ) => onChange({ ...settings, [key]: value });

  const toggleIndicator = (indicator: ChartIndicatorId) => {
    const active = settings.activeIndicators.includes(indicator);
    update(
      "activeIndicators",
      active
        ? settings.activeIndicators.filter((candidate) => candidate !== indicator)
        : [...settings.activeIndicators, indicator],
    );
  };
  const scaleMode = settings.priceScaleMode ?? "linear";
  const extendedHoursEnabled = extendedHoursAvailability.available
    && Boolean(settings.includeExtendedHours);

  return (
    <div className="stock-chart-controls">
      <div className="stock-chart-timeframes" role="group" aria-label="Chart timeframe">
        {availableTimeframes.map((timeframe) => (
          <button
            type="button"
            key={timeframe}
            className={settings.timeframe === timeframe ? "is-active" : ""}
            aria-pressed={settings.timeframe === timeframe}
            onClick={() => update("timeframe", timeframe)}
          >
            {timeframe}
          </button>
        ))}
      </div>
      <label>
        <span>INTERVAL</span>
        <select value={settings.interval} onChange={(event) => update("interval", event.target.value as ChartInterval)}>
          {availableIntervals.map((interval) => <option key={interval} value={interval}>{interval}</option>)}
        </select>
      </label>
      <label>
        <span>STYLE</span>
        <select value={settings.seriesType} onChange={(event) => update("seriesType", event.target.value as PriceSeriesType)}>
          <option value="candlestick">Candlestick</option>
          <option value="line">Line</option>
          <option value="area">Area</option>
        </select>
      </label>
      <label className="stock-chart-check">
        <input type="checkbox" checked={settings.volumeVisible} onChange={(event) => update("volumeVisible", event.target.checked)} />
        <span>VOLUME</span>
      </label>
      <div className="stock-scale-controls" role="group" aria-label="Price scale">
        <span>PRICE SCALE</span>
        {(["linear", "logarithmic"] as const satisfies readonly ChartPriceScaleMode[]).map((mode) => (
          <button
            type="button"
            key={mode}
            className={scaleMode === mode ? "is-active" : ""}
            aria-pressed={scaleMode === mode}
            onClick={() => update("priceScaleMode", mode)}
          >
            {mode === "linear" ? "LIN" : "LOG"}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`stock-extended-hours${extendedHoursEnabled ? " is-active" : ""}`}
        disabled={!extendedHoursAvailability.available}
        aria-pressed={extendedHoursEnabled}
        aria-label={`Extended hours: ${extendedHoursAvailability.available ? (extendedHoursEnabled ? "shown" : "hidden") : extendedHoursAvailability.label.toLowerCase()}`}
        title={extendedHoursAvailability.reason}
        onClick={() => update("includeExtendedHours", !extendedHoursEnabled)}
      >
        <span>EXT HRS</span>
        <small>{extendedHoursAvailability.available ? (extendedHoursEnabled ? "ON" : "OFF") : extendedHoursAvailability.label}</small>
      </button>
      {onResetView ? <button type="button" className="stock-chart-reset" onClick={onResetView}>FIT</button> : null}
      <div className="stock-indicator-controls" role="group" aria-label="Chart indicators">
        <span>INDICATORS</span>
        {INDICATOR_OPTIONS.map((indicator) => (
          <button
            type="button"
            key={indicator.id}
            className={settings.activeIndicators.includes(indicator.id) ? "is-active" : ""}
            aria-pressed={settings.activeIndicators.includes(indicator.id)}
            onClick={() => toggleIndicator(indicator.id)}
          >
            {indicator.label}
          </button>
        ))}
      </div>
    </div>
  );
}
