import type { Campaign } from "@/lib/campaigns";
import { parsePresellPage } from "@/lib/presell-page";

/** Public presentation id. Independent of visual-frame-lab query params. */
export const PRODUCTION_PRESENTATION_ID = "premium-final-candidate-v2";

export function hasProductionCandidate(campaign: Campaign): boolean {
  return (
    campaign.productionPresentation === PRODUCTION_PRESENTATION_ID &&
    Boolean(campaign.productionPageComposition?.trim()) &&
    Boolean(campaign.productionCreativeCompositionJson?.trim())
  );
}

/**
 * View used by the public route, admin preview, and publication gate.
 * Lab routes keep reading the stored pageComposition / creativeCompositionJson.
 */
export function applyProductionCandidate(campaign: Campaign): Campaign {
  if (!hasProductionCandidate(campaign)) return campaign;
  const page = parsePresellPage(campaign.productionPageComposition);
  return {
    ...campaign,
    pageComposition: campaign.productionPageComposition ?? campaign.pageComposition,
    creativeCompositionJson: campaign.productionCreativeCompositionJson ?? campaign.creativeCompositionJson,
    headline: page?.hero.headline || campaign.headline,
    subheadline: page?.hero.subheadline ?? campaign.subheadline,
    ctaLabel: page?.ctaLabel || campaign.ctaLabel,
    pageTemplate: page?.template || campaign.pageTemplate,
  };
}
