// npx tsx scripts/test-product-completeness.ts
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const dbFile = path.join(os.tmpdir(), `completeness-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

function input(facts: unknown, extra: Record<string, unknown> = {}) {
  return {
    facts,
    affiliateUrl: "https://example.test/hop",
    ctaLabel: "See price",
    imageUrl: null,
    imageProvenance: null,
    trackingOrigin: null,
    manualEditedAt: null,
    ...extra,
  } as import("../src/lib/product-completeness.ts").CompletenessInput;
}

async function main() {
  const { emptyProductFacts } = await import("../src/lib/product-facts.ts");
  const { analyzeProductCompleteness } = await import("../src/lib/product-completeness.ts");
  const { resetDbForTests } = await import("../src/lib/db.ts");
  const store = await import("../src/lib/product-completeness-store.ts");

  const unknown = emptyProductFacts("", "https://example.test/unknown", "IMPORTED");
  const unknownReport = analyzeProductCompleteness(input(unknown, { affiliateUrl: "", ctaLabel: "" }));
  assert(unknownReport.health === "INCOMPLETE", "unknown product with no name is incomplete");
  assert(unknownReport.categories.find((item) => item.id === "features")?.details.join(" ").includes("0 imported"), "unknown product invents no features");
  assert(unknownReport.categories.find((item) => item.id === "manufacturer")?.details.includes("Missing"), "unknown product manufacturer stays missing");
  assert(unknownReport.importerScore + unknownReport.manualScore === unknownReport.totalScore, "unknown product scores add up");

  const visiflora = emptyProductFacts("VisiFlora", "https://example.test/visiflora", "IMPORTED");
  visiflora.description = "A short imported description.";
  visiflora.confidence.description = "DIRECT_SOURCE";
  visiflora.ingredientsOrComponents = ["Petal extract", "Leaf powder"];
  visiflora.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  visiflora.pricingInformation = "Starter $39";
  visiflora.confidence.pricingInformation = "DIRECT_SOURCE";
  visiflora.offerFacts = [
    { packageName: "Starter", unitPrice: "$39", quantity: "1", sourceUrl: visiflora.sourceUrl, confidence: "DIRECT_SOURCE" },
    { packageName: "Ultimate", unitPrice: "$79", bonuses: "", sourceUrl: visiflora.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];
  visiflora.importQuality = "PARTIAL";
  const visifloraReport = analyzeProductCompleteness(input(visiflora));
  const visifloraIngredients = visifloraReport.categories.find((item) => item.id === "ingredients");
  assert(visifloraIngredients?.details.includes("2 imported"), "VisiFlora ingredient count is imported");
  assert(visifloraIngredients?.origin === "AUTO", "VisiFlora ingredients stay AUTO");
  assert(visifloraReport.categories.find((item) => item.id === "offers")?.details.some((line) => line.includes("bonus empty")), "VisiFlora offer with an empty bonus is reported");
  assert(visifloraReport.categories.find((item) => item.id === "faq")?.details.includes("0 found"), "VisiFlora reports the FAQ count that exists");
  assert(visifloraReport.health !== "BLOCKED", "VisiFlora completeness does not block");

  const manualDescription = analyzeProductCompleteness(
    input({
      ...visiflora,
      description: "Operator description.",
      confidence: { ...visiflora.confidence, description: "MANUAL" },
    }),
  );
  assert(manualDescription.categories.find((item) => item.id === "description")?.origin === "MANUAL", "manual description is MANUAL");
  assert(manualDescription.manualScore > visifloraReport.manualScore, "manual description raises the manual score");

  const prime = emptyProductFacts("Prime Biome", "https://example.test/prime", "IMPORTED");
  prime.features = ["Daily capsule"];
  prime.confidence.features = "HEURISTIC_EXTRACTION";
  prime.confidence.productName = "DIRECT_SOURCE";
  const primeReport = analyzeProductCompleteness(input(prime));
  assert(primeReport.categories.find((item) => item.id === "features")?.status === "PARTIAL", "Prime Biome heuristic features stay partial");
  assert(primeReport.categories.find((item) => item.id === "warnings")?.details.includes("None"), "Prime Biome does not invent warnings");

  const blocked = analyzeProductCompleteness(
    input(visiflora, { affiliateUrl: "javascript:alert(1)", ctaLabel: "See price" }),
  );
  assert(blocked.categories.find((item) => item.id === "tracking")?.status === "BLOCKED", "blocked tracking scheme is blocked");
  assert(blocked.categories.find((item) => item.id === "policy")?.status === "BLOCKED", "policy readiness sees the blocked scheme");
  assert(blocked.health === "BLOCKED", "health reports a blocked tracking scheme");
  assert(blocked.totalScore >= 0, "a blocked scheme still returns a score");

  const stored = [
    ["Neuro Serge", "data/multi-product-validation/neuro-serge/import-facts.json"],
    ["Joint Genesis", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"],
    ["Prodentim", "data/generic-lp-engine/v1/prodentim-replay-04/product-facts.json"],
    ["Audifort", "data/generic-lp-engine/v1/audifort-final-controlled-v1/product-facts.json"],
  ] as const;
  for (const [label, file] of stored) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { productName?: string; facts?: { productName?: string } };
    const facts = parsed.productName ? parsed : parsed.facts;
    const report = analyzeProductCompleteness(input(facts));
    assert(report.categories.find((item) => item.id === "identity")?.details.includes("Complete"), `${label} identity is read from stored facts`);
    assert(report.importerScore + report.manualScore === report.totalScore, `${label} scores add up`);
    assert(!report.categories.some((item) => item.details.some((detail) => /invented|recommended/i.test(detail))), `${label} details do not invent a quota`);
  }

  const engine = readFileSync("src/lib/product-completeness.ts", "utf8");
  assert(!/visiflora|neuro serge|prodentim|audifort|joint genesis|prime biome|clickbank|getcedar/i.test(engine), "completeness engine has no product or domain names");
  assert(!engine.includes("recommended"), "completeness engine has no recommended quota");
  for (const file of [
    "src/lib/import-product.ts",
    "src/lib/market-research/research.ts",
    "src/lib/presentation-plan.ts",
    "src/lib/ai/grounding-validator.ts",
    "src/lib/policy-linter.ts",
    "src/lib/publication.ts",
    "src/lib/affiliate-url.ts",
    "src/lib/manual-overrides.ts",
  ]) {
    assert(!readFileSync(file, "utf8").includes("product-completeness"), `${file} is unchanged by the completeness engine`);
  }

  resetDbForTests();
  store.recordCompletenessAnalysis(4, visifloraReport);
  store.recordCompletenessAnalysis(4, visifloraReport);
  assert(store.listCompletenessHistory(4).length === 1, "an unchanged analysis is stored once");
  store.recordCompletenessAnalysis(4, manualDescription);
  const trend = store.listCompletenessHistory(4);
  assert(trend.length === 2, "a changed analysis is appended");
  assert(trend[0].totalScore === visifloraReport.totalScore, "trend keeps the first score");
  assert(trend[1].manualScore === manualDescription.manualScore, "trend keeps the manual score");

  resetDbForTests();
  console.log("PRODUCT_COMPLETENESS_TESTS=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
