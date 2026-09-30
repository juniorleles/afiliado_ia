import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { planProductVisual } from "@/lib/product-visual/plan";
import {
  PRODUCT_ASSET_CLASSES,
  PRODUCT_VISUAL_ROLES,
  type ProductAssetClass,
  type ProductDominance,
  type ProductVisualPlan,
  type ProductVisualRole,
  type ProductVisualSource,
  type ProductVisualTri,
  type RenderedProductShot,
  type RenderedProductVisuals,
} from "@/lib/product-visual/types";

export type { RenderedProductShot, RenderedProductVisuals };

const SAFE_SLUG = /^[a-z0-9-]+$/i;
const KNOWN_CLASSES = new Set<string>(PRODUCT_ASSET_CLASSES);

export type AuditProductCandidate = {
  candidateId: string;
  localPath: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  assetClass: string[];
  containsProduct: ProductVisualTri;
  containsPerson: ProductVisualTri;
  containsExternalIcons: ProductVisualTri;
  productDominance: ProductDominance;
  visualUsability: string[];
};

export type PersistedProductSource = {
  assetId: string;
  localPath: string;
  width: number;
  height: number;
};

export type PersistedProductVisualPlan = ProductVisualPlan & {
  assetInventoryReference: string;
  sources: PersistedProductSource[];
  unused: Array<{ assetId: string; reason: string }>;
};

export function sourcesFromAudit(candidates: AuditProductCandidate[]): ProductVisualSource[] {
  return candidates.flatMap((candidate) => {
    const assetClass = candidate.assetClass.filter((name): name is ProductAssetClass => KNOWN_CLASSES.has(name));
    if (!candidate.candidateId || !Number.isFinite(candidate.width) || !Number.isFinite(candidate.height)) return [];
    return [
      {
        assetId: candidate.candidateId,
        width: candidate.width,
        height: candidate.height,
        hasAlpha: candidate.hasAlpha,
        assetClass,
        containsProduct: candidate.containsProduct,
        containsPerson: candidate.containsPerson,
        containsExternalIcons: candidate.containsExternalIcons,
        productDominance: candidate.productDominance,
        visualUsability: candidate.visualUsability,
      },
    ];
  });
}

export function persistableProductVisualPlan(candidates: AuditProductCandidate[], inventoryReference: string): PersistedProductVisualPlan {
  const sources = sourcesFromAudit(candidates);
  const plan = planProductVisual({ assets: sources });
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate.localPath]));
  const selected = new Set(Object.values(plan.roles).map((role) => role?.assetId).filter(Boolean));
  return {
    ...plan,
    assetInventoryReference: inventoryReference,
    sources: sources
      .filter((source) => selected.has(source.assetId))
      .map((source) => ({
        assetId: source.assetId,
        localPath: byId.get(source.assetId) ?? "",
        width: source.width,
        height: source.height,
      }))
      .filter((source) => source.localPath),
    unused: candidates
      .filter((candidate) => !selected.has(candidate.candidateId))
      .map((candidate) => ({ assetId: candidate.candidateId, reason: "not selected for a product role" })),
  };
}

function planPath(slug: string, root: string): string {
  return path.join(root, slug, "visual-master", "product-visual-plan.json");
}

export function readProductVisualPlan(slug: string, root = path.join(process.cwd(), "data", "visual-design")): PersistedProductVisualPlan | null {
  if (!SAFE_SLUG.test(slug)) return null;
  const file = planPath(slug, root);
  if (!existsSync(file)) return null;
  const plan = JSON.parse(readFileSync(file, "utf8")) as PersistedProductVisualPlan;
  if (plan.imageTextReimportAllowed !== false || plan.factualAuthority !== false) return null;
  return plan;
}

export function productVisualFile(slug: string, role: string, root = path.join(process.cwd(), "data", "visual-design")): string | null {
  if (!SAFE_SLUG.test(slug) || !PRODUCT_VISUAL_ROLES.includes(role as ProductVisualRole)) return null;
  const plan = readProductVisualPlan(slug, root);
  const use = plan?.roles[role as ProductVisualRole];
  const source = plan?.sources.find((item) => item.assetId === use?.assetId);
  if (!source?.localPath || source.localPath.includes("..")) return null;
  const dataRoot = path.resolve(process.cwd(), "data");
  const file = path.resolve(process.cwd(), source.localPath);
  if (!file.startsWith(dataRoot + path.sep) || !existsSync(file)) return null;
  return file;
}

function shot(slug: string, plan: PersistedProductVisualPlan, roles: ProductVisualRole[]): RenderedProductShot | undefined {
  const use = plan.roles[roles[0]];
  if (!use || !productVisualFile(slug, roles[0])) return undefined;
  return {
    src: `/media/product-visual/${slug}/${roles[0]}`,
    width: use.width,
    height: use.height,
    assetId: use.assetId,
    roles,
  };
}

/** Reads a persisted plan. It does not discover or generate images. */
export function renderedProductVisuals(slug: string): RenderedProductVisuals {
  const plan = readProductVisualPlan(slug);
  if (!plan) return {};
  const bundle = plan.roles.PRODUCT_BUNDLE;
  const section = plan.roles.SECTION_PRODUCT_MOMENT;
  const shared = Boolean(bundle && section && bundle.assetId === section.assetId);
  const closing = plan.roles.CLOSING_PRODUCT_CUE;
  const hero = plan.roles.HERO_PRODUCT_PRIMARY;
  return {
    heroPrimary: shot(slug, plan, ["HERO_PRODUCT_PRIMARY"]),
    sectionMoment: shared ? shot(slug, plan, ["PRODUCT_BUNDLE", "SECTION_PRODUCT_MOMENT"]) : shot(slug, plan, ["SECTION_PRODUCT_MOMENT"]) ?? shot(slug, plan, ["PRODUCT_BUNDLE"]),
    closingCue: closing && hero && closing.assetId === hero.assetId ? shot(slug, plan, ["CLOSING_PRODUCT_CUE"]) : shot(slug, plan, ["CLOSING_PRODUCT_CUE"]),
  };
}
