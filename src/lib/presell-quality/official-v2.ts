import { EVALUATOR_VARIATION_LIMIT } from "@/lib/presell-quality/consistency";
import {
  stabilityFromIndependentPair,
  VISITOR_VISUAL_CAPTURE,
  type VisualEvaluationIdentity,
} from "@/lib/presell-quality/evaluation-comparability";
import { PREMIUM_ENGINE_VERSION } from "@/lib/presell-quality/premium-design";
import { RENDERER_V4_ID, type PresellQualityAssessment } from "@/lib/presell-quality/types";
import { VISITOR_CAPTURE_DEVICE_SCALE_FACTOR, VISITOR_CAPTURE_VIEWPORTS } from "@/lib/presell-quality/visitor-capture";
import type { ActionableVisualProblem, ParsedVisualEvaluation } from "@/lib/presell-quality/visual-eval";
import { PREMIUM_VISUAL_EVALUATION_V2, VISUAL_EVAL_PROMPT_VERSION_V2 } from "@/lib/presell-quality/visual-eval-v2";

export const EXECUTION_54AY_GENERATION_ID = "lp-mvs7mja3-0d690e7c";
export const FORBIDDEN_BACKLOG_CHROME =
  /testimonial|star rating|verified buyer|fda|gmp certified|discount|free shipping|medical claim|clinical result/i;

export type OfficialVisualV2Record = {
  rubricVersion: typeof PREMIUM_VISUAL_EVALUATION_V2;
  referenceCompared: true;
  visitorCaptureValidated: boolean;
  desktopScore: number;
  mobileScore: number;
  overallScore: number;
  dimensionScores: Record<string, number>;
  criticalDefects: string[];
  strengths: string[];
  defects: ActionableVisualProblem[];
  recommendations: string[];
  evidence: string[];
};

export type OfficialEditorialRecord = {
  editorialScore: number;
  productContractGrounded: boolean;
  unsupportedClaims: string[];
  strengths: string[];
  defects: string[];
  recommendations: string[];
};

export type FrozenCandidateManifest = {
  campaignId: number;
  generationId: string;
  contentHash: string;
  productContractHash: string;
  rendererId: typeof RENDERER_V4_ID;
  engineVersion: typeof PREMIUM_ENGINE_VERSION;
  sourceCommit: string | null;
  rubricVersion: "2";
  promptVersion: typeof VISUAL_EVAL_PROMPT_VERSION_V2;
  visualEvalVersion: typeof PREMIUM_VISUAL_EVALUATION_V2;
  referenceHash: string | null;
  captureMode: typeof VISITOR_VISUAL_CAPTURE;
  captureViewports: typeof VISITOR_CAPTURE_VIEWPORTS;
  deviceScaleFactor: typeof VISITOR_CAPTURE_DEVICE_SCALE_FACTOR;
  immutable: true;
};

export type ImprovementBacklogItem = {
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: "visual" | "editorial";
  viewport: "desktop" | "mobile" | "all";
  section: string;
  problem: string;
  evidence: string;
  recommendedFix: string;
  affectedComponent: string;
  expectedImpact: "HIGH" | "MEDIUM" | "LOW";
  requiresNewProductFacts: boolean;
};

export function conservativeMinPair(first: number | null | undefined, second: number | null | undefined): number | null {
  if (first == null || second == null || !Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.min(first, second);
}

export function officialVisualV2Record(
  parsed: ParsedVisualEvaluation,
  visitorCaptureValidated: boolean,
): OfficialVisualV2Record {
  const strengths = Object.entries(parsed.rationales)
    .filter(([dimension]) => parsed.scores[dimension as keyof typeof parsed.scores] >= 80)
    .map(([dimension, rationale]) => rationale.trim() || `${dimension} scored ${parsed.scores[dimension as keyof typeof parsed.scores]}.`)
    .filter(Boolean);
  return {
    rubricVersion: PREMIUM_VISUAL_EVALUATION_V2,
    referenceCompared: true,
    visitorCaptureValidated,
    desktopScore: parsed.desktopVisualScore,
    mobileScore: parsed.mobileVisualScore,
    overallScore: parsed.overall,
    dimensionScores: { ...parsed.scores },
    criticalDefects: [...parsed.criticalDefects],
    strengths,
    defects: parsed.problems,
    recommendations: parsed.problems.map((item) => item.recommendedFix),
    evidence: parsed.problems.map((item) => item.visualEvidence).filter(Boolean),
  };
}

export function officialEditorialRecord(assessment: PresellQualityAssessment): OfficialEditorialRecord | null {
  if (assessment.overallScore == null || assessment.assessmentStatus === "EVALUATION_FAILED") return null;
  const unsupportedClaims = [
    ...assessment.criticalFailures.filter((code) =>
      code === "UNGROUNDED_CLAIM" || code === "INVENTED_HEALTH_BENEFIT" || code === "FALSE_PRICE_GUARANTEE_OR_MAKER",
    ),
    ...assessment.findings
      .filter((item) => /ungrounded|invented|unsupported claim/i.test(item.message))
      .map((item) => item.message),
  ];
  return {
    editorialScore: assessment.overallScore,
    productContractGrounded: unsupportedClaims.length === 0,
    unsupportedClaims,
    strengths: [
      ...assessment.dimensionScores.filter((item) => item.score >= 80).map((item) => item.rationale || `${item.dimension} ${item.score}`),
      ...assessment.findings.filter((item) => item.severity === "INFO").map((item) => item.message),
    ].filter(Boolean),
    defects: assessment.findings
      .filter((item) => item.severity === "WARNING" || item.severity === "BLOCKING")
      .map((item) => item.message),
    recommendations: assessment.recommendedActions.filter((item) => item.allowed).map((item) => item.action),
  };
}

export function officialEvaluatorStability(input: {
  firstVisual: VisualEvaluationIdentity | null;
  secondVisual: VisualEvaluationIdentity | null;
  firstVisualOverall: number | null;
  secondVisualOverall: number | null;
  firstEditorial: number | null;
  secondEditorial: number | null;
}): "STABLE" | "UNSTABLE" | "NOT_ESTABLISHED" {
  if (
    !input.firstVisual ||
    !input.secondVisual ||
    input.firstVisualOverall == null ||
    input.secondVisualOverall == null ||
    input.firstEditorial == null ||
    input.secondEditorial == null
  ) {
    return "NOT_ESTABLISHED";
  }
  const visual = stabilityFromIndependentPair({
    first: input.firstVisual,
    second: input.secondVisual,
    firstOverall: input.firstVisualOverall,
    secondOverall: input.secondVisualOverall,
    variationLimit: EVALUATOR_VARIATION_LIMIT,
  });
  if (visual !== "STABLE") return visual;
  const editorialDelta = Math.abs(input.firstEditorial - input.secondEditorial);
  return editorialDelta > EVALUATOR_VARIATION_LIMIT ? "UNSTABLE" : "STABLE";
}

export function freezeCandidateManifest(input: {
  campaignId: number;
  generationId: string;
  contentHash: string;
  productContractHash: string;
  sourceCommit: string | null;
  referenceHash: string | null;
}): FrozenCandidateManifest {
  return {
    campaignId: input.campaignId,
    generationId: input.generationId,
    contentHash: input.contentHash,
    productContractHash: input.productContractHash,
    rendererId: RENDERER_V4_ID,
    engineVersion: PREMIUM_ENGINE_VERSION,
    sourceCommit: input.sourceCommit,
    rubricVersion: "2",
    promptVersion: VISUAL_EVAL_PROMPT_VERSION_V2,
    visualEvalVersion: PREMIUM_VISUAL_EVALUATION_V2,
    referenceHash: input.referenceHash,
    captureMode: VISITOR_VISUAL_CAPTURE,
    captureViewports: VISITOR_CAPTURE_VIEWPORTS,
    deviceScaleFactor: VISITOR_CAPTURE_DEVICE_SCALE_FACTOR,
    immutable: true,
  };
}

function affectedComponentOf(section: string): string {
  const key = section.toLowerCase();
  if (/hero|packshot|first/.test(key)) return "src/components/product-showcase/v4/page.tsx";
  if (/cta/.test(key)) return "src/components/design-system/premium-blocks.tsx";
  if (/card|component|faq/.test(key)) return "src/components/design-system/premium-blocks.tsx";
  if (/type|typo|font/.test(key)) return "src/lib/design-system/tokens.ts";
  if (/mobile|space|layout/.test(key)) return "src/app/premium-design-engine.css";
  if (/ingredient|guarantee|ship|fulfill|copy|editorial/.test(key)) return "src/lib/presell-quality/premium-slots.ts";
  return "src/app/premium-design-engine.css";
}

function backlogFromProblem(
  item: ActionableVisualProblem,
  viewport: "desktop" | "mobile",
): ImprovementBacklogItem | null {
  if (FORBIDDEN_BACKLOG_CHROME.test(`${item.problem} ${item.recommendedFix}`)) return null;
  return {
    priority: item.severity,
    category: "visual",
    viewport,
    section: item.section,
    problem: item.problem,
    evidence: item.visualEvidence,
    recommendedFix: item.recommendedFix,
    affectedComponent: affectedComponentOf(item.section),
    expectedImpact: item.expectedImpact,
    requiresNewProductFacts: false,
  };
}

function uniqueProblems(items: ImprovementBacklogItem[], limit: number): ImprovementBacklogItem[] {
  const seen = new Set<string>();
  const out: ImprovementBacklogItem[] = [];
  for (const item of items) {
    const key = `${item.viewport}:${item.section}:${item.problem}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildImprovementBacklog(input: {
  visualRuns: OfficialVisualV2Record[];
  editorialRuns: OfficialEditorialRecord[];
}): {
  desktop: ImprovementBacklogItem[];
  mobile: ImprovementBacklogItem[];
  editorial: ImprovementBacklogItem[];
} {
  const visualProblems = input.visualRuns.flatMap((run) => run.defects);
  const desktop = uniqueProblems(
    visualProblems
      .filter((item) => !/mobile/i.test(item.section))
      .map((item) => backlogFromProblem(item, "desktop"))
      .filter((item): item is ImprovementBacklogItem => Boolean(item))
      .sort((a, b) => Number(b.priority === "HIGH") - Number(a.priority === "HIGH")),
    5,
  );
  const mobile = uniqueProblems(
    visualProblems
      .filter((item) => /mobile/i.test(item.section) || /mobile/i.test(item.problem))
      .map((item) => backlogFromProblem(item, "mobile"))
      .filter((item): item is ImprovementBacklogItem => Boolean(item))
      .sort((a, b) => Number(b.priority === "HIGH") - Number(a.priority === "HIGH")),
    5,
  );
  const editorial: ImprovementBacklogItem[] = [];
  const seen = new Set<string>();
  for (const run of input.editorialRuns) {
    for (const defect of run.defects) {
      if (FORBIDDEN_BACKLOG_CHROME.test(defect) || seen.has(defect)) continue;
      seen.add(defect);
      editorial.push({
        priority: "HIGH",
        category: "editorial",
        viewport: "all",
        section: "copy",
        problem: defect,
        evidence: defect,
        recommendedFix: run.recommendations[editorial.length] ?? "Restate only Product Contract facts; do not invent claims.",
        affectedComponent: "src/lib/presell-quality/premium-slots.ts",
        expectedImpact: "MEDIUM",
        requiresNewProductFacts: false,
      });
      if (editorial.length >= 5) break;
    }
    if (editorial.length >= 5) break;
  }
  return { desktop, mobile, editorial };
}
