import { readCampaignBrief } from "@/lib/campaign-brief";
import { factsForMarketResearch } from "@/lib/campaign-market";
import { getCampaignById } from "@/lib/campaigns";
import { buildLandingBlueprint } from "@/lib/landing-blueprint/build";
import { readStoredLandingBlueprint, writeStoredLandingBlueprint } from "@/lib/landing-blueprint/store";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";

export function refreshLandingBlueprint(campaignId: number): void {
  const campaign = getCampaignById(campaignId);
  if (!campaign) return;
  const brief = readCampaignBrief(campaignId);
  const previous = readStoredLandingBlueprint(campaignId);
  const blueprint = buildLandingBlueprint({
    campaignId,
    language: brief?.language || "en",
    facts: factsForMarketResearch(campaign, brief),
    analysis: readStoredMarketAnalysis(campaignId),
    decision: readStoredStrategyDecision(campaignId),
    report: readStoredMarketResearch(campaignId)?.report ?? null,
    previousVersion: previous?.blueprintVersion ?? 0,
  });
  writeStoredLandingBlueprint(campaignId, blueprint);
}
