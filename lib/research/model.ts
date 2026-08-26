import type {
  BreadthSnapshot,
  NewsFiltersValue,
  NewsRecentWindow,
  NewsSortDirection,
  NewsSortKey,
  OptionChainFilters,
  OptionChainRow,
  OptionMoneyness,
  ResearchDataStatus,
  ScannerCondition,
} from "./types";
import type { NewsArticle, OptionContract } from "@/types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 10);
}

export function isRecent(
  timestamp: string,
  nowIso: string,
  thresholdMinutes = 5,
): boolean {
  const timestampMs = Date.parse(timestamp);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - timestampMs;
  return age >= 0 && age <= thresholdMinutes * MINUTE_MS;
}

/** Parse a compact multi-ticker filter without binding the UI to a provider query shape. */
export function parseNewsTickers(value: string, maximum = 100): readonly string[] {
  const limit = Math.max(0, Math.trunc(maximum));
  const symbols = value
    .split(/[\s,;]+/)
    .map((item) => item.trim().toUpperCase().replace(/^\$/, "").replace(/[^A-Z0-9.-]/g, "").slice(0, 15))
    .filter((item) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(item));
  return [...new Set(symbols)].slice(0, limit);
}

export function newsSourceLabel(article: NewsArticle): string {
  const publisher = article.publisher.name.trim().split(/\s+[·|]\s+/)[0]?.trim();
  return publisher || article.source.toUpperCase();
}

export function newsReadKey(article: Pick<NewsArticle, "source" | "id">): string {
  return `${article.source.trim().toLowerCase()}:${article.id.trim()}`;
}

export function newsAgeMinutes(timestamp: string, nowIso: string): number | null {
  const publishedAt = Date.parse(timestamp);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(publishedAt) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - publishedAt) / MINUTE_MS));
}

export function formatNewsAge(timestamp: string, nowIso: string): string {
  const minutes = newsAgeMinutes(timestamp, nowIso);
  if (minutes === null) return "—";
  if (minutes < 1) return "NOW";
  if (minutes < 60) return `${minutes}M`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}H`;
  return `${Math.floor(minutes / (24 * 60))}D`;
}

interface EasternPublicationParts {
  readonly date: string;
  readonly time: string;
}

const EASTERN_PUBLICATION_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function easternPublicationParts(timestamp: string): EasternPublicationParts | null {
  const value = new Date(timestamp);
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Map(EASTERN_PUBLICATION_FORMATTER
    .formatToParts(value)
    .map((part) => [part.type, part.value]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  if (!year || !month || !day || !hour || !minute) return null;
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/**
 * Converts an inclusive New York calendar date into a safe provider UTC upper
 * bound. The one-millisecond subtraction keeps the following ET day out of the
 * upstream window; exact date matching is still enforced locally.
 */
export function easternInclusiveDateUpperBound(dateKey: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;

  const followingDay = new Date(Date.UTC(year, month - 1, day + 1));
  const targetLocal = Date.UTC(
    followingDay.getUTCFullYear(),
    followingDay.getUTCMonth(),
    followingDay.getUTCDate(),
  );
  // Midnight ET is always close to 05:00 UTC. Correct that guess from the
  // actual America/New_York calendar parts so daylight-saving changes remain exact.
  const guess = targetLocal + 5 * 60 * 60 * 1_000;
  const observed = easternPublicationParts(new Date(guess).toISOString());
  if (!observed) return null;
  const [observedYear, observedMonth, observedDay] = observed.date.split("-").map(Number);
  const [observedHour, observedMinute] = observed.time.split(":").map(Number);
  const observedLocal = Date.UTC(
    observedYear,
    observedMonth - 1,
    observedDay,
    observedHour,
    observedMinute,
  );
  return new Date(guess + targetLocal - observedLocal - 1).toISOString();
}

function matchesRecentWindow(
  publishedAt: string,
  recent: NewsRecentWindow,
  nowIso: string,
): boolean {
  if (recent === "all") return true;
  if (recent === "today") {
    const published = easternPublicationParts(publishedAt);
    const now = easternPublicationParts(nowIso);
    return Boolean(published && now && published.date === now.date);
  }
  const age = newsAgeMinutes(publishedAt, nowIso);
  return age !== null && age <= Number(recent);
}

function matchesPublicationTime(time: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (from && to && from > to) return time >= from || time <= to;
  if (from && time < from) return false;
  if (to && time > to) return false;
  return true;
}

/** Apply filters that are not consistently supported by both configured news providers. */
export function matchesNewsFilters(
  article: NewsArticle,
  filters: NewsFiltersValue,
  nowIso: string,
): boolean {
  const publication = easternPublicationParts(article.publishedAt);
  if (!publication) return false;
  if (filters.dateFrom && publication.date < filters.dateFrom) return false;
  if (filters.dateTo && publication.date > filters.dateTo) return false;
  if (!matchesPublicationTime(publication.time, filters.timeFrom, filters.timeTo)) return false;
  if (!matchesRecentWindow(article.publishedAt, filters.recent, nowIso)) return false;
  if (filters.source && newsSourceLabel(article) !== filters.source) return false;
  if (filters.category !== "all" && !article.categories.includes(filters.category)) return false;
  const keyword = filters.keyword.trim().toLowerCase();
  if (keyword && ![
    article.title,
    article.summary ?? "",
    article.body ?? "",
    ...article.keywords,
  ].join(" ").toLowerCase().includes(keyword)) return false;
  return true;
}

function sortableNewsValue(
  article: NewsArticle,
  key: NewsSortKey,
  nowIso: string,
): string | number | null {
  if (key === "publishedAt") {
    const timestamp = Date.parse(article.publishedAt);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (key === "age") return newsAgeMinutes(article.publishedAt, nowIso);
  if (key === "ticker") return article.tickers[0]?.toUpperCase() ?? "";
  if (key === "headline") return article.title.toLowerCase();
  if (key === "category") return article.categories[0] ?? "other";
  return newsSourceLabel(article).toLowerCase();
}

export function sortNewsArticles(
  articles: readonly NewsArticle[],
  key: NewsSortKey,
  direction: NewsSortDirection,
  nowIso: string,
): readonly NewsArticle[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...articles].sort((left, right) => {
    const leftValue = sortableNewsValue(left, key, nowIso);
    const rightValue = sortableNewsValue(right, key, nowIso);
    if (leftValue === null) return rightValue === null ? left.id.localeCompare(right.id) : 1;
    if (rightValue === null) return -1;
    const compared = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue));
    return compared * multiplier || left.id.localeCompare(right.id);
  });
}

export function formatCountdown(startsAt: string, nowIso: string): string {
  const difference = Date.parse(startsAt) - Date.parse(nowIso);
  if (!Number.isFinite(difference)) return "DATE UNAVAILABLE";
  if (difference < -MINUTE_MS) return "STARTED";
  if (difference <= MINUTE_MS) return "STARTING NOW";
  if (difference < DAY_MS) {
    const hours = Math.max(1, Math.ceil(difference / (60 * MINUTE_MS)));
    return `IN ${hours} ${hours === 1 ? "HOUR" : "HOURS"}`;
  }
  const days = Math.ceil(difference / DAY_MS);
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
}

function moneyness(
  type: OptionContract["type"],
  strike: number,
  underlyingPrice: number,
  atmTolerance: number,
): OptionMoneyness {
  const distance = Math.abs(strike - underlyingPrice) / Math.max(underlyingPrice, 0.01);
  if (distance <= atmTolerance) return "atm";
  if (type === "call") return strike < underlyingPrice ? "itm" : "otm";
  return strike > underlyingPrice ? "itm" : "otm";
}

export function groupOptionsByStrike(
  contracts: readonly OptionContract[],
  underlyingPrice: number,
  atmTolerance = 0.005,
): OptionChainRow[] {
  const strikes = new Map<number, { call: OptionContract | null; put: OptionContract | null }>();
  for (const contract of contracts) {
    const row = strikes.get(contract.strikePrice) ?? { call: null, put: null };
    row[contract.type] = contract;
    strikes.set(contract.strikePrice, row);
  }

  return [...strikes.entries()]
    .sort(([left], [right]) => left - right)
    .map(([strikePrice, contractsAtStrike]) => ({
      strikePrice,
      ...contractsAtStrike,
      callMoneyness: moneyness("call", strikePrice, underlyingPrice, atmTolerance),
      putMoneyness: moneyness("put", strikePrice, underlyingPrice, atmTolerance),
    }));
}

function reportedVolumeToOpenInterest(contract: OptionContract): number | null {
  if (
    contract.volume === null
    || contract.openInterest === null
    || contract.openInterest <= 0
  ) return null;
  return contract.volume / contract.openInterest;
}

/** Applies only reported option fields; missing values never pass numeric filters. */
export function filterOptionContracts(
  contracts: readonly OptionContract[],
  filters: OptionChainFilters,
  underlyingPrice: number,
): OptionContract[] {
  return contracts.filter((contract) => {
    if (filters.expirationDate && contract.expirationDate !== filters.expirationDate) return false;
    if (filters.contractType !== "all" && contract.type !== filters.contractType) return false;
    if (filters.strikeMin !== null && contract.strikePrice < filters.strikeMin) return false;
    if (filters.strikeMax !== null && contract.strikePrice > filters.strikeMax) return false;
    if (filters.minimumVolume !== null && (contract.volume === null || contract.volume < filters.minimumVolume)) return false;
    if (filters.minimumOpenInterest !== null && (contract.openInterest === null || contract.openInterest < filters.minimumOpenInterest)) return false;

    if (filters.minimumVolumeToOpenInterest !== null) {
      const ratio = reportedVolumeToOpenInterest(contract);
      if (ratio === null || ratio < filters.minimumVolumeToOpenInterest) return false;
    }
    if (filters.impliedVolatilityMin !== null) {
      if (contract.impliedVolatility === null || contract.impliedVolatility * 100 < filters.impliedVolatilityMin) return false;
    }
    if (filters.impliedVolatilityMax !== null) {
      if (contract.impliedVolatility === null || contract.impliedVolatility * 100 > filters.impliedVolatilityMax) return false;
    }
    const delta = contract.greeks.delta;
    if (filters.deltaMin !== null && (delta === null || delta < filters.deltaMin)) return false;
    if (filters.deltaMax !== null && (delta === null || delta > filters.deltaMax)) return false;
    if (
      filters.moneyness !== "all"
      && moneyness(contract.type, contract.strikePrice, underlyingPrice, 0.005) !== filters.moneyness
    ) return false;
    return true;
  });
}

export function calculateDaysToExpiration(expirationDate: string, nowIso: string): number | null {
  const expiration = Date.parse(`${expirationDate}T20:00:00Z`);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(expiration) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.ceil((expiration - now) / DAY_MS));
}

export function calculateBreadthPercentages(snapshot: BreadthSnapshot): {
  advancing: number;
  declining: number;
  unchanged: number;
} {
  const total = snapshot.advancing + snapshot.declining + snapshot.unchanged;
  if (total <= 0) return { advancing: 0, declining: 0, unchanged: 0 };
  return {
    advancing: (snapshot.advancing / total) * 100,
    declining: (snapshot.declining / total) * 100,
    unchanged: (snapshot.unchanged / total) * 100,
  };
}

export function describeScannerCondition(condition: ScannerCondition): string {
  const operatorLabels: Record<ScannerCondition["operator"], string> = {
    "greater-than": ">",
    "greater-than-or-equal": "≥",
    "less-than": "<",
    "less-than-or-equal": "≤",
    equal: "=",
    between: "BETWEEN",
    in: "IN",
  };
  const suffix = condition.unit ? ` ${condition.unit}` : "";
  const second =
    condition.operator === "between" && condition.secondaryValue !== undefined
      ? ` AND ${condition.secondaryValue}${suffix}`
      : "";
  return `${condition.field.replaceAll("-", " ").toUpperCase()} ${operatorLabels[condition.operator]} ${condition.value}${suffix}${second}`;
}

export function dataStatusTone(status: ResearchDataStatus): "positive" | "warning" | "negative" | "neutral" {
  if (status.mode === "live") return "positive";
  if (status.mode === "unavailable") return "negative";
  if (status.mode === "mock" || status.mode === "delayed") return "warning";
  return "neutral";
}
