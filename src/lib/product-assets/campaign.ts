import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readAffiliateProgram } from "@/lib/affiliate-program";
import { listCampaigns, type Campaign } from "@/lib/campaigns";
import { campaignAssetDir, listOfficialPromoAssets, storedProductName } from "@/lib/official-assets/store";
import { buildProductAssetsContract, evaluateCandidates } from "@/lib/product-assets/evaluate";
import { candidateFromLegacyHero, candidateFromOfficialRow, declaredHostsFrom, officialHostsFrom } from "@/lib/product-assets/from-official";
import { readAuthorizationRegistry } from "@/lib/product-assets/registry";
import { measureBytes } from "@/lib/product-assets/technical";
import type { AssetEvaluation, MeasuredImage, ProductAssetCandidate, ProductAssetsContract } from "@/lib/product-assets/types";

/** Hosts of the affiliate platforms that run official asset APIs. Platform data, not product data. */
const PLATFORM_HOSTS: Record<string, string[]> = { ClickBank: ["clickbank.com", "clickbank.net"] };

/** Server entry. Reads stored rows and, for approved files only, the stored copy. It never fetches and never writes. */

export type CampaignProductAssets = {
  contract: ProductAssetsContract;
  candidates: ProductAssetCandidate[];
  evaluations: AssetEvaluation[];
  /** Hosts used as the product's own domains. Recorded so an audit can show its premises. */
  officialHosts: string[];
  declaredAssetHosts: string[];
};

function sourceUrlOf(sourceFactsJson: string | null | undefined): string | null {
  try {
    const parsed = JSON.parse(sourceFactsJson || "{}") as { sourceUrl?: unknown };
    return typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : null;
  } catch {
    return null;
  }
}

function measureStored(campaignId: number, localFile: string | null, now: string): MeasuredImage | null {
  const name = localFile?.split("/").pop();
  if (!name || !/^\d+\.(?:jpg|png|webp)$/.test(name)) return null;
  const file = path.join(campaignAssetDir(campaignId), name);
  if (!existsSync(file)) return null;
  return measureBytes(readFileSync(file), { httpStatus: 200, contentType: null, checkedAt: now });
}

export function resolveCampaignProductAssets(campaign: Campaign, now: () => string = () => new Date().toISOString()): CampaignProductAssets {
  const productName = storedProductName(campaign.sourceFactsJson ?? null, campaign.name);
  const rows = listOfficialPromoAssets(campaign.id);
  const program = readAffiliateProgram(campaign.id);
  const stamp = now();
  const records = readAuthorizationRegistry(campaignAssetDir(campaign.id));

  const candidates: ProductAssetCandidate[] = rows.map((row) =>
    candidateFromOfficialRow(row, productName, {
      measured: row.status === "approved" ? measureStored(campaign.id, row.localFile, stamp) : null,
      record: records.get(row.originalUrl) ?? null,
    }),
  );
  const attached = campaign.productImageSrc?.trim();
  if (attached && !rows.some((row) => row.status === "approved" && row.localFile === attached)) {
    candidates.push(candidateFromLegacyHero({ productName, src: attached, provenance: campaign.productImageProvenance, observedAt: stamp }));
  }

  const officialHosts = officialHostsFrom([
    sourceUrlOf(campaign.sourceFactsJson),
    program?.affiliatePageUrl,
    program?.productSalesUrl,
    program?.termsUrl,
    ...rows.map((row) => row.sourcePage),
  ]);
  const declaredAssetHosts = declaredHostsFrom(rows);
  const otherProducts = listCampaigns()
    .filter((other) => other.id !== campaign.id)
    .map((other) => storedProductName(other.sourceFactsJson ?? null, other.name))
    .filter(Boolean);

  const evaluations = evaluateCandidates(candidates, {
    productName,
    officialHosts,
    declaredAssetHosts,
    otherProducts,
    programHosts: program ? (PLATFORM_HOSTS[program.platform] ?? []) : [],
    now: stamp,
  });
  return {
    contract: buildProductAssetsContract(productName, candidates, evaluations),
    candidates,
    evaluations,
    officialHosts,
    declaredAssetHosts,
  };
}
