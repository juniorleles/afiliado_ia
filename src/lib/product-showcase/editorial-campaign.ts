import { getCampaignById } from "@/lib/campaigns";
import { readStoredLandingBlueprint } from "@/lib/landing-blueprint/store";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import { type ProductFacts } from "@/lib/product-facts";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument } from "@/lib/product-showcase/editorial";
import {
  assessEditorialIntelligence,
  type EditorialIntelligenceReport,
  type EditorialPipelineContext,
} from "@/lib/product-showcase/editorial-intelligence";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT } from "@/lib/public-site";

function pipelineFor(campaignId: number): EditorialPipelineContext {
  const research = readStoredMarketResearch(campaignId);
  const analysis = readStoredMarketAnalysis(campaignId);
  const strategy = readStoredStrategyDecision(campaignId);
  const blueprint = readStoredLandingBlueprint(campaignId);
  return {
    researchPresent: Boolean(research),
    researchStatus: research?.report.status ?? null,
    researchSourceCount: research?.report.sources.length ?? 0,
    analysisPresent: Boolean(analysis),
    observedBenefits: analysis?.dominantBenefits.map((item) => item.label) ?? [],
    observedClaims: analysis?.dominantClaims.common.map((item) => item.text) ?? [],
    scientificTopics: analysis?.dominantScientificTopics.map((item) => item.type) ?? [],
    strategyPresent: Boolean(strategy),
    strategyApproach: strategy?.approachId ?? null,
    blueprintBlocking: blueprint?.validation.blocking ?? [],
  };
}

export function loadCampaignFacts(campaignId: number): ProductFacts | null {
  const campaign = getCampaignById(campaignId);
  if (!campaign?.sourceFactsJson) return null;
  try {
    const parsed = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Operator diagnosis. It does not render the public landing page. */
export function evaluateEditorialIntelligence(campaignId: number): EditorialIntelligenceReport | null {
  const facts = loadCampaignFacts(campaignId);
  if (!facts) return null;
  const plan = buildAdaptivePlan({ facts });
  const document = buildEditorialDocument({
    facts,
    plan,
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
  });
  return assessEditorialIntelligence({ facts, document, pipeline: pipelineFor(campaignId) });
}
