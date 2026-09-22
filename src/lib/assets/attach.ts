import type { Campaign } from "@/lib/campaigns";
import { updateCampaignProductAsset } from "@/lib/campaigns";
import { applyProductImageToPage, parsePresellPage, serializePresellPage } from "@/lib/presell-page";
import { storeManualProductImage, validateManualProductUpload } from "@/lib/product-image";
import { evaluateProductAsset } from "@/lib/assets/status";
import { applyDesignToCampaign, assertNoCopyRewrite } from "@/lib/design/optimize";
import { acquireBestProductAsset, type AcquisitionResult } from "@/lib/assets/acquire";
import type { ProductFacts } from "@/lib/product-facts";

export async function attachManualProductAsset(campaign: Campaign, buffer: Buffer, mime: string) {
  const validated = validateManualProductUpload(buffer, mime);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const stored = storeManualProductImage(buffer, validated.mime);
  if (!stored) throw new Error("could not store image");
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) throw new Error("missing page composition");
  const nextPage = applyProductImageToPage(page, {
    src: stored.src,
    alt: page.hero.image.alt || `${campaign.name} product image`,
    provenance: "MANUAL",
  });
  const meta = evaluateProductAsset({
    page: nextPage,
    campaign: { productImageSrc: stored.src, productImageProvenance: "MANUAL" },
  });
  const updated = updateCampaignProductAsset(campaign.id, {
    productImageSrc: stored.src,
    productImageProvenance: "MANUAL",
    productAssetStatus: meta.status,
    productAssetMetadata: JSON.stringify(meta),
    pageComposition: serializePresellPage(nextPage),
  });
  assertNoCopyRewrite(campaign, updated);
  return applyDesignToCampaign(updated.slug);
}

export async function clearProductAsset(campaign: Campaign) {
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) throw new Error("missing page composition");
  const nextPage = applyProductImageToPage(page, {
    src: "",
    alt: page.hero.image.alt,
    provenance: "NOT_FOUND",
  });
  const meta = evaluateProductAsset({
    page: nextPage,
    campaign: { productImageSrc: null, productImageProvenance: "NOT_FOUND" },
  });
  const updated = updateCampaignProductAsset(campaign.id, {
    productImageSrc: null,
    productImageProvenance: "NOT_FOUND",
    productAssetStatus: "NEEDS_ASSET",
    productAssetMetadata: JSON.stringify(meta),
    pageComposition: serializePresellPage(nextPage),
  });
  assertNoCopyRewrite(campaign, updated);
  return applyDesignToCampaign(updated.slug);
}

export async function rediscoverCampaignProductAsset(campaign: Campaign): Promise<{
  campaign: Campaign;
  plan: Awaited<ReturnType<typeof applyDesignToCampaign>>["plan"];
  acquisition: AcquisitionResult;
}> {
  if (!campaign.sourceFactsJson) {
    throw new Error("missing source facts");
  }
  const facts = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
  if (!facts.sourceUrl) throw new Error("missing sourceUrl");
  const response = await fetch(facts.sourceUrl, {
    headers: { "user-agent": "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`source HTTP ${response.status}`);
  const html = await response.text();
  const acquisition = await acquireBestProductAsset(html, facts.sourceUrl || response.url);
  if (!acquisition.selected) {
    const applied = await applyDesignToCampaign(campaign.slug);
    return { campaign: applied.campaign, plan: applied.plan, acquisition };
  }
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) throw new Error("missing page composition");
  const nextPage = applyProductImageToPage(page, {
    src: acquisition.selected.localPath,
    alt: page.hero.image.alt || `${campaign.name} product image`,
    provenance: "DIRECT_SOURCE",
  });
  const meta = evaluateProductAsset({
    page: nextPage,
    campaign: { productImageSrc: acquisition.selected.localPath, productImageProvenance: "DIRECT_SOURCE" },
  });
  const updated = updateCampaignProductAsset(campaign.id, {
    productImageSrc: acquisition.selected.localPath,
    productImageProvenance: "DIRECT_SOURCE",
    productAssetStatus: meta.status,
    productAssetMetadata: JSON.stringify({
      ...meta,
      sourceUrl: acquisition.selected.url,
      role: acquisition.selected.role,
      classificationMethod: acquisition.selected.classificationMethod,
    }),
    pageComposition: serializePresellPage(nextPage),
  });
  assertNoCopyRewrite(campaign, updated);
  const applied = await applyDesignToCampaign(updated.slug);
  return { campaign: applied.campaign, plan: applied.plan, acquisition };
}
