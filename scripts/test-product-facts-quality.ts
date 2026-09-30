// npx tsx scripts/test-product-facts-quality.ts
import { extractProductFacts } from "../src/lib/import-product.ts";
import { assessImportQuality, emptyProductFacts } from "../src/lib/product-facts.ts";
import { isPromotionalOrCta } from "../src/lib/import-heuristics.ts";
import { mergeAcceptedFacts } from "../src/lib/source-resolution/merge.ts";
import type { WebDiscoveryReport } from "../src/lib/source-resolution/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function report(productName = "Joint Support Pro"): WebDiscoveryReport {
  return {
    triggered: true,
    originalUrl: "https://blocked.example/product/",
    primaryBlock: "HTTP_403",
    productName,
    message: "Alternative sources found.",
    queriesUsed: [productName],
    sources: [],
    acceptedCount: 2,
    uncertainCount: 0,
    phases: [],
    outcome: "ALTERNATIVE_SOURCES_FOUND",
    operatorMessages: [],
    searchProvider: {
      implemented: true,
      configured: true,
      name: "TEST",
      apiKeyPresent: false,
      realWebSearchAvailable: true,
      missingConfig: [],
      message: "test",
    },
  };
}

const keyIngredients = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>Key Ingredients</h2>
<ul>
  <li>Glucosamine sulfate</li>
  <li>Chondroitin</li>
  <li>MSM</li>
</ul>
</body></html>
`);
assert(
  keyIngredients.ingredientsOrComponents.some((i) => /glucosamine sulfate/i.test(i)),
  "TEST A: Key Ingredients heading populates ingredients",
);
assert(
  keyIngredients.ingredientsOrComponents.some((i) => /chondroitin/i.test(i)),
  "TEST A: Key Ingredients list keeps concrete components",
);

const marketingFormula = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>100% Natural Formula</h2>
<p>This scientifically proven formula is 100% natural, non-GMO, and has no unwanted fillers.</p>
</body></html>
`);
assert(marketingFormula.ingredientsOrComponents.length === 0, "TEST B: marketing formula does not fill ingredients");
assert(
  marketingFormula.confidence.ingredientsOrComponents === "NOT_FOUND",
  "TEST B: ingredients stay NOT_FOUND without concrete components",
);

const realIngredients = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>Active Ingredients</h2>
<ul>
  <li>Boswellia serrata</li>
  <li>Ginger root</li>
  <li>Hyaluronan</li>
</ul>
</body></html>
`);
assert(
  realIngredients.ingredientsOrComponents.some((i) => /boswellia/i.test(i)),
  "TEST C: Ingredients section extracts concrete components",
);
assert(
  realIngredients.ingredientsOrComponents.some((i) => /ginger root/i.test(i)),
  "TEST C: second concrete component kept",
);

assert(isPromotionalOrCta("Order today and save up to 70%"), "TEST D: order today / save up to % is CTA");
const salesDesc = extractProductFacts(`
<html><head>
<meta name="description" content="Order today and save up to 70%! Limited offer on this bottle." />
</head>
<body><h1>Joint Support Pro</h1></body></html>
`);
assert(!salesDesc.description, "TEST D: sales meta does not become factual description");
assert(salesDesc.confidence.description === "NOT_FOUND", "TEST D: missing description stays NOT_FOUND");

const genericUsage = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>How To Use</h2>
<p>Follow the recommended dosage on the label and take consistently.</p>
</body></html>
`);
assert(genericUsage.usageInformation.length === 0, "TEST E: label-only usage stays empty");
assert(genericUsage.confidence.usageInformation === "NOT_FOUND", "TEST E: generic usage is NOT_FOUND");

const concreteUsage = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>How To Use</h2>
<p>Take one capsule once daily in the morning.</p>
</body></html>
`);
assert(
  concreteUsage.usageInformation.some((u) => /one capsule/i.test(u) && /daily|morning/i.test(u)),
  "TEST F: concrete usage is kept",
);

const safetyMarketing = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>FAQ</h2>
<h3>Are there any side effects?</h3>
<p>Generally well tolerated with minimal risk of side effects.</p>
</body></html>
`);
assert(safetyMarketing.cautions.length === 0, "TEST G: well-tolerated marketing is not a caution");
assert(safetyMarketing.confidence.cautions === "NOT_FOUND", "TEST G: safety marketing stays NOT_FOUND");

const actualCaution = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>Warnings</h2>
<ul>
  <li>Consult your healthcare provider before use if you take medication.</li>
</ul>
</body></html>
`);
assert(
  actualCaution.cautions.some((c) => /healthcare provider/i.test(c) && /medication/i.test(c)),
  "TEST H: actual caution is kept",
);

const heuristicPage = emptyProductFacts("Joint Support Pro", "https://a.example/p", "IMPORTED");
heuristicPage.features = ["Water-resistant shell for daily rain"];
heuristicPage.confidence.features = "HEURISTIC_EXTRACTION";
heuristicPage.sourceSnippets = [
  {
    field: "features",
    text: "Water-resistant shell for daily rain",
    sourceUrl: heuristicPage.sourceUrl,
    confidence: "HEURISTIC_EXTRACTION",
  },
];
const directPage = emptyProductFacts("Joint Support Pro", "https://b.example/p", "IMPORTED");
directPage.features = ["Insulated pockets for cold mornings"];
directPage.confidence.features = "DIRECT_SOURCE";
const mergedProvenance = mergeAcceptedFacts({
  productName: "Joint Support Pro",
  originalUrl: "https://blocked.example/product/",
  pages: [heuristicPage, directPage],
  report: report(),
});
assert(mergedProvenance.confidence.features === "HEURISTIC_EXTRACTION", "TEST I: HEURISTIC is not promoted to DIRECT_SOURCE");
assert(
  mergedProvenance.features.includes("Water-resistant shell for daily rain"),
  "TEST I: heuristic feature still present after merge",
);

const sourceA = emptyProductFacts("Joint Support Pro", "https://a.example/p", "IMPORTED");
sourceA.guaranteeInformation = "180-day money-back guarantee";
sourceA.confidence.guaranteeInformation = "DIRECT_SOURCE";
const sourceB = emptyProductFacts("Joint Support Pro", "https://b.example/p", "IMPORTED");
sourceB.guaranteeInformation = "60-day money-back guarantee";
sourceB.confidence.guaranteeInformation = "DIRECT_SOURCE";
const mergedConflict = mergeAcceptedFacts({
  productName: "Joint Support Pro",
  originalUrl: "https://blocked.example/product/",
  pages: [sourceA, sourceB],
  report: report(),
});
assert(/180/.test(mergedConflict.guaranteeInformation ?? ""), "TEST J: first guarantee kept");
assert(
  mergedConflict.importWarnings.some((w) => /CONFLICT guaranteeInformation/i.test(w) && /180/i.test(w) && /60/i.test(w)),
  "TEST J: guarantee conflict is reported",
);
assert(
  !mergedConflict.importWarnings.every((w) => !/CONFLICT/i.test(w)),
  "TEST J: conflict is not silently discarded",
);

const invalidInflation = extractProductFacts(`
<html><head><meta name="description" content="Order today and save up to 70%!" /></head>
<body>
<h1>Named Product Only</h1>
<h2>100% Natural Formula</h2>
<p>All natural, non-GMO, no unwanted fillers.</p>
<h2>FAQ</h2>
<h3>Are there any side effects?</h3>
<p>Generally well tolerated with minimal risk of side effects.</p>
<h2>How To Use</h2>
<p>Follow the recommended dosage on the label and take consistently.</p>
</body></html>
`);
assert(invalidInflation.importQuality !== "SUFFICIENT", "TEST K: invalid/NOT_FOUND fields do not inflate SUFFICIENT");
assert(assessImportQuality(invalidInflation) !== "SUFFICIENT", "TEST K: assessImportQuality ignores empty semantic fields");

const stuffed = emptyProductFacts("Named Product", "", "IMPORTED");
stuffed.features = ["treat chronic inflammation with this capsule"];
stuffed.confidence.features = "NOT_FOUND";
assert(assessImportQuality(stuffed) !== "SUFFICIENT", "TEST K: NOT_FOUND confidence does not count as a major field");

const sloganIngredients = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>Ingredients</h2>
<ul>
  <li>Boswellia Extract</li>
  <li>Ginger Root</li>
  <li>Reclaim Your Freedom to Move</li>
</ul>
</body></html>
`);
assert(
  sloganIngredients.ingredientsOrComponents.some((i) => /boswellia extract/i.test(i)),
  "TEST M: concrete ingredient kept",
);
assert(
  sloganIngredients.ingredientsOrComponents.some((i) => /ginger root/i.test(i)),
  "TEST M: second concrete ingredient kept",
);
assert(
  !sloganIngredients.ingredientsOrComponents.some((i) => /freedom|reclaim|move/i.test(i)),
  "TEST M: headline/slogan is not an ingredient",
);

const unheadedPromo = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<ul>
  <li>Real results within days of daily use</li>
  <li>Helps reduce swelling around the knee area</li>
  <li>Youthful mobility and flexibility for walkers</li>
</ul>
</body></html>
`);
assert(unheadedPromo.features.length === 0, "TEST N: unheaded promotional bullets do not fill features");
assert(unheadedPromo.confidence.features === "NOT_FOUND", "TEST N: missing structured features stay NOT_FOUND");

const structuredFeatures = extractProductFacts(`
<html><body>
<h1>Joint Support Pro</h1>
<h2>Key Features</h2>
<ul>
  <li>Easy-to-swallow capsules for daily use</li>
  <li>Travel-ready bottle for weekday routines</li>
</ul>
</body></html>
`);
assert(
  structuredFeatures.features.includes("Easy-to-swallow capsules for daily use"),
  "TEST O: Key Features heading extracts valid bullets",
);
assert(structuredFeatures.confidence.features === "DIRECT_SOURCE", "TEST O: headed features are DIRECT_SOURCE");

const originDesc = extractProductFacts(`
<html><head>
<meta name="description" content="Our daily capsule is proudly made in the USA." />
</head>
<body><h1>Joint Support Pro</h1></body></html>
`);
assert(!originDesc.description, "TEST P: origin/promotional copy is not a product description");
assert(originDesc.confidence.description === "NOT_FOUND", "TEST P: origin-only description stays NOT_FOUND");

const factualDesc = extractProductFacts(`
<html><head>
<meta name="description" content="Joint Support Pro is a daily joint-support supplement with glucosamine." />
</head>
<body><h1>Joint Support Pro</h1></body></html>
`);
assert(
  Boolean(factualDesc.description && /daily joint-support supplement/i.test(factualDesc.description)),
  "TEST Q: factual product description is accepted",
);

const lowerHeadingPage = extractProductFacts(`
<html><head>
<meta name="description" content="Northwind Daily Capsule is a daily capsule for ordinary nutrient support." />
</head><body>
<h1>Northwind Daily Capsule</h1>
<h2>What changes with daily use</h2>
<h5>Steady daytime comfort</h5>
<p>The capsule is shaped for an ordinary morning routine without a large tablet.</p>
<h5>Single daily serving</h5>
<p>Each serving is one capsule, packed for a weekday carry case.</p>
<h4>Selected Ingredients</h4>
<h4>Daytime Matrix</h4>
<h5>Bilberry Extract</h5>
<p>A berry extract listed on the formula card.</p>
<h5>Lutein Ester (from Marigold)</h5>
<p>A carotenoid ester listed beside the berry extract.</p>
<h5>Zinc (11mg)</h5>
<p>A mineral amount printed on the same formula card.</p>
<h3>BASIC</h3>
<h4 class="text-decoration-line-through">$40</h4>
<h2>$29</h2>
<p>per bottle</p>
<h3>FAMILY</h3>
<h4 class="text-decoration-line-through">$40</h4>
<h2>$19</h2>
<p>per bottle</p>
<h3>Total: $58</h3>
<h6>After purchase</h6>
<p>Savings: $12</p>
<footer><p>Example Retailer is the retailer of products on this site. Copyright Northwind Daily Capsule.</p></footer>
</body></html>
`);
assert(
  lowerHeadingPage.ingredientsOrComponents.some((item) => /bilberry extract/i.test(item)),
  "TEST R: h5 ingredient card under an h4 ingredient heading is extracted",
);
assert(
  lowerHeadingPage.ingredientsOrComponents.some((item) => /lutein ester \(from marigold\)/i.test(item)),
  "TEST R: parenthetical ingredient card is kept",
);
assert(
  !lowerHeadingPage.ingredientsOrComponents.some((item) => /daytime matrix/i.test(item)),
  "TEST R: group heading without its own card paragraph is not an ingredient",
);
assert(lowerHeadingPage.confidence.ingredientsOrComponents === "DIRECT_SOURCE", "TEST R: ingredient cards stay DIRECT_SOURCE");
assert(
  lowerHeadingPage.features.some((item) => /ordinary morning routine/i.test(item)),
  "TEST S: h5 benefit card paragraph is a feature",
);
assert(
  lowerHeadingPage.features.some((item) => /weekday carry case/i.test(item)),
  "TEST S: second h5 benefit card is a feature",
);
assert(lowerHeadingPage.confidence.features === "DIRECT_SOURCE", "TEST S: benefit cards stay DIRECT_SOURCE");
assert(lowerHeadingPage.pricingInformation?.includes("BASIC") && /\$29/.test(lowerHeadingPage.pricingInformation), "TEST T: package price is recovered without a pricing heading");
assert(lowerHeadingPage.pricingInformation?.includes("FAMILY") && /\$19/.test(lowerHeadingPage.pricingInformation ?? ""), "TEST T: second package price is recovered");
assert(!/\$40/.test(lowerHeadingPage.pricingInformation ?? ""), "TEST T: struck compare-at price is not the offer price");
assert(
  !lowerHeadingPage.features.some((item) => /^savings\b/i.test(item)),
  "TEST T: a savings line under a total heading is not a feature",
);
assert(!lowerHeadingPage.manufacturer, "TEST U: retailer boilerplate is not a manufacturer");
assert(lowerHeadingPage.confidence.manufacturer === "NOT_FOUND", "TEST U: absent manufacturer stays NOT_FOUND");
assert(
  !lowerHeadingPage.importWarnings.includes("Ingredient or component cards were visible in the source but were not extracted."),
  "TEST V: extracted ingredient cards do not count as a missed section",
);

const absentIngredients = extractProductFacts(`
<html><head>
<meta name="description" content="Harbor Trail Shell is a rain jacket with a water-resistant shell for daily wear." />
</head><body>
<h1>Harbor Trail Shell</h1>
<h2>Key Features</h2>
<ul>
  <li>Water-resistant shell for daily rain</li>
  <li>Packable hood for weekday travel</li>
</ul>
<h2>60-Day Money Back Guarantee</h2>
<p>Return the jacket within 60 days for a refund.</p>
</body></html>
`);
assert(absentIngredients.confidence.ingredientsOrComponents === "NOT_FOUND", "TEST V: a page with no ingredient section stays NOT_FOUND");
assert(assessImportQuality(absentIngredients) === "SUFFICIENT", "TEST V: missing ingredients are not required when the source has none");
assert(!absentIngredients.manufacturer, "TEST U: jacket page does not invent a manufacturer");

const sloganOnlyIngredients = extractProductFacts(`
<html><head>
<meta name="description" content="Northwind Daily Capsule is a daily capsule for ordinary nutrient support." />
</head><body>
<h1>Northwind Daily Capsule</h1>
<h2>How To Use</h2>
<p>Take one capsule daily with water.</p>
<h2>60-Day Money Back Guarantee</h2>
<p>Return unused bottles within 60 days for a refund.</p>
<h4>Selected Ingredients</h4>
<h5>Reclaim Your Freedom Today</h5>
<p>This scientifically proven formula is 100% natural and non-GMO.</p>
</body></html>
`);
assert(sloganOnlyIngredients.ingredientsOrComponents.length === 0, "TEST V: a slogan under an ingredient heading is not a component");
assert(
  !sloganOnlyIngredients.importWarnings.some((warning) => /visible in the source but were not extracted/i.test(warning)),
  "TEST V: a slogan is not treated as a visible component that extraction missed",
);
assert(assessImportQuality(sloganOnlyIngredients) === "SUFFICIENT", "TEST V: description plus two real fields stay SUFFICIENT when no component exists");

const hiddenLoss = emptyProductFacts("Northwind Daily Capsule", "https://example.test/northwind", "IMPORTED");
hiddenLoss.description = "Northwind Daily Capsule is a daily capsule for ordinary nutrient support.";
hiddenLoss.confidence.description = "HEURISTIC_EXTRACTION";
hiddenLoss.usageInformation = ["Take one capsule daily with water."];
hiddenLoss.confidence.usageInformation = "DIRECT_SOURCE";
hiddenLoss.guaranteeInformation = "Return unused bottles within 60 days for a refund.";
hiddenLoss.confidence.guaranteeInformation = "DIRECT_SOURCE";
assert(assessImportQuality(hiddenLoss) === "SUFFICIENT", "TEST V: the same three fields are SUFFICIENT before a visible miss");
hiddenLoss.importWarnings = [
  "Ingredient or component cards were visible in the source but were not extracted.",
];
assert(assessImportQuality(hiddenLoss) === "PARTIAL", "TEST V: a visible unextracted ingredient section cannot score SUFFICIENT");
assert(hiddenLoss.confidence.description === "HEURISTIC_EXTRACTION", "TEST V: the quality cap does not promote heuristic description");

const heuristicStays = extractProductFacts(`
<html><body>
<h1>Northwind Daily Capsule</h1>
<p>Northwind Daily Capsule is a daily capsule designed for ordinary nutrient support and weekday use.</p>
<h2>What changes with daily use</h2>
<h5>Steady daytime comfort</h5>
<p>The shell of the capsule is smooth enough for an ordinary morning swallow.</p>
<h5>Single daily serving</h5>
<p>Each serving is one capsule packed for a weekday carry case.</p>
</body></html>
`);
assert(heuristicStays.confidence.description === "HEURISTIC_EXTRACTION", "TEST W: card extraction does not promote a heuristic description to DIRECT_SOURCE");
assert(heuristicStays.confidence.features === "DIRECT_SOURCE", "TEST W: the benefit card itself remains DIRECT_SOURCE");

console.log("ALL PRODUCT FACTS QUALITY TESTS PASSED");
