"use client";

import type { NewsArticle, NewsCategory } from "@/types";
import { formatDateTime, formatTime, isRecent } from "@/lib/research";
import type {
  NewsFiltersValue,
  NewsScope,
  ResearchDataStatus,
  SelectOption,
} from "@/lib/research/types";
import { EmptyResearchState, ResearchFrame } from "./ResearchFrame";

const NEWS_SCOPES: readonly SelectOption<NewsScope>[] = [
  { value: "all", label: "ALL NEWS" },
  { value: "watchlist", label: "WATCHLIST" },
  { value: "ticker", label: "TICKER" },
  { value: "breaking", label: "BREAKING" },
  { value: "earnings", label: "EARNINGS" },
  { value: "analyst", label: "ANALYST" },
  { value: "mergers-acquisitions", label: "M&A" },
  { value: "fda", label: "FDA" },
  { value: "guidance", label: "GUIDANCE" },
  { value: "macro", label: "MACRO" },
];

const NEWS_CATEGORIES: readonly SelectOption<NewsCategory | "all">[] = [
  { value: "all", label: "All categories" },
  { value: "breaking", label: "Breaking" },
  { value: "earnings", label: "Earnings" },
  { value: "analyst", label: "Analyst" },
  { value: "mergers-acquisitions", label: "M&A" },
  { value: "fda", label: "FDA" },
  { value: "guidance", label: "Guidance" },
  { value: "macro", label: "Macro" },
  { value: "company", label: "Company" },
  { value: "markets", label: "Markets" },
  { value: "other", label: "Other" },
];

export interface NewsFilterBarProps {
  readonly value: NewsFiltersValue;
  readonly sectors: readonly string[];
  readonly onChange: (value: NewsFiltersValue) => void;
  readonly onRefresh?: () => void;
}

export function NewsFilterBar({ value, sectors, onChange, onRefresh }: NewsFilterBarProps) {
  const update = <Key extends keyof NewsFiltersValue>(
    key: Key,
    next: NewsFiltersValue[Key],
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="research-filter-stack">
      <div className="research-segmented" role="group" aria-label="News scope">
        {NEWS_SCOPES.map((scope) => (
          <button
            type="button"
            key={scope.value}
            className={value.scope === scope.value ? "is-active" : ""}
            aria-pressed={value.scope === scope.value}
            onClick={() => update("scope", scope.value)}
          >
            {scope.label}
          </button>
        ))}
      </div>
      <form className="research-filter-grid" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>TICKER</span>
          <input
            value={value.ticker}
            maxLength={10}
            placeholder="ALL"
            onChange={(event) => update("ticker", event.target.value.toUpperCase())}
          />
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
            {NEWS_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>DATE</span>
          <input type="date" value={value.date} onChange={(event) => update("date", event.target.value)} />
        </label>
        <label className="research-filter-grow">
          <span>KEYWORD</span>
          <input
            type="search"
            value={value.keyword}
            placeholder="Headline, company, topic"
            onChange={(event) => update("keyword", event.target.value)}
          />
        </label>
        {onRefresh ? (
          <button className="research-action-button" type="button" onClick={onRefresh}>
            REFRESH
          </button>
        ) : null}
      </form>
    </div>
  );
}

export interface NewsFeedProps {
  readonly articles: readonly NewsArticle[];
  readonly selectedArticleId: string | null;
  readonly nowIso: string;
  readonly recentThresholdMinutes?: number;
  readonly onSelect: (article: NewsArticle) => void;
  readonly onTickerSelect?: (ticker: string) => void;
}

export function NewsFeed({
  articles,
  selectedArticleId,
  nowIso,
  recentThresholdMinutes = 5,
  onSelect,
  onTickerSelect,
}: NewsFeedProps) {
  if (articles.length === 0) {
    return <EmptyResearchState title="NO HEADLINES" detail="No stories match the active filter set." />;
  }

  return (
    <div className="research-table-wrap">
      <table className="research-table research-news-table">
        <caption className="research-sr-only">Filtered financial news headlines</caption>
        <thead>
          <tr>
            <th scope="col">TIME</th>
            <th scope="col">TICKER</th>
            <th scope="col">HEADLINE</th>
            <th scope="col">SOURCE</th>
            <th scope="col">CATEGORY</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => {
            const recent = isRecent(article.publishedAt, nowIso, recentThresholdMinutes);
            const selected = selectedArticleId === article.id;
            return (
              <tr key={article.id} className={selected ? "is-selected" : ""}>
                <td>
                  <button
                    type="button"
                    className="research-row-select"
                    aria-label={`Open ${article.title}`}
                    aria-pressed={selected}
                    onClick={() => onSelect(article)}
                  >
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
                <td>{article.publisher.name}</td>
                <td>{article.categories[0]?.replaceAll("-", " ") ?? "other"}</td>
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
        <span>{article.publisher.name}</span>
        <span>{article.categories.join(" · ") || "uncategorized"}</span>
      </div>
      <h3>{article.title}</h3>
      <div className="research-ticker-list" aria-label="Related tickers">
        {article.tickers.map((ticker) => (
          <button type="button" key={ticker} onClick={() => onTickerSelect?.(ticker)}>{ticker}</button>
        ))}
      </div>
      {article.summary ? <p className="research-news-summary">{article.summary}</p> : null}
      {article.body ? <div className="research-news-body">{article.body}</div> : (
        <p className="research-muted-copy">Full article content was not supplied by the active data source.</p>
      )}
      {article.keywords.length > 0 ? (
        <dl className="research-keyword-row">
          <dt>KEYWORDS</dt>
          <dd>{article.keywords.join(" · ")}</dd>
        </dl>
      ) : null}
      {article.articleUrl ? (
        <a className="research-external-link" href={article.articleUrl} target="_blank" rel="noreferrer">
          OPEN SOURCE ARTICLE <span aria-hidden="true">↗</span>
        </a>
      ) : null}
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
          <button type="button" key={article.id} onClick={() => onSelect(article)}>
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

export interface NewsTerminalProps {
  readonly status: ResearchDataStatus;
  readonly filters: NewsFiltersValue;
  readonly sectors: readonly string[];
  readonly articles: readonly NewsArticle[];
  readonly selectedArticle: NewsArticle | null;
  readonly nowIso: string;
  readonly headlineMode?: boolean;
  readonly onFiltersChange: (value: NewsFiltersValue) => void;
  readonly onArticleSelect: (article: NewsArticle) => void;
  readonly onTickerSelect?: (ticker: string) => void;
  readonly onRefresh?: () => void;
}

export function NewsTerminal({
  status,
  filters,
  sectors,
  articles,
  selectedArticle,
  nowIso,
  headlineMode = false,
  onFiltersChange,
  onArticleSelect,
  onTickerSelect,
  onRefresh,
}: NewsTerminalProps) {
  return (
    <ResearchFrame
      title="NEWS TERMINAL"
      eyebrow="BENZINGA DATASET"
      status={status}
      className="research-news-terminal"
      footer={headlineMode ? <HeadlineStream articles={articles} nowIso={nowIso} onSelect={onArticleSelect} /> : undefined}
    >
      <NewsFilterBar value={filters} sectors={sectors} onChange={onFiltersChange} onRefresh={onRefresh} />
      <div className="research-master-detail">
        <NewsFeed
          articles={articles}
          selectedArticleId={selectedArticle?.id ?? null}
          nowIso={nowIso}
          onSelect={onArticleSelect}
          onTickerSelect={onTickerSelect}
        />
        <NewsStoryDetail article={selectedArticle} onTickerSelect={onTickerSelect} />
      </div>
    </ResearchFrame>
  );
}

