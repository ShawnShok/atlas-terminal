import type { ServerEnv } from "@/lib/env";

import type { CacheTtlConfig } from "./types";

export const DEFAULT_CACHE_TTLS = {
  quote: 5_000,
  snapshot: 5_000,
  news: 30_000,
  event: 900_000,
  reference: 86_400_000,
  financial: 21_600_000,
  historical: 86_400_000,
  generic: 30_000,
  staleIfError: 300_000,
} as const satisfies CacheTtlConfig;

export function cacheTtlsFromEnv(environment: ServerEnv): CacheTtlConfig {
  return {
    quote: environment.CACHE_TTL_QUOTE_MS,
    snapshot: environment.CACHE_TTL_QUOTE_MS,
    news: environment.CACHE_TTL_NEWS_MS,
    event: environment.CACHE_TTL_EVENTS_MS,
    reference: environment.CACHE_TTL_REFERENCE_MS,
    financial: environment.CACHE_TTL_FINANCIALS_MS,
    historical: environment.CACHE_TTL_HISTORICAL_MS,
    generic: environment.CACHE_TTL_NEWS_MS,
    staleIfError: environment.CACHE_STALE_IF_ERROR_MS,
  };
}
