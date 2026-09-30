import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Campaign } from "@/lib/campaigns";
import { mediaStorageKind } from "@/lib/env";
import { isSafeImageFilename, productImageDir } from "@/lib/product-image";
import { applyProductionCandidate, PRODUCTION_PRESENTATION_ID } from "@/lib/production-candidate-view";
import { productVisualFile, readProductVisualPlan } from "@/lib/product-visual/load";
import { PRODUCT_VISUAL_ROLES, type ProductVisualRole } from "@/lib/product-visual/types";
import { generatedVisualAssetFile } from "@/lib/visual-concept/asset-integration";
import { visualDesignRoot } from "@/lib/visual-concept/store";

/** Server-only deploy check. Resolves media through the same functions the public routes use. */

export type MediaRequirementKind =
  | "PRODUCT_IMAGE"
  | "VISUAL_ASSET_PLAN"
  | "VISUAL_ASSET"
  | "PRODUCT_VISUAL_PLAN"
  | "PRODUCT_VISUAL_ROLE";

export type MediaRequirement = {
  kind: MediaRequirementKind;
  ref: string;
  file: string | null;
  present: boolean;
  detail?: string;
};

export type CampaignMediaReport = {
  campaignId: number;
  slug: string;
  presentation: "VISUAL_MASTER" | "LEGACY";
  requirements: MediaRequirement[];
  missing: MediaRequirement[];
  ok: boolean;
};

const PRODUCT_IMAGE_REF = /\/media\/product\/([^"'\s?#)\\]+)/g;

function relative(file: string | null): string | null {
  return file ? path.relative(process.cwd(), file).replace(/\\/g, "/") : null;
}

function productImageRequirements(campaign: Campaign): MediaRequirement[] {
  const names = new Set<string>();
  for (const match of JSON.stringify(campaign).matchAll(PRODUCT_IMAGE_REF)) names.add(match[1]);
  const local = mediaStorageKind() === "LOCAL";
  return [...names].sort().map((name) => {
    const file = isSafeImageFilename(name) ? path.join(productImageDir(), name) : null;
    const present = local && file !== null && existsSync(file);
    const detail = !file ? "unsafe filename" : local ? undefined : "MEDIA_STORAGE is not LOCAL; object storage is not verifiable offline";
    return { kind: "PRODUCT_IMAGE", ref: `/media/product/${name}`, file: relative(file), present, detail };
  });
}

function visualAssetRequirements(slug: string, root: string): MediaRequirement[] {
  const assetsDir = path.join(root, slug, "visual-master", "assets");
  const planFile = path.join(assetsDir, "provenance", "plan.json");
  const out: MediaRequirement[] = [];
  if (!existsSync(planFile)) {
    return [{ kind: "VISUAL_ASSET_PLAN", ref: `${slug}/visual-master/assets/provenance/plan.json`, file: relative(planFile), present: false }];
  }
  out.push({ kind: "VISUAL_ASSET_PLAN", ref: `${slug}/visual-master/assets/provenance/plan.json`, file: relative(planFile), present: true });
  const declared = new Set<string>();
  try {
    const plan = JSON.parse(readFileSync(planFile, "utf8")) as { generatedFiles?: unknown };
    for (const entry of Array.isArray(plan.generatedFiles) ? plan.generatedFiles : []) {
      const match = typeof entry === "string" ? /^generated\/([a-z0-9-]+)\.png$/i.exec(entry) : null;
      if (match) declared.add(match[1]);
      else out.push({ kind: "VISUAL_ASSET", ref: String(entry), file: null, present: false, detail: "unrecognized generated file entry" });
    }
  } catch {
    out[0] = { ...out[0], present: false, detail: "unreadable plan.json" };
  }
  const provenanceDir = path.join(assetsDir, "provenance");
  for (const name of readdirSync(provenanceDir)) {
    if (!name.endsWith(".json") || name === "plan.json") continue;
    try {
      const record = JSON.parse(readFileSync(path.join(provenanceDir, name), "utf8")) as { assetId?: unknown };
      if (typeof record.assetId === "string") declared.add(record.assetId);
    } catch {
      out.push({ kind: "VISUAL_ASSET", ref: `provenance/${name}`, file: null, present: false, detail: "unreadable provenance record" });
    }
  }
  for (const assetId of [...declared].sort()) {
    const file = generatedVisualAssetFile(slug, assetId, root);
    const expected = path.join(assetsDir, "generated", `${assetId}.png`);
    out.push({ kind: "VISUAL_ASSET", ref: `/media/visual-asset/${slug}/${assetId}`, file: relative(file ?? expected), present: file !== null });
  }
  return out;
}

function productVisualRequirements(slug: string, root: string): MediaRequirement[] {
  const planFile = path.join(root, slug, "visual-master", "product-visual-plan.json");
  const plan = readProductVisualPlan(slug, root);
  const planReq: MediaRequirement = {
    kind: "PRODUCT_VISUAL_PLAN",
    ref: `${slug}/visual-master/product-visual-plan.json`,
    file: relative(planFile),
    present: plan !== null,
    detail: plan === null && existsSync(planFile) ? "plan rejected by the runtime loader" : undefined,
  };
  if (!plan) return [planReq];
  const roles = (Object.keys(plan.roles) as ProductVisualRole[]).filter((role) => PRODUCT_VISUAL_ROLES.includes(role) && plan.roles[role]);
  return [
    planReq,
    ...roles.sort().map((role): MediaRequirement => {
      const file = productVisualFile(slug, role, root);
      const source = plan.sources.find((item) => item.assetId === plan.roles[role]?.assetId);
      return {
        kind: "PRODUCT_VISUAL_ROLE",
        ref: `/media/product-visual/${slug}/${role}`,
        file: relative(file) ?? source?.localPath ?? null,
        present: file !== null,
      };
    }),
  ];
}

/**
 * What the public page for this campaign reads from disk. The visual-master presentation
 * requires its persisted asset plan and product-visual plan; declared files must exist.
 */
export function campaignMediaReport(stored: Campaign, root = visualDesignRoot()): CampaignMediaReport {
  const campaign = applyProductionCandidate(stored);
  const visualMaster = campaign.productionPresentation === PRODUCTION_PRESENTATION_ID;
  const requirements = visualMaster
    ? [...visualAssetRequirements(campaign.slug, root), ...productVisualRequirements(campaign.slug, root)]
    : productImageRequirements(campaign);
  const missing = requirements.filter((item) => !item.present);
  return {
    campaignId: campaign.id,
    slug: campaign.slug,
    presentation: visualMaster ? "VISUAL_MASTER" : "LEGACY",
    requirements,
    missing,
    ok: missing.length === 0,
  };
}
