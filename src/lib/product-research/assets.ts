import { getCampaignById } from "@/lib/campaigns";
import { decorateDiscoveredAssets, type AssetDecisionAction } from "@/lib/product-research/asset-display";
import { readProductResearchRun, writeProductResearchRun } from "@/lib/product-research/store";
import type { ProductResearchRun } from "@/lib/product-research/types";

export type { AssetDecisionAction } from "@/lib/product-research/asset-display";
export { decorateDiscoveredAssets, galleryKindFromAsset, mergeAssetDecisions, assetApprovalCounts } from "@/lib/product-research/asset-display";

export function decideDiscoveredAsset(input: {
  campaignId: number;
  runId: string;
  assetUrl: string;
  action: AssetDecisionAction;
}): ProductResearchRun {
  const campaign = getCampaignById(input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const run = readProductResearchRun(input.campaignId, input.runId);
  if (!run || run.campaignId !== input.campaignId) throw new Error("Research run not found.");
  const now = new Date().toISOString();
  const assets = decorateDiscoveredAssets(run.discoveredAssets);
  const target = assets.find((item) => item.assetUrl === input.assetUrl);
  if (!target) throw new Error("Asset not found.");
  if (input.action === "SET_HERO") {
    if (target.status !== "USER_APPROVED") throw new Error("Only an approved image can be the primary packshot.");
    return writeProductResearchRun({
      ...run,
      discoveredAssets: assets.map((item) => ({ ...item, hero: item.assetUrl === target.assetUrl })),
    });
  }
  if (input.action === "CONFIRM_KIND") {
    if (!target.kindProposal || target.kindProposal.status !== "PENDING") {
      throw new Error("No pending classification proposal exists for this image.");
    }
    const confirmed = target.kindProposal.proposedKind;
    return writeProductResearchRun({
      ...run,
      discoveredAssets: assets.map((item) =>
        item.assetUrl === target.assetUrl
          ? {
              ...item,
              galleryKind: confirmed,
              hero: item.hero,
              kindProposal: { ...item.kindProposal!, status: "CONFIRMED" as const },
            }
          : item,
      ),
    });
  }
  if (input.action === "ACCEPT" && target.status === "USER_APPROVED") {
    return writeProductResearchRun(run);
  }
  const nextStatus = input.action === "ACCEPT" ? "USER_APPROVED" : "REJECTED";
  return writeProductResearchRun({
    ...run,
    discoveredAssets: assets.map((item) =>
      item.assetUrl === target.assetUrl
        ? { ...item, status: nextStatus, hero: nextStatus === "REJECTED" ? false : item.hero, decidedAt: now }
        : item,
    ),
  });
}
