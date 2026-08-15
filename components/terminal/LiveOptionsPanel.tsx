"use client";

import { useMemo, useState } from "react";

import { OptionsTerminal } from "@/components/research";
import {
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
  optionMidpoint,
  type StrategyOptionLeg,
} from "@/lib/options";
import { useResearchData } from "@/hooks/useResearchData";
import type { AggregateBar, OptionChainBundle, OptionContract, SecurityResearchBundle } from "@/types";

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
  strikeMin: null,
  strikeMax: null,
  minimumVolume: null,
  minimumOpenInterest: null,
};

const EMPTY_DRAFT: StrategyLegDraft = {
  side: "buy",
  quantity: 1,
  contractSymbol: "",
  premium: null,
};

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
  const security = useResearchData<SecurityResearchBundle>("security", { ticker, range: "1M" }, { refreshMs: 15_000, retainMs: 10_000 });

  const contracts = useMemo(() => (chain.data?.contracts ?? []).filter((contract) =>
    (filters.strikeMin === null || contract.strikePrice >= filters.strikeMin)
    && (filters.strikeMax === null || contract.strikePrice <= filters.strikeMax)
    && (filters.minimumVolume === null || (contract.volume ?? -1) >= filters.minimumVolume)
    && (filters.minimumOpenInterest === null || (contract.openInterest ?? -1) >= filters.minimumOpenInterest),
  ), [chain.data?.contracts, filters.minimumOpenInterest, filters.minimumVolume, filters.strikeMax, filters.strikeMin]);
  const underlyingPrice = chain.data?.underlyingPrice ?? security.data?.snapshot.quote.lastPrice ?? 0;
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
  const unusual = findUnusualOptionActivity(contracts, { minimumVolume: 100, minimumVolumeToOpenInterest: 1.5 }).slice(0, 12);
  const activityMetrics: OptionActivityMetric[] = [
    { label: "PUT / CALL VOLUME", value: ratios.volumeRatio, detail: `${ratios.putVolume.toLocaleString()} puts / ${ratios.callVolume.toLocaleString()} calls` },
    { label: "PUT / CALL OI", value: ratios.openInterestRatio, detail: "Prior-session ending open interest" },
    { label: "CONTRACTS", value: contracts.length, detail: "Selected expiration and filters" },
  ];
  const activityCandidates: OptionActivityCandidate[] = unusual.map((item) => ({
    contract: item.contract,
    volumeToOpenInterest: item.volumeToOpenInterest,
    volumeVsBaseline: null,
    reason: item.observation,
  }));
  const strategy = analyzeResearchStrategy(template, legs, Math.max(underlyingPrice, 0.01));
  const quote = security.data?.snapshot.quote;
  const underlying: OptionsUnderlying | null = quote ? {
    symbol: ticker,
    name: security.data?.details.name ?? ticker,
    quote,
    ivRank: null,
    ivPercentile: null,
  } : null;

  if (!chain.data || !underlying) {
    return <DataState loading={chain.loading || security.loading} error={chain.error ?? security.error} onRetry={() => { chain.reload(); security.reload(); }} />;
  }
  const effectiveFilters = {
    ...filters,
    expirationDate: filters.expirationDate || chain.data.selectedExpiration || "",
  };
  const status = researchStatus(chain.meta, chain.error);
  const effectiveStatus = contractChart.error
    ? { ...status, message: [status.message, `Contract chart unavailable: ${contractChart.error.message}`].filter(Boolean).join(" · ") }
    : status;
  return (
    <OptionsTerminal
      status={effectiveStatus}
      underlying={underlying}
      filters={effectiveFilters}
      expirationDates={chain.data.expirations}
      nowIso={nowIso}
      rows={rows}
      selectedContract={selectedContract}
      selectedContractBars={contractChart.data ?? []}
      selectedBreakEven={selectedContract ? optionBreakEven(
        selectedContract.type,
        selectedContract.strikePrice,
        optionMidpoint(selectedContract.bidPrice, selectedContract.askPrice) ?? selectedContract.lastPrice ?? 0,
      ) : null}
      activityMetrics={activityMetrics}
      activityCandidates={activityCandidates}
      strategy={strategy}
      strategyDraft={draft}
      strategyContracts={contracts}
      onFiltersChange={setFilters}
      onContractSelect={(contract: OptionContract) => setSelectedSymbol(contract.symbol)}
      onStrategyTemplateChange={setTemplate}
      onStrategyDraftChange={setDraft}
      onStrategyAddLeg={() => {
        const contract = contracts.find((candidate) => candidate.symbol === draft.contractSymbol);
        if (!contract) return;
        const premium = draft.premium ?? optionMidpoint(contract.bidPrice, contract.askPrice) ?? contract.lastPrice;
        if (premium === null) return;
        setLegs((current) => [...current, {
          id: `leg-${Date.now().toString(36)}`,
          side: draft.side,
          quantity: Math.max(1, Math.trunc(draft.quantity)),
          contract,
          premium,
        }]);
      }}
      onStrategyRemoveLeg={(legId) => setLegs((current) => current.filter((leg) => leg.id !== legId))}
    />
  );
}
