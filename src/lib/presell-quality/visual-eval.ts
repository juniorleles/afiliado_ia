import { VISUAL_DIMENSIONS, VISUAL_SCORE_TARGET, weightedVisualScore, type VisualDimension } from "@/lib/presell-quality/premium-design";

export type ActionableVisualProblem = {
  section: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  problem: string;
  visualEvidence: string;
  referenceDifference: string;
  recommendedFix: string;
  expectedImpact: "HIGH" | "MEDIUM" | "LOW";
  requiresContentChange: boolean;
};

export type ParsedVisualEvaluation = {
  scores: Record<VisualDimension, number>;
  rationales: Record<VisualDimension, string>;
  overall: number;
  desktopVisualScore: number;
  mobileVisualScore: number;
  criticalDefects: string[];
  problems: ActionableVisualProblem[];
};

const GENERIC = /improve (the )?design|make it (more )?beautiful|increase conversion|deixar mais bonito/i;

export function visualComparisonPrompt(): { system: string; userText: string } {
  return {
    system: `You are an independent visual quality evaluator for affiliate presells.
Compare the rendered page screenshots to PREMIUM_PRESELL_DESIGN_STANDARD_V1 (image 3).
Score only composition, hierarchy, typography, image use, CTA emphasis, card craft, professionalism, and responsiveness.
Do not copy testimonials, star ratings, FDA/GMP seals, discounts, free shipping, or medical claims from the reference.
Do not penalize missing testimonials, seals, or discounts when the product contract does not support them.
Return JSON only. The response must be a json object.`,
    userText: `Return a json object. Score each visual dimension 0-100: ${VISUAL_DIMENSIONS.join(", ")}.
Also return desktopVisualScore, mobileVisualScore, criticalDefects (array of strings), rationales, and problems.
Each problem must be: {section, severity, problem, visualEvidence, referenceDifference, recommendedFix, expectedImpact, requiresContentChange}.
No generic advice. Target ${VISUAL_SCORE_TARGET}.
Images: 1=desktop first fold 1440x900, 2=mobile first fold 390x844, 3=official premium reference. Also consider desktop full-page composition if a fourth image is present. Problems must be an array of objects with string fields, not nested objects inside criticalDefects.`,
  };
}

function asScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error("Visual score is not a number.");
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asProblems(value: unknown): ActionableVisualProblem[] {
  if (!Array.isArray(value)) return [];
  const out: ActionableVisualProblem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const problem = String(item.problem ?? "").trim();
    const recommendedFix = String(item.recommendedFix ?? "").trim();
    if (!problem || !recommendedFix || GENERIC.test(problem) || GENERIC.test(recommendedFix)) continue;
    out.push({
      section: String(item.section ?? "page"),
      severity: item.severity === "HIGH" || item.severity === "LOW" ? item.severity : "MEDIUM",
      problem,
      visualEvidence: String(item.visualEvidence ?? ""),
      referenceDifference: String(item.referenceDifference ?? ""),
      recommendedFix,
      expectedImpact: item.expectedImpact === "HIGH" || item.expectedImpact === "LOW" ? item.expectedImpact : "MEDIUM",
      requiresContentChange: item.requiresContentChange === true,
    });
  }
  return out;
}

export function parseVisualEvaluationPayload(text: string): ParsedVisualEvaluation {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Visual evaluation JSON is missing.");
  const payload = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const rawScores = (payload.scores ?? payload) as Record<string, unknown>;
  const scores = {} as Record<VisualDimension, number>;
  const rationales = {} as Record<VisualDimension, string>;
  for (const dimension of VISUAL_DIMENSIONS) {
    const block = rawScores[dimension];
    if (block && typeof block === "object") {
      const row = block as Record<string, unknown>;
      scores[dimension] = asScore(row.score ?? row.value);
      rationales[dimension] = String(row.rationale ?? "");
    } else {
      scores[dimension] = asScore(rawScores[dimension]);
      rationales[dimension] = String((payload.rationales as Record<string, unknown> | undefined)?.[dimension] ?? "");
    }
  }
  const overall = weightedVisualScore(scores);
  const desktopVisualScore = payload.desktopVisualScore != null ? asScore(payload.desktopVisualScore) : overall;
  const mobileVisualScore = payload.mobileVisualScore != null ? asScore(payload.mobileVisualScore) : asScore(scores.MOBILE);
  const defectSource = Array.isArray(payload.criticalDefects) ? payload.criticalDefects : [];
  const criticalDefects = defectSource
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        return String(row.problem ?? row.message ?? row.defect ?? "").trim();
      }
      return "";
    })
    .filter((item) => item && item !== "[object Object]");
  const problems = asProblems(payload.problems).length ? asProblems(payload.problems) : asProblems(payload.criticalDefects);
  return {
    scores,
    rationales,
    overall,
    desktopVisualScore,
    mobileVisualScore,
    criticalDefects,
    problems,
  };
}

export function problemsAreActionable(problems: ActionableVisualProblem[]): boolean {
  return problems.length > 0 && problems.every((item) => item.problem.length > 12 && item.recommendedFix.length > 12 && !GENERIC.test(item.problem));
}
