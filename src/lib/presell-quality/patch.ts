import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import type { SectionType } from "@/lib/conversion-strategy/types";
import { DEFAULT_GENERATION_ROOT } from "@/lib/lp-generator/store";

export const ALLOWED_FIX_CODES = [
  "RETITLE_USAGE_SECTION",
  "RANK_GALLERY",
  "TIGHTEN_HERO_LAYOUT",
  "QUIET_SANDBOX_CTA",
  "IMPROVE_SECTION_TITLES",
] as const;
export type AllowedFixCode = (typeof ALLOWED_FIX_CODES)[number];

export const FORBIDDEN_FIX_CODES = [
  "PROMOTE_UNELIGIBLE_HERO",
  "INVENT_BENEFIT",
  "INVENT_TESTIMONIAL",
  "INVENT_HEALTH_CLAIM",
  "GENERATE_PACKSHOT",
  "APPROVE_ASSET",
  "CHANGE_INGREDIENT",
  "CHANGE_GUARANTEE",
  "AUTHORIZE_COMMERCIAL",
  "PUBLISH",
] as const;
export type ForbiddenFixCode = (typeof FORBIDDEN_FIX_CODES)[number];

export type QualityPresentationPatch = {
  titles?: Partial<Record<SectionType, string>>;
  galleryLead?: boolean;
  tightenHero?: boolean;
  sandboxQuiet?: boolean;
  applied: AllowedFixCode[];
  rejected: Array<{ code: ForbiddenFixCode | string; reason: string }>;
};

export function emptyPatch(): QualityPresentationPatch {
  return { applied: [], rejected: [] };
}

export function applyQualityPatch(model: V4Model, patch: QualityPresentationPatch): V4Model {
  return { ...model, qualityPatch: patch };
}

function patchFile(generationId: string, root = DEFAULT_GENERATION_ROOT): string {
  return path.join(root, generationId, "quality-patch.json");
}

export function readQualityPatch(generationId: string, root = DEFAULT_GENERATION_ROOT): QualityPresentationPatch | null {
  const file = patchFile(generationId, root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as QualityPresentationPatch;
  } catch {
    return null;
  }
}

export function writeQualityPatch(
  generationId: string,
  patch: QualityPresentationPatch,
  root = DEFAULT_GENERATION_ROOT,
): QualityPresentationPatch {
  mkdirSync(path.dirname(patchFile(generationId, root)), { recursive: true });
  writeFileSync(patchFile(generationId, root), `${JSON.stringify(patch, null, 2)}\n`);
  return patch;
}

export function snapshotOriginalModel(generationId: string, model: V4Model, root = DEFAULT_GENERATION_ROOT): void {
  const dir = path.join(root, generationId);
  if (!existsSync(dir)) return;
  const file = path.join(dir, "model.pre-quality-loop.json");
  if (existsSync(file)) return;
  writeFileSync(file, `${JSON.stringify(model)}\n`);
}
