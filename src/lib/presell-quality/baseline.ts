import { assessPresellQuality } from "@/lib/product-research/presell-quality";
import { acceptedProposals, approvedContentStatus } from "@/lib/product-research/approved-facts";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { assessmentFromScores } from "@/lib/presell-quality/evaluator";
import type { CriticalFailureCode, PresellQualityAssessment, QualityDimension } from "@/lib/presell-quality/types";

function score(dimension: QualityDimension, value: number, rationale: string) {
  return { dimension, score: value, rationale };
}

export function deterministicBaselineAssessment(input: {
  run: ProductResearchRun | null;
  campaignId: number;
  generationId?: string | null;
  desktopScreenshotReference?: string | null;
  mobileScreenshotReference?: string | null;
}): PresellQualityAssessment {
  const run = input.run;
  const accepted = acceptedProposals(run);
  const fields = new Set(accepted.map((item) => item.field));
  const media = selectReviewMedia({
    assets: run?.discoveredAssets,
    productName: run?.productName || "Product",
    campaignId: input.campaignId,
  });
  const research = assessPresellQuality({ run });
  const critical: CriticalFailureCode[] = [];
  if (approvedContentStatus(run) === "INSUFFICIENT_APPROVED_CONTENT" || !fields.has("description")) {
    critical.push("INSUFFICIENT_EDITORIAL_CONTENT");
  }
  if (media.heroStatus === "HERO_IMAGE_MISSING") critical.push("BROKEN_ESSENTIAL_LAYOUT");
  if (media.used.some((item) => item.approvalStatus !== "USER_APPROVED")) critical.push("UNAPPROVED_IMAGE_CONTEXT");

  const dimensions = [
    score(
      "DESIGN_HIERARCHY",
      media.heroStatus === "SELECTED" ? 70 : 32,
      media.heroStatus === "SELECTED" ? "A packshot is selected for the hero." : "The hero has no eligible packshot. The first screen is type-only.",
    ),
    score(
      "COPY_CLARITY",
      fields.has("description") && fields.has("howItWorks") ? 58 : 38,
      fields.has("description")
        ? "A derived or extracted description exists, but benefits and warnings are still absent."
        : "No approved description. Identity is carried by the product name alone.",
    ),
    score(
      "DEPTH_ORGANIZATION",
      Math.min(80, 20 + accepted.length * 12),
      `${accepted.length} approved fact field(s). Research completeness is a coverage score, not editorial depth.`,
    ),
    score(
      "IMAGES_COMPOSITION",
      media.heroStatus === "SELECTED" ? 72 : media.approvedCount > 0 ? 36 : 15,
      media.approvedCount
        ? `${media.approvedCount} approved images remain OTHER/gallery without a confirmed packshot hierarchy.`
        : "No approved images.",
    ),
    score("MOBILE_EXPERIENCE", 50, "Deterministic baseline does not inspect pixels. Mobile still needs a multimodal pass."),
    score(
      "TRANSPARENCY_LEGIBILITY",
      74,
      "Sandbox CTA, blocked commercial authorization, and seller-stated operational restatement are expected. They are not publication approval.",
    ),
  ];

  const assessment = assessmentFromScores(
    {
      campaignId: input.campaignId,
      generationId: input.generationId,
      desktopScreenshotReference: input.desktopScreenshotReference,
      mobileScreenshotReference: input.mobileScreenshotReference,
      evaluatorType: "DETERMINISTIC_BASELINE",
      evaluatorModel: "deterministic-baseline-v1",
      evidenceReferences: accepted.flatMap((item) => item.evidenceIds),
    },
    {
      dimensionScores: dimensions,
      criticalFailures: [...new Set(critical)],
      evaluatorType: "DETERMINISTIC_BASELINE",
      evaluationCompleted: true,
    },
  );
  assessment.findings = [
    ...assessment.findings.filter((item) => item.id !== "not-evaluated"),
    {
      id: "deterministic-only",
      dimension: "CRITICAL",
      severity: "INFO",
      message: "This baseline is structural. It is not a multimodal AI visual evaluation.",
      evidence: ["evaluatorType=DETERMINISTIC_BASELINE"],
    },
    {
      id: "hero",
      dimension: "DESIGN_HIERARCHY",
      severity: media.heroStatus === "HERO_IMAGE_MISSING" ? "BLOCKING" : "INFO",
      message: media.heroStatus === "HERO_IMAGE_MISSING" ? "HERO_IMAGE_MISSING. The first viewport has no product packshot." : "Hero packshot is selected.",
      evidence: [media.heroStatus],
    },
    {
      id: "completeness",
      dimension: "DEPTH_ORGANIZATION",
      severity: research.contentCompleteness === "INSUFFICIENT" ? "BLOCKING" : "WARNING",
      message: `CONTENT_COMPLETENESS=${research.contentCompleteness}. Editorial depth=${research.editorialDepth}.`,
      evidence: research.reasons,
    },
  ];
  assessment.recommendedActions = [
    {
      id: "confirm-packshot",
      action: "Human-confirm a bottle image as PRODUCT_PACKSHOT only if it represents the product without medical badges.",
      allowed: true,
      reason: "Classification is pending. Auto-promotion is forbidden.",
    },
    {
      id: "do-not-invent",
      action: "Do not invent benefits, price, manufacturer, or FAQ to raise the score.",
      allowed: false,
      reason: "Missing fields stay absent until evidence exists.",
    },
  ];
  return assessment;
}
