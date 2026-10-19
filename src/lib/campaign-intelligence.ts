import type { CampaignBrief } from "@/lib/campaign-brief";
import type { Campaign } from "@/lib/campaigns";
import { factsForMarketResearch, recommendFromResearch, researchSlice } from "@/lib/campaign-market";
import { buildIntelligenceReport, type IntelligenceReportView } from "@/lib/intelligence-report";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { readKnowledgeText } from "@/lib/product-knowledge";

export function readCampaignIntelligence(campaign: Campaign, brief: CampaignBrief | null): IntelligenceReportView {
  const knowledge = readKnowledgeText(campaign, brief);
  const facts = resolveProductFacts(
    parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
    listManualOverrides(campaign.id),
  );
  const offerPrices = (facts.offerFacts ?? []).map((offer) => offer.unitPrice.trim()).filter(Boolean);
  const stored = readStoredMarketResearch(campaign.id);
  const researchFacts = factsForMarketResearch(campaign, brief);
  const recommendation = stored ? recommendFromResearch(researchFacts, stored.report) : null;
  const hosts = stored ? [...new Set(stored.report.sources.map((source) => source.domain).filter(Boolean))] : [];
  return buildIntelligenceReport({
    benefits: knowledge.text.benefits,
    ingredients: knowledge.text.ingredients,
    claims: (facts.ingredientContext ?? []).filter((entry) => entry.statement?.trim()).length,
    pricing: knowledge.text.pricing.trim() || offerPrices.join(" · "),
    guarantee: knowledge.text.guarantee,
    research: stored && recommendation ? researchSlice(researchFacts, stored.report, recommendation) : null,
    hosts,
  });
}
