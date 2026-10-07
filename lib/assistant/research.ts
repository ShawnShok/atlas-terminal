import type {
  AggregateBar,
  CorporateEvent,
  FinancialRatioPoint,
  NewsArticle,
  OptionChainBundle,
  Snapshot,
  TickerDetails,
} from "@/types";
import { calculatePutCallRatios, findUnusualOptionActivity } from "@/lib/options";
import { detectResearchPatterns, type PatternDetection } from "@/lib/analytics";

export type AssistantTerminalView =
  | "security"
  | "chart"
  | "financials"
  | "news"
  | "events"
  | "options"
  | "options-surface"
  | "timeline";

export interface AssistantResearchContext {
  readonly ticker: string;
  readonly snapshot: Snapshot | null;
  readonly details: TickerDetails | null;
  readonly bars: readonly AggregateBar[];
  readonly news: readonly NewsArticle[];
  readonly events: readonly CorporateEvent[];
  readonly options: OptionChainBundle | null;
  readonly ratios: readonly FinancialRatioPoint[];
  readonly unavailable: readonly string[];
  readonly source: string;
  readonly asOf: string;
}

export interface AssistantEvidence {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly view: AssistantTerminalView;
}

export interface AssistantReply {
  readonly headline: string;
  readonly summary: string;
  readonly sections: readonly {
    readonly title: string;
    readonly body: string;
  }[];
  readonly evidence: readonly AssistantEvidence[];
  readonly followUps: readonly string[];
  readonly confidence: "high" | "medium" | "limited";
  readonly source: string;
  readonly asOf: string;
  readonly disclaimer: string;
}

type AssistantIntent =
  | "options"
  | "catalysts"
  | "technicals"
  | "fundamentals"
  | "risk"
  | "thesis"
  | "overview";

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentChange(first: number | null | undefined, last: number | null | undefined): number | null {
  if (first === null || first === undefined || last === null || last === undefined || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "unavailable" : `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "unavailable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "unavailable";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function intentFor(question: string): AssistantIntent {
  const normalized = question.toLowerCase();
  if (/\b(option|options|call|calls|put|puts|iv|volatility|gamma|delta|open interest|oi)\b/.test(normalized)) return "options";
  if (/\b(news|headline|catalyst|earnings|event|why|move today|moving today)\b/.test(normalized)) return "catalysts";
  if (/\b(chart|technical|pattern|support|resistance|trend|breakout|breakdown|momentum)\b/.test(normalized)) return "technicals";
  if (/\b(fundamental|valuation|financial|revenue|margin|cash flow|balance sheet|ratio)\b/.test(normalized)) return "fundamentals";
  if (/\b(risk|bear|downside|wrong|invalid|concern|weakness)\b/.test(normalized)) return "risk";
  if (/\b(thesis|bull|setup|opportunity|case for|case against)\b/.test(normalized)) return "thesis";
  return "overview";
}

function normalizedBars(bars: readonly AggregateBar[]): readonly AggregateBar[] {
  return [...bars]
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function technicalState(context: AssistantResearchContext) {
  const bars = normalizedBars(context.bars);
  const latest = bars.at(-1) ?? null;
  const five = bars.length > 5 ? percentChange(bars.at(-6)?.close, latest?.close) : null;
  const twenty = bars.length > 20 ? percentChange(bars.at(-21)?.close, latest?.close) : null;
  const sixty = bars.length > 60 ? percentChange(bars.at(-61)?.close, latest?.close) : null;
  const recent = bars.slice(-20);
  const support = recent.length ? Math.min(...recent.map((bar) => bar.low)) : null;
  const resistance = recent.length ? Math.max(...recent.map((bar) => bar.high)) : null;
  const averageVolume = average(recent.slice(0, -1).map((bar) => bar.volume).filter((value) => value >= 0));
  const relativeVolume = latest && averageVolume && averageVolume > 0 ? latest.volume / averageVolume : null;
  let patterns: readonly PatternDetection[] = [];
  try {
    patterns = detectResearchPatterns(bars.slice(-80));
  } catch {
    patterns = [];
  }
  return { bars, latest, five, twenty, sixty, support, resistance, relativeVolume, patterns };
}

function setupLabel(change: number | null, twenty: number | null, pattern: PatternDetection | null): string {
  let score = 0;
  if (change !== null) score += change > 0.4 ? 1 : change < -0.4 ? -1 : 0;
  if (twenty !== null) score += twenty > 2 ? 1 : twenty < -2 ? -1 : 0;
  if (pattern?.pattern === "double-bottom" || pattern?.pattern === "ascending-triangle" || pattern?.pattern === "bullish-pennant") score += 1;
  if (pattern?.pattern === "double-top" || pattern?.pattern === "descending-triangle" || pattern?.pattern === "bearish-pennant") score -= 1;
  return score >= 2 ? "constructive" : score <= -2 ? "fragile" : "mixed";
}

function patternName(pattern: PatternDetection | null): string {
  return pattern ? `${pattern.phase} ${pattern.pattern.replaceAll("-", " ")}` : "no high-confidence pattern";
}

function overviewSection(context: AssistantResearchContext, technical: ReturnType<typeof technicalState>) {
  const quote = context.snapshot?.quote ?? null;
  const company = context.details?.name ?? context.ticker;
  return {
    title: "Market read",
    body: `${company} is at ${formatPrice(quote?.lastPrice)} (${formatPercent(quote?.changePercent)} for the reported session). `
      + `The five-session move is ${formatPercent(technical.five)} and the 20-session move is ${formatPercent(technical.twenty)}. `
      + `Reported volume is ${formatCompact(quote?.volume)}${technical.relativeVolume === null ? "" : `, or ${technical.relativeVolume.toFixed(2)}× its recent daily baseline`}.`,
  };
}

function technicalSection(context: AssistantResearchContext, technical: ReturnType<typeof technicalState>) {
  const pattern = technical.patterns[0] ?? null;
  return {
    title: "Technical structure",
    body: pattern
      ? `${pattern.analysis} Model confidence is ${Math.round(pattern.confidence * 100)}%; volume confirmation is ${pattern.volumeConfirmation ? "present" : "not present"}.`
      : `No high-confidence classical pattern is active in the latest window. The observable 20-session range is ${formatPrice(technical.support)} to ${formatPrice(technical.resistance)}; those are descriptive levels, not price targets.`,
  };
}

function catalystSection(context: AssistantResearchContext) {
  const latestNews = context.news[0] ?? null;
  const nextEvent = context.events
    .filter((event) => event.status !== "canceled" && Date.parse(event.startsAt) >= Date.parse(context.asOf))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null;
  const newsText = latestNews
    ? `The latest matched headline is “${latestNews.title}” from ${latestNews.publisher.name}, published ${formatDate(latestNews.publishedAt)}.`
    : "No matched headline was returned by the available feed.";
  const eventText = nextEvent
    ? ` The next listed event is ${nextEvent.title} on ${formatDate(nextEvent.startsAt)} (${nextEvent.status}).`
    : " No upcoming company event was returned in the current window.";
  return { title: "Catalysts", body: newsText + eventText };
}

function optionsSection(context: AssistantResearchContext) {
  const bundle = context.options;
  if (!bundle || bundle.contracts.length === 0) {
    return { title: "Options positioning", body: "The options feed did not return enough contracts to make a positioning observation." };
  }
  const ratios = calculatePutCallRatios(bundle.contracts);
  const unusual = findUnusualOptionActivity(bundle.contracts, {
    minimumVolume: 100,
    minimumOpenInterest: 50,
    minimumVolumeToOpenInterest: 1.5,
  })[0] ?? null;
  const ratioText = ratios.volumeRatio === null
    ? "Put/call volume is unavailable"
    : `Put/call volume is ${ratios.volumeRatio.toFixed(2)}×`;
  const unusualText = unusual
    ? ` The most elevated reported volume/open-interest contract is ${unusual.contract.symbol} at ${unusual.volumeToOpenInterest?.toFixed(2) ?? "—"}×.`
    : " No contract crossed the assistant's elevated volume/open-interest threshold.";
  return {
    title: "Options positioning",
    body: `${ratioText} across ${bundle.contracts.length.toLocaleString()} loaded contracts for ${bundle.selectedExpiration ?? "the nearest available expiration"}.${unusualText} This describes activity, not trader direction or intent.`,
  };
}

function fundamentalSection(context: AssistantResearchContext) {
  const display = context.ratios.filter((ratio) => ratio.value !== null).slice(0, 4);
  if (display.length === 0) {
    return { title: "Fundamental context", body: "The current data entitlement did not return comparable financial ratios, so ATLAS is not filling the gap with estimates." };
  }
  return {
    title: "Fundamental context",
    body: display.map((ratio) => `${ratio.label}: ${ratio.format === "percent" ? formatPercent((ratio.value as number) * 100) : (ratio.value as number).toFixed(2)}`).join(" · ")
      + ". These are reported/provider-derived ratios and should be checked against the underlying filings.",
  };
}

function riskSection(context: AssistantResearchContext, technical: ReturnType<typeof technicalState>) {
  const quote = context.snapshot?.quote ?? null;
  const risks: string[] = [];
  if (technical.twenty !== null && technical.twenty < -2) risks.push(`20-session momentum is negative at ${formatPercent(technical.twenty)}`);
  if (quote?.lastPrice !== null && quote?.lastPrice !== undefined && technical.support !== null) {
    risks.push(`a close below the observed ${formatPrice(technical.support)} support area would weaken the current structure`);
  }
  if (context.events.some((event) => /earnings/i.test(event.type))) risks.push("a listed earnings event can increase gap and volatility risk");
  if (context.unavailable.length) risks.push(`some evidence is unavailable (${context.unavailable.join(", ")})`);
  if (risks.length === 0) risks.push("price, headline, event, and options data can change faster than this snapshot refreshes");
  return { title: "What could invalidate the read", body: `${risks.join("; ")}.` };
}

function evidenceFor(context: AssistantResearchContext, technical: ReturnType<typeof technicalState>): readonly AssistantEvidence[] {
  const quote = context.snapshot?.quote ?? null;
  const pattern = technical.patterns[0] ?? null;
  const latestNews = context.news[0] ?? null;
  const nextEvent = context.events.filter((event) => Date.parse(event.startsAt) >= Date.parse(context.asOf)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
  const evidence: AssistantEvidence[] = [];
  if (quote) evidence.push({ label: "PRICE", value: formatPrice(quote.lastPrice), detail: `${formatPercent(quote.changePercent)} · ${quote.session}`, view: "security" });
  if (technical.latest) evidence.push({ label: "20D RANGE", value: `${formatPrice(technical.support)}–${formatPrice(technical.resistance)}`, detail: `${formatPercent(technical.twenty)} performance`, view: "chart" });
  if (pattern) evidence.push({ label: "PATTERN", value: pattern.pattern.replaceAll("-", " ").toUpperCase(), detail: `${pattern.phase} · ${Math.round(pattern.confidence * 100)}% model confidence`, view: "chart" });
  if (latestNews) evidence.push({ label: "LATEST NEWS", value: latestNews.publisher.name.toUpperCase(), detail: latestNews.title, view: "news" });
  if (nextEvent) evidence.push({ label: "NEXT EVENT", value: formatDate(nextEvent.startsAt).toUpperCase(), detail: nextEvent.title, view: "events" });
  if (context.options?.contracts.length) evidence.push({ label: "OPTIONS", value: `${context.options.contracts.length.toLocaleString()} CONTRACTS`, detail: context.options.selectedExpiration ?? "Nearest expiration", view: "options" });
  return evidence.slice(0, 6);
}

function followUps(intent: AssistantIntent, ticker: string): readonly string[] {
  const common = [
    `What are the key risks for ${ticker}?`,
    `Analyze ${ticker}'s options positioning`,
    `What catalysts are coming for ${ticker}?`,
  ];
  if (intent === "technicals") return [`What confirms or invalidates this pattern?`, ...common.slice(1)];
  if (intent === "options") return [`Where is ${ticker}'s unusual options activity?`, `Show the IV surface`, common[0]];
  if (intent === "catalysts") return [`How did ${ticker} react to recent catalysts?`, common[0], common[1]];
  return common;
}

export function buildAssistantReply(question: string, context: AssistantResearchContext): AssistantReply {
  const intent = intentFor(question);
  const technical = technicalState(context);
  const pattern = technical.patterns[0] ?? null;
  const stance = setupLabel(context.snapshot?.quote.changePercent ?? null, technical.twenty, pattern);
  const sections = intent === "options"
    ? [optionsSection(context), technicalSection(context, technical), riskSection(context, technical)]
    : intent === "catalysts"
      ? [catalystSection(context), overviewSection(context, technical), riskSection(context, technical)]
      : intent === "technicals"
        ? [technicalSection(context, technical), overviewSection(context, technical), riskSection(context, technical)]
        : intent === "fundamentals"
          ? [fundamentalSection(context), overviewSection(context, technical), riskSection(context, technical)]
          : intent === "risk"
            ? [riskSection(context, technical), technicalSection(context, technical), catalystSection(context)]
            : intent === "thesis"
              ? [overviewSection(context, technical), catalystSection(context), optionsSection(context), riskSection(context, technical)]
              : [overviewSection(context, technical), technicalSection(context, technical), catalystSection(context), riskSection(context, technical)];
  const evidence = evidenceFor(context, technical);
  const availableGroups = [context.snapshot, technical.bars.length >= 20, context.news.length || context.events.length, context.options].filter(Boolean).length;
  const confidence = availableGroups >= 4 ? "high" : availableGroups >= 2 ? "medium" : "limited";
  return {
    headline: `${context.ticker} setup: ${stance}`,
    summary: `ATLAS reads the current ${context.ticker} setup as ${stance}. The leading chart observation is ${patternName(pattern)}; the conclusion is bounded to the live evidence cards below.`,
    sections,
    evidence,
    followUps: followUps(intent, context.ticker),
    confidence,
    source: context.source,
    asOf: context.asOf,
    disclaimer: "Research assistance only. This is not investment advice, a price target, or an instruction to trade.",
  };
}
