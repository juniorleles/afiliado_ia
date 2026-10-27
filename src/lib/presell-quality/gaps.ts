import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { classifyQualityFixes } from "@/lib/presell-quality/classify";
import type { PresellQualityAssessment } from "@/lib/presell-quality/types";
import { sha256Text } from "@/lib/presell-quality/fingerprint";

export const QUALITY_GAP_KINDS = [
  "PRESENTATION_GAP",
  "CONTENT_DEPTH_GAP",
  "EVIDENCE_GAP",
  "IMAGE_AVAILABILITY_GAP",
  "IMAGE_ELIGIBILITY_GAP",
  "SOURCE_AUTHORIZATION_GAP",
  "MODEL_EVALUATION_UNCERTAINTY",
] as const;
export type QualityGapKind = (typeof QUALITY_GAP_KINDS)[number];

export type QualityGap = {
  id: string;
  kind: QualityGapKind;
  severity: "INFO" | "WARNING" | "BLOCKING";
  observedEvidence: string[];
  probableCause: string;
  autoRecoverable: boolean;
  requiredSources: string[];
  proposedAction: string;
  resolution: "OPEN" | "RECOVERED" | "BLOCKED" | "NEEDS_HUMAN";
};

export type QualityGapReport = {
  campaignId: number;
  generationId: string | null;
  assessmentId: string | null;
  fingerprint: string;
  gaps: QualityGap[];
  presentationOnly: boolean;
};

function blob(assessment: PresellQualityAssessment | null): string {
  if (!assessment) return "";
  return [
    ...assessment.findings.map((item) => `${item.id} ${item.message}`),
    ...assessment.recommendedActions.map((item) => item.action),
    ...assessment.dimensionScores.map((item) => `${item.dimension} ${item.rationale}`),
  ].join("\n");
}

export function classifyQualityGaps(input: {
  assessment: PresellQualityAssessment | null;
  run: ProductResearchRun | null;
  previousScore?: number | null;
}): QualityGapReport {
  const assessment = input.assessment;
  const run = input.run;
  const accepted = acceptedProposals(run);
  const acceptedFields = new Set(accepted.map((item) => item.field));
  const media = selectReviewMedia({
    assets: run?.discoveredAssets,
    productName: run?.productName || "Product",
    campaignId: run?.campaignId ?? assessment?.campaignId ?? null,
  });
  const heroEligible = media.heroStatus === "SELECTED";
  const approvedImages = media.approvedCount;
  const text = blob(assessment);
  const gaps: QualityGap[] = [];
  const campaignId = assessment?.campaignId ?? run?.campaignId ?? 0;

  if (/sandbox/i.test(text) && /commercial|live hop|purchase|misleading/i.test(text)) {
    gaps.push({
      id: "sandbox-uncertainty",
      kind: "MODEL_EVALUATION_UNCERTAINTY",
      severity: "WARNING",
      observedEvidence: ["Evaluator mentioned SANDBOX in a commercial-defect context."],
      probableCause: "The model may treat a labeled lab CTA as a published commercial hop.",
      autoRecoverable: false,
      requiredSources: [],
      proposedAction: "Diagnose calibration. Do not change the page to hide SANDBOX labeling.",
      resolution: "OPEN",
    });
  }

  if (typeof input.previousScore === "number" && assessment?.overallScore != null && assessment.overallScore <= input.previousScore) {
    gaps.push({
      id: "score-regression",
      kind: "MODEL_EVALUATION_UNCERTAINTY",
      severity: "INFO",
      observedEvidence: [`Score moved ${input.previousScore} → ${assessment.overallScore} after a presentation-only change.`],
      probableCause: "Evaluator variance or over-penalizing a missing packshot across unrelated dimensions.",
      autoRecoverable: false,
      requiredSources: [],
      proposedAction: "Calibrate the prompt. Do not restyle the page to chase a 1-point swing.",
      resolution: "OPEN",
    });
  }

  if (!heroEligible && approvedImages === 0) {
    gaps.push({
      id: "no-images",
      kind: "IMAGE_AVAILABILITY_GAP",
      severity: "BLOCKING",
      observedEvidence: ["No USER_APPROVED images are available."],
      probableCause: "Research did not produce approved product imagery.",
      autoRecoverable: true,
      requiredSources: ["Official or affiliate-resource product pages already seeded for this campaign."],
      proposedAction: "Discover image candidates. Do not fabricate a packshot.",
      resolution: "OPEN",
    });
  } else if (!heroEligible) {
    gaps.push({
      id: "hero-ineligible",
      kind: "IMAGE_ELIGIBILITY_GAP",
      severity: "BLOCKING",
      observedEvidence: [
        "HERO_IMAGE_MISSING.",
        `${approvedImages} approved gallery image(s) are not PRODUCT_PACKSHOT.`,
      ],
      probableCause: "Approved images are not placement-eligible for hero.",
      autoRecoverable: false,
      requiredSources: ["Human confirmation of packshot kind, or a newly approved packshot."],
      proposedAction: "Prepare identity/rights candidates. Do not promote a gallery bottle to hero.",
      resolution: "NEEDS_HUMAN",
    });
  }

  const editorialFields = ["description", "howItWorks", "ingredients", "warnings", "faq", "benefits", "pricing", "manufacturer"] as const;
  const missingEditorial = editorialFields.filter((field) => !acceptedFields.has(field));
  if (missingEditorial.length || /thin|insufficient|superficial|lack of (detail|depth)|basic usage/i.test(text)) {
    const missingEvidence = missingEditorial.filter((field) => field === "warnings" || field === "faq" || field === "benefits" || field === "pricing" || field === "manufacturer");
    if (missingEvidence.length) {
      gaps.push({
        id: "missing-evidence-fields",
        kind: "EVIDENCE_GAP",
        severity: "BLOCKING",
        observedEvidence: missingEvidence.map((field) => `${field} is not an accepted fact.`),
        probableCause: "Research coverage did not yield human-accepted copy for those fields.",
        autoRecoverable: true,
        requiredSources: ["Same-host informational pages ranked for cautions, FAQ, and features."],
        proposedAction: "Re-run gap-fill research. New extracts stay pending until human acceptance.",
        resolution: "OPEN",
      });
    }
    gaps.push({
      id: "thin-copy",
      kind: "CONTENT_DEPTH_GAP",
      severity: "WARNING",
      observedEvidence: [
        `${accepted.length} accepted fact field(s).`,
        "Approved facts are seller-stated unless independently supported.",
      ],
      probableCause: "The page can only restate accepted facts. Missing fields cannot be invented.",
      autoRecoverable: false,
      requiredSources: missingEditorial.map((field) => `Accepted ${field} evidence`),
      proposedAction: "Rebuild from accepted facts only. Do not pad with generic copy.",
      resolution: accepted.length ? "OPEN" : "BLOCKED",
    });
  }

  const sellerOnly = accepted.filter((item) => item.sourceClass === "AFFILIATE_RESOURCE" || item.sourceClass === "SELLER" || item.verification === "SELLER_STATED");
  if (sellerOnly.length && /independent|proof|clinical/i.test(text)) {
    gaps.push({
      id: "seller-not-independent",
      kind: "EVIDENCE_GAP",
      severity: "WARNING",
      observedEvidence: [`${sellerOnly.length} accepted field(s) are seller/affiliate-stated.`],
      probableCause: "Seller claims were treated as independent proof.",
      autoRecoverable: false,
      requiredSources: ["INDEPENDENT_REFERENCE pages, if any exist on the seeded host set."],
      proposedAction: "Keep seller text attributed. Do not restatement-strengthen it.",
      resolution: "OPEN",
    });
  }

  if (/hop|commercial authorization|google ads|publish/i.test(text) || assessment?.commercialAuthorization === "BLOCKED") {
    gaps.push({
      id: "commercial-block",
      kind: "SOURCE_AUTHORIZATION_GAP",
      severity: "BLOCKING",
      observedEvidence: ["Commercial authorization remains BLOCKED."],
      probableCause: "Quality recovery cannot authorize hops, ads, or publication.",
      autoRecoverable: false,
      requiredSources: [],
      proposedAction: "Record the pending authorization. Do not enable a live CTA.",
      resolution: "BLOCKED",
    });
  }

  const presentation = assessment
    ? classifyQualityFixes({ assessment, heroEligible, previous: null })
    : { applied: [] as string[] };
  const presentationUseful = presentation.applied.length > 0 && heroEligible;
  if (presentation.applied.length && !heroEligible) {
    gaps.push({
      id: "layout-will-not-fix-hero",
      kind: "PRESENTATION_GAP",
      severity: "INFO",
      observedEvidence: presentation.applied,
      probableCause: "Layout tweaks cannot create an eligible packshot.",
      autoRecoverable: true,
      requiredSources: [],
      proposedAction: "Keep information-first composition. Skip repeating CSS-only loops.",
      resolution: "RECOVERED",
    });
  } else if (presentationUseful) {
    gaps.push({
      id: "presentation",
      kind: "PRESENTATION_GAP",
      severity: "WARNING",
      observedEvidence: presentation.applied,
      probableCause: "Rendered presentation can still be tightened from approved material.",
      autoRecoverable: true,
      requiredSources: [],
      proposedAction: "Apply allowed presentation fixes only.",
      resolution: "OPEN",
    });
  }

  const fingerprint = sha256Text(
    JSON.stringify({
      campaignId,
      generationId: assessment?.generationId ?? null,
      assessmentId: assessment?.assessmentId ?? null,
      kinds: gaps.map((item) => item.kind),
      accepted: [...acceptedFields],
      hero: media.heroStatus,
    }),
  );

  return {
    campaignId,
    generationId: assessment?.generationId ?? null,
    assessmentId: assessment?.assessmentId ?? null,
    fingerprint,
    gaps,
    presentationOnly: gaps.every((item) => item.kind === "PRESENTATION_GAP" || item.kind === "MODEL_EVALUATION_UNCERTAINTY"),
  };
}
