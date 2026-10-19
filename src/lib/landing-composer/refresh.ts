import { readCampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById } from "@/lib/campaigns";
import { readStoredLandingBlueprint } from "@/lib/landing-blueprint/store";
import { composeLandingDocument } from "@/lib/landing-composer/compose";
import { readStoredLandingDocument, writeStoredLandingDocument } from "@/lib/landing-composer/store";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { readStoredGeneratedSections } from "@/lib/section-generation/store";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";

export function refreshLandingDocument(campaignId: number): void {
  const campaign = getCampaignById(campaignId);
  const blueprint = readStoredLandingBlueprint(campaignId);
  const generated = readStoredGeneratedSections(campaignId);
  if (!campaign || !blueprint || !generated) return;
  const brief = readCampaignBrief(campaignId);
  const facts = resolveProductFacts(
    parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
    listManualOverrides(campaign.id),
  );
  if (!facts.productName.trim()) facts.productName = brief?.productName?.trim() || campaign.name;
  const document = composeLandingDocument({
    campaignId,
    blueprint,
    generated,
    decision: readStoredStrategyDecision(campaignId),
    previous: readStoredLandingDocument(campaignId),
    facts,
  });
  writeStoredLandingDocument(campaignId, document);
}
