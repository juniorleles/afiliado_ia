// npx tsx scripts/test-section-classifier.ts
import { classifyHeading, composePresellPage, visibleSections } from "../src/lib/presell-page.ts";
import { clipAtWordBoundary } from "../src/lib/presell-display.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

assert(classifyHeading("How It Works") === "overview", "How It Works is mechanism/overview, not usage");
assert(classifyHeading("How the Formula Works") === "overview", "How the Formula Works is mechanism");
assert(classifyHeading("Mechanism") === "overview", "Mechanism heading is overview");
assert(classifyHeading("How Joint Support Works") === "overview", "How {product} Works is not hardcoded");
assert(classifyHeading("How to Use") === "usage", "How to Use is usage");
assert(classifyHeading("Directions") === "usage", "Directions is usage");
assert(classifyHeading("Suggested Use") === "usage", "Suggested Use is usage");
assert(classifyHeading("Usage") === "usage", "Usage is usage");
assert(classifyHeading("Dosage") === "usage", "Dosage is usage");
assert(classifyHeading("How to Take") === "usage", "How to Take is usage");
assert(classifyHeading("Who May Consider It") === "overview", "audience heading is not mixed into cautions");
assert(classifyHeading("Things to Consider") === "considerations", "Things to Consider stays considerations");
assert(classifyHeading("Warnings") === "considerations", "Warnings stay considerations");

const facts = emptyProductFacts("Sample Support Capsule", "https://example.com/p", "IMPORTED");
facts.description = "a daily capsule described on the product page";
facts.confidence.description = "DIRECT_SOURCE";
facts.features = ["Supports daily mobility"];
facts.confidence.features = "DIRECT_SOURCE";
facts.ingredientsOrComponents = ["Pycnogenol®", "Boswellia Serrata", "BioPerine®", "French Maritime Pine Bark Extract (Pycnogenol®)"];
facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
facts.usageInformation = ["Take one capsule per day with water, preferably in the morning."];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.cautions = ["If you have any medical conditions or are taking medication, consult your healthcare provider."];
facts.confidence.cautions = "DIRECT_SOURCE";
facts.guaranteeInformation = "60-day money-back guarantee";
facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
facts.importQuality = "SUFFICIENT";

const page = composePresellPage({
  facts,
  template: "BUYER_GUIDE",
  variant: {
    approach: "BUYER_GUIDE",
    headline: "What to know before you decide",
    ctaLabel: "View Product Details",
    body: `A daily capsule described on the product page.

## How It Works

The formula is described as supporting hyaluronan production in joint tissue.

Cartilage explanation belongs with mechanism copy, not directions.

## How to Use

Take one capsule per day with water, preferably in the morning.

Each bottle is a 30-day supply.

## Who May Consider It

People comparing daily joint-support capsules.

## Things to Consider

Pricing is listed on the product page.

## Ingredients

- Pycnogenol®
- Boswellia Serrata
- BioPerine®
`,
  },
});

const usage = page.sections.find((s) => s.id === "usage")!;
const overview = page.sections.find((s) => s.id === "overview")!;
const considerations = page.sections.find((s) => s.id === "considerations")!;
const usageText = [...usage.paragraphs, ...usage.bullets].join("\n");
const overviewText = [...overview.paragraphs, ...overview.bullets].join("\n");
assert(usage.visible, "usage section remains visible");
assert(/one capsule per day/i.test(usageText), "dosage stays in usage");
assert(!/hyaluronan/i.test(usageText), "mechanism text is not in usage");
assert(/hyaluronan/i.test(overviewText), "mechanism text lands in overview");
assert(/People comparing daily joint-support capsules/i.test(overviewText), "who-may-consider stays editorial, not caution");
assert(
  !considerations.cards.some((card) => /healthcare provider/i.test(card.body)),
  "ProductFacts cautions are not injected when the variant omitted them",
);
assert(!considerations.cards.some((card) => /People comparing/i.test(card.body)), "audience copy is not the caution card");

const names = page.sections.find((s) => s.id === "ingredients")!.cards.map((c) => c.title);
assert(names.includes("Pycnogenol®"), "short trademark ingredient is intact");
assert(names.includes("Boswellia Serrata"), "multi-word ingredient is intact");
assert(names.includes("BioPerine®"), "registered trademark symbol is intact");
assert(
  !names.includes("French Maritime Pine Bark Extract (Pycnogenol®)"),
  "facts-only ingredient is not resurrected into composition",
);
assert(!JSON.stringify(page).includes("Boswellia Serra…"), "composition JSON does not emit truncated Boswellia");
assert(!JSON.stringify(page).includes("BioPerin") || JSON.stringify(page).includes("BioPerine®"), "BioPerine is not truncated");

const src = "By improving joint lubrication allowing easier movement extra words";
const cutAt = src.indexOf("joint") + 4;
const naive = src.slice(0, cutAt);
assert(naive.endsWith("join"), "naive character slice is mid-word");
const safe = clipAtWordBoundary(src, naive.length);
assert(!/\bjoin\b/.test(safe), "word-boundary clip does not emit partial 'join'");
assert(safe.startsWith("By improving"), "clip keeps the preceding phrase");
assert(safe.endsWith("…"), "clip uses ellipsis");

const move = "more natural movement for everyday activity extra";
const moveCut = move.indexOf("movement") + 7;
const naiveMove = move.slice(0, moveCut);
assert(naiveMove.endsWith("movemen"), "naive movement cut is mid-word");
const safeMove = clipAtWordBoundary(move, naiveMove.length);
assert(!/movemen/.test(safeMove), "movement is not left as a broken token");
assert(/more natural/.test(safeMove), "keeps the readable phrase");

assert(clipAtWordBoundary("Pycnogenol®", 120) === "Pycnogenol®", "short names are not clipped");
assert(visibleSections(page).some((s) => s.id === "overview"), "overview remains a composed section");

console.log("\nTodos os testes do section classifier passaram.");
