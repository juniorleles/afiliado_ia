import { readFileSync } from "node:fs";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import {
  deriveVisualAssetManifest,
  imageCallPlan,
  missingRequiredRoles,
  validateVisualAssetManifest,
  type VisualAssetManifest,
  type VisualAssetNeed,
} from "../src/lib/visual-concept/asset-manifest.ts";
import { VISUAL_ASSET_BINDINGS, visualAssetForBinding } from "../src/lib/visual-concept/asset-binding.ts";
import { rejectVisualMutation } from "../src/lib/visual-concept/firewall.ts";

let failed = 0;
function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

const art = {
  photographicLanguage: "quiet natural light",
  materialVocabulary: ["stone", "matte surfaces"],
  depthIntent: "A modest foreground and an open background.",
  lightingDirection: "Side light.",
};

const needs: VisualAssetNeed[] = [
  {
    assetId: "hero-atmosphere",
    semanticRole: "HERO_ATMOSPHERE",
    sectionId: "hero",
    placeholderSlot: "hero-photography",
    purpose: "Field",
    desktopAspectRatio: "16:9",
    mobileAspectRatio: "4:5",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "open-ground",
    focalPoint: "open-right",
    visualDescription: "Open ground.",
    compositionIntent: "Leave space empty.",
  },
  {
    assetId: "feature-visual",
    semanticRole: "FEATURE_VISUAL",
    sectionId: "features",
    placeholderSlot: "feature-material",
    purpose: "Stone",
    desktopAspectRatio: "4:3",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "tactile-stone",
    focalPoint: "center",
    visualDescription: "Stone.",
    compositionIntent: "Beside text.",
  },
  {
    assetId: "decision-background",
    semanticRole: "DECISION_BACKGROUND",
    sectionId: "decision",
    placeholderSlot: "closing-photography",
    purpose: "Closing field",
    desktopAspectRatio: "16:9",
    recommendedGenerationSize: "1536x1024",
    generationGroup: "open-ground",
    focalPoint: "center",
    visualDescription: "Open light.",
    compositionIntent: "Closing ground.",
  },
];

const derived = deriveVisualAssetManifest({
  campaignSlug: "sample-campaign",
  contentVersion: "abc",
  art,
  needs,
});
assert(validateVisualAssetManifest(derived).length === 0, "a derived manifest passes schema checks");
assert(derived.assets.every((asset) => asset.textAllowed === false), "text is not allowed by default");
assert(
  derived.assets.every((asset) => asset.generatedAssetIsEvidence === false && asset.factualAuthority === false && asset.evidenceAuthority === false),
  "generated assets are not evidence",
);
assert(derived.masterIsBitmapSource === false && derived.assets.every((asset) => asset.provenance.masterBitmapSliced === false), "the master bitmap is not sliced");
const plan = imageCallPlan(derived);
assert(plan.minimumImageCalls === 2 && plan.idealImageCalls === 2, "shared groups count as one image call");
assert(plan.p0Assets === 2 && plan.p1Assets === 1 && plan.p2Assets === 0, "priorities follow the semantic role");

const broken = structuredClone(derived) as VisualAssetManifest;
(broken.assets[0] as { textAllowed: boolean }).textAllowed = true;
(broken.assets[0] as { containsProduct: boolean }).containsProduct = true;
assert(validateVisualAssetManifest(broken).length >= 2, "text and product pixels fail validation");
assert(missingRequiredRoles(derived, ["HERO_ATMOSPHERE", "PHOTOGRAPHIC_PAUSE"]).join(",") === "PHOTOGRAPHIC_PAUSE", "a missing P0 role is reported");

const facts = emptyProductFacts("Sample", "https://seller.example/product", "MANUAL");
assert(rejectVisualMutation(facts) === facts, "manifest planning does not mutate product facts");
assert(visualAssetForBinding(derived, "heroAtmosphere")?.assetId === "hero-atmosphere", "components bind by semantic role");
assert(visualAssetForBinding(derived, "photographicPause") === null, "an absent role stays empty");

const stored = JSON.parse(
  readFileSync("data/visual-design/joint-genesis-controlled-ready-13/visual-master/assets/manifest.json", "utf8"),
) as VisualAssetManifest;
assert(validateVisualAssetManifest(stored).length === 0, "the campaign manifest is valid");
const storedPlan = imageCallPlan(stored);
assert(storedPlan.minimumRequiredAssets === 3 && storedPlan.idealImageCalls === 5, "the campaign plan keeps three essential calls and five ideal calls");
assert(storedPlan.p0Assets === 4 && storedPlan.p1Assets === 3 && storedPlan.p2Assets === 0, "the campaign priority split is recorded");
assert(missingRequiredRoles(stored, ["HERO_ATMOSPHERE", "FEATURE_VISUAL", "PHOTOGRAPHIC_PAUSE"]).length === 0, "essential roles are present");
const templateSource = readFileSync("src/components/presell/visual-master-view.tsx", "utf8");
const templateSlots = [...templateSource.matchAll(/<Photo name="([^"]+)" role="([^"]+)"/g)].map((match) => ({
  name: match[1],
  role: match[2],
}));
const configuredBindings = VISUAL_ASSET_BINDINGS as Record<string, string>;
assert(templateSlots.length > 0, "the active template declares photography slots");
assert(
  templateSlots.every((slot) => slot.role in configuredBindings),
  "every active template photo uses a configured visual binding",
);
assert(
  templateSlots.every((slot) => {
    const plannedAsset = stored.assets.find((asset) => asset.placeholderSlot === slot.name);
    return plannedAsset?.semanticRole === configuredBindings[slot.role];
  }),
  "every active template placeholder has a planned asset for that binding",
);

const generic = [
  "src/lib/visual-concept/asset-manifest.ts",
  "src/lib/visual-concept/asset-binding.ts",
  "src/components/presell/visual-master-view.tsx",
  "src/app/visual-master-v1.css",
].map((file) => readFileSync(file, "utf8")).join("\n");
assert(!/joint[\s-]?genesis/i.test(generic), "generic visual code has no campaign hardcoding");
assert(!/joint-genesis-hero|hero\.jpg|packshot\.jpg/i.test(generic), "generic components do not name campaign image files");
assert(!/openai|images\/generations|anthropic/i.test(readFileSync("src/lib/visual-concept/asset-manifest.ts", "utf8")), "manifest planning does not call an image model");
assert(!readFileSync("src/components/presell/visual-master-view.tsx", "utf8").includes("asset-manifest"), "the current page does not render from the manifest");

if (failed) {
  console.error("VISUAL_ASSET_MANIFEST_CHECKS=FAIL " + failed);
  process.exit(1);
}
console.log("VISUAL_ASSET_MANIFEST_CHECKS=PASS");
console.log("SCHEMA_TESTS=PASS");
console.log("PROVENANCE_TESTS=PASS");
console.log("SAFETY_TESTS=PASS");
console.log("NO_RENDER_SIDE_EFFECTS=PASS");
console.log("NO_TEST_API_CALLS=PASS");
