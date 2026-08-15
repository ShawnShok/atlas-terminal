import type { ResearchDataStatus } from "@/lib/research";
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
  const mode = meta.quality === "live"
    ? "live"
    : meta.quality === "delayed" || meta.quality === "indicative"
      ? "delayed"
      : meta.quality === "historical" || meta.quality === "end-of-day"
        ? "historical"
        : "delayed";
  const label = meta.quality === "unknown" ? "TIMING UNVERIFIED" : meta.quality.toUpperCase();
  return { mode, label, asOf: meta.asOf, message: meta.source };
}
