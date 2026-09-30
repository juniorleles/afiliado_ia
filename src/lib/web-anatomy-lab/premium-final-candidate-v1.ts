/**
 * PREMIUM_LP_FINAL_CANDIDATE_V1
 * Lab-only presentation of the frozen V4 page used by Experiment C.
 * Does not write campaigns or V4 files. Does not change Experiment C.
 */
import type { Campaign } from "@/lib/campaigns";
import { parseCreativeCompositionPlan, serializeCreativeCompositionPlan } from "@/lib/creative/plan";
import { campaignForExperimentC } from "@/lib/web-anatomy-lab/experiment-c";

export const PREMIUM_FINAL_CANDIDATE_ID = "PREMIUM_LP_FINAL_CANDIDATE_V1";

/** In-memory campaign. Same V4 page as Experiment C, without the usage transition packshot. */
export function campaignForPremiumFinalCandidate(campaign: Campaign): Campaign {
  const view = campaignForExperimentC(campaign);
  const creative = parseCreativeCompositionPlan(view.creativeCompositionJson);
  if (!creative) return view;
  creative.scenes = creative.scenes.map((scene) =>
    scene.id === "usage" ? { ...scene, assetUse: "NONE", slot: null } : scene,
  );
  return {
    ...view,
    creativeCompositionJson: serializeCreativeCompositionPlan(creative),
  };
}
