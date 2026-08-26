import type { ReactNode } from "react";

import {
  buildTickerOverviewIntelligence,
  stockCompact,
  stockCurrency,
  stockDateTime,
  stockNumber,
  stockPercent,
  stockTone,
} from "@/lib/stocks";
import type { CorporateEvent, DataQuality, NewsArticle } from "@/types/market";
import type { OptionChainBundle, SecurityResearchBundle } from "@/types/research";

interface IntelligenceHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly quality?: DataQuality | null;
  readonly source?: string | null;
  readonly asOf?: string | null;
  readonly unavailableLabel?: string;
}

function IntelligenceHeader({
  eyebrow,
  title,
  quality,
  source,
  asOf,
  unavailableLabel = "DATA UNAVAILABLE",
}: IntelligenceHeaderProps) {
  const available = Boolean(quality || source || asOf);
  return (
    <header className="stock-intelligence-card-header">
      <div><span>{eyebrow}</span><h3>{title}</h3></div>
      <div className="stock-intelligence-freshness">
        <strong>{available ? (quality ?? "TIMING UNVERIFIED").replaceAll("-", " ") : unavailableLabel}</strong>
        {source ? <span>{source}</span> : null}
        {asOf ? <time dateTime={asOf}>{stockDateTime(asOf)}</time> : null}
      </div>
    </header>
  );
}

function Metric({ label, value, detail, tone = "neutral" }: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: ReactNode;
  readonly tone?: "positive" | "negative" | "neutral";
}) {
  return <div className={`stock-intelligence-metric ${tone}`}><dt>{label}</dt><dd>{value}</dd>{detail ? <small>{detail}</small> : null}</div>;
}

function ratio(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${stockNumber(value)}×`;
}

function positionLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "POSITION UNAVAILABLE";
  if (Math.abs(value) < 0.005) return "AT REFERENCE";
  return value > 0 ? "ABOVE REFERENCE" : "BELOW REFERENCE";
}

function countdownLabel(event: CorporateEvent, daysUntil: number): string {
  const prefix = event.type === "earnings-release" || event.type === "earnings-call" ? "EARNINGS" : "EVENT";
  if (daysUntil === 0) return `${prefix} TODAY`;
  if (daysUntil === 1) return `${prefix} TOMORROW`;
  return `${prefix} IN ${daysUntil} DAYS`;
}

function categoryLabel(article: NewsArticle): string {
  return article.categories.length ? article.categories.join(" · ").replaceAll("-", " ") : "UNCATEGORIZED";
}

export interface TickerOverviewIntelligenceProps {
  readonly security: SecurityResearchBundle;
  /** Undefined/null means this panel was not supplied data; an empty array means no matching stories were returned. */
  readonly news?: readonly NewsArticle[] | null;
  /** Undefined/null means this panel was not supplied data; an empty array means no upcoming events were returned. */
  readonly events?: readonly CorporateEvent[] | null;
  readonly optionChain?: OptionChainBundle | null;
  /** Defaults to security.snapshot.asOf so server and client renders use the same calendar date. */
  readonly referenceTime?: string;
  readonly recentNewsLimit?: number;
  readonly upcomingEventLimit?: number;
  readonly onFindSimilar?: (ticker: string) => void;
}

/**
 * Purely presentational overview intelligence. It consumes normalized bundles and never fetches data.
 * All relationships are described as observations, not asserted catalysts or directional signals.
 */
export function TickerOverviewIntelligence({
  security,
  news,
  events,
  optionChain,
  referenceTime,
  recentNewsLimit = 3,
  upcomingEventLimit = 3,
  onFindSimilar,
}: TickerOverviewIntelligenceProps) {
  const model = buildTickerOverviewIntelligence({
    security,
    news,
    events,
    optionChain,
    referenceTime,
    newsLimit: recentNewsLimit,
    eventLimit: upcomingEventLimit,
  });
  const quote = security.snapshot.quote;
  const securityFreshness = { quality: quote.quality, source: quote.source, asOf: quote.asOf };
  const newestNews = model.recentNews[0] ?? null;
  const nextEvent = model.upcomingEvents[0]?.event ?? null;
  const matchingOptionContract = optionChain?.contracts.find(
    (contract) => contract.underlyingSymbol.toUpperCase() === model.symbol,
  ) ?? null;

  return (
    <section className="stock-ticker-intelligence" aria-label={`${model.symbol} overview intelligence`}>
      {onFindSimilar ? (
        <div className="stock-intelligence-actions">
          <div>
            <span>SCANNER WORKFLOW</span>
            <strong>Compare {model.symbol} with the active research universe</strong>
          </div>
          <button
            type="button"
            className="stock-find-similar-button"
            aria-label={`Find scanner results similar to ${model.symbol}`}
            onClick={() => onFindSimilar(model.symbol)}
          >
            FIND SIMILAR
          </button>
        </div>
      ) : null}
      <section className="stock-intelligence-card" aria-label="Performance summary">
        <IntelligenceHeader eyebrow="PRICE" title="PERFORMANCE" {...securityFreshness} />
        <dl className="stock-intelligence-metrics is-performance">
          {model.performance.map((measurement) => (
            <Metric
              key={measurement.label}
              label={measurement.label}
              value={stockPercent(measurement.changePercent)}
              detail={measurement.changePercent === null ? "INSUFFICIENT HISTORY" : measurement.basis}
              tone={stockTone(measurement.changePercent)}
            />
          ))}
        </dl>
      </section>

      <section className="stock-intelligence-card" aria-label="Technical position summary">
        <IntelligenceHeader eyebrow="CONTEXT" title="TECHNICAL POSITION" {...securityFreshness} />
        <dl className="stock-intelligence-metrics">
          <Metric
            label="VS VWAP"
            value={stockPercent(model.technical.distanceFromVwapPercent)}
            detail={positionLabel(model.technical.distanceFromVwapPercent)}
            tone={stockTone(model.technical.distanceFromVwapPercent)}
          />
          {model.technical.movingAverages.map((average) => (
            <Metric
              key={average.label}
              label={average.label}
              value={stockCurrency(average.average)}
              detail={average.average === null ? "INSUFFICIENT BARS" : `${stockPercent(average.distancePercent)} FROM LAST`}
              tone={stockTone(average.distancePercent)}
            />
          ))}
          <Metric
            label={model.technical.rangeLabel}
            value={model.technical.rangeLow === null || model.technical.rangeHigh === null
              ? "—"
              : `${stockCurrency(model.technical.rangeLow)} — ${stockCurrency(model.technical.rangeHigh)}`}
            detail={model.technical.rangePositionPercent === null
              ? "POSITION UNAVAILABLE"
              : `${stockNumber(model.technical.rangePositionPercent, 0)}% THROUGH RANGE`}
          />
        </dl>
      </section>

      <section className="stock-intelligence-card" aria-label="Relative volume summary">
        <IntelligenceHeader eyebrow="PARTICIPATION" title="RELATIVE VOLUME" {...securityFreshness} />
        <dl className="stock-intelligence-metrics">
          <Metric
            label="DAILY RVOL"
            value={ratio(model.relativeVolume.dailyRvol)}
            detail={model.relativeVolume.dailyRvol === null ? "VOLUME BASELINE UNAVAILABLE" : "CURRENT / AVG DAILY"}
          />
          <Metric label="CURRENT VOLUME" value={stockCompact(model.relativeVolume.currentVolume)} />
          <Metric label="AVG DAILY VOLUME" value={stockCompact(model.relativeVolume.averageDailyVolume)} />
          <Metric label="INTRADAY RVOL" value="—" detail="TIME-ALIGNED BASELINE NOT IN BUNDLE" />
        </dl>
      </section>

      <section className="stock-intelligence-card stock-intelligence-news" aria-label="Recent news">
        <IntelligenceHeader
          eyebrow="BENZINGA"
          title="RECENT NEWS"
          quality={newestNews?.quality}
          source={newestNews?.source}
          asOf={newestNews?.asOf}
          unavailableLabel={model.newsProvided ? "NO MATCHING STORIES" : "NEWS INPUT NOT PROVIDED"}
        />
        {model.recentNews.length ? (
          <ol className="stock-intelligence-list">
            {model.recentNews.map((article) => (
              <li key={article.id}>
                <div><time dateTime={article.publishedAt}>{stockDateTime(article.publishedAt)}</time><span>{article.publisher.name}</span></div>
                {article.articleUrl
                  ? <a href={article.articleUrl} target="_blank" rel="noreferrer">{article.title}</a>
                  : <strong>{article.title}</strong>}
                <small>{categoryLabel(article)} · {article.quality.replaceAll("-", " ")}</small>
              </li>
            ))}
          </ol>
        ) : <p className="stock-intelligence-empty">{model.newsProvided ? `No normalized stories matched ${model.symbol}.` : "No normalized news input was supplied to this component."}</p>}
        <p className="stock-intelligence-caveat">Temporal proximity to a headline does not establish that the story caused a price move.</p>
      </section>

      <section className="stock-intelligence-card stock-intelligence-events" aria-label="Upcoming corporate events">
        <IntelligenceHeader
          eyebrow="TMX EVENTS"
          title="UPCOMING EVENTS"
          quality={nextEvent?.quality}
          source={nextEvent?.source}
          asOf={nextEvent?.asOf}
          unavailableLabel={model.eventsProvided ? "NO UPCOMING EVENTS" : "EVENT INPUT NOT PROVIDED"}
        />
        {model.upcomingEvents.length ? (
          <ol className="stock-intelligence-list">
            {model.upcomingEvents.map(({ event, daysUntil }) => (
              <li key={event.id}>
                <div><strong className="stock-intelligence-countdown">{countdownLabel(event, daysUntil)}</strong><span>{event.status}</span></div>
                {event.eventUrl
                  ? <a href={event.eventUrl} target="_blank" rel="noreferrer">{event.title}</a>
                  : <strong>{event.title}</strong>}
                <small><time dateTime={event.startsAt}>{stockDateTime(event.startsAt)}</time> · {event.type.replaceAll("-", " ")}</small>
              </li>
            ))}
          </ol>
        ) : <p className="stock-intelligence-empty">{model.eventsProvided ? `No active future events matched ${model.symbol} as of ${stockDateTime(model.referenceTime)}.` : "No normalized corporate-event input was supplied to this component."}</p>}
      </section>

      <section className="stock-intelligence-card" aria-label="Options activity summary">
        <IntelligenceHeader
          eyebrow="OPTIONS"
          title="CHAIN OBSERVATIONS"
          quality={optionChain?.quality}
          source={matchingOptionContract?.source}
          asOf={optionChain?.asOf}
          unavailableLabel={model.options.state === "symbol-mismatch" ? "SYMBOL MISMATCH" : model.options.state === "empty" ? "NO CONTRACTS RETURNED" : "OPTIONS INPUT NOT PROVIDED"}
        />
        {model.options.state === "available" ? (
          <dl className="stock-intelligence-metrics">
            <Metric label="CONTRACT COVERAGE" value={stockNumber(model.options.contractCount, 0)} detail={`${stockNumber(model.options.expirationCount, 0)} EXPIRATIONS`} />
            <Metric label="REPORTED VOLUME" value={stockCompact(model.options.reportedVolume)} detail={`CALL ${stockCompact(model.options.callVolume)} · PUT ${stockCompact(model.options.putVolume)}`} />
            <Metric label="PUT / CALL VOLUME" value={ratio(model.options.putCallVolumeRatio)} detail="OBSERVED CONTRACTS ONLY" />
            <Metric label="REPORTED OPEN INTEREST" value={stockCompact(model.options.reportedOpenInterest)} />
            <Metric label="VOLUME / OPEN INTEREST" value={ratio(model.options.volumeToOpenInterestRatio)} detail="AGGREGATED COVERAGE" />
            <Metric
              label="TOP REPORTED VOLUME"
              value={model.options.topVolumeContract
                ? `${model.options.topVolumeContract.type.toUpperCase()} ${stockNumber(model.options.topVolumeContract.strikePrice)}`
                : "—"}
              detail={model.options.topVolumeContract
                ? `${model.options.topVolumeContract.expirationDate} · VOL ${stockCompact(model.options.topVolumeContract.volume)}`
                : "CONTRACT VOLUME UNAVAILABLE"}
            />
          </dl>
        ) : (
          <p className="stock-intelligence-empty">
            {model.options.state === "symbol-mismatch"
              ? `The supplied option chain does not match ${model.symbol}.`
              : model.options.state === "empty"
                ? `The normalized chain returned no ${model.symbol} contracts.`
                : "No normalized option-chain input was supplied to this component."}
          </p>
        )}
        <p className="stock-intelligence-caveat">Without a historical baseline, chain volume is not labeled unusual; volume alone does not imply bullish or bearish intent.</p>
      </section>

      <aside className="stock-intelligence-disclosure">
        <strong>OBSERVATIONAL CONTEXT</strong>
        <span>Performance, news, events, and option-chain statistics are displayed together for research. The interface does not assert causation, predict returns, or provide a trade signal.</span>
      </aside>
    </section>
  );
}
