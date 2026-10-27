export { runGeneration, loadGeneration } from "@/lib/lp-generator/run";
export { runApprovedReviewGeneration, loadApprovedReviewGeneration } from "@/lib/lp-generator/from-approved-review";
export { normalizeGenerationInput, inputIsReady, generationHash } from "@/lib/lp-generator/input";
export { listGenerations, readGeneration, readGenerationModel, writeGeneration } from "@/lib/lp-generator/store";
export { collectSourceUrls, pageCategoryFromUrl } from "@/lib/lp-generator/research";
export { structureResearchFacts, isWeakCommercialLead, isIncompleteFragment } from "@/lib/lp-generator/structure";
export { diagnoseAiProvider, createConfiguredCopyCaller, extractOpenAiResponseText } from "@/lib/lp-generator/ai-copy/provider";
export {
  resolveCopyProvider,
  estimateOpenAiCostUsd,
  OPENAI_TEXT_MODEL,
  OPENAI_RESPONSES_URL,
  COPY_MAX_OUTPUT_TOKENS,
  COPY_TIMEOUT_MS,
} from "@/lib/lp-generator/ai-copy/config";
export {
  MAX_TOTAL_COST_USD,
  reservePaidCall,
  createBudgetGatedCopyCaller,
  closeAuthorization,
  paidCallsBlocked,
} from "@/lib/lp-generator/ai-copy/budget";
export { parseAiCommercialCopy, AI_COMMERCIAL_COPY_SCHEMA } from "@/lib/lp-generator/ai-copy/schema";
export { resolveCommercialCopy } from "@/lib/lp-generator/ai-copy/resolve";
export { inspectContentQuality, repairContentQuality, countContentRepetitions, CONTENT_QUALITY_RULE_VERSION } from "@/lib/lp-generator/content-quality";
export { persistQualityInspection, replayQualityInspection } from "@/lib/lp-generator/quality-persist";
export type {
  CommercialGoal,
  GenerationInput,
  GenerationRecord,
  GenerationState,
  GenerationSummary,
  GateLabelMap,
} from "@/lib/lp-generator/types";
