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
export { OPENAI_LOOP_BUDGET, EXECUTION_54AH_BUDGET, EXECUTION_54AI_BUDGET, EXECUTION_54AJ_BUDGET, EXECUTION_54AK_BUDGET, EXECUTION_54AL_BUDGET, EXECUTION_54AT_BUDGET, budgetAllowsCall } from "@/lib/presell-quality/budget";
export {
  EXECUTION_54AT_ID,
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
export { MULTIMODAL_PROVIDER_ID, MULTIMODAL_MODEL_ID, multimodalProviderStatus } from "@/lib/presell-quality/provider";
