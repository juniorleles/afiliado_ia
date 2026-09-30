/**
 * Opens the LP Builder for a generated recommended landing page.
 * The generated composition is copied onto a draft campaign. Publication is unchanged.
 */

import { createCampaign, getCampaignById, getCampaignBySlug, type CampaignInput } from "@/lib/campaigns";
import { candidateToSyntheticCampaign } from "@/lib/validation/candidate-campaign";
import { getValidationCandidate, updateValidationCandidate } from "@/lib/validation/store";

function builderSlug(candidateId: string): string {
  const slug = `builder-${candidateId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 80) || "builder-page";
}

export function openBuilderForCandidate(candidateId: string): { ok: true; campaignId: number } | { ok: false } {
  const candidate = getValidationCandidate(candidateId);
  if (!candidate?.pageCompositionJson) return { ok: false };
  if (candidate.campaignId) {
    const linked = getCampaignById(candidate.campaignId);
    if (linked) return { ok: true, campaignId: linked.id };
  }
  const slug = builderSlug(candidate.id);
  const existing = getCampaignBySlug(slug);
  if (existing) {
    updateValidationCandidate(candidate.id, { campaignId: existing.id });
    return { ok: true, campaignId: existing.id };
  }
  const synthetic = candidateToSyntheticCampaign(candidate);
  const input: CampaignInput = {
    name: synthetic.name || "Landing page",
    slug,
    headline: synthetic.headline,
    body: synthetic.headline || "Generated landing page",
    ctaLabel: synthetic.ctaLabel,
    affiliateUrl: synthetic.affiliateUrl,
    headScript: null,
    adHeadline: null,
    pageTemplate: synthetic.pageTemplate,
    pageComposition: synthetic.pageComposition,
    productImageSrc: synthetic.productImageSrc,
    productImageProvenance: synthetic.productImageProvenance,
    subheadline: synthetic.subheadline,
    sourceFactsJson: synthetic.sourceFactsJson,
    designPlanJson: synthetic.designPlanJson,
    visualTheme: synthetic.visualTheme,
    designVersion: synthetic.designVersion,
  };
  const created = createCampaign(input);
  updateValidationCandidate(candidate.id, { campaignId: created.id });
  return { ok: true, campaignId: created.id };
}
