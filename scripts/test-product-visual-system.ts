import { readFileSync } from "node:fs";
import { planProductVisual } from "../src/lib/product-visual/plan";
import { persistableProductVisualPlan, sourcesFromAudit, type AuditProductCandidate } from "../src/lib/product-visual/load";
import { reimportImageText, rejectVisualMutation } from "../src/lib/visual-concept/firewall";
import type { ProductFacts } from "../src/lib/product-facts";
import type { ProductVisualSource } from "../src/lib/product-visual/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(partial: Partial<ProductVisualSource> & Pick<ProductVisualSource, "assetId" | "assetClass">): ProductVisualSource {
  return {
    width: 900,
    height: 1200,
    hasAlpha: true,
    containsProduct: "YES",
    containsPerson: "NO",
    containsExternalIcons: "NO",
    productDominance: "LIKELY_HIGH",
    visualUsability: ["HERO_PRIMARY", "CLOSING_PRODUCT_CUE"],
    ...partial,
  };
}

const clean = (assetId: string, usability = ["HERO_PRIMARY", "CLOSING_PRODUCT_CUE"]) =>
  source({
    assetId,
    assetClass: ["TRANSPARENT_PACKSHOT", "CLEAN_STUDIO_PACKSHOT", "PRODUCT_STAGE"],
    visualUsability: usability,
  });

const bundle = (assetId: string) =>
  source({
    assetId,
    width: 560,
    height: 545,
    assetClass: ["MULTI_BOTTLE", "BUNDLE", "TRANSPARENT_PACKSHOT"],
    visualUsability: ["HERO_SECONDARY", "BUNDLE_PRESENTATION", "SECTION_PRODUCT_MOMENT"],
  });

const personComposite = (assetId: string) =>
  source({
    assetId,
    width: 800,
    height: 800,
    assetClass: ["COMPOSITE_PRODUCT_PERSON"],
    containsPerson: "YES",
    containsExternalIcons: "YES",
    productDominance: "LIKELY_MEDIUM",
    visualUsability: ["NOT_RECOMMENDED"],
  });

const fixtureA = planProductVisual({ assets: [clean("northwind-pack")] });
assert(fixtureA.roles.HERO_PRODUCT_PRIMARY?.assetId === "northwind-pack", "clean packshot becomes the hero");
assert(!fixtureA.roles.PRODUCT_BUNDLE, "a single packshot is not treated as a bundle");

const fixtureB = planProductVisual({ assets: [bundle("harbor-bundle"), clean("harbor-pack")] });
assert(fixtureB.roles.HERO_PRODUCT_PRIMARY?.assetId === "harbor-pack", "packshot plus bundle keeps the packshot as hero");
assert(fixtureB.roles.PRODUCT_BUNDLE?.assetId === "harbor-bundle", "bundle maps to the bundle role");
assert(fixtureB.roles.SECTION_PRODUCT_MOMENT?.assetId === "harbor-bundle", "bundle can carry the section moment");
assert(fixtureB.roles.HERO_PRODUCT_PRIMARY?.assetId !== "harbor-bundle", "bundle is not the hero when a packshot exists");

const fixtureC = planProductVisual({ assets: [personComposite("only-composite")] });
assert(fixtureC.roles.HERO_PRODUCT_PRIMARY?.assetId === "only-composite", "person composite is the fallback hero");
assert(!fixtureC.roles.PRODUCT_BUNDLE, "a person composite is not a bundle");

const fixtureD = planProductVisual({ assets: [] });
assert(Object.keys(fixtureD.roles).length === 0, "no usable asset omits every product role");
assert(fixtureD.omitted.every((item) => item.reason === "no usable source product asset"), "omission is explicit");

const fixtureE = planProductVisual({
  assets: [clean("second-pack", ["HERO_SECONDARY"]), clean("first-pack", ["HERO_PRIMARY", "CLOSING_PRODUCT_CUE"])],
});
assert(fixtureE.roles.HERO_PRODUCT_PRIMARY?.assetId === "first-pack", "multiple packshots prefer the declared primary");
assert(fixtureE.roles.HERO_PRODUCT_SECONDARY?.assetId === "second-pack", "the other packshot can be secondary");

const named = (productName: string) =>
  planProductVisual({ assets: [clean("same-pack"), bundle("same-bundle")], productName } as never);
assert(JSON.stringify(named("Northwind Daily")) === JSON.stringify(named("Other Product")), "product name does not change the plan");

const idSwapped = planProductVisual({
  assets: [personComposite("2d8919be77715aa8"), clean("ordinary-token")],
});
assert(idSwapped.roles.HERO_PRODUCT_PRIMARY?.assetId === "ordinary-token", "a candidate id does not outrank cleaner metadata");

const hero = fixtureB.roles.HERO_PRODUCT_PRIMARY;
assert(hero?.fit === "contain" && hero.width === 900 && hero.height === 1200, "source aspect is preserved as contain");

const plannerSource = readFileSync("src/lib/product-visual/plan.ts", "utf8");
assert(!plannerSource.includes("writeFile") && !plannerSource.includes("png"), "the planner does not modify package pixels");

const renderSource = [
  readFileSync("src/lib/product-visual/load.ts", "utf8"),
  readFileSync("src/components/presell/visual-master-view.tsx", "utf8"),
  readFileSync("src/app/media/product-visual/[slug]/[role]/route.ts", "utf8"),
].join("\n");
assert(!renderSource.includes("discoverSourceAssets") && !renderSource.includes("probeRemoteImage") && !renderSource.includes("fetch("), "rendering does not discover images");
assert(!renderSource.includes("createOpenAiImageProvider") && !renderSource.includes("generateVisualMaster"), "rendering does not generate images");

const facts = { productName: "Northwind Daily" } as ProductFacts;
assert(rejectVisualMutation(facts) === facts, "product facts are not mutated");
assert(reimportImageText("Doctor Formulated").allowed === false, "package text is not imported");

const genericFiles = [
  "src/lib/product-visual/plan.ts",
  "src/lib/product-visual/types.ts",
  "src/lib/product-visual/load.ts",
  "src/components/presell/visual-master-view.tsx",
  "src/app/visual-master-v1.css",
  "src/app/media/product-visual/[slug]/[role]/route.ts",
];
const genericSource = genericFiles.map((file) => readFileSync(file, "utf8")).join("\n");
assert(!/joint[\s-]?genesis/i.test(genericSource), "generic product presentation has no product-specific name");
assert(!genericSource.includes("2d8919be") && !genericSource.includes("f192abc0"), "generic product presentation has no candidate ids");

const inventory = JSON.parse(
  readFileSync("data/visual-design/joint-genesis-controlled-ready-13/product-asset-audit-v1/inventory.json", "utf8"),
) as { candidates: AuditProductCandidate[] };
const campaign = persistableProductVisualPlan(inventory.candidates, "product-asset-audit-v1/inventory.json");
const selectedHero = inventory.candidates.find((item) => item.candidateId === campaign.roles.HERO_PRODUCT_PRIMARY?.assetId);
const selectedBundle = inventory.candidates.find((item) => item.candidateId === campaign.roles.PRODUCT_BUNDLE?.assetId);
assert(selectedHero?.containsPerson === "NO" && selectedHero.assetClass.includes("TRANSPARENT_PACKSHOT"), "campaign hero is the clean transparent asset");
assert(!selectedHero?.assetClass.includes("COMPOSITE_PRODUCT_PERSON"), "campaign hero is not the person composite");
assert(selectedBundle?.assetClass.includes("BUNDLE") && selectedBundle.containsPerson === "NO", "campaign bundle is the real bundle asset");
assert(campaign.roles.CLOSING_PRODUCT_CUE?.assetId === selectedHero?.candidateId, "closing reuses the clean asset");
assert(campaign.imageTextReimportAllowed === false, "image text stays non-authoritative");
assert(sourcesFromAudit(inventory.candidates).every((item) => item.assetId.length > 0), "audit records become planner sources");

console.log("PRODUCT_VISUAL_SYSTEM=PASS");
