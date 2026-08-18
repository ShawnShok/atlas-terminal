import "server-only";

import { getServerEnv } from "@/lib/env";
import { getMassiveMarketDataService } from "@/lib/massive";
import { MockMarketDataService } from "@/lib/mock";
import type { StockMarketDataService } from "@/lib/services";

let mockService: MockMarketDataService | undefined;

export function getMarketDataService(): StockMarketDataService {
  const environment = getServerEnv();
  if (environment.USE_MOCK_DATA) {
    mockService ??= new MockMarketDataService();
    return mockService;
  }

  return getMassiveMarketDataService();
}
