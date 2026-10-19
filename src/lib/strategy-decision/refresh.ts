import { readCampaignBrief } from "@/lib/campaign-brief";
import { factsForMarketResearch } from "@/lib/campaign-market";
import { getCampaignById } from "@/lib/campaigns";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import { decideStrategy } from "@/lib/strategy-decision/decide";
import { writeStoredStrategyDecision } from "@/lib/strategy-decision/store";

export function refreshStrategyDecision(campaignId: number): void {
  const campaign = getCampaignById(campaignId);
  if (!campaign) return;
  const facts = factsForMarketResearch(campaign, readCampaignBrief(campaignId));
  const analysis = readStoredMarketAnalysis(campaignId);
  writeStoredStrategyDecision(campaignId, decideStrategy({ facts, analysis }));
}
