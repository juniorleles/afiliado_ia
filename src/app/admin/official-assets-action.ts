"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { officialToolsPageAllowed } from "@/lib/official-assets/extract";
import {
  approveOfficialPromoAsset,
  discoverOfficialPromoHtml,
  listOfficialPromoAssets,
  rejectOfficialPromoAsset,
  storedProductName,
} from "@/lib/official-assets/store";

async function campaignOrNull(campaignId: number) {
  if (!Number.isInteger(campaignId) || campaignId < 1) return null;
  return getCampaignById(campaignId);
}

function refresh(campaignId: number, slug: string) {
  revalidatePath(`/admin/landing-pages/${campaignId}`);
  revalidatePath(`/admin/${campaignId}/edit`);
  revalidatePath(`/admin/lp-media/${campaignId}`);
  revalidatePath(`/admin/preview/${slug}`);
}

export async function discoverOfficialAssetsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  const campaign = await campaignOrNull(campaignId);
  const pageUrl = String(formData.get("pageUrl") ?? "").trim();
  if (!campaign || !officialToolsPageAllowed(pageUrl)) return;
  const response = await fetch(pageUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!response.ok) return;
  const html = await response.text();
  if (html.length > 2_000_000) return;
  discoverOfficialPromoHtml({
    campaignId,
    pageUrl,
    html,
    productName: storedProductName(campaign.sourceFactsJson ?? null, campaign.name),
  });
  refresh(campaign.id, campaign.slug);
}

export async function rejectOfficialAssetAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  const assetId = Number(formData.get("assetId"));
  const campaign = await campaignOrNull(campaignId);
  if (!campaign || !Number.isInteger(assetId)) return;
  rejectOfficialPromoAsset(campaignId, assetId, String(formData.get("reviewNote") ?? ""));
  refresh(campaign.id, campaign.slug);
}

export async function approveOfficialAssetAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  const assetId = Number(formData.get("assetId"));
  const campaign = await campaignOrNull(campaignId);
  if (!campaign || !Number.isInteger(assetId)) return;
  const assets = listOfficialPromoAssets(campaignId);
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) return;
  const response = await fetch(asset.originalUrl, { redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!response.ok) return;
  const bytes = Buffer.from(await response.arrayBuffer());
  approveOfficialPromoAsset({
    campaignId,
    assetId,
    bytes,
    embeddedTextCleared: formData.get("embeddedTextCleared") === "yes",
    productMatchConfirmed: formData.get("productMatchConfirmed") === "yes",
  });
  refresh(campaign.id, campaign.slug);
}
