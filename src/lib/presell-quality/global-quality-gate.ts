import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { QUALITY_SCORE_TARGET, VISUAL_SCORE_TARGET } from "@/lib/presell-quality/premium-design";
import {
  loadPremiumPresellDesignStandard,
  type PremiumDesignStandard,
} from "@/lib/presell-quality/premium-standard";
import { listQualityAssessments, qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { readSandboxPresellPointer } from "@/lib/product-research/sandbox-presell";

export const GLOBAL_PRESELL_QUALITY_GATE_ID = "GLOBAL_PRESELL_QUALITY_GATE";

export const GLOBAL_PRESELL_QUALITY_STATES = [
  "GENERATING",
  "RENDERING",
  "AI_EVALUATING",
  "IMPROVING",
  "QUALITY_APPROVED",
  "QUALITY_BLOCKED",
  "EVALUATION_UNAVAILABLE",
] as const;

export type GlobalPresellQualityState = (typeof GLOBAL_PRESELL_QUALITY_STATES)[number];

export type GlobalPresellQualityInput = {
  campaignId: number;
  generationId?: string | null;
  phase?: Exclude<GlobalPresellQualityState, "QUALITY_APPROVED" | "QUALITY_BLOCKED" | "EVALUATION_UNAVAILABLE">;
  desktopScreenshotPath?: string | null;
  mobileScreenshotPath?: string | null;
  comparedToOfficialReference?: boolean;
  evaluatorIndependentFromGenerator?: boolean;
  visualScore?: number | null;
  desktopVisualScore?: number | null;
  mobileVisualScore?: number | null;
  editorialScore?: number | null;
  evaluatorStability?: "STABLE" | "NOT_ESTABLISHED" | "EVALUATOR_UNSTABLE" | null;
  criticalVisualDefects?: string[];
  contentSafetyPass?: boolean;
  paidEvaluationAvailable?: boolean;
};

export type GlobalPresellQualityGate = {
  id: typeof GLOBAL_PRESELL_QUALITY_GATE_ID;
  status: GlobalPresellQualityState;
  campaignId: number;
  generationId: string | null;
  humanReviewUnlocked: false | true;
  publicationUnlocked: false;
  reasons: string[];
  visualScore: number | null;
  desktopVisualScore: number | null;
  mobileVisualScore: number | null;
  editorialScore: number | null;
  evaluatorStability: GlobalPresellQualityInput["evaluatorStability"];
  criticalVisualDefects: string[];
  contentSafetyPass: boolean;
  referenceRegistered: boolean;
  comparedToOfficialReference: boolean;
};

export function emptyGlobalGate(campaignId: number, generationId: string | null = null): GlobalPresellQualityGate {
  return {
    id: GLOBAL_PRESELL_QUALITY_GATE_ID,
    status: "EVALUATION_UNAVAILABLE",
    campaignId,
    generationId,
    humanReviewUnlocked: false,
    publicationUnlocked: false,
    reasons: ["Premium evaluation has not been executed."],
    visualScore: null,
    desktopVisualScore: null,
    mobileVisualScore: null,
    editorialScore: null,
    evaluatorStability: null,
    criticalVisualDefects: [],
    contentSafetyPass: false,
    referenceRegistered: false,
    comparedToOfficialReference: false,
  };
}

export function resolveGlobalPresellQualityGate(
  input: GlobalPresellQualityInput,
  standard: PremiumDesignStandard = loadPremiumPresellDesignStandard(),
): GlobalPresellQualityGate {
  const defects = input.criticalVisualDefects ?? [];
  const base: GlobalPresellQualityGate = {
    ...emptyGlobalGate(input.campaignId, input.generationId ?? null),
    visualScore: input.visualScore ?? null,
    desktopVisualScore: input.desktopVisualScore ?? null,
    mobileVisualScore: input.mobileVisualScore ?? null,
    editorialScore: input.editorialScore ?? null,
    evaluatorStability: input.evaluatorStability ?? null,
    criticalVisualDefects: defects,
    contentSafetyPass: Boolean(input.contentSafetyPass),
    referenceRegistered: standard.registered,
    comparedToOfficialReference: Boolean(input.comparedToOfficialReference),
  };

  if (input.phase === "GENERATING" || input.phase === "RENDERING" || input.phase === "AI_EVALUATING" || input.phase === "IMPROVING") {
    return { ...base, status: input.phase, reasons: [`Pipeline is in ${input.phase}.`] };
  }

  const reasons: string[] = [];
  if (!standard.registered || !standard.accessibleToEvaluator) {
    reasons.push(standard.reason ?? "Official premium reference PNG is not available to the evaluator.");
  }
  const desktopOk = Boolean(input.desktopScreenshotPath && existsSync(input.desktopScreenshotPath));
  const mobileOk = Boolean(input.mobileScreenshotPath && existsSync(input.mobileScreenshotPath));
  if (!desktopOk) reasons.push("A real desktop screenshot is required.");
  if (!mobileOk) reasons.push("A real mobile screenshot is required.");
  if (!input.comparedToOfficialReference) reasons.push("Multimodal comparison with the official reference was not executed.");
  if (!input.evaluatorIndependentFromGenerator) reasons.push("The quality evaluator must be independent from the generator.");
  if (input.paidEvaluationAvailable === false && !input.comparedToOfficialReference) {
    reasons.push("Paid multimodal evaluation is unavailable; absence of evaluation is not approval.");
  }

  const evaluationMissing =
    !standard.registered ||
    !desktopOk ||
    !mobileOk ||
    !input.comparedToOfficialReference ||
    !input.evaluatorIndependentFromGenerator;

  if (evaluationMissing) {
    return {
      ...base,
      status: "EVALUATION_UNAVAILABLE",
      reasons,
      humanReviewUnlocked: false,
      publicationUnlocked: false,
    };
  }

  const desktopVisual = input.desktopVisualScore ?? input.visualScore;
  const mobileVisual = input.mobileVisualScore ?? input.visualScore;
  if ((desktopVisual ?? 0) < VISUAL_SCORE_TARGET) reasons.push(`Desktop visual score ${desktopVisual ?? "n/a"} < ${VISUAL_SCORE_TARGET}.`);
  if ((mobileVisual ?? 0) < VISUAL_SCORE_TARGET) reasons.push(`Mobile visual score ${mobileVisual ?? "n/a"} < ${VISUAL_SCORE_TARGET}.`);
  if ((input.editorialScore ?? 0) < QUALITY_SCORE_TARGET) reasons.push(`Editorial score ${input.editorialScore ?? "n/a"} < ${QUALITY_SCORE_TARGET}.`);
  if (defects.length) reasons.push("Critical visual defects remain.");
  if (!input.contentSafetyPass) reasons.push("Content safety gate failed.");
  if (input.evaluatorStability !== "STABLE") reasons.push("Evaluator stability is not established.");

  const approved = reasons.length === 0;
  return {
    ...base,
    status: approved ? "QUALITY_APPROVED" : "QUALITY_BLOCKED",
    reasons: approved ? ["All premium quality requirements were met."] : reasons,
    humanReviewUnlocked: approved,
    publicationUnlocked: false,
  };
}

export function canEnterHumanReviewQueue(gate: Pick<GlobalPresellQualityGate, "status">): boolean {
  return gate.status === "QUALITY_APPROVED";
}

export function canApproveEditorialFinal(gate: Pick<GlobalPresellQualityGate, "status">): boolean {
  return gate.status === "QUALITY_APPROVED";
}

export function canPromoteApprovedVersion(gate: Pick<GlobalPresellQualityGate, "status">): boolean {
  return gate.status === "QUALITY_APPROVED";
}

export function requestPresellHumanReview(gate: GlobalPresellQualityGate): { ok: true } | { ok: false; reason: string; status: GlobalPresellQualityState } {
  if (gate.status !== "QUALITY_APPROVED") {
    return {
      ok: false,
      status: gate.status,
      reason: `Human review is blocked while GLOBAL_PRESELL_QUALITY_GATE is ${gate.status}.`,
    };
  }
  return { ok: true };
}

function gateFile(campaignId: number, generationId: string): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "global-quality-gate", `${generationId}.json`);
}

export function writeGlobalPresellQualityGate(gate: GlobalPresellQualityGate): GlobalPresellQualityGate {
  if (!gate.generationId) return gate;
  const file = gateFile(gate.campaignId, gate.generationId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(gate, null, 2)}\n`);
  return gate;
}

export function readGlobalPresellQualityGate(campaignId: number, generationId: string): GlobalPresellQualityGate | null {
  const file = gateFile(campaignId, generationId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as GlobalPresellQualityGate;
  } catch {
    return null;
  }
}

export function campaignRequiresPremiumQualityGate(campaignId: number): boolean {
  if (listQualityAssessments(campaignId).length > 0) return true;
  return Boolean(readSandboxPresellPointer(campaignId)?.generationId);
}

function gateForCampaign(campaignId: number): GlobalPresellQualityGate {
  const generationId = readSandboxPresellPointer(campaignId)?.generationId ?? listQualityAssessments(campaignId)[0]?.generationId ?? null;
  if (!generationId) return emptyGlobalGate(campaignId, null);
  return readGlobalPresellQualityGate(campaignId, generationId) ?? resolveGlobalPresellQualityGate({ campaignId, generationId, paidEvaluationAvailable: false });
}

export function premiumPublicationBlock(campaignId: number): string | null {
  if (!campaignRequiresPremiumQualityGate(campaignId)) return null;
  const gate = gateForCampaign(campaignId);
  if (gate.status !== "QUALITY_APPROVED") {
    return `Publishing refused: GLOBAL_PRESELL_QUALITY_GATE is ${gate.status}.`;
  }
  return null;
}

export function humanReviewAcceptanceBlock(campaignId: number | null | undefined): string | null {
  if (campaignId == null) return null;
  if (!campaignRequiresPremiumQualityGate(campaignId)) return null;
  const gate = gateForCampaign(campaignId);
  if (!canEnterHumanReviewQueue(gate)) {
    return `Human review is blocked while GLOBAL_PRESELL_QUALITY_GATE is ${gate.status}.`;
  }
  if (!canApproveEditorialFinal(gate)) {
    return `Editorial acceptance is blocked while GLOBAL_PRESELL_QUALITY_GATE is ${gate.status}.`;
  }
  return null;
}

export function approvedVersionPromotionBlock(campaignId: number | null | undefined): string | null {
  if (campaignId == null) return null;
  if (!campaignRequiresPremiumQualityGate(campaignId)) return null;
  const gate = gateForCampaign(campaignId);
  if (!canPromoteApprovedVersion(gate)) {
    return `Approved-version promotion is blocked while GLOBAL_PRESELL_QUALITY_GATE is ${gate.status}.`;
  }
  return null;
}
