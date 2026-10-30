export { PRESELL_QUALITY_VERSION, QUALITY_TARGET, QUALITY_DIMENSIONS, QUALITY_DIMENSION_WEIGHTS, ASSESSMENT_STATUSES, CRITICAL_FAILURE_CODES, QUALITY_RUBRIC_VERSION, QUALITY_PROMPT_VERSION } from "@/lib/presell-quality/types";
export type { PresellQualityAssessment, AssessmentStatus, QualityDimension, EvaluatorType } from "@/lib/presell-quality/types";
export { weightedQualityScore, resolveAssessmentStatus } from "@/lib/presell-quality/score";
export { QUALITY_DIMENSION_CRITERIA, qualityTarget } from "@/lib/presell-quality/criteria";
export { humanReviewEligibilityOf, approvalsFromAssessment, qualityPassedWithoutAi } from "@/lib/presell-quality/policy";
export { QUALITY_COST_POLICY, qualityCostGate, emptyCostMetadata } from "@/lib/presell-quality/cost";
export { unevaluatedAssessment, assessmentFromScores, createBlockedMultimodalEvaluator } from "@/lib/presell-quality/evaluator";
export { writeQualityAssessment, readQualityAssessment, findCachedQualityAssessment, listQualityAssessments, assessmentIsCurrent } from "@/lib/presell-quality/persist";
export { QUALITY_CALIBRATION_FIXTURES } from "@/lib/presell-quality/fixtures";
export { tenProductProtocol, emptyPilotSlot } from "@/lib/presell-quality/protocol";
export { deterministicBaselineAssessment } from "@/lib/presell-quality/baseline";
export { createMultimodalPresellEvaluator } from "@/lib/presell-quality/multimodal";
export type { MultimodalPresellEvaluator } from "@/lib/presell-quality/multimodal";
export type { PresellEvaluationInput } from "@/lib/presell-quality/input";
export { QUALITY_VIEWPORTS } from "@/lib/presell-quality/capture";
export { OPENAI_VISION_PROVIDER_ID, OPENAI_VISION_MODEL, openaiVisionProviderStatus, createOpenAiVisionClient } from "@/lib/presell-quality/openai-provider";
export { OPENAI_LOOP_BUDGET, EXECUTION_54AH_BUDGET, EXECUTION_54AI_BUDGET, EXECUTION_54AJ_BUDGET, EXECUTION_54AK_BUDGET, EXECUTION_54AL_BUDGET, EXECUTION_54AT_BUDGET, EXECUTION_54AU_BUDGET, EXECUTION_54AW_BUDGET, EXECUTION_54AX_BUDGET, EXECUTION_54AY_BUDGET, EXECUTION_54AY_MAX_AI_COST_USD, EXECUTION_54AZ_BUDGET, EXECUTION_54AZ_MAX_AI_COST_USD, EXECUTION_54BA_BUDGET, EXECUTION_54BA_MAX_AI_COST_USD, EXECUTION_54BB_BUDGET, EXECUTION_54BB_MAX_AI_COST_USD, EXECUTION_54BD_BUDGET, EXECUTION_54BD_MAX_AI_COST_USD, EXECUTION_54BE_BUDGET, EXECUTION_54BE_MAX_AI_COST_USD, EXECUTION_54BF_BUDGET, EXECUTION_54BF_MAX_AI_COST_USD, budgetAllowsCall } from "@/lib/presell-quality/budget";
export {
  EXECUTION_54AT_ID,
  EXECUTION_54AW_ID,
  EXECUTION_54AX_ID,
  EXECUTION_54AY_ID,
  EXECUTION_54AZ_ID,
  EXECUTION_54BA_ID,
  EXECUTION_54BB_ID,
  EXECUTION_54BD_ID,
  EXECUTION_54BE_ID,
  EXECUTION_54BF_ID,
  EXECUTION_54AW_BUDGET as EXECUTION_54AW_LEDGER_BUDGET,
  EXECUTION_54AX_BUDGET as EXECUTION_54AX_LEDGER_BUDGET,
  EXECUTION_54AY_BUDGET as EXECUTION_54AY_LEDGER_BUDGET,
  EXECUTION_54AZ_BUDGET as EXECUTION_54AZ_LEDGER_BUDGET,
  EXECUTION_54BA_BUDGET as EXECUTION_54BA_LEDGER_BUDGET,
  EXECUTION_54BB_BUDGET as EXECUTION_54BB_LEDGER_BUDGET,
  EXECUTION_54BD_BUDGET as EXECUTION_54BD_LEDGER_BUDGET,
  EXECUTION_54BE_BUDGET as EXECUTION_54BE_LEDGER_BUDGET,
  EXECUTION_54BF_BUDGET as EXECUTION_54BF_LEDGER_BUDGET,
  emptyExecutionBudgetLedger,
  budgetAllowsPaidCall,
  reservePaidCall,
  consumePaidCall,
  consumeReservedAsUnverified,
} from "@/lib/presell-quality/execution-budget";
export { enrichApprovedFactsForGeneration, SSL_PLATFORM_QUALIFIER } from "@/lib/presell-quality/approved-generation-facts";
export { validatePersistedProductContract } from "@/lib/presell-quality/contract-integrity";
export { buildContentManifest } from "@/lib/presell-quality/content-manifest";
export { evaluateContentSafety, disableCommercialCta, hydrateFaqSection } from "@/lib/presell-quality/content-safety";
export { selectApprovedPackshot, botanicalAssetIds } from "@/lib/presell-quality/approved-packshot";
export { compareAgainstBaseline } from "@/lib/presell-quality/baseline-comparison";
export {
  PREMIUM_ENGINE_ID,
  PREMIUM_ENGINE_VERSION,
  PREMIUM_CTA_LABEL,
  PREMIUM_DISPLAY_THEME,
  MAX_DESIGN_ITERATIONS,
  VISUAL_SCORE_TARGET,
  QUALITY_SCORE_TARGET,
  PAID_AI_BUDGET_USD,
  VISUAL_DIMENSIONS,
  VISUAL_DIMENSION_WEIGHTS,
  FORBIDDEN_REFERENCE_CHROME,
  weightedVisualScore,
  visualWeightsSumToOne,
} from "@/lib/presell-quality/premium-design";
export { premiumSlotsFromModel, daysFromText, presentVisitorCopy, joinSplitSteps, splitUsageSentences, compactFact, premiumSectionTitle, experimentalSectionTitle, uniqueGuaranteeStatements } from "@/lib/presell-quality/premium-slots";
export { evaluateVisualGate, criticalVisualDefects, paidAiBlockedFor54au, paidAiBlockedFor54ax } from "@/lib/presell-quality/visual-gate";
export {
  PREMIUM_VISUAL_EVALUATION_V2,
  VISUAL_EVAL_PROMPT_VERSION_V2,
  visualRubricV2Record,
  visualComparisonPromptV2,
  VISUAL_EVAL_V2_NON_PENALTIES,
  VISUAL_EVAL_V2_PENALTIES,
} from "@/lib/presell-quality/visual-eval-v2";
export {
  VISITOR_VISUAL_CAPTURE,
  LAB_PREVIEW_CAPTURE,
  evaluationIdentityOf,
  compareEvaluationIdentities,
  stabilityFromIndependentPair,
  methodologyThresholdsFrozen,
} from "@/lib/presell-quality/evaluation-comparability";
export {
  PRESELL_BEST_CANDIDATE_SELECTOR,
  selectBestCandidate,
  candidateStateOf,
  readBestCandidate,
  writeBestCandidate,
} from "@/lib/presell-quality/best-candidate";
export {
  DESIGN_CHECKPOINT_FILES,
  createDesignCheckpoint,
  createDesignCheckpointFromFiles,
  restoreDesignCheckpoint,
  restoreProtectedPath,
  checkpointDiffers,
} from "@/lib/presell-quality/design-checkpoint";
export {
  BEST_KNOWN_CANDIDATE_ID,
  EXPERIMENTAL_CANDIDATE_ID,
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  RENDERER_CANDIDATE_IDS,
  parseRendererCandidateId,
  resolveRendererCandidate,
  readRendererCandidateSelection,
  writeActivePreviewCandidate,
  defaultRendererCandidateSelection,
  rendererCandidateQuery,
} from "@/lib/presell-quality/renderer-candidate";
export {
  visitorCapturePreviewPath,
  adminChromePresentInHtml,
  visitorCaptureDefects,
  visitorCaptureFilenames,
  VISITOR_CAPTURE_VIEWPORTS,
  VISITOR_CAPTURE_DEVICE_SCALE_FACTOR,
} from "@/lib/presell-quality/visitor-capture";
export {
  conservativeMinPair,
  officialVisualV2Record,
  officialEditorialRecord,
  officialEvaluatorStability,
  officialPerDimensionStability,
  dimensionPairStability,
  freezeCandidateManifest,
  buildImprovementBacklog,
  EXECUTION_54AY_GENERATION_ID,
  FORBIDDEN_BACKLOG_CHROME,
} from "@/lib/presell-quality/official-v2";
export { EXECUTION_54AZ_PLAN, EXECUTION_54AZ_BASELINE } from "@/lib/presell-quality/design-recovery";
export {
  EXECUTION_54BA_PLAN,
  EXECUTION_54BA_BASELINE,
  EXECUTION_54BA_CHECKPOINT_ID,
  EXECUTION_54BA_GENERATION_ID,
  EXECUTION_54BA_EDITORIAL_DIFF,
  EXECUTION_54BA_COMPONENT_MANIFEST,
  EXECUTION_54BA_EXTRA_CHECKPOINT_FILES,
} from "@/lib/presell-quality/premium-redesign";
export { historicalEvaluationRows, historicalComparabilityMatrix } from "@/lib/presell-quality/historical-audit";
export { parseVisualEvaluationPayload, visualComparisonPrompt, problemsAreActionable } from "@/lib/presell-quality/visual-eval";
export {
  PREMIUM_PRESELL_DESIGN_STANDARD_ID,
  PREMIUM_REFERENCE_RELATIVE_PATH,
  PREMIUM_REFERENCE_EVALUATOR_PATH,
  loadPremiumPresellDesignStandard,
  persistPremiumDesignStandardRecord,
  readPremiumReferenceBytes,
} from "@/lib/presell-quality/premium-standard";
export {
  GLOBAL_PRESELL_QUALITY_GATE_ID,
  GLOBAL_PRESELL_QUALITY_STATES,
  resolveGlobalPresellQualityGate,
  canEnterHumanReviewQueue,
  canApproveEditorialFinal,
  canPromoteApprovedVersion,
  requestPresellHumanReview,
  premiumPublicationBlock,
  humanReviewAcceptanceBlock,
  approvedVersionPromotionBlock,
  writeGlobalPresellQualityGate,
} from "@/lib/presell-quality/global-quality-gate";
export { planDesignImprovements } from "@/lib/presell-quality/design-improve";
export {
  classifyAssessmentValidity,
  aggregateValidAssessments,
  diagnoseEvaluatorPair,
  medianScore,
  scoreDispersion,
  ASSESSMENT_VALIDITY_VERSION,
  DISPERSION_LIMIT,
  ASSESSMENT_VALIDITY_STATES,
} from "@/lib/presell-quality/assessment-validity";
export { auditQualityRubric, EXPECTED_QUALITY_WEIGHTS } from "@/lib/presell-quality/rubric-audit";
export {
  buildEvidenceInventory,
  reviewQueueFromInventory,
  autoAcceptDecision,
  AUTO_ACCEPT_POLICY_AUTHORIZED,
} from "@/lib/presell-quality/evidence-inventory";
export { buildContentGapReport } from "@/lib/presell-quality/content-gap-report";
export { reconcileStoredCandidates, loadStoredFactCandidates, loadOrReconcileLedger } from "@/lib/presell-quality/candidate-ledger";
export { classifySourceIdentity, investigateCampaignSourceIdentity, confirmSourceIdentity, isGenericHostConfirmation } from "@/lib/presell-quality/source-identity";
export { extractOperationalFactsFromDocuments, extractAndPersistOperationalFacts, inventoryStoredDocuments } from "@/lib/presell-quality/operational-extract";
export {
  buildCommercialGraph,
  sellerReviewAllowed,
  applyScopedConfirmation,
  confirmScopedIdentity,
  rejectRelation,
  sourceIdentityPanel,
} from "@/lib/presell-quality/commercial-graph";
export { prepareReviewQueue, prepareReviewCandidate, reviewSummary } from "@/lib/presell-quality/review-prepare";
export { decideEvidenceCandidate, evidenceReviewAuthGate } from "@/lib/presell-quality/review-decide";
export { loadEvidenceReviewWorkspace } from "@/lib/presell-quality/review-workspace";
export {
  PRIMARY_SOURCE_AUTO_APPROVAL,
  PRIMARY_SOURCE_POLICY,
  PRIMARY_SOURCE_POLICY_VERSION,
  applyPrimarySourceAutoApproval,
  evaluatePrimarySourceAutoApproval,
  policyApprovedCandidateIds,
} from "@/lib/presell-quality/primary-source-auto-approval";
export { processPrimaryAffiliatePage, readPrimaryPageResearch } from "@/lib/presell-quality/primary-page-research";
export {
  classifyPrimaryFaq,
  diagnosePrimaryCandidate,
  domainConfirmationNeeded,
} from "@/lib/presell-quality/primary-evidence-triage";
export { mapContentGapsToCandidates } from "@/lib/presell-quality/content-gap-map";
export { evaluateRegenerationGate, snapshotProductContract, REGENERATION_GATE_READY, REGENERATION_GATE_WAITING } from "@/lib/presell-quality/regeneration-gate";
export { classifyOperationalThemes, candidateSupportsGap, buildOperationalReviewCard, primaryOperationalTheme } from "@/lib/presell-quality/operational-theme";
export { buildReviewPresentation, presentationMatchesApproval, validateSafeTranslation } from "@/lib/presell-quality/review-presentation";
export { REVIEW_COPY, REVIEW_ACTION_LABEL, reviewStateLabel, reviewGroupOf, friendlyIdentity } from "@/lib/presell-quality/review-labels";
export { PRIMARY_AFFILIATE_LANDING_PAGE, sourcePriorityOf, secondaryResearchAllowed } from "@/lib/campaign-sources/primary-page";
export { auditApprovedCopy } from "@/lib/presell-quality/copy-audit";
export { validateCopyRewrite, onlySafeRewrites, extractComparableNumbers } from "@/lib/presell-quality/copy-validate";
export { proposeDeterministicRewrites, splitUsageSteps } from "@/lib/presell-quality/copy-rewrite";
export { applySafeCopyOptimization, restoreCopyOptimization } from "@/lib/presell-quality/apply-copy-optimization";
export {
  recordUserAssetDeclaration,
  readUserAssetDeclaration,
  productImageIdsForDeclaration,
  declarationCoversAsset,
  declarationAuthorizesAds,
  declarationAuthorizesScope,
  separateMediaStates,
} from "@/lib/presell-quality/user-asset-declaration";
export { classifyAssetSuitabilityFromMetadata, mergeVisionSuitability, looksBotanicalOrIngredient } from "@/lib/presell-quality/asset-suitability";
export { selectEditorialPlacement } from "@/lib/presell-quality/editorial-placement";
export { applyDeclaredPresellMedia, galleryHasDuplicateSrc } from "@/lib/presell-quality/apply-declared-media";
export { gallerySuppressionImpact, GALLERY_IMPACT_NOISE_BAND } from "@/lib/presell-quality/gallery-impact";
export { contentFingerprintOf, presentationFingerprintOf } from "@/lib/presell-quality/context";
export { screenshotAssociationError, bindScreenshotsToGeneration, rubricVersionsComparable } from "@/lib/presell-quality/normalize";
export { classifyEditorialPayload, structuredEditorialFailure } from "@/lib/presell-quality/editorial-payload";
export { editorialRetryAllowed, classifyEditorialProviderError, EDITORIAL_RETRYABLE_CODES } from "@/lib/presell-quality/editorial-retry";
export { recover54baComposition, applyRecovered54baFiles, RECOVER_54BA_FILES, RECOVER_54BA_MARKERS } from "@/lib/presell-quality/recover-54ba";
export { validateScreenshotBinding, boundScreenshotsForImmutableFixture } from "@/lib/presell-quality/binding";
export { measureEvaluatorConsistency, EVALUATOR_VARIATION_LIMIT } from "@/lib/presell-quality/consistency";
export { compareEditorialPages, normalizeVisualComparisonPayload, VISUAL_COMPARISON_JSON_SCHEMA } from "@/lib/presell-quality/visual-compare";
export { classifyQualityFixes } from "@/lib/presell-quality/classify";
export { applyQualityPatch, readQualityPatch, writeQualityPatch } from "@/lib/presell-quality/patch";
export { runQualityImprovementLoop } from "@/lib/presell-quality/loop";
export { classifyQualityGaps, QUALITY_GAP_KINDS } from "@/lib/presell-quality/gaps";
export { stageImageCandidates } from "@/lib/presell-quality/asset-recovery";
export { calibrateQualityEvaluator } from "@/lib/presell-quality/calibration";
export { proposeEditorialPlan } from "@/lib/presell-quality/editorial-plan";
export { reconstructApprovedPresell, applyEditorialReconstruction } from "@/lib/presell-quality/reconstruct";
export { triageFactCandidates } from "@/lib/presell-quality/fact-triage";
export { detectDoublePenalty } from "@/lib/presell-quality/dimension-overlap";
export { buildEditorialEnrichmentPlan } from "@/lib/presell-quality/enrichment-plan";
export { runAutonomousRecovery, validateFactCandidate, nextQualityAction } from "@/lib/presell-quality/recovery";
export { runWithTemporaryPaidAi, paidProviderAllowed } from "@/lib/ai/paid-gate";
export {
  PRESELL_STANDARD_ID,
  PRESELL_STANDARD_VERSION,
  PRESELL_STANDARD_SECTION_IDS,
  PRESELL_REQUIRED_SECTIONS,
  PRESELL_OPTIONAL_SECTIONS,
  EXECUTION_54BC_PAID_AI_BUDGET_USD,
  PRESELL_SECTION_REGISTRY,
  mapPresellStandardV1,
  validatePresellTemplateDocument,
  runTemplateQualityPreflight,
  producerEvidenceLibraryFromRun,
} from "@/lib/presell-template";
export { MULTIMODAL_PROVIDER_ID, MULTIMODAL_MODEL_ID, multimodalProviderStatus } from "@/lib/presell-quality/provider";
