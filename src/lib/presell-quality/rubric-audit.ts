import { buildMultimodalEvaluatorPrompt } from "@/lib/presell-quality/prompt";
import { QUALITY_DIMENSION_CRITERIA } from "@/lib/presell-quality/criteria";
import { QUALITY_DIMENSION_WEIGHTS, QUALITY_PROMPT_VERSION, QUALITY_RUBRIC_VERSION, QUALITY_TARGET } from "@/lib/presell-quality/types";

export const EXPECTED_QUALITY_WEIGHTS = {
  DESIGN_HIERARCHY: 0.25,
  COPY_CLARITY: 0.2,
  DEPTH_ORGANIZATION: 0.2,
  IMAGES_COMPOSITION: 0.15,
  MOBILE_EXPERIENCE: 0.1,
  TRANSPARENCY_LEGIBILITY: 0.1,
} as const;

export type RubricAudit = {
  rubricVersion: string;
  promptVersion: string;
  target: number;
  weights: typeof QUALITY_DIMENSION_WEIGHTS;
  weightsUnchanged: boolean;
  versionChanged: false;
  changeApplied: false;
  requiresClinicalBenefits: boolean;
  requiresTestimonials: boolean;
  requiresMedicalProof: boolean;
  requiresEfficacyClaims: boolean;
  informationalPageCanScoreHigh: boolean;
  stillPenalizesDeceptiveContent: boolean;
  observedModelBias: string[];
  justification: string;
};

const FORBIDDEN_REQUIREMENT =
  /require(s|d)? (clinical|testimonial|medical proof|efficacy)|must include (benefits?|testimonials?|results|clinical)/i;

export function auditQualityRubric(input?: { evaluatorRationales?: string[] }): RubricAudit {
  const prompt = buildMultimodalEvaluatorPrompt({
    campaignId: 0,
    generationId: "audit",
    productContractVersion: 1,
    rendererVersion: "v4",
    screenshots: {
      desktop: { path: "d.png", generationId: "audit", sha256: "0", width: 1440, height: 900, role: "desktop" },
      mobile: { path: "m.png", generationId: "audit", sha256: "1", width: 390, height: 844, role: "mobile" },
    },
    pageStructure: {},
    renderedCopy: "Documented product. One capsule daily.",
    approvedFacts: ["description", "howItWorks"],
    evidenceReferences: ["ev-audit"],
    approvedAssets: [],
    editorialConstraints: ["Do not invent benefits."],
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
  });
  const criteriaText = Object.values(QUALITY_DIMENSION_CRITERIA)
    .flatMap((item) => item.looksFor)
    .join("\n");
  const hostText = `${prompt.system}\n${criteriaText}`;
  const requiresForbidden = FORBIDDEN_REQUIREMENT.test(hostText);
  const informationalPageCanScoreHigh =
    /Do not penalize missing clinical claims, testimonials, or independent proof/i.test(prompt.system) &&
    /A short page that uses every approved fact without padding is complete/i.test(prompt.system);
  const stillPenalizesDeceptiveContent =
    /INVENTED_HEALTH_BENEFIT/.test(prompt.system) && /UNGROUNDED_CLAIM/.test(prompt.system);
  const observedModelBias = (input?.evaluatorRationales ?? []).filter((text) =>
    /benefit|testimonial|clinical|efficacy|result/i.test(text),
  );
  const weightsUnchanged = (Object.keys(EXPECTED_QUALITY_WEIGHTS) as Array<keyof typeof EXPECTED_QUALITY_WEIGHTS>).every(
    (key) => QUALITY_DIMENSION_WEIGHTS[key] === EXPECTED_QUALITY_WEIGHTS[key],
  );

  return {
    rubricVersion: QUALITY_RUBRIC_VERSION,
    promptVersion: QUALITY_PROMPT_VERSION,
    target: QUALITY_TARGET,
    weights: QUALITY_DIMENSION_WEIGHTS,
    weightsUnchanged,
    versionChanged: false,
    changeApplied: false,
    requiresClinicalBenefits: requiresForbidden,
    requiresTestimonials: requiresForbidden,
    requiresMedicalProof: requiresForbidden,
    requiresEfficacyClaims: requiresForbidden,
    informationalPageCanScoreHigh,
    stillPenalizesDeceptiveContent,
    observedModelBias: observedModelBias.slice(0, 8),
    justification:
      "Host rubric v1 / prompt v4 already forbids demanding unsupported medical claims. Model non-compliance on a single campaign is not a general rubric defect and does not authorize a weight change.",
  };
}
