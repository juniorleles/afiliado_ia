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

console.log("ALL PRODUCT FACTS QUALITY TESTS PASSED");
