export { SEARCH_INTENT_VERSION } from "@/lib/search-intent/types";
export type {
  AdsCheckId,
  AdsReadinessCheck,
  BofuSlot,
  GoogleAdsReadiness,
  HopLinkReadiness,
  PresellMode,
  SearchIntent,
  SearchIntentClassification,
} from "@/lib/search-intent/types";
export { classifySearchIntent, presellModeForIntent, searchIntentCategoryOf } from "@/lib/search-intent/classify";
export { composeIntentHeadline, isIntentAlignedHeadline, INTENT_HEADLINE_SUFFIXES } from "@/lib/search-intent/headline";
export { applyPresellMode } from "@/lib/search-intent/apply";
export { buildHopLinkReadiness } from "@/lib/search-intent/hoplink";
export { evaluateGoogleAdsReadiness } from "@/lib/search-intent/ads-readiness";
export { selectedBofuSlots, bofuSectionOrder, editorialSectionOrder } from "@/lib/search-intent/modes";
