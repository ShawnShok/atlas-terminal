import type { ResearchDataStatus } from "@/lib/research";
import { freshnessLabel } from "@/lib/freshness";
import type { TerminalApiMeta } from "@/types";

export function researchStatus(
  meta: TerminalApiMeta | null,
  error: { code: string; message: string } | null,
): ResearchDataStatus {
  if (error) {
    return {
      mode: "unavailable",
      label: error.code.replaceAll("_", " "),
      asOf: null,
      message: error.message,
    };
  }
  if (!meta) return { mode: "historical", label: "LOADING", asOf: null };
  if (meta.mode === "mock") {
    return { mode: "mock", label: "MOCK DATA", asOf: meta.asOf, message: "Synthetic development data" };
  }
  const mode = meta.freshness.status === "live"
    ? "live"
    : meta.freshness.status === "historical" || meta.freshness.status === "end-of-day" || meta.freshness.status === "closed"
        ? "historical"
        : meta.freshness.status === "unavailable"
          ? "unavailable"
          : "delayed";
  const label = freshnessLabel(meta.freshness);
  return { mode, label, asOf: meta.asOf, message: meta.source };
}
