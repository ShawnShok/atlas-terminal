export {
  calculateMarketBreadth,
  type BreadthHorizonResult,
  type BreadthSecurityInput,
  type MarketBreadthResult,
} from "./breadth";
export {
  associateNewsWithPriceMovement,
  type NewsPriceAssociation,
  type NewsPriceMove,
  type PriceObservation,
} from "./news-price";
export {
  detectResearchPatterns,
  type PatternBar,
  type PatternDetection,
  type PatternDetectionOptions,
  type ResearchPattern,
} from "./patterns";
export {
  compareNormalizedPerformance,
  normalizePerformance,
  type NormalizedPerformancePoint,
  type NormalizedPerformanceSeries,
  type PerformanceComparison,
  type PerformancePoint,
  type PerformanceSeries,
} from "./performance";
