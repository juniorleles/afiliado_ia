export { RESEARCH_COVERAGE_VERSION, SOURCE_CLASSES, COVERAGE_WEIGHTS, RESEARCH_LIMITS, PAGE_INTENTS } from "@/lib/research-coverage/types";
export type {
  AccessStatus,
  CoverageEvidenceRecord,
  CoverageScore,
  CoverageSlot,
  GroundingStatus,
  InfoClass,
  PageIntent,
  PriceStatus,
  PriceVerification,
  SourceClass,
  SourceCoverageRow,
} from "@/lib/research-coverage/types";
export { classifySourceClass, domainOf } from "@/lib/research-coverage/classify-source";
export { collectInformationalCandidates, canonicalizeResearchUrl, discoverInformationalUrls } from "@/lib/research-coverage/discover";
export { classifyPageIntent, intentFillsSlots } from "@/lib/research-coverage/page-intent";
export { rankResearchCandidates } from "@/lib/research-coverage/rank";
export { classifyInformationKind } from "@/lib/research-coverage/info-class";
export { buildSourceCoverageMatrix, buildSourceCoverageRow } from "@/lib/research-coverage/matrix";
export { scoreProductCoverage } from "@/lib/research-coverage/score";
export { extractPriceCandidates, verifyPrices, priceStatusOf } from "@/lib/research-coverage/price";
export { coverageEvidenceFromRegistry, groundingStatusOf, usableNewEvidence } from "@/lib/research-coverage/evidence";
export { fetchCoverageSources } from "@/lib/research-coverage/run";
export { classifyPageRenderMode, visibleTextFromHtml } from "@/lib/research-coverage/spa-detect";
export type { PageRenderMode } from "@/lib/research-coverage/spa-detect";
export { fetchPublicPageForResearch, resetBrowserRenderBudget } from "@/lib/research-coverage/fetch-rendered";
export type { ExtractionMode, ResearchFetchResult } from "@/lib/research-coverage/fetch-rendered";
export { renderPublicPage, BROWSER_RENDER_LIMITS } from "@/lib/research-coverage/browser-render";
