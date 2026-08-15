import "server-only";

import { cacheTtlsFromEnv, MemoryCacheStore } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

import { MassiveClient } from "./client";
import { MassiveResearchService } from "./research-service";
import { MassiveMarketDataService } from "./service";

let service: MassiveMarketDataService | undefined;
let researchService: MassiveResearchService | undefined;
let client: MassiveClient | undefined;

export function getMassiveClient(): MassiveClient {
  if (client) return client;

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
  client = new MassiveClient({
    apiKey: environment.MASSIVE_API_KEY,
    baseUrl: environment.MASSIVE_API_BASE_URL,
    cache,
    maxRetries: environment.MASSIVE_MAX_RETRIES,
    requestTimeoutMs: environment.MASSIVE_REQUEST_TIMEOUT_MS,
    retryBaseDelayMs: environment.MASSIVE_RETRY_BASE_DELAY_MS,
  });
  return client;
}

export function getMassiveMarketDataService(): MassiveMarketDataService {
  if (service) {
    return service;
  }

  const environment = getServerEnv();
  service = new MassiveMarketDataService(
    getMassiveClient(),
    cacheTtlsFromEnv(environment),
  );
  return service;
}

export function getMassiveResearchService(): MassiveResearchService {
  if (researchService) return researchService;
  const environment = getServerEnv();
  researchService = new MassiveResearchService(
    getMassiveClient(),
    cacheTtlsFromEnv(environment),
    environment.MASSIVE_API_BASE_URL,
  );
  return researchService;
}
