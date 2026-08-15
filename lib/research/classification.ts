export const RESEARCH_SECTORS = [
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Financials",
  "Health Care",
  "Industrials",
  "Information Technology",
  "Materials",
  "Real Estate",
  "Utilities",
  "Other",
] as const;

export type ResearchSector = typeof RESEARCH_SECTORS[number];
export type MarketCapBand = "micro" | "small" | "mid" | "large" | "mega";

/**
 * Derives a broad research sector from the SIC description returned by Massive.
 * This is an explicit local classification, not a vendor-supplied GICS value.
 */
export function researchSectorFromSic(
  sicCode: string | null | undefined,
  sicDescription: string | null | undefined,
): ResearchSector | null {
  const description = sicDescription?.trim().toLowerCase() ?? "";
  const rules: readonly [ResearchSector, RegExp][] = [
    ["Information Technology", /software|semiconductor|computer|data processing|electronic component|information technology/],
    ["Health Care", /pharmaceutical|biological|biotech|medical|health|hospital|diagnostic|surgical/],
    ["Financials", /bank|credit|insurance|broker|investment|finance|financial|savings institution/],
    ["Energy", /oil|gas|petroleum|coal|drilling|energy services/],
    ["Utilities", /electric service|gas distribution|water supply|utility/],
    ["Real Estate", /real estate|reit|land subdivider/],
    ["Communication Services", /telecommunication|broadcast|cable|motion picture|advertising|communications/],
    ["Consumer Staples", /food|beverage|tobacco|grocery|soap|household product/],
    ["Consumer Discretionary", /retail|restaurant|hotel|apparel|automobile|recreation|consumer service/],
    ["Materials", /chemical|metal|mining|mineral|paper|lumber|steel|packaging|glass/],
    ["Industrials", /machinery|aerospace|transportation|aircraft|construction|industrial|railroad|trucking/],
  ];
  for (const [sector, pattern] of rules) {
    if (pattern.test(description)) return sector;
  }

  const numeric = Number.parseInt(sicCode ?? "", 10);
  if (!Number.isFinite(numeric)) return description ? "Other" : null;
  if (numeric >= 6000 && numeric <= 6799) return "Financials";
  if (numeric >= 4900 && numeric <= 4999) return "Utilities";
  if (numeric >= 1000 && numeric <= 1499) return "Materials";
  if (numeric >= 1500 && numeric <= 1799) return "Industrials";
  if (numeric >= 4000 && numeric <= 4799) return "Industrials";
  if (numeric >= 5000 && numeric <= 5999) return "Consumer Discretionary";
  if (numeric >= 7000 && numeric <= 8999) return "Consumer Discretionary";
  return "Other";
}

export function marketCapBand(value: number | null | undefined): MarketCapBand | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  if (value < 300_000_000) return "micro";
  if (value < 2_000_000_000) return "small";
  if (value < 10_000_000_000) return "mid";
  if (value < 200_000_000_000) return "large";
  return "mega";
}
