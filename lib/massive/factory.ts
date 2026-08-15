import "server-only";

import { cacheTtlsFromEnv, MemoryCacheStore } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

import { MassiveClient } from "./client";
import { MassiveMarketDataService } from "./service";

let service: MassiveMarketDataService | undefined;

export function getMassiveMarketDataService(): MassiveMarketDataService {
  if (service) {
    return service;
  }

  const environment = getServerEnv();
  if (!environment.MASSIVE_API_KEY) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "MASSIVE_API_KEY is required for live market data.",
      { details: { fields: ["MASSIVE_API_KEY"] } },
    );
  }

  const cache = new MemoryCacheStore({
    maxEntries: environment.MEMORY_CACHE_MAX_ENTRIES,
  });
  const client = new MassiveClient({
    apiKey: environment.MASSIVE_API_KEY,
    baseUrl: environment.MASSIVE_API_BASE_URL,
    cache,
    maxRetries: environment.MASSIVE_MAX_RETRIES,
    requestTimeoutMs: environment.MASSIVE_REQUEST_TIMEOUT_MS,
    retryBaseDelayMs: environment.MASSIVE_RETRY_BASE_DELAY_MS,
  });
  service = new MassiveMarketDataService(client, cacheTtlsFromEnv(environment));
  return service;
}
