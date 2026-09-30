import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deriveVisualAssetManifest, imageCallPlan, validateVisualAssetManifest, type VisualAssetNeed } from "../../src/lib/visual-concept/asset-manifest.ts";

const slug = "joint-genesis-controlled-ready-13";
const root = path.join("data", "visual-design", slug, "visual-master");
const art = JSON.parse(readFileSync(path.join(root, "art-direction.json"), "utf8")) as {
  photographicLanguage: string;
  materialVocabulary: string[];
  depthStrategy: string;
};
const metadata = JSON.parse(readFileSync(path.join(root, "metadata.json"), "utf8")) as { contentVersion: string };

const needs: VisualAssetNeed[] = [
  {
    assetId: "hero-atmosphere",
    semanticRole: "HERO_ATMOSPHERE",
    sectionId: "hero",
    placeholderSlot: "hero-photography",
    purpose: "Wide photographic field behind the editorial headline, with clear space for the separate packshot overlay.",
    desktopAspectRatio: "16:9",
    mobileAspectRatio: "4:5",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "open-ground",
    focalPoint: "open-right",
    visualDescription: "Open ground, pale stone, and a calm horizon in unhurried natural light. Matte surfaces and soft shadow. No object on the right third.",
    compositionIntent: "Leave the right side uncluttered so a packshot can be placed later. Do not draw a package, label, logo, or person.",
  },
  {
    assetId: "editorial-material",
    semanticRole: "EDITORIAL_MATERIAL",
    sectionId: "overview",
    placeholderSlot: "overview-material",
    purpose: "Adjacent material still for the overview, cropped from the shared stone photograph.",
    desktopAspectRatio: "3:2",
    mobileAspectRatio: "1:1",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "tactile-stone",
    focalPoint: "center",
    visualDescription: "A quiet stone ledge with soft natural shadow and a small amount of natural vegetation. Matte, tactile, and unoccupied.",
    compositionIntent: "Support large type beside the image. No package, no person, and no lettering.",
  },
  {
    assetId: "feature-visual",
    semanticRole: "FEATURE_VISUAL",
    sectionId: "features",
    placeholderSlot: "feature-material",
    purpose: "Closer stone crop beside the feature copy, from the same photograph as the overview.",
    desktopAspectRatio: "4:3",
    mobileAspectRatio: "1:1",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "tactile-stone",
    focalPoint: "texture",
    visualDescription: "Close tactile stone, layered planes, and soft shadow. The frame stays empty of objects and lettering.",
    compositionIntent: "An editorial image beside text. Not a card, icon, or product shot.",
  },
  {
    assetId: "photographic-pause",
    semanticRole: "PHOTOGRAPHIC_PAUSE",
    sectionId: "visual-story",
    placeholderSlot: "editorial-pause",
    purpose: "Full-bleed pause that gives the page a visual breath between information sections.",
    desktopAspectRatio: "21:9",
    mobileAspectRatio: "16:9",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "photographic-pause",
    focalPoint: "horizon",
    visualDescription: "A calm path through open ground, natural light, and distant vegetation. No people and no products.",
    compositionIntent: "A wide photographic interval. Do not add a headline, caption, or symbol.",
  },
  {
    assetId: "usage-visual",
    semanticRole: "USAGE_VISUAL",
    sectionId: "usage",
    placeholderSlot: "usage-material",
    purpose: "Quiet still life beside the usage text.",
    desktopAspectRatio: "4:3",
    mobileAspectRatio: "1:1",
    recommendedGenerationSize: "1024x1024",
    generationGroup: "usage-still",
    focalPoint: "center",
    visualDescription: "A simple glass of water on stone, in soft side light. No package and no person.",
    compositionIntent: "Keep the section calm and readable. The photograph does not state instructions.",
  },
  {
    assetId: "return-policy-visual",
    semanticRole: "RETURN_POLICY_VISUAL",
    sectionId: "guarantee",
    placeholderSlot: "return-material",
    purpose: "Dark natural accent on the return-policy band.",
    desktopAspectRatio: "16:9",
    mobileAspectRatio: "3:2",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "return-vegetation",
    focalPoint: "right",
    visualDescription: "Dark green vegetation against a deep matte ground, with soft natural shadow.",
    compositionIntent: "A contrast accent only. No seal, badge, or promise language.",
  },
  {
    assetId: "decision-background",
    semanticRole: "DECISION_BACKGROUND",
    sectionId: "decision",
    placeholderSlot: "closing-photography",
    purpose: "Warm open field behind the closing action, cropped from the hero atmosphere photograph.",
    desktopAspectRatio: "16:9",
    mobileAspectRatio: "3:2",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "open-ground",
    focalPoint: "center-light",
    visualDescription: "The same open stone and natural light as the hero field, without the reserved product stage.",
    compositionIntent: "A quiet closing ground. No second product, no person, and no promotional line.",
  },
];

const manifest = deriveVisualAssetManifest({
  campaignSlug: slug,
  contentVersion: metadata.contentVersion,
  art: {
    photographicLanguage: art.photographicLanguage,
    materialVocabulary: art.materialVocabulary,
    depthIntent: art.depthStrategy,
    lightingDirection: "Unhurried natural light from the side, with soft open shadow.",
  },
  needs,
});
const errors = validateVisualAssetManifest(manifest);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const assetsDir = path.join(root, "assets");
mkdirSync(path.join(assetsDir, "generated"), { recursive: true });
mkdirSync(path.join(assetsDir, "provenance"), { recursive: true });
writeFileSync(path.join(assetsDir, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(
  path.join(assetsDir, "provenance", "plan.json"),
  JSON.stringify(
    {
      generatedFiles: [],
      masterBitmapSliced: false,
      sourcePackshotRedrawn: false,
      imageCalls: imageCallPlan(manifest),
    },
    null,
    2,
  ),
);
console.log("MANIFEST_WRITTEN=YES");
console.log(`MINIMUM_IMAGE_CALLS=${imageCallPlan(manifest).minimumImageCalls}`);
console.log(`IDEAL_IMAGE_CALLS=${imageCallPlan(manifest).idealImageCalls}`);
