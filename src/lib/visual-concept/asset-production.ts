import { VISUAL_ASSET_MANIFEST_VERSION, type VisualAssetManifest, type VisualAssetSemanticRole } from "@/lib/visual-concept/asset-manifest";
import type { VisualConceptSize } from "@/lib/visual-concept/config";
import type { ConceptImageRequest } from "@/lib/visual-concept/provider";

export const VISUAL_ASSET_PROMPT_VERSION = "visual-asset-prompt-v1";
export const PRODUCTION_ASSET_MODEL = "gpt-image-2.5-sunburst";
export const PRODUCTION_ASSET_QUALITY = "high";
export const PRODUCTION_ASSET_SIZE: VisualConceptSize = "1536x1024";
export const USAGE_STILL_SIZE: VisualConceptSize = "1024x1024";
export const USAGE_STILL_PROMPT_VERSION = "visual-usage-still-prompt-v1";

export type ProductionAssetJob = {
  assetId: string;
  generationGroup: string;
};

export function p0ProductionGroups(manifest: VisualAssetManifest): string[] {
  const groups: string[] = [];
  for (const asset of manifest.assets) {
    if (asset.priority !== "P0" || groups.includes(asset.generationGroup)) continue;
    groups.push(asset.generationGroup);
  }
  return groups;
}

export function buildProductionAssetPrompt(
  manifest: VisualAssetManifest,
  generationGroup: string,
  world?: string,
): string {
  const assets = manifest.assets.filter((asset) => asset.generationGroup === generationGroup);
  const first = assets[0];
  if (!first) throw new Error("unknown production asset group");
  return [
    "ONE photographic environmental asset.",
    "This is not a webpage, not a screenshot, not a user interface, not an advertisement, not a poster, and not an infographic.",
    "No buttons, navigation, cards, captions, or website chrome.",
    "",
    "PHOTOGRAPHIC WORLD",
    world?.trim() || first.photographicLanguage,
    `Materials: ${first.materialVocabulary.join(", ")}.`,
    `Light: ${first.lightingDirection}`,
    "The same quiet premium editorial world as the other assets in this set.",
    "Avoid generic wellness stock, hyper-saturated nature, fantasy landscape, HDR, clinical imagery, gym imagery, and transformation imagery.",
    "",
    "THIS PHOTOGRAPH",
    ...assets.flatMap((asset) => [
      `${asset.semanticRole}: ${asset.visualDescription}`,
      asset.compositionIntent,
    ]),
    "",
    "FORBIDDEN IN THE IMAGE",
    "No written text, letters, numbers, logos, watermarks, or captions.",
    "No bottle, container, packaging, label, capsule, pill, or medical device.",
    "No person, doctor, patient, customer, or testimonial subject.",
    "No before-and-after, badge, seal, or certification mark.",
    "No symbol that implies a health outcome.",
  ].join("\n");
}

export function buildProductionAssetRequest(input: {
  manifest: VisualAssetManifest;
  job: ProductionAssetJob;
  world?: string;
}): ConceptImageRequest {
  const assets = input.manifest.assets.filter((asset) => asset.generationGroup === input.job.generationGroup);
  if (assets.length === 0) throw new Error("unknown production asset group");
  if (!assets.some((asset) => asset.priority === "P0")) throw new Error("production job is not a P0 group");
  if (assets.some((asset) => asset.recommendedGenerationSize !== PRODUCTION_ASSET_SIZE)) {
    throw new Error("production asset size is not the supported landscape size");
  }
  if (assets.some((asset) => asset.containsProduct || asset.containsPerson || asset.textAllowed)) {
    throw new Error("production asset contract rejected");
  }
  return {
    model: PRODUCTION_ASSET_MODEL,
    prompt: buildProductionAssetPrompt(input.manifest, input.job.generationGroup, input.world),
    size: PRODUCTION_ASSET_SIZE,
    quality: PRODUCTION_ASSET_QUALITY,
    outputFormat: "png",
    idempotencyKey: `${VISUAL_ASSET_MANIFEST_VERSION}:${input.job.assetId}`,
    operation: "generations",
  };
}

export function buildUsageStillPrompt(manifest: VisualAssetManifest, world?: string): string {
  const asset = manifest.assets.find((item) => item.semanticRole === "USAGE_VISUAL");
  if (!asset) throw new Error("usage visual is not in the manifest");
  return [
    "ONE quiet premium editorial still-life photograph.",
    "This is a tabletop photograph, not a landscape, not a scenic vista, not a path, and not another open-terrain image.",
    "This is not a webpage, not a screenshot, not a user interface, not an advertisement, and not a poster.",
    "",
    "PHOTOGRAPHIC WORLD",
    world?.trim() || asset.photographicLanguage,
    `Materials: ${asset.materialVocabulary.join(", ")}.`,
    `Light: ${asset.lightingDirection}`,
    "Pale natural stone or a matte mineral surface, warm restrained daylight, and a calm neutral background.",
    "",
    "SUBJECT",
    asset.visualDescription,
    "The only intentional recognizable object is one simple clear drinking glass containing water.",
    "The glass is modest, not enormous, and sits away from the edges.",
    "Leave generous surrounding surface so the same file can be cropped to 4:3 and to 1:1.",
    asset.compositionIntent,
    "The photograph does not state an instruction and does not show a dose.",
    "",
    "FORBIDDEN IN THE IMAGE",
    "No written text, letters, numbers, logos, watermarks, or captions.",
    "No supplement bottle, packaging, label, capsule, pill, tablet, or medicine.",
    "No doctor, patient, customer, hand, or person.",
    "No one drinking. No medical device.",
    "No health symbol, badge, seal, certification, or before-and-after.",
  ].join("\n");
}

export function buildUsageStillRequest(input: {
  manifest: VisualAssetManifest;
  assetId: string;
  world?: string;
}): ConceptImageRequest {
  const asset = input.manifest.assets.find((item) => item.semanticRole === "USAGE_VISUAL");
  if (!asset) throw new Error("usage visual is not in the manifest");
  if (asset.priority !== "P1" || asset.recommendedGenerationSize !== USAGE_STILL_SIZE) {
    throw new Error("usage visual configuration rejected");
  }
  if (asset.containsProduct || asset.containsPerson || asset.textAllowed) {
    throw new Error("usage visual contract rejected");
  }
  if (input.manifest.assets.some((item) => item.semanticRole === "RETURN_POLICY_VISUAL" && item.generationGroup === asset.generationGroup)) {
    throw new Error("usage visual must stay separate from the return-policy asset");
  }
  return {
    model: PRODUCTION_ASSET_MODEL,
    prompt: buildUsageStillPrompt(input.manifest, input.world),
    size: USAGE_STILL_SIZE,
    quality: PRODUCTION_ASSET_QUALITY,
    outputFormat: "png",
    idempotencyKey: `${VISUAL_ASSET_MANIFEST_VERSION}:${input.assetId}`,
    operation: "generations",
  };
}

export function productionAssetRoles(manifest: VisualAssetManifest, generationGroup: string): VisualAssetSemanticRole[] {
  return manifest.assets.filter((asset) => asset.generationGroup === generationGroup).map((asset) => asset.semanticRole);
}

export const DECORATIVE_PLATE_PROMPT_VERSION = "decorative-plate-v1";

const DECORATIVE_PLATES = {
  HERO_ATMOSPHERE: "A wide field of light. Deeper tone on the left, brighter atmosphere on the right.",
  FEATURE_TEXTURE: "A dark, fine texture with soft geometry. Even enough that type can sit on top.",
  CLOSING_LIGHT: "A pool of light low in the frame, with darker edges. Not a copy of the opening field.",
} as const;

export type DecorativePlatePurpose = keyof typeof DECORATIVE_PLATES;

const MOTIF_ATMOSPHERE: Record<string, string> = {
  clarity: "Soft fields of light and faint concentric illumination. No eye, lens, face, or anatomy.",
  movement: "Gentle arcs of light and a sense of flow. No body, joint, or figure.",
  technical: "Quiet grid-like geometry and controlled light. No interface, screen, or logo.",
  calm: "A still gradient and very little contrast. No scene and no object.",
  editorial: "Broad planes of light and restrained depth. No object and no scene.",
};

/** Abstract plates only. The palette is supplied by the caller from stored identity. */
export function buildDecorativePlatePrompt(input: {
  purpose: DecorativePlatePurpose;
  motif: string;
  palette: readonly string[];
}): string {
  const colors = input.palette.map((color) => color.trim()).filter(Boolean);
  return [
    "ONE abstract decorative plate.",
    "This is not a webpage, not a screenshot, not a user interface, and not an advertisement.",
    "It is light, depth, gradient, geometry, and texture only.",
    "",
    "PALETTE",
    colors.length > 0 ? `Use these colors as atmosphere: ${colors.join(", ")}.` : "Use a restrained neutral field and one warm accent.",
    "",
    "ATMOSPHERE",
    MOTIF_ATMOSPHERE[input.motif] ?? MOTIF_ATMOSPHERE.editorial,
    "",
    "THIS PLATE",
    `${input.purpose}: ${DECORATIVE_PLATES[input.purpose]}`,
    "",
    "FORBIDDEN IN THE IMAGE",
    "No written text, letters, numbers, logos, watermarks, or labels.",
    "No bottle, container, packaging, label, capsule, pill, or product.",
    "No ingredient, fruit, herb, flower, or leaf as a subject.",
    "No person, doctor, patient, customer, hand, or face.",
    "No anatomy, laboratory, chart, clinical result, or before-and-after.",
    "No badge, seal, certification, or trust mark.",
    "No quantity, price, or offer claim.",
  ].join("\n");
}
