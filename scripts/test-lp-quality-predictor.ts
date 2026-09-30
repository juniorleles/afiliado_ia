// npx tsx scripts/test-lp-quality-predictor.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine";
import {
  DEFAULT_LP_QUALITY_CONFIG,
  LP_QUALITY_LABELS,
  predictLpQuality,
  type LpQualityConfig,
} from "../src/lib/lp-quality-predictor";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

function factsNamed(name: string): ProductFacts {
  return emptyProductFacts(name, "https://example.test/item", "IMPORTED");
}

function predict(facts: ProductFacts, headline?: string | null) {
  const report = analyzeImportCompleteness({
    facts,
    headline: headline ?? null,
    imageUrl: facts.productImageUrl,
    imageProvenance: facts.productImageProvenance,
  });
  return predictLpQuality({ facts, report });
}

async function main() {
  const unknown = factsNamed("");
  const unknownBefore = JSON.stringify(unknown);
  const unknownPrediction = predict(unknown);
  assert(JSON.stringify(unknown) === unknownBefore, "analysis does not change ProductFacts");
  assert(unknownPrediction.blocksGeneration === false, "the estimate does not block generation");
  assert(unknownPrediction.quality === "Poor", "an unnamed product estimates poor quality");
  assert(unknownPrediction.reasons.some((reason) => reason.text === "Pricing missing"), "missing pricing is explained");
  assert(unknownPrediction.confidence >= 0 && unknownPrediction.confidence <= 100, "confidence stays between 0 and 100");

  const visiflora = factsNamed("VisiFlora");
  visiflora.description = "A short imported description with enough words to be present on the page.";
  visiflora.features = ["Only one feature", "A second feature"];
  visiflora.ingredientsOrComponents = ["One", "Two", "Three"];
  visiflora.sourceSnippets = [
    { field: "faq", question: "First?", text: "Answer one", sourceUrl: visiflora.sourceUrl, confidence: "DIRECT_SOURCE" },
    { field: "faq", question: "Second?", text: "Answer two", sourceUrl: visiflora.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];
  const visifloraPrediction = predict(visiflora, "A calm headline for the hero area of the page.");
  assert(visifloraPrediction.quality === "Limited", "a thin import estimates limited quality");
  assert(visifloraPrediction.reasons.some((reason) => reason.text === "Pricing missing"), "limited quality explains missing pricing");
  assert(visifloraPrediction.reasons.some((reason) => reason.text === "Only 2 Features"), "limited quality explains a short feature list");
  assert(visifloraPrediction.reasons.some((reason) => reason.text === "Low FAQ coverage"), "limited quality explains low FAQ coverage");
  assert(visifloraPrediction.reasons.some((reason) => reason.text === "No Bonus"), "limited quality explains a missing bonus");
  assert(visifloraPrediction.reasons.some((reason) => reason.text === "Few Ingredients"), "limited quality explains few ingredients");
  assert(visifloraPrediction.actions.some((action) => action.text === "Add Pricing"), "pricing is an improvement action");

  const prime = factsNamed("Prime Biome");
  prime.features = ["Daily capsule"];
  const primeBefore = JSON.stringify(prime);
  const primePrediction = predict(prime);
  assert(JSON.stringify(prime) === primeBefore, "Prime Biome facts are unchanged");
  assert(primePrediction.reasons.some((reason) => reason.text === "Only 1 Feature"), "one feature uses the same explanation");
  assert(!primePrediction.reasons.some((reason) => reason.text === "Complete Pricing"), "missing pricing is not described as complete");

  const harbor = factsNamed("Harbor Kettle");
  harbor.description = "A long operator description that clears the recommended length for a grounded product page and still stays inside the supplied facts.";
  harbor.features = ["Pours cleanly", "Holds heat", "Wide base", "Measured spout"];
  harbor.ingredientsOrComponents = ["Steel", "Glass", "Silicone", "Oak", "Brass", "Copper", "Maple", "Cork"];
  harbor.pricingInformation = "$48";
  harbor.guaranteeInformation = "30 day returns";
  harbor.productImageUrl = "https://example.test/kettle.jpg";
  harbor.productImageProvenance = "DIRECT_SOURCE";
  harbor.cautions = ["Hot surface"];
  harbor.offerFacts = [
    {
      packageName: "Single kettle",
      unitPrice: "$48",
      bonuses: "Oak lid",
      sourceUrl: harbor.sourceUrl,
      confidence: "DIRECT_SOURCE",
    },
  ];
  harbor.sourceSnippets = ["One", "Two", "Three", "Four"].map((item) => ({
    field: "faq",
    question: `${item}?`,
    text: `Answer ${item}`,
    sourceUrl: harbor.sourceUrl,
    confidence: "DIRECT_SOURCE" as const,
  }));
  const harborPrediction = predict(harbor, "A calm headline for the hero area of this kettle page.");
  assert(harborPrediction.quality === "Good" || harborPrediction.quality === "Excellent", "a complete set estimates good or excellent quality");
  assert(harborPrediction.reasons.some((reason) => reason.text === "Complete Pricing"), "complete pricing is explained");
  assert(harborPrediction.reasons.some((reason) => reason.text === "Strong Features"), "strong features are explained");
  assert(harborPrediction.reasons.some((reason) => reason.text === "Complete FAQ"), "complete FAQ is explained");
  assert(harborPrediction.reasons.some((reason) => reason.text === "Complete Guarantee"), "complete guarantee is explained");
  assert(harborPrediction.confidence >= 80, "a complete set has high confidence");
  assert(harborPrediction.conversionReadiness !== "Thin", "complete pricing raises conversion readiness");
  assert(harborPrediction.croReadiness !== "Thin", "complete FAQ and features raise CRO readiness");

  const pricingOnly: LpQualityConfig = {
    ...DEFAULT_LP_QUALITY_CONFIG,
    weights: {
      hero: 0,
      description: 0,
      features: 0,
      ingredients: 0,
      faq: 0,
      pricing: 100,
      guarantee: 0,
      warnings: 0,
      images: 0,
      manualOverrides: 0,
      completenessScore: 0,
      presentationRichness: 0,
    },
  };
  const priced = factsNamed("Northwind Lantern");
  priced.pricingInformation = "$12";
  const pricedReport = analyzeImportCompleteness({ facts: priced });
  const pricedPrediction = predictLpQuality({ facts: priced, report: pricedReport, config: pricingOnly });
  assert(pricedPrediction.quality === "Excellent", "weights are configuration, not a product rule");
  const unpriced = predictLpQuality({ facts: factsNamed("Fernwick Globe"), report: analyzeImportCompleteness({ facts: factsNamed("Fernwick Globe") }), config: pricingOnly });
  assert(unpriced.quality === "Poor", "a zeroed factor follows the same configuration");

  const stored = [
    ["Neuro Serge", "data/multi-product-validation/neuro-serge/import-facts.json"],
    ["Joint Genesis", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"],
    ["Prodentim", "data/generic-lp-engine/v1/prodentim-replay-04/product-facts.json"],
    ["Audifort", "data/generic-lp-engine/v1/audifort-final-controlled-v1/product-facts.json"],
  ] as const;
  for (const [label, file] of stored) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ProductFacts & { facts?: ProductFacts };
    const facts = parsed.productName ? parsed : parsed.facts;
    if (!facts) throw new Error(`missing facts for ${label}`);
    const before = JSON.stringify(facts);
    const prediction = predict(facts, "Stored headline for the replay.");
    assert(JSON.stringify(facts) === before, `${label} facts are unchanged`);
    assert(prediction.blocksGeneration === false, `${label} generation stays available`);
    assert(LP_QUALITY_LABELS.includes(prediction.quality), `${label} quality is one of the configured labels`);
  }

  const source = readFileSync(path.join("src", "lib", "lp-quality-predictor.ts"), "utf8");
  for (const name of ["VisiFlora", "Prime Biome", "Neuro Serge", "Joint Genesis", "Prodentim", "Audifort", "Unknown Product", "Harbor Kettle"]) {
    assert(!source.includes(name), `${name} is not named in the predictor`);
  }
  for (const banned of [
    "import-product",
    "grounding-validator",
    "policy-linter",
    "publication",
    "generate-variants",
    "tracking",
    "manual-overrides",
    "anthropic",
    "openai",
  ]) {
    assert(!source.includes(banned), `the predictor does not import ${banned}`);
  }

  console.log("LP_QUALITY_PREDICTOR_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
