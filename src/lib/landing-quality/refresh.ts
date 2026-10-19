import { readCampaignBrief, type CampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById, type Campaign } from "@/lib/campaigns";
import { readStoredLandingBlueprint } from "@/lib/landing-blueprint/store";
import { readStoredLandingDocument, writeStoredLandingDocument } from "@/lib/landing-composer/store";
import { runLandingQuality } from "@/lib/landing-quality/run";
import { writeStoredAutoFixHistory, writeStoredLandingQuality } from "@/lib/landing-quality/store";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import type { ProductFacts } from "@/lib/product-facts";
import { readStoredCopyGeneration, writeStoredCopyGeneration } from "@/lib/section-generation/copy-store";
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

export function refreshLandingQuality(campaignId: number): void {
  const campaign = getCampaignById(campaignId);
  const blueprint = readStoredLandingBlueprint(campaignId);
  const document = readStoredLandingDocument(campaignId);
  const generated = readStoredGeneratedSections(campaignId);
  if (!campaign || !blueprint || !document || !generated) return;
  const result = runLandingQuality({
    campaignId,
    document,
    sections: generated,
    facts: factsForSections(campaign, readCampaignBrief(campaignId)),
    analysis: readStoredMarketAnalysis(campaignId),
    decision: readStoredStrategyDecision(campaignId),
    blueprint,
  });
  const changed = result.sections.sections.some((section, index) => section !== generated.sections[index]);
  if (changed) {
    writeStoredGeneratedSections(campaignId, result.sections);
    const copy = readStoredCopyGeneration(campaignId);
    writeStoredCopyGeneration(campaignId, {
      version: 1,
      campaignId,
      generatedAt: copy?.generatedAt ?? result.quality.validatedAt,
      averageGenerationTimeMs: copy?.averageGenerationTimeMs ?? generated.averageGenerationTimeMs,
      sections: result.sections.sections.map((section) => ({
        sectionId: section.sectionId,
        promptId: section.sectionId,
        status: section.status,
        scores: section.scores,
        generationTime: section.generationTime,
        cached: section.cached,
      })),
    });
  }
  if (result.document !== document) writeStoredLandingDocument(campaignId, result.document);
  writeStoredLandingQuality(campaignId, result.quality);
  writeStoredAutoFixHistory(campaignId, result.history);
}
