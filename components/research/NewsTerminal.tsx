"use client";

import { useState } from "react";

import type { NewsArticle, NewsCategory } from "@/types";
import {
  formatDateTime,
  formatNewsAge,
  formatTime,
  isRecent,
  newsReadKey,
  newsSourceLabel,
} from "@/lib/research";
import type {
  NewsAlertDraft,
  NewsFiltersValue,
  NewsRecentWindow,
  NewsScope,
  NewsSortDirection,
  NewsSortKey,
  NewsWatchlistOption,
  ResearchDataStatus,
  SelectOption,
} from "@/lib/research/types";
import { EmptyResearchState, ResearchFrame } from "./ResearchFrame";

const NEWS_SCOPES: readonly SelectOption<NewsScope>[] = [
  { value: "all", label: "ALL NEWS" },
  { value: "watchlist", label: "WATCHLIST" },
  { value: "ticker", label: "TICKER" },
];

const NEWS_CATEGORY_LABELS: Readonly<Record<NewsCategory, string>> = {
  breaking: "BREAKING",
  earnings: "EARNINGS",
  analyst: "ANALYST",
  "mergers-acquisitions": "M&A",
  fda: "FDA",
  guidance: "GUIDANCE",
  macro: "MACRO",
  company: "COMPANY",
  markets: "MARKETS",
  other: "OTHER",
};

const NEWS_RECENT_WINDOWS: readonly SelectOption<NewsRecentWindow>[] = [
  { value: "all", label: "Any age" },
  { value: "5", label: "Last 5 min" },
  { value: "15", label: "Last 15 min" },
  { value: "30", label: "Last 30 min" },
  { value: "60", label: "Last hour" },
  { value: "today", label: "Today (ET)" },
];

function categoryLabel(category: NewsCategory): string {
  return NEWS_CATEGORY_LABELS[category];
}

export interface NewsFilterBarProps {
  readonly value: NewsFiltersValue;
  readonly sectors: readonly string[];
  readonly categories: readonly NewsCategory[];
  readonly sources: readonly string[];
  readonly watchlists: readonly NewsWatchlistOption[];
  readonly selectedWatchlistId: string;
  readonly readTrackingLabel: string;
  readonly readTrackingAvailable: boolean;
  readonly onSelectedWatchlistChange: (id: string) => void;
  readonly onChange: (value: NewsFiltersValue) => void;
  readonly onRefresh?: () => void;
}

export function NewsFilterBar({
  value,
  sectors,
  categories,
  sources,
  watchlists,
  selectedWatchlistId,
  readTrackingLabel,
  readTrackingAvailable,
  onSelectedWatchlistChange,
  onChange,
  onRefresh,
}: NewsFilterBarProps) {
  const update = <Key extends keyof NewsFiltersValue>(
    key: Key,
    next: NewsFiltersValue[Key],
  ) => onChange({ ...value, [key]: next });

  const selectScope = (scope: NewsScope) => onChange({
    ...value,
    scope,
    tickers: scope === "all" || scope === "watchlist" ? "" : value.tickers,
    category: scope === "all" ? "all" : value.category,
  });

  const selectCategoryView = (category: NewsCategory) => onChange({
    ...value,
    scope: "all",
    category,
    tickers: "",
  });

  return (
    <div className="research-filter-stack">
      <div className="research-segmented" role="group" aria-label="News view">
        {NEWS_SCOPES.map((scope) => {
          const active = value.scope === scope.value
            && (scope.value !== "all" || value.category === "all");
          return (
            <button
              type="button"
              key={scope.value}
              className={active ? "is-active" : ""}
              aria-pressed={active}
              onClick={() => selectScope(scope.value)}
            >
              {scope.label}
            </button>
          );
        })}
        {categories.map((category) => {
          const active = value.scope === "all" && value.category === category;
          return (
            <button
              type="button"
              key={category}
              className={active ? "is-active" : ""}
              aria-pressed={active}
              onClick={() => selectCategoryView(category)}
            >
              {categoryLabel(category)}
            </button>
          );
        })}
      </div>
      <form className="research-filter-grid research-news-filter-primary" onSubmit={(event) => event.preventDefault()}>
        <label className="research-filter-grow">
          <span>TICKER(S)</span>
          <input
            value={value.tickers}
            maxLength={320}
            placeholder="NVDA, AMD, MSFT"
            onChange={(event) => update("tickers", event.target.value.toUpperCase())}
          />
        </label>
        <label>
          <span>WATCHLIST</span>
          <select
            value={selectedWatchlistId}
            disabled={watchlists.length === 0}
            onChange={(event) => {
              onSelectedWatchlistChange(event.target.value);
              onChange({ ...value, scope: "watchlist", tickers: "" });
            }}
          >
            {watchlists.length === 0 ? <option value="">No watchlists</option> : null}
            {watchlists.map((watchlist) => (
              <option key={watchlist.id} value={watchlist.id}>{watchlist.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>SECTOR</span>
          <select value={value.sector} onChange={(event) => update("sector", event.target.value)}>
            <option value="">All sectors</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        </label>
        <label>
          <span>CATEGORY</span>
          <select
            value={value.category}
            onChange={(event) => update("category", event.target.value as NewsCategory | "all")}
          >
            <option value="all">All returned categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>SOURCE</span>
          <select value={value.source} onChange={(event) => update("source", event.target.value)}>
            <option value="">All returned sources</option>
            {sources.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
        </label>
        <label className="research-filter-grow">
          <span>KEYWORD</span>
          <input
            type="search"
            value={value.keyword}
            placeholder="Headline, summary, topic"
            onChange={(event) => update("keyword", event.target.value)}
          />
        </label>
      </form>
      <form className="research-filter-grid research-news-filter-time" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>DATE FROM (ET)</span>
          <input type="date" value={value.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} />
        </label>
        <label>
          <span>DATE TO (ET)</span>
          <input type="date" value={value.dateTo} onChange={(event) => update("dateTo", event.target.value)} />
        </label>
        <label>
          <span>PUBLISHED AFTER (ET)</span>
          <input type="time" value={value.timeFrom} onChange={(event) => update("timeFrom", event.target.value)} />
        </label>
        <label>
          <span>PUBLISHED BEFORE (ET)</span>
          <input type="time" value={value.timeTo} onChange={(event) => update("timeTo", event.target.value)} />
        </label>
        <label>
          <span>RECENT</span>
          <select value={value.recent} onChange={(event) => update("recent", event.target.value as NewsRecentWindow)}>
            {NEWS_RECENT_WINDOWS.map((window) => (
              <option key={window.value} value={window.value}>{window.label}</option>
            ))}
          </select>
        </label>
        <label className="research-check-filter" title={readTrackingLabel}>
          <input
            type="checkbox"
            checked={value.unreadOnly}
            disabled={!readTrackingAvailable}
            onChange={(event) => update("unreadOnly", event.target.checked)}
          />
          <span>ONLY UNREAD</span>
        </label>
        {onRefresh ? (
          <button className="research-action-button" type="button" onClick={onRefresh}>
            REFRESH
          </button>
        ) : null}
      </form>
      <p className="research-news-persistence-status" role="status">{readTrackingLabel}</p>
    </div>
  );
}

function SortHeader({
  label,
  value,
  activeKey,
  direction,
  onSort,
}: {
  readonly label: string;
  readonly value: NewsSortKey;
  readonly activeKey: NewsSortKey;
  readonly direction: NewsSortDirection;
  readonly onSort: (key: NewsSortKey) => void;
}) {
  const active = activeKey === value;
  return (
    <button
      type="button"
      className="research-sort-button"
      aria-label={`Sort news by ${label}`}
      onClick={() => onSort(value)}
    >
      {label} {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
    </button>
  );
}

export interface NewsFeedProps {
  readonly articles: readonly NewsArticle[];
  readonly selectedArticleId: string | null;
  readonly readArticleKeys: ReadonlySet<string>;
  readonly nowIso: string;
  readonly sortKey: NewsSortKey;
  readonly sortDirection: NewsSortDirection;
  readonly recentThresholdMinutes?: number;
  readonly onSort: (key: NewsSortKey) => void;
  readonly onSelect: (article: NewsArticle) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function NewsFeed({
  articles,
  selectedArticleId,
  readArticleKeys,
  nowIso,
  sortKey,
  sortDirection,
  recentThresholdMinutes = 5,
  onSort,
  onSelect,
  onTickerSelect,
}: NewsFeedProps) {
  if (articles.length === 0) {
    return <EmptyResearchState title="NO HEADLINES" detail="No returned stories match the active filter set." />;
  }

  const header = (value: NewsSortKey, label: string) => (
    <SortHeader label={label} value={value} activeKey={sortKey} direction={sortDirection} onSort={onSort} />
  );

  return (
    <div className="research-table-wrap">
      <table className="research-table research-news-table">
        <caption className="research-sr-only">Filtered and sortable financial news headlines</caption>
        <thead>
          <tr>
            <th scope="col">{header("publishedAt", "TIME")}</th>
            <th scope="col">{header("ticker", "TICKER")}</th>
            <th scope="col">{header("headline", "HEADLINE")}</th>
            <th scope="col">{header("category", "CATEGORY")}</th>
            <th scope="col">{header("source", "SOURCE")}</th>
            <th scope="col">{header("age", "AGE")}</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => {
            const recent = isRecent(article.publishedAt, nowIso, recentThresholdMinutes);
            const selected = selectedArticleId === article.id;
            const unread = !readArticleKeys.has(newsReadKey(article));
            const className = [selected ? "is-selected" : "", unread ? "is-unread" : ""]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={`${article.source}:${article.id}`} className={className}>
                <td>
                  <button
                    type="button"
                    className="research-row-select"
                    aria-label={`Open ${article.title}`}
                    aria-pressed={selected}
                    onClick={() => onSelect(article)}
                  >
                    {unread ? <span className="research-unread-badge">UNREAD</span> : null}
                    {recent ? <span className="research-breaking-pulse">NEW</span> : null}
                    <time dateTime={article.publishedAt}>{formatTime(article.publishedAt)}</time>
                  </button>
                </td>
                <td>
                  <div className="research-ticker-list">
                    {article.tickers.length > 0 ? article.tickers.slice(0, 3).map((ticker) => (
                      <button type="button" key={ticker} onClick={() => onTickerSelect?.(ticker)}>
                        {ticker}
                      </button>
                    )) : <span>—</span>}
                  </div>
                </td>
                <td>
                  <button type="button" className="research-headline" onClick={() => onSelect(article)}>
                    {article.title}
                  </button>
                </td>
                <td>{categoryLabel(article.categories[0] ?? "other")}</td>
                <td>{newsSourceLabel(article)}</td>
                <td><time dateTime={article.publishedAt} title={formatDateTime(article.publishedAt)}>{formatNewsAge(article.publishedAt, nowIso)}</time></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface NewsStoryDetailProps {
  readonly article: NewsArticle | null;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function NewsStoryDetail({ article, onTickerSelect }: NewsStoryDetailProps) {
  if (!article) {
    return <EmptyResearchState title="SELECT A STORY" detail="Open a headline to inspect its normalized article record." />;
  }

  return (
    <article className="research-news-detail">
      <div className="research-detail-meta">
        <time dateTime={article.publishedAt}>{formatDateTime(article.publishedAt)}</time>
        <span>{newsSourceLabel(article)}</span>
        <span>{article.categories.map(categoryLabel).join(" · ") || "UNCATEGORIZED"}</span>
      </div>
      <h3>{article.title}</h3>
      <div className="research-ticker-list" aria-label="Related tickers">
        {article.tickers.map((ticker) => (
          <button type="button" key={ticker} onClick={() => onTickerSelect?.(ticker)}>{ticker}</button>
        ))}
      </div>
      {article.summary ? <p className="research-news-summary">{article.summary}</p> : (
        <p className="research-muted-copy">No article summary was supplied by the active data source.</p>
      )}
      {article.body ? <div className="research-news-body">{article.body}</div> : (
        <p className="research-muted-copy">Full article content was not supplied by the active data source.</p>
      )}
      {article.keywords.length > 0 ? (
        <dl className="research-keyword-row">
          <dt>KEYWORDS</dt>
          <dd>{article.keywords.join(" · ")}</dd>
        </dl>
      ) : null}
      <dl className="research-keyword-row research-news-freshness">
        <dt>DATA</dt>
        <dd>{article.quality.toUpperCase()} · {article.source.toUpperCase()} · AS OF {formatDateTime(article.asOf)}</dd>
      </dl>
      {article.articleUrl ? (
        <a className="research-external-link" href={article.articleUrl} target="_blank" rel="noreferrer">
          OPEN SOURCE ARTICLE <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <p className="research-muted-copy">The provider did not supply an external article link.</p>
      )}
    </article>
  );
}

export interface HeadlineStreamProps {
  readonly articles: readonly NewsArticle[];
  readonly nowIso: string;
  readonly onSelect: (article: NewsArticle) => void;
}

export function HeadlineStream({ articles, nowIso, onSelect }: HeadlineStreamProps) {
  return (
    <div className="research-headline-stream" aria-label="Scrolling headline mode">
      <strong>HEADLINE MODE</strong>
      <div>
        {articles.length === 0 ? <span>NO HEADLINES</span> : articles.map((article) => (
          <button type="button" key={`${article.source}:${article.id}`} onClick={() => onSelect(article)}>
            {isRecent(article.publishedAt, nowIso, 5) ? <i aria-hidden="true" /> : null}
            <time dateTime={article.publishedAt}>{formatTime(article.publishedAt)}</time>
            <b>{article.tickers[0] ?? "NEWS"}</b>
            <span>{article.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface NewsAlertBuilderProps {
  readonly categories: readonly NewsCategory[];
  readonly watchlists: readonly NewsWatchlistOption[];
  readonly initialTicker: string;
  readonly busy: boolean;
  readonly message: string | null;
  readonly persistenceAvailable: boolean;
  readonly onCreate: (draft: NewsAlertDraft) => void;
}

export function NewsAlertBuilder({
  categories,
  watchlists,
  initialTicker,
  busy,
  message,
  persistenceAvailable,
  onCreate,
}: NewsAlertBuilderProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [watchlistId, setWatchlistId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [browserNotification, setBrowserNotification] = useState(false);
  const [sound, setSound] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);
  const [enabled, setEnabled] = useState(true);

  return (
    <section className="research-news-alert-builder" aria-label="Create news alert">
      <header>
        <strong>NEWS ALERT</strong>
        <span>Saved definitions require PostgreSQL; browser permission is requested only by the button below.</span>
      </header>
      <form className="research-filter-grid" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>TICKER</span>
          <input
            value={ticker}
            maxLength={15}
            placeholder="ANY"
            onChange={(event) => setTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, ""))}
          />
        </label>
        <label>
          <span>WATCHLIST</span>
          <select value={watchlistId} onChange={(event) => setWatchlistId(event.target.value)}>
            <option value="">No watchlist</option>
            {watchlists.map((watchlist) => (
              <option key={watchlist.id} value={watchlist.id}>{watchlist.label}</option>
            ))}
          </select>
        </label>
        <label className="research-filter-grow">
          <span>HEADLINE KEYWORD</span>
          <input value={keyword} maxLength={160} placeholder="guidance, acquisition…" onChange={(event) => setKeyword(event.target.value)} />
        </label>
        <label>
          <span>CATEGORY</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as NewsCategory | "all")}>
            <option value="all">Any category</option>
            {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
          </select>
        </label>
        <label>
          <span>COOLDOWN (MIN)</span>
          <input
            type="number"
            min={0}
            max={10_080}
            step={1}
            value={cooldownMinutes}
            onChange={(event) => setCooldownMinutes(Math.max(0, Math.min(10_080, Number(event.target.value) || 0)))}
          />
        </label>
        <label className="research-check-filter">
          <input type="checkbox" checked={browserNotification} onChange={(event) => setBrowserNotification(event.target.checked)} />
          <span>BROWSER</span>
        </label>
        <label className="research-check-filter">
          <input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} />
          <span>SOUND</span>
        </label>
        <label className="research-check-filter">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>ENABLED</span>
        </label>
        <button
          className="research-primary-button"
          type="button"
          disabled={busy || !persistenceAvailable}
          onClick={() => onCreate({
            ticker,
            watchlistId,
            keyword,
            category,
            browserNotification,
            sound,
            cooldownMinutes,
            enabled,
          })}
        >
          {busy ? "SAVING…" : "CREATE NEWS ALERT"}
        </button>
      </form>
      {message ? <p className="research-news-alert-message" role="status">{message}</p> : null}
    </section>
  );
}

export interface NewsTerminalProps {
  readonly status: ResearchDataStatus;
  readonly providerLabel?: string;
  readonly filters: NewsFiltersValue;
  readonly sectors: readonly string[];
  readonly categories: readonly NewsCategory[];
  readonly sources: readonly string[];
  readonly watchlists: readonly NewsWatchlistOption[];
  readonly selectedWatchlistId: string;
  readonly articles: readonly NewsArticle[];
  readonly selectedArticle: NewsArticle | null;
  readonly readArticleKeys: ReadonlySet<string>;
  readonly readTrackingLabel: string;
  readonly readTrackingAvailable: boolean;
  readonly nowIso: string;
  readonly sortKey: NewsSortKey;
  readonly sortDirection: NewsSortDirection;
  readonly alertBusy?: boolean;
  readonly alertMessage?: string | null;
  readonly alertPersistenceAvailable?: boolean;
  readonly headlineMode?: boolean;
  readonly onFiltersChange: (value: NewsFiltersValue) => void;
  readonly onSelectedWatchlistChange: (id: string) => void;
  readonly onSort: (key: NewsSortKey) => void;
  readonly onArticleSelect: (article: NewsArticle) => void;
  readonly onCreateNewsAlert?: (draft: NewsAlertDraft) => void;
  readonly onTickerSelect?: (ticker: string) => void;
  readonly onRefresh?: () => void;
}

export function NewsTerminal({
  status,
  providerLabel = "MARKET NEWS",
  filters,
  sectors,
  categories,
  sources,
  watchlists,
  selectedWatchlistId,
  articles,
  selectedArticle,
  readArticleKeys,
  readTrackingLabel,
  readTrackingAvailable,
  nowIso,
  sortKey,
  sortDirection,
  alertBusy = false,
  alertMessage = null,
  alertPersistenceAvailable = false,
  headlineMode = false,
  onFiltersChange,
  onSelectedWatchlistChange,
  onSort,
  onArticleSelect,
  onCreateNewsAlert,
  onTickerSelect,
  onRefresh,
}: NewsTerminalProps) {
  return (
    <ResearchFrame
      title="NEWS TERMINAL"
      eyebrow={providerLabel}
      status={status}
      className="research-news-terminal"
      footer={headlineMode ? <HeadlineStream articles={articles} nowIso={nowIso} onSelect={onArticleSelect} /> : undefined}
    >
      <NewsFilterBar
        value={filters}
        sectors={sectors}
        categories={categories}
        sources={sources}
        watchlists={watchlists}
        selectedWatchlistId={selectedWatchlistId}
        readTrackingLabel={readTrackingLabel}
        readTrackingAvailable={readTrackingAvailable}
        onSelectedWatchlistChange={onSelectedWatchlistChange}
        onChange={onFiltersChange}
        onRefresh={onRefresh}
      />
      <div className="research-master-detail">
        <NewsFeed
          articles={articles}
          selectedArticleId={selectedArticle?.id ?? null}
          readArticleKeys={readArticleKeys}
          nowIso={nowIso}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={onSort}
          onSelect={onArticleSelect}
          onTickerSelect={onTickerSelect}
        />
        <NewsStoryDetail article={selectedArticle} onTickerSelect={onTickerSelect} />
      </div>
      {onCreateNewsAlert ? (
        <NewsAlertBuilder
          categories={categories}
          watchlists={watchlists}
          initialTicker={filters.tickers.split(/[\s,;]+/)[0] ?? ""}
          busy={alertBusy}
          message={alertMessage}
          persistenceAvailable={alertPersistenceAvailable}
          onCreate={onCreateNewsAlert}
        />
      ) : null}
    </ResearchFrame>
  );
}
