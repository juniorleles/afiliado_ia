import { acceptedProposals, approvedContentStatus } from "@/lib/product-research/approved-facts";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import type { ProductResearchRun } from "@/lib/product-research/types";

export type PresellCompleteness = "COMPLETE" | "PARTIAL" | "INSUFFICIENT" | "BLOCKED";

export type PresellQualityAssessment = {
  researchCoverage: { total: number; max: number };
  approvedFactCoverage: { accepted: number; reviewable: number };
  editorialDepth: "THIN" | "ADEQUATE";
  imageEligibility: { approved: number; eligible: number; hero: string };
  visualCompleteness: "HERO_AND_GALLERY" | "GALLERY_ONLY" | "NONE";
  sandboxGenerationStatus: string;
  publicationReadiness: "BLOCKED";
  contentCompleteness: PresellCompleteness;
  reasons: string[];
};

export function assessPresellQuality(input: {
  run: ProductResearchRun | null;
  sandboxStatus?: string;
}): PresellQualityAssessment {
  const accepted = acceptedProposals(input.run);
  const fields = new Set(accepted.map((item) => item.field));
  const media = selectReviewMedia({
    assets: input.run?.discoveredAssets,
    productName: input.run?.productName || "Product",
    campaignId: input.run?.campaignId ?? null,
  });
  const reviewable = (input.run?.proposals ?? []).filter((item) => item.suggestedValue.trim() || item.status === "ACCEPTED").length;
  const editorialDepth = fields.has("description") || fields.has("benefits") ? "ADEQUATE" : "THIN";
  const visual =
    media.heroStatus === "SELECTED" && media.usedCount > 1
      ? "HERO_AND_GALLERY"
      : media.usedCount > 0
        ? "GALLERY_ONLY"
        : "NONE";
  const reasons: string[] = [];
  if (!fields.has("description")) reasons.push("No approved description.");
  if (!fields.has("howItWorks")) reasons.push("No approved usage directions.");
  if (!fields.has("warnings")) reasons.push("No approved warnings.");
  if (media.heroStatus === "HERO_IMAGE_MISSING") reasons.push("HERO_IMAGE_MISSING.");
  if (approvedContentStatus(input.run) === "INSUFFICIENT_APPROVED_CONTENT") {
    reasons.push("Approved facts are not enough for an editorial presell.");
  }
  const contentCompleteness: PresellCompleteness =
    accepted.length === 0
      ? "INSUFFICIENT"
      : editorialDepth === "ADEQUATE" && fields.has("howItWorks") && media.heroStatus === "SELECTED"
        ? "PARTIAL"
        : "INSUFFICIENT";
  return {
    researchCoverage: { total: input.run?.coverageTotal ?? 0, max: input.run?.coverageMax ?? 100 },
    approvedFactCoverage: { accepted: accepted.length, reviewable: Math.max(reviewable, accepted.length) },
    editorialDepth,
    imageEligibility: { approved: media.approvedCount, eligible: media.eligibleCount, hero: media.heroStatus },
    visualCompleteness: visual,
    sandboxGenerationStatus: input.sandboxStatus ?? "UNKNOWN",
    publicationReadiness: "BLOCKED",
    contentCompleteness,
    reasons,
  };
}
