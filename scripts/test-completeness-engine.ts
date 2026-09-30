// npx tsx scripts/test-completeness-engine.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  analyzeImportCompleteness,
  DEFAULT_COMPLETENESS_CONFIG,
  projectCompletenessDraft,
  type CompletenessConfig,
} from "../src/lib/completeness-engine";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

function factsNamed(name: string): ProductFacts {
  return emptyProductFacts(name, "https://example.test/item", "IMPORTED");
}

function section(report: ReturnType<typeof analyzeImportCompleteness>, id: string) {
  return report.sections.find((item) => item.id === id);
}

async function main() {
  const unknown = factsNamed("");
  const unknownBefore = JSON.stringify(unknown);
  const unknownReport = analyzeImportCompleteness({ facts: unknown });
  assert(JSON.stringify(unknown) === unknownBefore, "analysis does not change ProductFacts");
  assert(unknownReport.blocksGeneration === false, "the report does not block generation");
  assert(section(unknownReport, "identity")?.status === "MISSING", "an unnamed product has missing identity");
  assert(section(unknownReport, "ingredients")?.found === 0, "an unnamed product invents no ingredients");
  assert(unknownReport.score >= 0 && unknownReport.score <= 100, "the score stays between 0 and 100");

  const visiflora = factsNamed("VisiFlora");
  visiflora.description = "A short imported description with enough words to be present on the page.";
  visiflora.ingredientsOrComponents = ["One", "Two", "Three", "Four", "Five", "Six"];
  visiflora.features = ["Only one feature"];
  visiflora.sourceSnippets = [
    { field: "faq", question: "First?", text: "Answer one", sourceUrl: visiflora.sourceUrl, confidence: "DIRECT_SOURCE" },
    { field: "faq", question: "Second?", text: "Answer two", sourceUrl: visiflora.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];
  const visifloraReport = analyzeImportCompleteness({ facts: visiflora, headline: "A calm headline for the hero area of the page." });
  assert(section(visifloraReport, "ingredients")?.status === "PARTIAL", "six ingredients are partial against the configured target");
  assert(section(visifloraReport, "ingredients")?.found === 6, "six ingredients are counted");
  assert(section(visifloraReport, "features")?.quality === "WEAK", "one feature is weak against the configured target");
  assert(section(visifloraReport, "features")?.targetLabel === `${DEFAULT_COMPLETENESS_CONFIG.targets.features.recommended}+`, "the feature target comes from configuration");
  assert(section(visifloraReport, "features")?.reason.includes("Found=1"), "the feature reason reports the found count");
  assert(visifloraReport.recommendations.some((item) => item.text === "Add 3 Features" && item.action === "Open Features section"), "the feature gap opens the features section");
  assert(section(visifloraReport, "faq")?.quality === "WEAK" && section(visifloraReport, "faq")?.found === 2, "two FAQ entries are weak");
  assert(section(visifloraReport, "faq")?.targetLabel === `${DEFAULT_COMPLETENESS_CONFIG.targets.faq.recommended}+`, "the FAQ target comes from configuration");
  assert(visifloraReport.recommendations.some((item) => item.text === "Add 2 FAQ entries" && item.action === "Open FAQ section"), "the FAQ gap opens the FAQ section");
  assert(section(visifloraReport, "ingredients")?.targetLabel === `${DEFAULT_COMPLETENESS_CONFIG.targets.ingredients.recommended}+`, "the ingredient target comes from configuration");
  assert(section(visifloraReport, "images")?.targetLabel === `${DEFAULT_COMPLETENESS_CONFIG.targets.images.recommended}+`, "the image target comes from configuration");
  assert(section(visifloraReport, "identity")?.targetLabel === "Required", "identity is required by configuration");
  assert(section(visifloraReport, "description")?.targetLabel === "Recommended", "description is recommended by configuration");
  assert(section(visifloraReport, "pricing")?.targetLabel === "Recommended", "pricing is recommended by configuration");
  assert(section(visifloraReport, "manufacturer")?.targetLabel === "Recommended", "manufacturer is recommended by configuration");
  assert(section(visifloraReport, "warnings")?.targetLabel === "Optional", "warnings are optional by configuration");
  assert(section(visifloraReport, "pricing")?.quality === "MISSING", "missing pricing is reported");
  assert(visifloraReport.recommendations.some((item) => item.text === "Add Pricing" && item.action === "Open Pricing Editor"), "pricing opens the pricing editor");
  assert(visifloraReport.recommendations.some((item) => item.text === "Add Manufacturer" && item.action === "Open Manufacturer section"), "manufacturer opens the manufacturer section");
  assert(!visifloraReport.priorityActions.some((item) => item.sectionId === "warnings"), "optional warnings stay out of the priority actions");
  assert(visifloraReport.remaining.some((item) => item.id === "warnings"), "optional warnings remain visible");
  assert(
    visifloraReport.generationWarning ===
      "This landing page can still be generated, but quality is expected to be limited because important sections are incomplete.",
    "a low score warns without blocking generation",
  );
  assert(visifloraReport.completed.length + visifloraReport.remaining.length === visifloraReport.sections.length, "completed and remaining cover every section");

  const prime = factsNamed("Prime Biome");
  prime.features = ["Daily capsule"];
  const primeReport = analyzeImportCompleteness({ facts: prime });
  const primeBefore = JSON.stringify(prime);
  const primeProjected = projectCompletenessDraft(prime, "features", JSON.stringify(["Daily capsule", "Second feature"]));
  assert(JSON.stringify(prime) === primeBefore, "a draft projection does not change ProductFacts");
  assert(primeProjected.features.length === 2, "a draft projection applies only to the returned copy");
  assert(section(primeReport, "features")?.quality === "WEAK", "Prime Biome one feature uses the same weak rule");
  assert(section(primeReport, "warnings")?.found === 0, "Prime Biome does not invent warnings");

  const weighted: CompletenessConfig = {
    ...DEFAULT_COMPLETENESS_CONFIG,
    weights: { ...DEFAULT_COMPLETENESS_CONFIG.weights, identity: 100, description: 0, hero: 0, ingredients: 0, features: 0, guarantee: 0, pricing: 0, faq: 0, images: 0 },
  };
  const identityOnly = analyzeImportCompleteness({ facts: factsNamed("Harbor Kettle"), config: weighted });
  assert(identityOnly.score === 100, "weights are configuration, not a product rule");
  assert(identityOnly.estimatedQuality === "High", "a complete score estimates high landing-page quality");
  assert(identityOnly.generationWarning === null, "a score at the threshold has no generation warning");

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
    const report = analyzeImportCompleteness({ facts });
    assert(JSON.stringify(facts) === before, `${label} facts are unchanged`);
    assert(report.blocksGeneration === false, `${label} generation stays available`);
    assert(section(report, "identity")?.status === "COMPLETE", `${label} identity is read from stored facts`);
  }

  const source = readFileSync(path.join("src", "lib", "completeness-engine.ts"), "utf8");
  for (const name of ["VisiFlora", "Prime Biome", "Neuro Serge", "Joint Genesis", "Prodentim", "Audifort", "Unknown Product"]) {
    assert(!source.includes(name), `${name} is not named in the engine`);
  }
  assert(!source.includes("product-facts.ts") || source.includes('from "@/lib/product-facts"'), "the engine only types against ProductFacts");
  for (const banned of ["import-product", "grounding-validator", "policy-linter", "publication", "generate-variants", "presentation-plan"]) {
    assert(!source.includes(banned), `the engine does not import ${banned}`);
  }

  console.log("COMPLETENESS_ENGINE_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
