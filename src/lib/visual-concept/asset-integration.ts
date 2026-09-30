import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { VISUAL_ASSET_BINDINGS, type IntegratedVisualAssets, type VisualAssetBinding } from "@/lib/visual-concept/asset-binding";
import type { VisualAssetSemanticRole } from "@/lib/visual-concept/asset-manifest";
import { visualDesignRoot } from "@/lib/visual-concept/store";

const SAFE_TOKEN = /^[a-z0-9_-]+$/i;

export type { IntegratedVisualAssets };

type ProvenanceRecord = {
  assetId?: string;
  semanticRoles?: VisualAssetSemanticRole[];
  containsProduct?: boolean;
  containsPerson?: boolean;
  textAllowed?: boolean;
  generatedAssetIsEvidence?: boolean;
  factualAuthority?: boolean | "NONE";
  evidenceAuthority?: boolean;
};

function claimsEvidence(value: boolean | "NONE" | undefined): boolean {
  return value === true;
}

const ROLE_TO_BINDING = new Map<VisualAssetSemanticRole, VisualAssetBinding>(
  Object.entries(VISUAL_ASSET_BINDINGS).map(([binding, role]) => [role, binding as VisualAssetBinding]),
);

/** Roles with an accepted decorative source. A role stays unbound until its own provenance exists. */
const PAGE_INTEGRATED_ROLES = new Set<VisualAssetSemanticRole>([
  "HERO_ATMOSPHERE",
  "EDITORIAL_MATERIAL",
  "FEATURE_VISUAL",
  "PHOTOGRAPHIC_PAUSE",
  "USAGE_VISUAL",
  "DECISION_BACKGROUND",
]);

export function generatedVisualAssetFile(slug: string, assetId: string, root = visualDesignRoot()): string | null {
  if (!SAFE_TOKEN.test(slug) || !SAFE_TOKEN.test(assetId)) return null;
  const base = path.resolve(root, slug, "visual-master", "assets", "generated");
  const file = path.resolve(base, `${assetId}.png`);
  if (!file.startsWith(base + path.sep) || !existsSync(file)) return null;
  return file;
}

/** Maps semantic roles to generated files. Missing roles stay unbound. */
export function integratedVisualAssetSources(slug: string, root = visualDesignRoot()): IntegratedVisualAssets {
  if (!SAFE_TOKEN.test(slug)) return {};
  const provenanceDir = path.join(root, slug, "visual-master", "assets", "provenance");
  if (!existsSync(provenanceDir)) return {};
  const sources: IntegratedVisualAssets = {};
  for (const name of readdirSync(provenanceDir)) {
    if (!name.endsWith(".json") || name === "plan.json") continue;
    let record: ProvenanceRecord;
    try {
      record = JSON.parse(readFileSync(path.join(provenanceDir, name), "utf8")) as ProvenanceRecord;
    } catch {
      continue;
    }
    if (!record.assetId || !generatedVisualAssetFile(slug, record.assetId, root)) continue;
    if (record.containsProduct || record.containsPerson || record.textAllowed) continue;
    if (claimsEvidence(record.generatedAssetIsEvidence) || claimsEvidence(record.factualAuthority) || claimsEvidence(record.evidenceAuthority)) continue;
    const src = `/media/visual-asset/${slug}/${record.assetId}`;
    for (const role of record.semanticRoles ?? []) {
      if (!PAGE_INTEGRATED_ROLES.has(role)) continue;
      const binding = ROLE_TO_BINDING.get(role);
      if (binding) sources[binding] = src;
    }
  }
  return sources;
}
