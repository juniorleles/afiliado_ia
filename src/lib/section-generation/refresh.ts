import { readCampaignBrief, type CampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById, type Campaign } from "@/lib/campaigns";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import type { ProductFacts } from "@/lib/product-facts";
import { writeStoredCopyGeneration } from "@/lib/section-generation/copy-store";
import { averageGenerationTime, generateCampaignSections } from "@/lib/section-generation/run";
import { readStoredGeneratedSections, writeStoredGeneratedSections } from "@/lib/section-generation/store";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";

function factsForSections(campaign: Campaign, brief: CampaignBrief | null): ProductFacts {
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

export function refreshGeneratedSections(campaignId: number): void {
  const campaign = getCampaignById(campaignId);
  if (!campaign) return;
  const previous = readStoredGeneratedSections(campaignId);
  const sections = generateCampaignSections({
    facts: factsForSections(campaign, readCampaignBrief(campaignId)),
    analysis: readStoredMarketAnalysis(campaignId),
    decision: readStoredStrategyDecision(campaignId),
    previous,
  });
  const generatedAt = new Date().toISOString();
  const averageGenerationTimeMs = averageGenerationTime(sections);
  writeStoredGeneratedSections(campaignId, {
    version: 1,
    campaignId,
    generatedAt,
    averageGenerationTimeMs,
    sections,
  });
  writeStoredCopyGeneration(campaignId, {
    version: 1,
    campaignId,
    generatedAt,
    averageGenerationTimeMs,
    sections: sections.map((section) => ({
      sectionId: section.sectionId,
      promptId: section.sectionId,
      status: section.status,
      scores: section.scores,
      generationTime: section.generationTime,
      cached: section.cached,
    })),
  });
}
