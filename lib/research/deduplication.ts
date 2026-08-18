import type { CorporateEvent, NewsArticle } from "@/types";

function normalizedText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    const normalized = normalizedText(value);
    return normalized || null;
  }
}

function latestTimestamp(...values: readonly (string | null | undefined)[]): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return valid[0] ?? null;
}

function richestText(
  left: string | null,
  right: string | null,
): string | null {
  if (!left) return right;
  if (!right) return left;
  return right.length > left.length ? right : left;
}

function uniqueStrings<T extends string>(
  left: readonly T[],
  right: readonly T[],
): readonly T[] {
  return [...new Set([...left, ...right])];
}

/** Stable key shared by overlapping ticker, watchlist, and global news queries. */
export function newsDedupeKey(article: NewsArticle): string {
  const url = normalizedUrl(article.articleUrl);
  if (url) return `news:url:${url}`;
  if (article.id.trim()) {
    return `news:id:${normalizedText(article.source)}:${normalizedText(article.id)}`;
  }
  return [
    "news:fingerprint",
    normalizedText(article.publisher.name),
    normalizedText(article.title),
    article.publishedAt,
  ].join(":");
}

function mergeNewsArticle(left: NewsArticle, right: NewsArticle): NewsArticle {
  const richer = (right.body?.length ?? 0) + (right.summary?.length ?? 0)
    > (left.body?.length ?? 0) + (left.summary?.length ?? 0)
    ? right
    : left;
  return {
    ...richer,
    summary: richestText(left.summary, right.summary),
    body: richestText(left.body, right.body),
    articleUrl: left.articleUrl ?? right.articleUrl,
    imageUrl: left.imageUrl ?? right.imageUrl,
    updatedAt: latestTimestamp(left.updatedAt, right.updatedAt),
    tickers: uniqueStrings(left.tickers, right.tickers),
    categories: uniqueStrings(left.categories, right.categories),
    keywords: uniqueStrings(left.keywords, right.keywords),
    asOf: latestTimestamp(left.asOf, right.asOf) ?? richer.asOf,
  };
}

export function dedupeNewsArticles(
  articles: readonly NewsArticle[],
): readonly NewsArticle[] {
  const unique = new Map<string, NewsArticle>();
  for (const article of articles) {
    const key = newsDedupeKey(article);
    const existing = unique.get(key);
    unique.set(key, existing ? mergeNewsArticle(existing, article) : article);
  }
  return [...unique.values()].sort((left, right) =>
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
      || left.id.localeCompare(right.id));
}

/** Stable key shared by overlapping ticker, watchlist, and calendar event queries. */
export function eventDedupeKey(event: CorporateEvent): string {
  const url = normalizedUrl(event.eventUrl);
  if (url) return `event:url:${url}`;
  if (event.id.trim()) {
    return `event:id:${normalizedText(event.source)}:${normalizedText(event.id)}`;
  }
  return [
    "event:fingerprint",
    normalizedText(event.symbol),
    event.type,
    event.startsAt,
    normalizedText(event.title),
  ].join(":");
}

function mergeCorporateEvent(
  left: CorporateEvent,
  right: CorporateEvent,
): CorporateEvent {
  const latest = Date.parse(right.asOf) > Date.parse(left.asOf) ? right : left;
  return {
    ...latest,
    description: richestText(left.description, right.description),
    eventUrl: left.eventUrl ?? right.eventUrl,
    endsAt: latestTimestamp(left.endsAt, right.endsAt),
    asOf: latestTimestamp(left.asOf, right.asOf) ?? latest.asOf,
  };
}

export function dedupeCorporateEvents(
  events: readonly CorporateEvent[],
): readonly CorporateEvent[] {
  const unique = new Map<string, CorporateEvent>();
  for (const event of events) {
    const key = eventDedupeKey(event);
    const existing = unique.get(key);
    unique.set(key, existing ? mergeCorporateEvent(existing, event) : event);
  }
  return [...unique.values()].sort((left, right) =>
    Date.parse(left.startsAt) - Date.parse(right.startsAt)
      || left.id.localeCompare(right.id));
}
