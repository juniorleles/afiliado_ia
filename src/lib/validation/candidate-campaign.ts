import type { Campaign } from "@/lib/campaigns";
import { parsePresellPage } from "@/lib/presell-page";
import type { ValidationCandidate } from "@/lib/validation/types";
import { VALIDATION_SAFE_AFFILIATE } from "@/lib/validation/constants";

export function candidateToSyntheticCampaign(candidate: ValidationCandidate): Campaign {
  const page = parsePresellPage(candidate.pageCompositionJson);
  return {
    id: 0,
    name: candidate.productName,
    slug: `validation-${candidate.id}`,
    headline: page?.hero.headline || candidate.productName,
    body: "",
    ctaLabel: page?.ctaLabel || "See current offer",
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    pageTemplate: candidate.template,
    pageComposition: candidate.pageCompositionJson,
    productImageSrc: page?.hero.image.src || null,
    productImageProvenance: page?.hero.image.provenance || null,
    subheadline: page?.hero.subheadline || null,
    sourceFactsJson: candidate.factsJson,
    designPlanJson: candidate.designPlanJson,
    visualTheme: candidate.theme,
    designVersion: 2,
    productAssetStatus: candidate.assetQa.packshotFound ? "READY" : "NEEDS_ASSET",
    productAssetMetadata: JSON.stringify(candidate.assetQa),
    creativeCompositionJson: candidate.creativeJson,
    creativeCompositionVersion: 1,
  };
}
