"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AreaData,
  CandlestickData,
  HistogramData,
  IChartApi,
  LineData,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

import type { AggregateBar } from "@/types/market";
import { normalizeChartBars, stockCurrency, stockDateTime } from "@/lib/stocks";
import type {
  ChartDisplaySettings,
  ChartIndicatorSeries,
  StockDataStatus,
} from "@/lib/stocks";
import { ChartControls, type ChartControlsProps } from "./ChartControls";

function indicatorData(points: ChartIndicatorSeries["points"]) {
  return [...points]
    .map((point) => ({
      time: Math.floor(Date.parse(point.timestamp) / 1_000) as UTCTimestamp,
      value: point.value,
      color: point.color,
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => Number(left.time) - Number(right.time));
}

export interface PriceChartProps {
  readonly symbol: string;
  readonly bars: readonly AggregateBar[];
  readonly status: StockDataStatus;
  readonly settings: ChartDisplaySettings;
  readonly indicatorSeries: readonly ChartIndicatorSeries[];
  readonly height?: number;
  readonly availableTimeframes?: ChartControlsProps["availableTimeframes"];
  readonly availableIntervals?: ChartControlsProps["availableIntervals"];
  readonly onSettingsChange: (settings: ChartDisplaySettings) => void;
}

export function PriceChart({
  symbol,
  bars,
  status,
  settings,
  indicatorSeries,
  height = 430,
  availableTimeframes,
  availableIntervals,
  onSettingsChange,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [chartError, setChartError] = useState<string | null>(null);
  const normalizedBars = useMemo(() => normalizeChartBars(bars), [bars]);

  useEffect(() => {
    if (!containerRef.current || status.state !== "ready" || normalizedBars.length === 0) return;
    let disposed = false;
    let chart: IChartApi | null = null;

    void import("lightweight-charts")
      .then((library) => {
        if (disposed || !containerRef.current) return;
        chart = library.createChart(containerRef.current, {
          autoSize: true,
          height,
          layout: {
            background: { type: library.ColorType.Solid, color: "#090d12" },
            textColor: "#778697",
            fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
            fontSize: 10,
          },
          grid: {
            vertLines: { color: "#151e27" },
            horzLines: { color: "#151e27" },
          },
          crosshair: { mode: library.CrosshairMode.MagnetOHLC },
          rightPriceScale: { borderColor: "#263442", scaleMargins: { top: 0.08, bottom: 0.08 } },
          timeScale: { borderColor: "#263442", timeVisible: true, secondsVisible: false, rightOffset: 4 },
          handleScroll: true,
          handleScale: true,
        });
        chartRef.current = chart;

        const candlesticks: CandlestickData<Time>[] = normalizedBars.map((bar) => ({
          time: bar.time as UTCTimestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));
        const closes: LineData<Time>[] = normalizedBars.map((bar) => ({
          time: bar.time as UTCTimestamp,
          value: bar.close,
        }));

        if (settings.seriesType === "candlestick") {
          const priceSeries = chart.addSeries(library.CandlestickSeries, {
            upColor: "#42d392",
            downColor: "#ff6278",
            borderUpColor: "#42d392",
            borderDownColor: "#ff6278",
            wickUpColor: "#42d392",
            wickDownColor: "#ff6278",
            priceLineColor: "#3b9eff",
          });
          priceSeries.setData(candlesticks);
        } else if (settings.seriesType === "area") {
          const priceSeries = chart.addSeries(library.AreaSeries, {
            lineColor: "#3b9eff",
            topColor: "rgba(59, 158, 255, .35)",
            bottomColor: "rgba(59, 158, 255, .02)",
            lineWidth: 2,
          });
          priceSeries.setData(closes as AreaData<Time>[]);
        } else {
          const priceSeries = chart.addSeries(library.LineSeries, {
            color: "#3b9eff",
            lineWidth: 2,
          });
          priceSeries.setData(closes);
        }

        let nextPane = 1;
        if (settings.volumeVisible) {
          const volume = chart.addSeries(library.HistogramSeries, {
            priceFormat: { type: "volume" },
            priceLineVisible: false,
            lastValueVisible: false,
          }, nextPane);
          const volumeData: HistogramData<Time>[] = normalizedBars.map((bar) => ({
            time: bar.time as UTCTimestamp,
            value: bar.volume,
            color: bar.close >= bar.open ? "rgba(66, 211, 146, .46)" : "rgba(255, 98, 120, .46)",
          }));
          volume.setData(volumeData);
          nextPane += 1;
        }

        const enabledSeries = indicatorSeries.filter((series) =>
          settings.activeIndicators.includes(series.indicator),
        );
        const separatePane = enabledSeries.some((series) => series.pane === "separate")
          ? nextPane
          : null;
        for (const series of enabledSeries) {
          const paneIndex = series.pane === "separate" ? separatePane ?? 0 : 0;
          const data = indicatorData(series.points);
          if (series.kind === "histogram") {
            const api = chart.addSeries(library.HistogramSeries, {
              color: series.color,
              priceLineVisible: false,
              lastValueVisible: false,
            }, paneIndex);
            api.setData(data as HistogramData<Time>[]);
          } else {
            const api = chart.addSeries(library.LineSeries, {
              color: series.color,
              lineWidth: 1,
              priceLineVisible: false,
              lastValueVisible: true,
              title: series.label,
            }, paneIndex);
            api.setData(data as LineData<Time>[]);
          }
        }

        const panes = chart.panes();
        panes[0]?.setStretchFactor(4);
        for (let index = 1; index < panes.length; index += 1) panes[index]?.setStretchFactor(1);
        chart.timeScale().fitContent();
        setChartError(null);
      })
      .catch(() => {
        if (!disposed) setChartError("Chart renderer could not initialize.");
      });

    return () => {
      disposed = true;
      chartRef.current = null;
      chart?.remove();
    };
  }, [height, indicatorSeries, normalizedBars, settings, status.state]);

  useEffect(() => {
    if (fitRequest > 0) chartRef.current?.timeScale().fitContent();
  }, [fitRequest]);

  const latest = normalizedBars.at(-1);
  const overlay = status.state !== "ready"
    ? status.message ?? status.label
    : chartError
      ? chartError
      : normalizedBars.length === 0
        ? "No historical bars supplied for this range."
        : null;

  return (
    <section className="stock-price-chart" aria-label={`${symbol} historical price chart`}>
      <ChartControls
        settings={settings}
        availableTimeframes={availableTimeframes}
        availableIntervals={availableIntervals}
        onChange={onSettingsChange}
        onResetView={() => setFitRequest((request) => request + 1)}
      />
      <div className="stock-chart-legend" aria-live="polite">
        <strong>{symbol}</strong>
        <span>{settings.timeframe} · {settings.interval}</span>
        {latest ? (
          <>
            <time dateTime={latest.timestamp}>{stockDateTime(latest.timestamp)}</time>
            <span>O {stockCurrency(latest.open)}</span>
            <span>H {stockCurrency(latest.high)}</span>
            <span>L {stockCurrency(latest.low)}</span>
            <span>C {stockCurrency(latest.close)}</span>
          </>
        ) : null}
      </div>
      <div className="stock-chart-canvas" ref={containerRef} style={{ height }} />
      {overlay ? <div className={`stock-chart-overlay state-${status.state}`} role="status">{overlay}</div> : null}
      <p className="stock-chart-attribution">Interactive chart rendered with Lightweight Charts™. Market data status is shown separately above.</p>
    </section>
  );
}
