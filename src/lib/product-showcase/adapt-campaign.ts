import type { Campaign } from "@/lib/campaigns";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { readAffiliateProgram } from "@/lib/affiliate-program";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";
import { resolveCampaignProductAssets } from "@/lib/product-assets/campaign";
import { showcaseImageFromContract } from "@/lib/product-assets/evaluate";
import { adaptLandingToShowcase as adaptModel, type ShowcaseField } from "@/lib/product-showcase/adapt";

/** Server entry. The client preview must not import this file. */
export function adaptLandingToShowcase(
  campaign: Campaign,
  document: LandingDocument,
  options: {
    fields?: readonly ShowcaseField[];
    channel: "presell" | null;
    siteName: string;
    affiliateDisclosure: string;
    healthDisclaimer?: string | null;
    review?: { heading: string; paragraphs: readonly string[] } | null;
    footerLinks: Array<{ href: string; label: string }>;
  },
) {
  const program = readAffiliateProgram(campaign.id);
  // Only the approach id is read, and only to order sections. No research or strategy text reaches the page.
  const strategyApproach = readStoredStrategyDecision(campaign.id)?.approachId ?? null;
  // Only an approved, stored, documented asset can come from the contract. Image metadata never becomes copy.
  const approvedImage = showcaseImageFromContract(resolveCampaignProductAssets(campaign).contract);
  return adaptModel(campaign, document, {
    ...options,
    ppc: program ? { brandPpc: program.brandPpc, genericSearchPpc: program.genericSearchPpc } : null,
    strategyApproach,
    approvedImage,
  });
}
