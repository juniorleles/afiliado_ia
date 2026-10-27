import { QUALITY_TARGET, type AssessmentStatus, type PresellQualityAssessment } from "@/lib/presell-quality/types";
import { captureEvaluationScreenshots, type CaptureManifest } from "@/lib/presell-quality/capture";
import { createMultimodalPresellEvaluator, type MultimodalPresellEvaluator } from "@/lib/presell-quality/multimodal";
import { evaluationInputFromModel } from "@/lib/presell-quality/context";
import { classifyQualityFixes, hasNewAllowedFix } from "@/lib/presell-quality/classify";
import {
  applyQualityPatch,
  emptyPatch,
  snapshotOriginalModel,
  writeQualityPatch,
  type QualityPresentationPatch,
} from "@/lib/presell-quality/patch";
import {
  OPENAI_LOOP_BUDGET,
  budgetAllowsCall,
  emptyBudgetLedger,
  recordBudgetSpend,
  type QualityBudgetLedger,
} from "@/lib/presell-quality/budget";
import type { ApprovedAssetRef } from "@/lib/presell-quality/input";
import type { V4Model } from "@/lib/product-showcase/v4/model";

export type QualityLoopStopReason =
  | "QUALITY_PASSED"
  | "NO_ALLOWED_FIXES"
  | "NO_SCORE_IMPROVEMENT"
  | "EVALUATION_LIMIT"
  | "CORRECTION_LIMIT"
  | "BUDGET_EXCEEDED"
  | "PROVIDER_ERROR"
  | "CAPTURE_FAILED"
  | "QUALITY_BLOCKED";

export type QualityLoopIteration = {
  campaignId: number;
  generationId: string;
  iteration: number;
  inputFingerprint: string | null;
  screenshotHashes: string[];
  model: string | null;
  promptVersion: string | null;
  score: number | null;
  findings: PresellQualityAssessment["findings"];
  correctionsApplied: QualityPresentationPatch["applied"];
  correctionsRejected: QualityPresentationPatch["rejected"];
  criticalFailures: PresellQualityAssessment["criticalFailures"];
  status: AssessmentStatus;
  tokenUsage: PresellQualityAssessment["tokenUsage"];
  estimatedCost: number;
  capture: CaptureManifest | null;
  assessmentId: string | null;
};

export type QualityLoopResult = {
  campaignId: number;
  generationId: string;
  status: AssessmentStatus;
  stopReason: QualityLoopStopReason;
  initialScore: number | null;
  finalScore: number | null;
  iterations: QualityLoopIteration[];
  autoFixesApplied: QualityPresentationPatch["applied"];
  autoFixesRejected: QualityPresentationPatch["rejected"];
  ledger: QualityBudgetLedger;
  heroEligible: boolean;
  factsPreserved: true;
  assetApprovalsPreserved: true;
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
};

export type QualityLoopInput = {
  campaignId: number;
  generationId: string;
  previewPath: string;
  model: V4Model;
  approvedFacts: string[];
  evidenceReferences: string[];
  approvedAssets: ApprovedAssetRef[];
  editorialConstraints: string[];
  heroEligible: boolean;
  baseUrl?: string;
};

export type QualityLoopDeps = {
  env?: NodeJS.ProcessEnv;
  evaluator?: MultimodalPresellEvaluator;
  capture?: (input: { campaignId: number; generationId: string; previewPath: string; baseUrl?: string; iteration?: number }) => Promise<CaptureManifest>;
  apply?: (generationId: string, patch: QualityPresentationPatch, model: V4Model) => V4Model;
  ledger?: QualityBudgetLedger;
};

function viewportFrom(capture: CaptureManifest): { desktop: CaptureManifest["desktop"]; mobile: CaptureManifest["mobile"] } {
  const desktop = capture.extras.find((item) => item.role === "desktop-viewport") ?? capture.desktop;
  const mobile = capture.extras.find((item) => item.role === "mobile-viewport") ?? capture.mobile;
  return { desktop, mobile };
}

function stopStatus(reason: QualityLoopStopReason, last: AssessmentStatus | null): AssessmentStatus {
  if (reason === "QUALITY_PASSED") return "QUALITY_PASSED";
  if (reason === "PROVIDER_ERROR" || reason === "CAPTURE_FAILED") return "EVALUATION_FAILED";
  if (reason === "QUALITY_BLOCKED" || reason === "NO_ALLOWED_FIXES" || reason === "BUDGET_EXCEEDED") return "QUALITY_BLOCKED";
  return last ?? "QUALITY_REJECTED";
}

export async function runQualityImprovementLoop(input: QualityLoopInput, deps: QualityLoopDeps = {}): Promise<QualityLoopResult> {
  const env = deps.env ?? process.env;
  const evaluator = deps.evaluator ?? createMultimodalPresellEvaluator({ env, skipCache: true });
  const captureFn = deps.capture ?? captureEvaluationScreenshots;
  let ledger = deps.ledger ?? emptyBudgetLedger(env.AIA_PAID_AI_SCOPE || "54AB");
  ledger.maxUsd = Number(env.AIA_PAID_AI_BUDGET_USD || ledger.maxUsd);
  const apply =
    deps.apply ??
    ((generationId, patch, model) => {
      snapshotOriginalModel(generationId, model);
      writeQualityPatch(generationId, patch);
      return applyQualityPatch(model, patch);
    });

  let model = input.model;
  snapshotOriginalModel(input.generationId, input.model);
  const iterations: QualityLoopIteration[] = [];
  let previousScore: number | null = null;
  let patch = emptyPatch();
  let lastStatus: AssessmentStatus | null = null;
  let stopReason: QualityLoopStopReason = "EVALUATION_LIMIT";

  for (let iteration = 1; iteration <= OPENAI_LOOP_BUDGET.maxEvaluations; iteration += 1) {
    const budget = budgetAllowsCall(ledger);
    if (!budget.allowed) {
      stopReason = "BUDGET_EXCEEDED";
      lastStatus = "QUALITY_BLOCKED";
      break;
    }

    const capture = await captureFn({
      campaignId: input.campaignId,
      generationId: input.generationId,
      previewPath: input.previewPath,
      baseUrl: input.baseUrl,
      iteration,
    });
    if (!capture.ok || !capture.mobile) {
      iterations.push({
        campaignId: input.campaignId,
        generationId: input.generationId,
        iteration,
        inputFingerprint: null,
        screenshotHashes: [],
        model: null,
        promptVersion: null,
        score: null,
        findings: [{ id: "capture-failed", dimension: "CRITICAL", severity: "BLOCKING", message: capture.notes.join("; ") || "Screenshot capture failed.", evidence: ["mobile"] }],
        correctionsApplied: patch.applied,
        correctionsRejected: patch.rejected,
        criticalFailures: ["SEVERE_MOBILE_BREAKAGE"],
        status: "EVALUATION_FAILED",
        tokenUsage: null,
        estimatedCost: 0,
        capture,
        assessmentId: null,
      });
      stopReason = "CAPTURE_FAILED";
      lastStatus = "EVALUATION_FAILED";
      break;
    }

    const screenshots = viewportFrom(capture);
    const evaluationInput = evaluationInputFromModel({
      campaignId: input.campaignId,
      generationId: input.generationId,
      model,
      screenshots,
      approvedFacts: input.approvedFacts,
      evidenceReferences: input.evidenceReferences,
      approvedAssets: input.approvedAssets,
      editorialConstraints: input.editorialConstraints,
      previewPath: input.previewPath,
      iteration,
      patch,
    });
    const assessment = await evaluator.evaluate(evaluationInput);
    if (
      assessment.provider === "openai" &&
      assessment.tokenUsage &&
      assessment.costMetadata.estimatedUsd > 0 &&
      !assessment.costMetadata.cached
    ) {
      ledger = recordBudgetSpend(ledger, {
        inputTokens: assessment.tokenUsage.inputTokens,
        outputTokens: assessment.tokenUsage.outputTokens,
        estimatedUsd: assessment.costMetadata.estimatedUsd,
      });
    }

    iterations.push({
      campaignId: input.campaignId,
      generationId: input.generationId,
      iteration,
      inputFingerprint: assessment.inputFingerprint ?? null,
      screenshotHashes: assessment.screenshotHashes ?? [],
      model: assessment.evaluatorModel,
      promptVersion: assessment.promptVersion ?? null,
      score: assessment.overallScore,
      findings: assessment.findings,
      correctionsApplied: patch.applied,
      correctionsRejected: patch.rejected,
      criticalFailures: assessment.criticalFailures,
      status: assessment.assessmentStatus,
      tokenUsage: assessment.tokenUsage ?? null,
      estimatedCost: assessment.costMetadata.estimatedUsd,
      capture,
      assessmentId: assessment.assessmentId,
    });
    lastStatus = assessment.assessmentStatus;

    if (assessment.assessmentStatus === "EVALUATION_FAILED") {
      stopReason = "PROVIDER_ERROR";
      break;
    }
    if (assessment.assessmentStatus === "QUALITY_PASSED" && (assessment.overallScore ?? 0) >= QUALITY_TARGET && assessment.criticalFailures.length === 0) {
      stopReason = "QUALITY_PASSED";
      break;
    }

    const classified = classifyQualityFixes({ assessment, heroEligible: input.heroEligible, previous: patch });
    const canCorrect = ledger.correctionCount < OPENAI_LOOP_BUDGET.maxCorrectionRounds;
    if (previousScore !== null && (assessment.overallScore ?? 0) <= previousScore) {
      stopReason = "NO_SCORE_IMPROVEMENT";
      break;
    }
    if (!canCorrect) {
      stopReason = "CORRECTION_LIMIT";
      break;
    }
    if (!hasNewAllowedFix(patch, classified)) {
      stopReason = assessment.assessmentStatus === "QUALITY_BLOCKED" ? "QUALITY_BLOCKED" : "NO_ALLOWED_FIXES";
      patch = classified;
      apply(input.generationId, patch, input.model);
      break;
    }

    previousScore = assessment.overallScore;
    patch = classified;
    model = apply(input.generationId, patch, input.model);
    ledger = { ...ledger, correctionCount: ledger.correctionCount + 1 };
  }

  if (iterations.length >= OPENAI_LOOP_BUDGET.maxEvaluations && stopReason === "EVALUATION_LIMIT") {
    stopReason = "EVALUATION_LIMIT";
  }

  const first = iterations[0];
  const last = iterations[iterations.length - 1];
  return {
    campaignId: input.campaignId,
    generationId: input.generationId,
    status: stopStatus(stopReason, lastStatus),
    stopReason,
    initialScore: first?.score ?? null,
    finalScore: last?.score ?? null,
    iterations,
    autoFixesApplied: patch.applied,
    autoFixesRejected: patch.rejected,
    ledger,
    heroEligible: input.heroEligible,
    factsPreserved: true,
    assetApprovalsPreserved: true,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
  };
}
