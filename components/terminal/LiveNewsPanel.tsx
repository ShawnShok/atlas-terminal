"use client";

import { useEffect, useMemo, useState } from "react";

import { NewsTerminal } from "@/components/research";
import type { NewsFiltersValue } from "@/lib/research";
import { useResearchData } from "@/hooks/useResearchData";
import type {
  NewsArticle,
  NewsCategory,
  NewsResearchBundle,
  SecurityClassification,
} from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

const CORE_WATCHLIST = new Set(["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "META", "PLTR", "TSLA"]);
const SCOPE_CATEGORY: Readonly<Partial<Record<NewsFiltersValue["scope"], NewsCategory>>> = {
  breaking: "breaking",
  earnings: "earnings",
  analyst: "analyst",
  "mergers-acquisitions": "mergers-acquisitions",
  fda: "fda",
  guidance: "guidance",
  macro: "macro",
};

function LiveNewsPanelInner({ ticker, onTickerSelect }: { ticker: string; onTickerSelect: (ticker: string) => void }) {
  const [filters, setFilters] = useState<NewsFiltersValue>({
    scope: "ticker",
    ticker,
    sector: "",
    category: "all",
    date: "",
    keyword: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const scopedCategory = SCOPE_CATEGORY[filters.scope];
  const params = useMemo(() => ({
    ticker: filters.ticker || ticker,
    all: filters.scope !== "ticker",
    category: filters.category === "all" ? scopedCategory : filters.category,
    after: filters.date ? `${filters.date}T00:00:00.000Z` : undefined,
    q: filters.keyword || undefined,
  }), [filters.category, filters.date, filters.keyword, filters.scope, filters.ticker, scopedCategory, ticker]);
  const result = useResearchData<NewsResearchBundle>("news", params, { refreshMs: 30_000, retainMs: 20_000 });
  const baseArticles = useMemo(() => (result.data?.articles ?? []).filter((article) => {
    if (filters.scope === "watchlist" && !article.tickers.some((symbol) => CORE_WATCHLIST.has(symbol))) return false;
    if (filters.date && article.publishedAt.slice(0, 10) !== filters.date) return false;
    return true;
  }), [filters.date, filters.scope, result.data?.articles]);
  const allArticleSymbols = useMemo(() => [...new Set(baseArticles.flatMap((article) =>
    article.tickers.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)))].sort(), [baseArticles]);
  // The shared API ticker parser intentionally caps one request at 100 symbols.
  const classificationSymbols = useMemo(() => allArticleSymbols.slice(0, 100), [allArticleSymbols]);
  const classificationParams = useMemo(() => ({
    symbols: classificationSymbols.join(","),
  }), [classificationSymbols]);
  const classifications = useResearchData<readonly SecurityClassification[]>(
    "classifications",
    classificationParams,
    {
      enabled: classificationSymbols.length > 0,
      refreshMs: 5 * 60_000,
      retainMs: 5 * 60_000,
    },
  );
  const classificationBySymbol = useMemo(() => new Map(
    (classifications.data ?? []).map((classification) => [classification.symbol.toUpperCase(), classification]),
  ), [classifications.data]);
  const availableSectors = useMemo(() => {
    const choices = [...new Set((classifications.data ?? [])
      .map((classification) => classification.sector?.trim())
      .filter((sector): sector is string => Boolean(sector)))].sort((left, right) => left.localeCompare(right));
    if (filters.sector && !choices.includes(filters.sector)) choices.push(filters.sector);
    return choices;
  }, [classifications.data, filters.sector]);
  const articles = useMemo(() => {
    if (!filters.sector) return baseArticles;
    return baseArticles.filter((article) => article.tickers.some((symbol) =>
      classificationBySymbol.get(symbol.toUpperCase())?.sector === filters.sector));
  }, [baseArticles, classificationBySymbol, filters.sector]);
  const selected = articles.find((article) => article.id === selectedId) ?? articles[0] ?? null;

  if (!result.data) return <DataState loading={result.loading} error={result.error} onRetry={result.reload} />;
  const baseStatus = researchStatus(result.meta, result.error);
  const enrichmentMessages: string[] = [];
  if (allArticleSymbols.length > classificationSymbols.length) {
    enrichmentMessages.push(`Sector enrichment is limited to ${classificationSymbols.length} of ${allArticleSymbols.length} article symbols.`);
  }
  if (classifications.error) {
    enrichmentMessages.push(`Sector classification enrichment unavailable: ${classifications.error.message}`);
  } else if (classifications.loading && !classifications.data) {
    enrichmentMessages.push("Sector classification enrichment is loading.");
  } else if (classifications.data) {
    const enrichedSymbols = new Set(classifications.data
      .filter((classification) => Boolean(classification.sector))
      .map((classification) => classification.symbol.toUpperCase()));
    const missingCount = classificationSymbols.filter((symbol) => !enrichedSymbols.has(symbol)).length;
    if (missingCount > 0) {
      enrichmentMessages.push(`${missingCount} article symbol${missingCount === 1 ? " has" : "s have"} no sector classification and ${missingCount === 1 ? "is" : "are"} excluded from sector-filtered results.`);
    }
  }
  const status = enrichmentMessages.length > 0
    ? {
        ...baseStatus,
        message: [baseStatus.message, ...enrichmentMessages].filter(Boolean).join(" · "),
      }
    : baseStatus;
  return (
    <NewsTerminal
      status={status}
      filters={filters}
      sectors={availableSectors}
      articles={articles}
      selectedArticle={selected}
      nowIso={nowIso}
      headlineMode
      onFiltersChange={setFilters}
      onArticleSelect={(article: NewsArticle) => setSelectedId(article.id)}
      onTickerSelect={onTickerSelect}
      onRefresh={() => {
        result.reload();
        classifications.reload();
      }}
    />
  );
}

export function LiveNewsPanel(props: { ticker: string; onTickerSelect: (ticker: string) => void }) {
  return <LiveNewsPanelInner key={props.ticker} {...props} />;
}
