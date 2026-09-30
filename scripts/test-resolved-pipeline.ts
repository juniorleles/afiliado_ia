// npx tsx scripts/test-resolved-pipeline.ts
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const dbFile = path.join(os.tmpdir(), `resolved-pipeline-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

function override(field: string, value: unknown) {
  return {
    campaignId: 1,
    field,
    value,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as const;
}

async function main() {
  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const { createCampaign, getCampaignById, updateCampaign } = await import("../src/lib/campaigns.ts");
  const overrides = await import("../src/lib/manual-overrides.ts");
  const { emptyProductFacts } = await import("../src/lib/product-facts.ts");
  const { planPresentation } = await import("../src/lib/presentation-plan.ts");
  const { analyzeProductProfile } = await import("../src/lib/product-profile.ts");
  const { marketResearchQueries } = await import("../src/lib/market-research/queries.ts");
  const { validateGrounding } = await import("../src/lib/ai/grounding-validator.ts");
  const { lintCampaign } = await import("../src/lib/policy-linter.ts");
  const { tryPublish, decidePublish } = await import("../src/lib/publication.ts");
  const { buildAffiliateHref } = await import("../src/lib/affiliate-url.ts");

  const facts = emptyProductFacts("Harbor Kettle", "https://example.test/harbor", "IMPORTED");
  facts.description = "A steel kettle for boiling water.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["Whistles when the water boils"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Stainless steel"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.pricingInformation = "Single $40";
  facts.confidence.pricingInformation = "DIRECT_SOURCE";
  facts.offerFacts = [
    { packageName: "Single", unitPrice: "$40", quantity: "1", sourceUrl: facts.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];
  facts.importQuality = "SUFFICIENT";

  const described = overrides.resolveProductFacts(facts, [override("description", "A steel kettle for clear vision during a long boil.")]);
  assert(described.description?.includes("clear vision") === true, "description override replaces the imported text");
  assert(described.features[0] === facts.features[0], "description override leaves features in place");
  assert(marketResearchQueries(described).join(" ").toLowerCase().includes("vision"), "research reads the resolved description");
  assert(!marketResearchQueries(facts).join(" ").toLowerCase().includes("vision"), "research on the raw facts does not see the override");

  const priced = overrides.resolveProductFacts(facts, [
    override("pricing", [{ packageName: "Pair", quantity: "2", unitPrice: "$35", totalPrice: "$70", savings: "", shipping: "", bonus: "" }]),
  ]);
  assert(priced.pricingInformation?.includes("Pair") === true && priced.pricingInformation.includes("$70"), "pricing override replaces the package text");
  assert(priced.offerFacts?.length === 0, "pricing override does not keep the importer package beside the manual one");
  assert(priced.confidence.pricingInformation === "MANUAL", "manual pricing stays MANUAL");

  const ingredients = overrides.resolveProductFacts(facts, [
    override("ingredients", Array.from({ length: 10 }, (_, index) => `Component ${index + 1}`)),
  ]);
  assert(ingredients.ingredientsOrComponents.length === 10, "ingredient override replaces the list");
  assert(!ingredients.ingredientsOrComponents.includes("Stainless steel"), "ingredient override does not merge the importer list");
  const beforePlan = planPresentation(facts, analyzeProductProfile(facts));
  const afterPlan = planPresentation(ingredients, analyzeProductProfile(ingredients));
  assert(beforePlan.sectionVariants.ingredients !== afterPlan.sectionVariants.ingredients, "presentation reads the resolved ingredient list");

  const grounded = validateGrounding("A steel kettle for clear vision during a long boil.", described);
  assert(grounded.status === "GROUNDED", "grounding accepts copy that matches the resolved description");
  const stale = validateGrounding("A steel kettle for boiling water.", described);
  assert(stale.status !== "GROUNDED", "grounding does not accept the replaced importer sentence");

  const campaign = createCampaign({
    name: "Harbor kettle draft",
    slug: "harbor-kettle-resolved",
    headline: "Harbor Kettle",
    body: "A steel kettle for boiling water. It is a kitchen tool, not a medical device.",
    ctaLabel: "See price",
    affiliateUrl: "https://example.test/hop",
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify(facts),
  });
  overrides.saveManualOverride(campaign.id, "trackingUrl", "javascript:alert(1)");
  const viewed = overrides.withResolvedCampaign(getCampaignById(campaign.id)!);
  const policy = lintCampaign(viewed);
  assert(
    policy.findings.some((finding) => finding.ruleId === "cta.not_javascript" && finding.status === "fail"),
    "policy evaluates the resolved tracking URL",
  );
  assert(getCampaignById(campaign.id)!.affiliateUrl === "https://example.test/hop", "the stored tracking URL stays imported");
  const hop = buildAffiliateHref("https://example.test/hop", new URLSearchParams({ utm_source: "test" }));
  assert(hop.includes("utm_source=test") && !hop.startsWith("javascript:"), "tracking hop construction is unchanged");

  overrides.resetManualOverride(campaign.id, "trackingUrl");
  overrides.saveManualOverride(campaign.id, "description", "A steel kettle for clear vision during a long boil.");
  const preview = overrides.withResolvedCampaign(getCampaignById(campaign.id)!);
  const previewFacts = JSON.parse(preview.sourceFactsJson || "{}") as { description?: string };
  assert(previewFacts.description?.includes("clear vision") === true, "preview campaign carries the resolved description");
  assert(getCampaignById(campaign.id)!.sourceFactsJson === JSON.stringify(facts), "preview does not rewrite the importer JSON");

  const rawJson = getCampaignById(campaign.id)!.sourceFactsJson!;
  updateCampaign(campaign.id, {
    name: campaign.name,
    slug: campaign.slug,
    headline: campaign.headline,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    affiliateUrl: campaign.affiliateUrl,
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify({ ...facts, description: "Reimported kettle copy." }),
  });
  const afterImport = getCampaignById(campaign.id)!;
  assert(overrides.listManualOverrides(campaign.id).some((row) => row.field === "description"), "a later import does not erase the override");
  const recalculated = overrides.loadResolvedProductFacts(afterImport);
  assert(recalculated?.description?.includes("clear vision") === true, "resolved facts are recalculated from the new import plus the override");
  assert(rawJson !== afterImport.sourceFactsJson, "the importer JSON itself was replaced");

  const blocked = tryPublish(
    { ...getCampaignById(campaign.id)!, sourceFactsJson: null },
    false,
  );
  assert(!blocked.ok && blocked.gate === "BLOCKED", "publication still blocks a campaign with no importer facts");
  assert(decidePublish("REVIEW_REQUIRED", true) === "confirm", "confirming warnings still does not publish");
  assert(decidePublish("READY", false) === "allow", "only READY remains publishable");

  const stored = [
    ["Neuro Serge", "data/multi-product-validation/neuro-serge/import-facts.json"],
    ["Joint Genesis", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"],
    ["Prodentim", "data/generic-lp-engine/v1/prodentim-replay-04/product-facts.json"],
    ["Audifort", "data/generic-lp-engine/v1/audifort-final-controlled-v1/product-facts.json"],
  ] as const;
  for (const [label, file] of stored) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const same = JSON.stringify(overrides.resolveProductFacts(raw, [])) === JSON.stringify(raw);
    const renamed = overrides.resolveProductFacts(raw, [override("description", "Operator completion for this draft.")]);
    assert(same, `${label} without overrides is unchanged`);
    assert(renamed.description === "Operator completion for this draft.", `${label} description override replaces text`);
    assert(renamed.productName === raw.productName, `${label} override leaves the imported name`);
  }

  const visiflora = emptyProductFacts("VisiFlora", "https://example.test/visiflora", "IMPORTED");
  visiflora.description = "Precision vision support.";
  visiflora.confidence.description = "DIRECT_SOURCE";
  visiflora.features = ["Supports daily visual comfort."];
  visiflora.confidence.features = "DIRECT_SOURCE";
  const visifloraResolved = overrides.resolveProductFacts(visiflora, [override("description", "A short operator description.")]);
  assert(visifloraResolved.description === "A short operator description.", "VisiFlora description override replaces text");
  assert(visifloraResolved.features.length === 1, "VisiFlora description override keeps features");

  const prime = emptyProductFacts("Prime Biome", "https://example.test/prime", "IMPORTED");
  const primeResolved = overrides.resolveProductFacts(prime, [override("ingredients", ["Fiber blend"])]);
  assert(primeResolved.ingredientsOrComponents[0] === "Fiber blend", "Prime Biome ingredient override replaces the list");
  assert(primeResolved.productName === "Prime Biome", "Prime Biome name stays imported");

  const unknown = emptyProductFacts("", "https://example.test/unknown", "IMPORTED");
  const completed = overrides.resolveProductFacts(unknown, [override("productName", "Fernwick Lantern")]);
  assert(completed.productName === "Fernwick Lantern", "unknown product name can be completed");
  assert(completed.features.length === 0, "completing an unknown product invents no features");

  const layer = readFileSync("src/lib/manual-overrides.ts", "utf8");
  assert(!/visiflora|neuro serge|prodentim|audifort|joint genesis|prime biome/i.test(layer), "resolved pipeline has no product names");
  assert(!readFileSync("src/lib/affiliate-url.ts", "utf8").includes("manual-overrides"), "tracking builder does not read overrides");
  assert(!readFileSync("src/lib/import-product.ts", "utf8").includes("manual-overrides"), "importer does not read overrides");

  resetDbForTests();
  console.log("RESOLVED_PIPELINE_TESTS=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
