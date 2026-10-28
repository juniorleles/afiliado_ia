import { VISUAL_DIMENSION_WEIGHTS, VISUAL_SCORE_TARGET } from "@/lib/presell-quality/premium-design";
import { QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "@/lib/presell-quality/types";
import { PREMIUM_VISUAL_EVALUATION_V2, VISUAL_EVAL_PROMPT_VERSION_V2 } from "@/lib/presell-quality/visual-eval-v2";

export const VISITOR_VISUAL_CAPTURE = "VISITOR_VISUAL_CAPTURE";
export const LAB_PREVIEW_CAPTURE = "LAB_PREVIEW_CAPTURE";

export type CaptureMode = typeof VISITOR_VISUAL_CAPTURE | typeof LAB_PREVIEW_CAPTURE;
export type ComparisonStatus = "COMPARABLE" | "PARTIALLY_COMPARABLE" | "NOT_COMPARABLE";

export type VisualEvaluationIdentity = {
  generationId: string;
  rendererVersion: string;
  sourceCommit: string | null;
  referenceHash: string | null;
  screenshotHashes: string[];
  viewport: { width: number; height: number; deviceScaleFactor: number };
  rubricVersion: string;
  promptVersion: string;
  visualEvalVersion: string | null;
  captureMode: CaptureMode;
  adminChromePresent: boolean;
  model: string | null;
  evaluatedAt: string | null;
  scores: Record<string, number> | null;
  rationales: Record<string, string> | null;
};

export function evaluationIdentityOf(input: Partial<VisualEvaluationIdentity> & Pick<VisualEvaluationIdentity, "generationId">): VisualEvaluationIdentity {
  return {
    generationId: input.generationId,
    rendererVersion: input.rendererVersion ?? "v4",
    sourceCommit: input.sourceCommit ?? null,
    referenceHash: input.referenceHash ?? null,
    screenshotHashes: input.screenshotHashes ?? [],
    viewport: input.viewport ?? { width: 1440, height: 900, deviceScaleFactor: 1 },
    rubricVersion: input.rubricVersion ?? QUALITY_RUBRIC_VERSION,
    promptVersion: input.promptVersion ?? QUALITY_PROMPT_VERSION,
    visualEvalVersion: input.visualEvalVersion ?? null,
    captureMode: input.captureMode ?? LAB_PREVIEW_CAPTURE,
    adminChromePresent: input.adminChromePresent === true,
    model: input.model ?? null,
    evaluatedAt: input.evaluatedAt ?? null,
    scores: input.scores ?? null,
    rationales: input.rationales ?? null,
  };
}

export function compareEvaluationIdentities(left: VisualEvaluationIdentity, right: VisualEvaluationIdentity): {
  status: ComparisonStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (left.rubricVersion !== right.rubricVersion) reasons.push("Rubric versions differ.");
  if (left.promptVersion !== right.promptVersion) reasons.push("Prompt versions differ.");
  if ((left.visualEvalVersion ?? "") !== (right.visualEvalVersion ?? "")) reasons.push("Visual evaluation methodology versions differ.");
  if (left.captureMode !== right.captureMode) reasons.push("Capture modes differ.");
  if (left.adminChromePresent !== right.adminChromePresent) reasons.push("Admin chrome presence differs.");
  if (Boolean(left.referenceHash) !== Boolean(right.referenceHash) || (left.referenceHash && right.referenceHash && left.referenceHash !== right.referenceHash)) {
    reasons.push("Official reference identity differs.");
  }
  if ((left.model ?? "") !== (right.model ?? "")) reasons.push("Evaluator models differ.");
  if (left.rendererVersion !== right.rendererVersion) reasons.push("Renderer versions differ.");
  if (left.viewport.width !== right.viewport.width || left.viewport.height !== right.viewport.height) {
    reasons.push("Viewports differ.");
  }
  if (left.viewport.deviceScaleFactor !== right.viewport.deviceScaleFactor) reasons.push("Device scale factors differ.");

  const material = reasons.some((item) =>
    /methodology|Rubric|Prompt|Capture modes|Admin chrome|reference identity|Evaluator models/.test(item),
  );
  if (!reasons.length) return { status: "COMPARABLE", reasons: ["Evaluation conditions match."] };
  if (material) return { status: "NOT_COMPARABLE", reasons };
  return { status: "PARTIALLY_COMPARABLE", reasons };
}

export function stabilityFromIndependentPair(input: {
  first: VisualEvaluationIdentity;
  second: VisualEvaluationIdentity;
  firstOverall: number | null;
  secondOverall: number | null;
  variationLimit?: number;
}): "STABLE" | "NOT_ESTABLISHED" | "UNSTABLE" {
  const comparison = compareEvaluationIdentities(input.first, input.second);
  if (comparison.status !== "COMPARABLE") return "NOT_ESTABLISHED";
  if (input.first.generationId !== input.second.generationId) return "NOT_ESTABLISHED";
  const firstHashes = [...input.first.screenshotHashes].sort().join(",");
  const secondHashes = [...input.second.screenshotHashes].sort().join(",");
  if (!firstHashes || firstHashes !== secondHashes) return "NOT_ESTABLISHED";
  if (input.firstOverall == null || input.secondOverall == null) return "NOT_ESTABLISHED";
  const limit = input.variationLimit ?? 8;
  return Math.abs(input.firstOverall - input.secondOverall) > limit ? "UNSTABLE" : "STABLE";
}

export function methodologyThresholdsFrozen(): boolean {
  return (
    VISUAL_SCORE_TARGET === 90 &&
    QUALITY_TARGET === 85 &&
    VISUAL_DIMENSION_WEIGHTS.HERO_FIRST_IMPRESSION === 0.2 &&
    VISUAL_DIMENSION_WEIGHTS.COMPOSITION_HIERARCHY === 0.2 &&
    VISUAL_DIMENSION_WEIGHTS.MOBILE === 0.1
  );
}

export function v2IdentityDefaults(): Pick<VisualEvaluationIdentity, "visualEvalVersion" | "promptVersion" | "rubricVersion" | "captureMode"> {
  return {
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    rubricVersion: "2",
    captureMode: VISITOR_VISUAL_CAPTURE,
  };
}
