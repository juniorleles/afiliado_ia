export {
  VISUAL_OPTIMIZATION_AGENT_ID,
  VISUAL_OPTIMIZATION_PROMPT_VERSION,
  VISUAL_OPTIMIZATION_MAX_ITERATIONS,
  VISUAL_OPTIMIZATION_OPS,
  ALLOWED_COPY_OPS,
  FORBIDDEN_AGENT_TARGETS,
  CONVERSION_OPTIMIZATION_AGENT_ID,
  CONVERSION_OPTIMIZATION_PROMPT_VERSION,
  EDITORIAL_QUALITY_GATE_ID,
  EDITORIAL_QUALITY_PROMPT_VERSION,
  EDITORIAL_HEADLINE_MAX_WORDS,
  EDITORIAL_SUBHEADLINE_MAX_WORDS,
  EDITORIAL_ISSUE_CODES,
} from "./types.ts";
export type {
  VisualComposition,
  VisualAnalysisPlan,
  VisualDefect,
  LayoutChange,
  CopyChange,
  AppliedChange,
  VisualInspectResult,
  IterationRecord,
  CommercialCopyState,
  CommercialCopyPlan,
  ApprovedCopyInventory,
  FactMappingRow,
  FactBackedCopy,
} from "./types.ts";
export { parseVisualAnalysisPlan, emptyVisualAnalysisPlan, isAllowedLayoutOp, isAllowedCopyOp } from "./schema.ts";
export { parseCommercialCopyPlan } from "./commercial-schema.ts";
export {
  SOURCE_CANDIDATE_COMPOSITION,
  IMPROVED_SEED_COMPOSITION,
  CONVERSION_SEED_COMPOSITION,
  EDITORIAL_SEED_COMPOSITION,
  FINAL_VISUAL_SEED_COMPOSITION,
  OFFER_CARDS_SEED_COMPOSITION,
  defaultVisualComposition,
  readVisualComposition,
  writeVisualComposition,
  applyVisualPlan,
  confirmedDefectPlan,
  compositionDataAttributes,
  cloneComposition,
} from "./composition.ts";
export {
  presentCommercialHeroCopy,
  presentPackageShipping,
  commercialPackageSummary,
  complianceLines,
  heroIntroduction,
  conversionSectionTitle,
  SANDBOX_CHROME_COPY,
} from "./copy.ts";
export {
  buildSeedCommercialCopy,
  readCommercialCopy,
  writeCommercialCopy,
  cloneCommercialCopy,
  applyCommercialPlan,
  confirmedConversionPlan,
  emptyCommercialCopyPlan,
  mapApprovedFacts,
  copyChangeIsGrounded,
  inventoryFromPage,
} from "./commercial.ts";
export { buildEditorialCopy, confirmedEditorialPlan } from "./editorial.ts";
export {
  runEditorialQualityGate,
  isFactDumpHeadline,
  wordCount,
  detectDuplicateSectionTitles,
  detectEmptySections,
  detectFaqWithoutAnswer,
  editorialHeadlineAcceptable,
  editorialOperationsFromIssues,
} from "./editorial-gate.ts";
export { inspectRenderedViewport, inspectRenderedPage, inspectPass, inspectPassEditorial, inspectFaqInteraction } from "./inspect.ts";
export { analyzeVisualComposition, mergeConfirmedDefects, visualAnalysisUserText, VISUAL_ANALYSIS_SYSTEM } from "./analyze.ts";
export { analyzeCommercialConversion, conversionAnalysisUserText, CONVERSION_ANALYSIS_SYSTEM } from "./commercial-analyze.ts";
export { analyzeEditorialQuality, editorialAnalysisUserText, EDITORIAL_ANALYSIS_SYSTEM } from "./editorial-analyze.ts";
