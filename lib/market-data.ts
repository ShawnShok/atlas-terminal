import "server-only";

import { getServerEnv } from "@/lib/env";
import { getMassiveMarketDataService } from "@/lib/massive";
import type { MarketDataService } from "@/lib/massive";
import { MockMarketDataService } from "@/lib/mock";

let mockService: MockMarketDataService | undefined;

export function getMarketDataService(): MarketDataService {
  const environment = getServerEnv();
  if (environment.USE_MOCK_DATA) {
    mockService ??= new MockMarketDataService();
    return mockService;
  }

  return getMassiveMarketDataService();
}
