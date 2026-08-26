"use client";

import { useMemo, useState } from "react";

import { OptionsTerminal, type OptionActivityRanking } from "@/components/research";
import {
  filterOptionContracts,
  groupOptionsByStrike,
  type OptionActivityCandidate,
  type OptionActivityMetric,
  type OptionChainFilters,
  type OptionsUnderlying,
  type StrategyAnalysis,
  type StrategyLeg,
  type StrategyLegDraft,
  type StrategyTemplate,
} from "@/lib/research";
import {
  analyzeStrategyPayoff,
  calculatePutCallRatios,
  combineStrategyGreeks,
  createPayoffCurve,
  findUnusualOptionActivity,
  optionBreakEven,
  rankOptionContracts,
  summarizeOptionDistribution,
  type StrategyOptionLeg,
} from "@/lib/options";
import { useResearchData } from "@/hooks/useResearchData";
import type { AggregateBar, OptionChainBundle, OptionContract, OptionIvSurfaceBundle, Quote, SecurityResearchBundle } from "@/types";

import { DataState } from "./DataState";
import { researchStatus } from "./research-status";

const EMPTY_STRATEGY: StrategyAnalysis = {
  template: "custom",
  legs: [],
  netDebitCredit: 0,
  maximumGain: null,
  maximumLoss: null,
  breakEvenLevels: [],
  combinedGreeks: { delta: null, gamma: null, theta: null, vega: null, rho: null },
  payoff: [],
};

const EMPTY_FILTERS: OptionChainFilters = {
  expirationDate: "",
  contractType: "all",
  strikeMin: null,
  strikeMax: null,
  minimumVolume: null,
  minimumOpenInterest: null,
  minimumVolumeToOpenInterest: null,
  impliedVolatilityMin: null,
  impliedVolatilityMax: null,
  deltaMin: null,
  deltaMax: null,
  moneyness: "all",
};

const EMPTY_DRAFT: StrategyLegDraft = {
  side: "buy",
  quantity: 1,
  contractSymbol: "",
  premium: null,
};

function formatReportedTotal(value: number | null): string {
  return value === null ? "unavailable" : value.toLocaleString();
}

function sumReportedPair(left: number | null, right: number | null): number | null {
  const values = [left, right].filter((value): value is number => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function analyzeResearchStrategy(
  template: StrategyTemplate,
  legs: readonly StrategyLeg[],
  underlyingPrice: number,
): StrategyAnalysis {
  if (!legs.length) return { ...EMPTY_STRATEGY, template };
  const engineLegs: StrategyOptionLeg[] = legs.map((leg) => ({
    kind: "option",
    id: leg.id,
    type: leg.contract.type,
    side: leg.side === "buy" ? "long" : "short",
    strikePrice: leg.contract.strikePrice,
    premiumPerShare: leg.premium,
    quantity: leg.quantity,
    sharesPerContract: leg.contract.sharesPerContract,
    greeks: leg.contract.greeks,
  }));
  const payoff = analyzeStrategyPayoff(engineLegs);
  const greeks = combineStrategyGreeks(engineLegs).values;
  const maximumStrike = Math.max(...legs.map((leg) => leg.contract.strikePrice), underlyingPrice);
  return {
    template,
    legs,
    netDebitCredit: payoff.netOptionPremium,
    maximumGain: payoff.maxGainUnlimited ? null : payoff.maxGain,
    maximumLoss: payoff.maxLossUnlimited ? null : payoff.maxLoss,
    breakEvenLevels: payoff.breakEvenPrices,
    combinedGreeks: greeks,
    payoff: createPayoffCurve(engineLegs, {
      minimum: Math.max(0.01, underlyingPrice * 0.55),
      maximum: maximumStrike * 1.45,
      steps: 45,
    }),
  };
}

export function LiveOptionsPanel({ ticker }: { ticker: string }) {
  return <TickerScopedOptionsPanel key={ticker} ticker={ticker} />;
}

function TickerScopedOptionsPanel({ ticker }: { ticker: string }) {
  const [nowIso] = useState(() => new Date().toISOString());
  const [filters, setFilters] = useState<OptionChainFilters>(EMPTY_FILTERS);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [template, setTemplate] = useState<StrategyTemplate>("custom");
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const [draft, setDraft] = useState<StrategyLegDraft>(EMPTY_DRAFT);
  const chain = useResearchData<OptionChainBundle>("options", {
    ticker,
    expiration: filters.expirationDate || undefined,
  }, { refreshMs: 30_000, retainMs: 20_000 });
  const ivSurface = useResearchData<OptionIvSurfaceBundle>("options-surface", {
    ticker,
  }, { refreshMs: 120_000, retainMs: 60_000 });
  const security = useResearchData<SecurityResearchBundle>("security", { ticker, range: "1M" }, { refreshMs: 15_000, retainMs: 10_000 });

  const underlyingPrice = chain.data?.underlyingPrice ?? security.data?.snapshot.quote.lastPrice ?? 0;
  const effectiveExpiration = filters.expirationDate || chain.data?.selectedExpiration || "";
  const contracts = useMemo(() => filterOptionContracts(
    chain.data?.contracts ?? [],
    { ...filters, expirationDate: effectiveExpiration },
    Math.max(underlyingPrice, 0.01),
  ), [chain.data?.contracts, effectiveExpiration, filters, underlyingPrice]);
  const rows = useMemo(() => groupOptionsByStrike(contracts, Math.max(underlyingPrice, 0.01)), [contracts, underlyingPrice]);
  const selectedContract = contracts.find((contract) => contract.symbol === selectedSymbol)
    ?? [...contracts].sort((a, b) => Math.abs(a.strikePrice - underlyingPrice) - Math.abs(b.strikePrice - underlyingPrice))[0]
    ?? null;
  const contractChart = useResearchData<readonly AggregateBar[]>("option-chart", {
    contract: selectedContract?.symbol,
    range: "3M",
    interval: "1D",
  }, { enabled: Boolean(selectedContract), refreshMs: 60_000 });
  const ratios = calculatePutCallRatios(contracts);
  const unusual = findUnusualOptionActivity(contracts, {
    minimumVolume: filters.minimumVolume ?? 100,
    minimumOpenInterest: filters.minimumOpenInterest ?? 100,
    minimumVolumeToOpenInterest: filters.minimumVolumeToOpenInterest ?? 1.5,
  }).slice(0, 12);
  const activityMetrics: OptionActivityMetric[] = [
    {
      label: "PUT / CALL VOLUME",
      value: ratios.volumeRatio,
      format: "ratio",
      detail: `${formatReportedTotal(ratios.putVolume)} puts / ${formatReportedTotal(ratios.callVolume)} calls`,
      tooltip: "Reported put volume divided by reported call volume. Missing sides remain unavailable.",
    },
    {
      label: "PUT / CALL OI",
      value: ratios.openInterestRatio,
      format: "ratio",
      detail: `${formatReportedTotal(ratios.putOpenInterest)} puts / ${formatReportedTotal(ratios.callOpenInterest)} calls`,
      tooltip: "Reported put open interest divided by reported call open interest; open interest is generally a prior-session field.",
    },
    {
      label: "REPORTED VOLUME",
      value: sumReportedPair(ratios.putVolume, ratios.callVolume),
      detail: "Sum of contracts with reported volume",
      tooltip: "Descriptive total of available volume fields; unavailable values are not converted to zero.",
    },
    {
      label: "REPORTED OI",
      value: sumReportedPair(ratios.putOpenInterest, ratios.callOpenInterest),
      detail: "Prior-session ending open interest",
      tooltip: "Descriptive total of available open-interest fields; unavailable values are not converted to zero.",
    },
    { label: "CONTRACTS", value: contracts.length, detail: "Selected expiration and active filters" },
  ];
  const activityCandidates: OptionActivityCandidate[] = unusual.map((item) => ({
    contract: item.contract,
    volumeToOpenInterest: item.volumeToOpenInterest,
    volumeVsBaseline: null,
    reason: item.observation,
  }));
  const activityRankings: OptionActivityRanking[] = [
    {
      label: "TOP REPORTED VOLUME",
      detail: "Descriptive, not directional",
      metric: "volume",
      contracts: rankOptionContracts(contracts, "volume", 5),
    },
    {
      label: "TOP OPEN INTEREST",
      detail: "Prior-session positions outstanding",
      metric: "open-interest",
      contracts: rankOptionContracts(contracts, "open-interest", 5),
    },
    {
      label: "TOP VOLUME / OI",
      detail: "Requires reported volume and positive OI",
      metric: "volume-open-interest-ratio",
      contracts: rankOptionContracts(contracts, "volume-open-interest-ratio", 5),
    },
    {
      label: "TOP IMPLIED VOLATILITY",
      detail: "Provider-reported IV only",
      metric: "implied-volatility",
      contracts: rankOptionContracts(contracts, "implied-volatility", 5),
    },
  ];
  const strikeDistribution = summarizeOptionDistribution(contracts, "strike");
  const expirationDistribution = summarizeOptionDistribution(contracts, "expiration");
  const selectedStrategyLeg = selectedContract
    ? [...legs].reverse().find((leg) => leg.contract.symbol === selectedContract.symbol)
    : undefined;
  const draftPremium = selectedContract
    && draft.contractSymbol === selectedContract.symbol
    && draft.premium !== null
    && Number.isFinite(draft.premium)
    && draft.premium >= 0
    ? draft.premium
    : null;
  const selectedManualPremium = draftPremium ?? selectedStrategyLeg?.premium ?? null;
  const strategy = analyzeResearchStrategy(template, legs, Math.max(underlyingPrice, 0.01));
  const chainQuote: Quote | null = chain.data ? {
    symbol: ticker,
    lastPrice: chain.data.underlyingPrice,
    bidPrice: null,
    bidSize: null,
    askPrice: null,
    askSize: null,
    change: null,
    changePercent: null,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    volume: null,
    averageVolume: null,
    marketCap: null,
    vwap: null,
    session: "unknown",
    asOf: chain.data.asOf,
    quality: chain.data.quality,
    source: chain.meta?.mode === "mock" ? "mock" : "massive",
  } : null;
  const quote = security.data?.snapshot.quote ?? chainQuote;
  const underlying: OptionsUnderlying | null = quote ? {
    symbol: ticker,
    name: security.data?.details.name ?? ticker,
    quote,
    ivRank: null,
    ivPercentile: null,
  } : null;

  if (!chain.data || !underlying) {
    return <DataState loading={chain.loading} error={chain.error} onRetry={() => { chain.reload(); security.reload(); }} />;
  }
  const effectiveFilters = {
    ...filters,
    expirationDate: effectiveExpiration,
  };
  const status = researchStatus(chain.meta, chain.error);
  const effectiveMessage = [
    status.message,
    security.error ? `Underlying stock context unavailable; using option-chain fields: ${security.error.message}` : null,
    contractChart.error ? `Contract chart unavailable: ${contractChart.error.message}` : null,
  ].filter(Boolean).join(" · ");
  const effectiveStatus = effectiveMessage ? { ...status, message: effectiveMessage } : status;
  return (
    <OptionsTerminal
      status={effectiveStatus}
      underlying={underlying}
      hasContracts={chain.data.contracts.length > 0}
      filters={effectiveFilters}
      expirationDates={chain.data.expirations}
      nowIso={nowIso}
      chainAsOf={chain.data.asOf}
      quoteAvailability={chain.data.quoteAvailability}
      quoteNote={chain.data.quoteNote}
      rows={rows}
      ivSurface={ivSurface.data}
      ivSurfaceLoading={ivSurface.loading || ivSurface.refreshing}
      ivSurfaceError={ivSurface.error?.message ?? null}
      selectedContract={selectedContract}
      selectedContractBars={contractChart.data ?? []}
      selectedManualPremium={selectedManualPremium}
      selectedBreakEven={selectedContract && selectedManualPremium !== null ? optionBreakEven(
        selectedContract.type,
        selectedContract.strikePrice,
        selectedManualPremium,
      ) : null}
      activityMetrics={activityMetrics}
      activityCandidates={activityCandidates}
      activityRankings={activityRankings}
      strikeDistribution={strikeDistribution}
      expirationDistribution={expirationDistribution}
      strategy={strategy}
      strategyDraft={draft}
      strategyContracts={contracts}
      onFiltersChange={setFilters}
      onContractSelect={(contract: OptionContract) => setSelectedSymbol(contract.symbol)}
      onIvSurfaceRetry={ivSurface.reload}
      onIvSurfaceContractSelect={(expirationDate, contractSymbol) => {
        setFilters({ ...EMPTY_FILTERS, expirationDate });
        setSelectedSymbol(contractSymbol);
      }}
      onStrategyTemplateChange={setTemplate}
      onStrategyDraftChange={setDraft}
      onStrategyAddLeg={() => {
        const contract = contracts.find((candidate) => candidate.symbol === draft.contractSymbol);
        const premium = draft.premium;
        if (!contract || premium === null || !Number.isFinite(premium) || premium < 0) return;
        const quantity = Number.isFinite(draft.quantity) ? Math.max(1, Math.trunc(draft.quantity)) : 1;
        setLegs((current) => [...current, {
          id: `leg-${Date.now().toString(36)}`,
          side: draft.side,
          quantity,
          contract,
          premium,
        }]);
      }}
      onStrategyRemoveLeg={(legId) => setLegs((current) => current.filter((leg) => leg.id !== legId))}
    />
  );
}
