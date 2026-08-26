import type { OptionChainBundle, OptionContract } from "@/types";

export interface ScannerOptionsObservation {
  readonly available: boolean;
  /** Exact expiration whose contracts were aggregated for scanner metrics. */
  readonly selectedExpiration: string | null;
  /** Provider-reported selectable expirations; metrics still use selectedExpiration only. */
  readonly availableExpirations: readonly string[];
  /** Whether every provider page for the selected expiration was fetched. */
  readonly contractsComplete: boolean;
  readonly contractCount: number;
  readonly totalVolume: number | null;
  readonly totalOpenInterest: number | null;
  readonly volumeReportedContractCount: number;
  readonly openInterestReportedContractCount: number;
  readonly volumeOpenInterestPairedContractCount: number;
  readonly volumeComplete: boolean;
  readonly openInterestComplete: boolean;
  readonly callContractCount: number;
  readonly putContractCount: number;
  readonly callVolumeReportedContractCount: number;
  readonly putVolumeReportedContractCount: number;
  readonly callOpenInterestReportedContractCount: number;
  readonly putOpenInterestReportedContractCount: number;
  readonly callVolumeComplete: boolean;
  readonly putVolumeComplete: boolean;
  readonly callOpenInterestComplete: boolean;
  readonly putOpenInterestComplete: boolean;
  readonly volumeToOpenInterest: number | null;
  readonly callVolume: number | null;
  readonly putVolume: number | null;
  readonly callOpenInterest: number | null;
  readonly putOpenInterest: number | null;
  readonly callToPutVolumeRatio: number | null;
  readonly callToPutOpenInterestRatio: number | null;
  readonly averageImpliedVolatility: number | null;
  readonly reportedIvContractCount: number;
  readonly dteContractCount: number;
  readonly minimumDte: number | null;
  readonly maximumDte: number | null;
  readonly highestVolumeContract: string | null;
  readonly highestContractVolume: number | null;
  readonly highestOpenInterestContract: string | null;
  readonly highestContractOpenInterest: number | null;
  /** Reported option contracts converted with each contract's share multiplier. */
  readonly contractEquivalentShareVolume: number | null;
  readonly equivalentShareVolumeReportedContractCount: number;
  readonly equivalentShareVolumeComplete: boolean;
  readonly asOf: string | null;
  readonly quality: OptionChainBundle["quality"] | null;
  readonly quoteAvailability: OptionChainBundle["quoteAvailability"] | null;
}

const NEW_YORK_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface ReportedSum {
  readonly total: number | null;
  readonly count: number;
  readonly complete: boolean;
}

function reportedNonNegativeSum(
  contracts: readonly OptionContract[],
  value: (contract: OptionContract) => number | null,
): ReportedSum {
  const values = contracts.map(value)
    .filter((item): item is number => item !== null && Number.isFinite(item) && item >= 0);
  return {
    total: values.length ? values.reduce((sum, item) => sum + item, 0) : null,
    count: values.length,
    complete: contracts.length > 0 && values.length === contracts.length,
  };
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0
    ? numerator / denominator
    : null;
}

function expirationDte(expirationDate: string, now: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expirationDate);
  const nowDate = new Date(now);
  if (!match || !Number.isFinite(nowDate.getTime())) return null;
  const parts = Object.fromEntries(NEW_YORK_DATE.formatToParts(nowDate)
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => [part.type, Number(part.value)]));
  const expiration = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(parts.year, parts.month - 1, parts.day);
  const days = Math.round((expiration - today) / 86_400_000);
  return days >= 0 ? days : null;
}

export function summarizeScannerOptions(
  chain: OptionChainBundle | null,
  now: string,
): ScannerOptionsObservation {
  if (!chain) {
    return {
      available: false,
      selectedExpiration: null,
      availableExpirations: [],
      contractsComplete: false,
      contractCount: 0,
      totalVolume: null,
      totalOpenInterest: null,
      volumeReportedContractCount: 0,
      openInterestReportedContractCount: 0,
      volumeOpenInterestPairedContractCount: 0,
      volumeComplete: false,
      openInterestComplete: false,
      callContractCount: 0,
      putContractCount: 0,
      callVolumeReportedContractCount: 0,
      putVolumeReportedContractCount: 0,
      callOpenInterestReportedContractCount: 0,
      putOpenInterestReportedContractCount: 0,
      callVolumeComplete: false,
      putVolumeComplete: false,
      callOpenInterestComplete: false,
      putOpenInterestComplete: false,
      volumeToOpenInterest: null,
      callVolume: null,
      putVolume: null,
      callOpenInterest: null,
      putOpenInterest: null,
      callToPutVolumeRatio: null,
      callToPutOpenInterestRatio: null,
      averageImpliedVolatility: null,
      reportedIvContractCount: 0,
      dteContractCount: 0,
      minimumDte: null,
      maximumDte: null,
      highestVolumeContract: null,
      highestContractVolume: null,
      highestOpenInterestContract: null,
      highestContractOpenInterest: null,
      contractEquivalentShareVolume: null,
      equivalentShareVolumeReportedContractCount: 0,
      equivalentShareVolumeComplete: false,
      asOf: null,
      quality: null,
      quoteAvailability: null,
    };
  }

  const observedContracts = chain.selectedExpiration
    ? chain.contracts.filter((contract) => contract.expirationDate === chain.selectedExpiration)
    : chain.contracts;
  const calls = observedContracts.filter((contract) => contract.type === "call");
  const puts = observedContracts.filter((contract) => contract.type === "put");
  const totalVolume = reportedNonNegativeSum(observedContracts, (contract) => contract.volume);
  const totalOpenInterest = reportedNonNegativeSum(observedContracts, (contract) => contract.openInterest);
  const callVolume = reportedNonNegativeSum(calls, (contract) => contract.volume);
  const putVolume = reportedNonNegativeSum(puts, (contract) => contract.volume);
  const callOpenInterest = reportedNonNegativeSum(calls, (contract) => contract.openInterest);
  const putOpenInterest = reportedNonNegativeSum(puts, (contract) => contract.openInterest);
  const pairedVolumeOpenInterest = observedContracts.filter((contract) =>
    contract.volume !== null && Number.isFinite(contract.volume) && contract.volume >= 0
    && contract.openInterest !== null && Number.isFinite(contract.openInterest) && contract.openInterest >= 0);
  const pairedVolume = pairedVolumeOpenInterest.reduce((sum, contract) => sum + (contract.volume ?? 0), 0);
  const pairedOpenInterest = pairedVolumeOpenInterest.reduce((sum, contract) => sum + (contract.openInterest ?? 0), 0);
  const impliedVolatilities = observedContracts
    .map((contract) => contract.impliedVolatility)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const dtes = observedContracts
    .map((contract) => expirationDte(contract.expirationDate, now))
    .filter((value): value is number => value !== null);
  const highestVolume = observedContracts
    .filter((contract) => contract.volume !== null && Number.isFinite(contract.volume) && contract.volume >= 0)
    .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0) || left.symbol.localeCompare(right.symbol))[0] ?? null;
  const highestOpenInterest = observedContracts
    .filter((contract) => contract.openInterest !== null && Number.isFinite(contract.openInterest) && contract.openInterest >= 0)
    .sort((left, right) => (right.openInterest ?? 0) - (left.openInterest ?? 0) || left.symbol.localeCompare(right.symbol))[0] ?? null;
  const equivalentShareVolumes = observedContracts.flatMap((contract) =>
    contract.volume !== null && Number.isFinite(contract.volume) && contract.volume >= 0
      && contract.sharesPerContractReported
      && Number.isFinite(contract.sharesPerContract) && contract.sharesPerContract > 0
      ? [contract.volume * contract.sharesPerContract]
      : []);

  return {
    available: true,
    selectedExpiration: chain.selectedExpiration,
    availableExpirations: chain.expirations,
    contractsComplete: chain.contractsComplete,
    contractCount: observedContracts.length,
    totalVolume: totalVolume.total,
    totalOpenInterest: totalOpenInterest.total,
    volumeReportedContractCount: totalVolume.count,
    openInterestReportedContractCount: totalOpenInterest.count,
    volumeOpenInterestPairedContractCount: pairedVolumeOpenInterest.length,
    volumeComplete: chain.contractsComplete && totalVolume.complete,
    openInterestComplete: chain.contractsComplete && totalOpenInterest.complete,
    callContractCount: calls.length,
    putContractCount: puts.length,
    callVolumeReportedContractCount: callVolume.count,
    putVolumeReportedContractCount: putVolume.count,
    callOpenInterestReportedContractCount: callOpenInterest.count,
    putOpenInterestReportedContractCount: putOpenInterest.count,
    callVolumeComplete: chain.contractsComplete && callVolume.complete,
    putVolumeComplete: chain.contractsComplete && putVolume.complete,
    callOpenInterestComplete: chain.contractsComplete && callOpenInterest.complete,
    putOpenInterestComplete: chain.contractsComplete && putOpenInterest.complete,
    volumeToOpenInterest: pairedVolumeOpenInterest.length ? ratio(pairedVolume, pairedOpenInterest) : null,
    callVolume: callVolume.total,
    putVolume: putVolume.total,
    callOpenInterest: callOpenInterest.total,
    putOpenInterest: putOpenInterest.total,
    callToPutVolumeRatio: ratio(callVolume.total, putVolume.total),
    callToPutOpenInterestRatio: ratio(callOpenInterest.total, putOpenInterest.total),
    averageImpliedVolatility: impliedVolatilities.length
      ? impliedVolatilities.reduce((sum, value) => sum + value, 0) / impliedVolatilities.length
      : null,
    reportedIvContractCount: impliedVolatilities.length,
    dteContractCount: dtes.length,
    minimumDte: dtes.length ? Math.min(...dtes) : null,
    maximumDte: dtes.length ? Math.max(...dtes) : null,
    highestVolumeContract: chain.contractsComplete ? highestVolume?.symbol ?? null : null,
    highestContractVolume: chain.contractsComplete ? highestVolume?.volume ?? null : null,
    highestOpenInterestContract: chain.contractsComplete ? highestOpenInterest?.symbol ?? null : null,
    highestContractOpenInterest: chain.contractsComplete ? highestOpenInterest?.openInterest ?? null : null,
    contractEquivalentShareVolume: equivalentShareVolumes.length
      ? equivalentShareVolumes.reduce((sum, value) => sum + value, 0)
      : null,
    equivalentShareVolumeReportedContractCount: equivalentShareVolumes.length,
    equivalentShareVolumeComplete: chain.contractsComplete && observedContracts.length > 0
      && equivalentShareVolumes.length === observedContracts.length,
    asOf: chain.asOf,
    quality: chain.quality,
    quoteAvailability: chain.quoteAvailability,
  };
}
