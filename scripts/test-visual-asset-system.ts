// npx tsx scripts/test-visual-asset-system.ts
import { readFileSync } from "node:fs";
import {
  classifyVisualAsset,
  discoverVisualAssets,
  inspectEmbeddedText,
  plannedDecorativeAssets,
  planSectionAssets,
  sectionNavLinks,
} from "../src/lib/premium/visual-asset-system.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

assert(inspectEmbeddedText(null) === "unknown", "uninspected text stays unknown");
assert(inspectEmbeddedText("") === "clear", "inspected empty text is clear");
assert(inspectEmbeddedText("BEST VALUE pack") === "unsupported", "a sticker phrase is unsupported");
assert(inspectEmbeddedText("MOST POPULAR") === "unsupported", "a popularity sticker is unsupported");

const loose = classifyVisualAsset({
  id: "loose",
  url: "https://example.test/pack.png",
  association: "url-only",
  subject: "offer",
  embeddedText: "",
  unitsDepicted: 1,
});
assert(loose.assetClass === "REJECTED", "a loose url is rejected");

const dirty = classifyVisualAsset({
  id: "dirty",
  url: "https://example.test/offer.png",
  association: "same-card",
  subject: "offer",
  embeddedText: "MOST POPULAR",
  unitsDepicted: 1,
});
assert(dirty.assetClass === "REJECTED", "an associated image with a sticker is rejected");

const unknownOffer = classifyVisualAsset({
  id: "unknown-offer",
  url: "https://example.test/offer.png",
  association: "same-card",
  subject: "offer",
  embeddedText: null,
  unitsDepicted: null,
});
assert(unknownOffer.assetClass === "REJECTED", "an uninspected offer image is rejected");

const cleanIngredient = classifyVisualAsset({
  id: "leaf",
  url: "https://example.test/leaf.png",
  association: "structured",
  subject: "ingredient",
  subjectKey: "Harbor Leaf",
  embeddedText: "",
  unitsDepicted: null,
});
assert(cleanIngredient.assetClass === "EVIDENCE_ASSOCIATED", "a structured ingredient image may be used");

const pack = classifyVisualAsset({
  id: "packshot",
  url: "/media/product/harbor.png",
  association: "product-identity",
  subject: "product",
  embeddedText: null,
  unitsDepicted: null,
});
assert(pack.assetClass === "AUTHORITATIVE_PRODUCT", "the identity packshot stays authoritative");
assert(pack.quantityUse === "omit", "an uncounted packshot is not a quantity image");

const single = classifyVisualAsset({
  id: "single",
  url: "/media/product/one.png",
  association: "product-identity",
  subject: "product",
  embeddedText: "",
  unitsDepicted: 1,
});
assert(single.quantityUse === "single-unit", "a proven one-unit packshot may be repeated");

const harbor = discoverVisualAssets({
  packshot: { url: "/media/product/harbor.png" },
  offers: [{ name: "FIELD", imageUrl: "https://example.test/field.png" }],
  ingredients: [{ name: "Harbor Leaf" }],
});
assert(harbor.some((asset) => asset.assetClass === "AUTHORITATIVE_PRODUCT"), "discovery keeps the packshot");
assert(harbor.some((asset) => asset.id.startsWith("offer:") && asset.assetClass === "REJECTED"), "discovery rejects an uninspected offer image");
assert(!harbor.some((asset) => asset.subject === "ingredient"), "an ingredient name without an image adds no photo");

const harborPlan = planSectionAssets({
  sections: [
    { id: "hero", itemCount: 1 },
    { id: "ingredients", itemCount: 15 },
    { id: "features", itemCount: 6 },
    { id: "usage", itemCount: 1 },
    { id: "guarantee", itemCount: 1 },
    { id: "offer", itemCount: 3 },
    { id: "closing", itemCount: 1 },
  ],
  assets: harbor,
});
assert(harborPlan.find((item) => item.section === "ingredients")?.assetRole === "PRESENTATIONAL_ICON", "ingredients without images use icons");
assert(harborPlan.find((item) => item.section === "offer")?.render === "omit", "unsafe offer images are omitted");
assert(harborPlan.find((item) => item.section === "hero")?.assetRole === "AUTHORITATIVE_PRODUCT", "the hero uses the packshot");

const movementLinks = sectionNavLinks([
  { id: "features", title: "Key Features", visible: true },
  { id: "faq", title: "FAQ", visible: true },
]);
assert(!movementLinks.some((link) => link.id === "ingredients"), "a missing ingredients section adds no ingredients link");
assert(movementLinks.map((link) => link.id).join(",") === "features,faq", "nav links follow the sections that exist");

const withIngredients = sectionNavLinks([
  { id: "ingredients", title: "Ingredients / Components", visible: true },
  { id: "features", title: "Key Features", visible: true },
  { id: "faq", title: "FAQ", visible: false },
]);
assert(withIngredients.some((link) => link.label === "Ingredients / Components"), "a visible ingredients title is the link label");
assert(!withIngredients.some((link) => link.id === "faq"), "a hidden FAQ adds no FAQ link");

const planned = plannedDecorativeAssets();
assert(planned.length > 0 && planned.every((item) => item.factualAuthority === "NONE" && item.assetType === "DECORATIVE_GENERATED"), "planned art is decorative and not evidence");
assert(planned.every((item) => /no product/i.test(item.prompt) && /no people/i.test(item.prompt)), "planned prompts forbid product and people");

const source = readFileSync("src/lib/premium/visual-asset-system.ts", "utf8");
assert(!/visiflora|joint genesis|astaxanthin/i.test(source), "the asset system has no product branch");
assert(!/openai|anthropic|fetch\(/.test(source), "the asset system does not call a provider");

console.log("visual asset system ok");
