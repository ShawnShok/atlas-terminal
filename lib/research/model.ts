import type {
  BreadthSnapshot,
  OptionChainRow,
  OptionMoneyness,
  ResearchDataStatus,
  ScannerCondition,
} from "./types";
import type { OptionContract } from "@/types";

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

