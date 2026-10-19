import { readCampaignBrief, type CampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById, type Campaign } from "@/lib/campaigns";
import { configuredOrigin, originIsHttps } from "@/lib/env";
import { buildGoogleAdsPackage } from "@/lib/google-ads-generation/build";
import { writeStoredGoogleAdsPackage } from "@/lib/google-ads-generation/store";
import { readStoredLandingDocument } from "@/lib/landing-composer/store";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import type { ProductFacts } from "@/lib/product-facts";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";

function factsForAds(campaign: Campaign, brief: CampaignBrief | null): ProductFacts {
  const facts = resolveProductFacts(
    parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
    listManualOverrides(campaign.id),
  );
  const copy: ProductFacts = {
    ...facts,
    features: [...facts.features],
    ingredientsOrComponents: [...facts.ingredientsOrComponents],
    usageInformation: [...facts.usageInformation],
    cautions: [...facts.cautions],
    importWarnings: [...facts.importWarnings],
  };
  if (!copy.productName.trim()) copy.productName = brief?.productName?.trim() || campaign.name;
  return copy;
}

export function refreshGoogleAdsPackage(campaignId: number): void {
  const campaign = getCampaignById(campaignId);
  if (!campaign) return;
  const brief = readCampaignBrief(campaignId);
  const origin = configuredOrigin();
  const bundle = buildGoogleAdsPackage({
    campaignId,
    slug: campaign.slug,
    published: campaign.publicationStatus === "published",
    origin: origin && originIsHttps(origin) ? origin : null,
    brand: brief?.brand?.trim() || null,
    facts: factsForAds(campaign, brief),
    analysis: readStoredMarketAnalysis(campaignId),
    decision: readStoredStrategyDecision(campaignId),
    document: readStoredLandingDocument(campaignId),
  });
  writeStoredGoogleAdsPackage(campaignId, bundle);
}
