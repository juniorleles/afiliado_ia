// npx tsx scripts/test-manual-overrides.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const dbFile = path.join(os.tmpdir(), `manual-overrides-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

async function main() {
  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const { createCampaign, getCampaignById } = await import("../src/lib/campaigns.ts");
  const overrides = await import("../src/lib/manual-overrides.ts");
  const { emptyProductFacts } = await import("../src/lib/product-facts.ts");

  const facts = emptyProductFacts("Harbor Kettle", "https://example.test/harbor", "IMPORTED");
  facts.description = "A steel kettle for boiling water.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["Whistles when the water boils"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Stainless steel"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["Fill the kettle before heating."];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.cautions = ["Handle stays hot."];
  facts.confidence.cautions = "DIRECT_SOURCE";
  facts.guaranteeInformation = "Return the kettle within 60 days.";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.manufacturer = "Northwind";
  facts.confidence.manufacturer = "DIRECT_SOURCE";
  facts.pricingInformation = "One kettle for 40 dollars.";
  facts.confidence.pricingInformation = "DIRECT_SOURCE";
  facts.offerFacts = [
    {
      packageName: "Single",
      unitPrice: "40",
      quantity: "1",
      totalPrice: "40",
      sourceUrl: facts.sourceUrl,
      confidence: "DIRECT_SOURCE",
    },
  ];
  facts.sourceSnippets = [
    { field: "features", text: "Whistles when the water boils", sourceUrl: facts.sourceUrl, confidence: "DIRECT_SOURCE" },
    { field: "faq", text: "Yes, it whistles.", question: "Does it whistle?", sourceUrl: facts.sourceUrl, confidence: "DIRECT_SOURCE" },
  ];

  const identical = overrides.resolveProductFacts(facts, []);
  assert(JSON.stringify(identical) === JSON.stringify(facts), "no overrides leaves every ProductFacts field unchanged");

  const campaign = createCampaign({
    name: "Harbor kettle draft",
    slug: "harbor-kettle-draft",
    headline: "Harbor Kettle",
    body: "A steel kettle for boiling water.",
    ctaLabel: "See price",
    affiliateUrl: "https://example.test/hop",
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify(facts),
  });
  const before = getCampaignById(campaign.id)!;
  overrides.saveManualOverride(campaign.id, "productName", "Harbor Whistle Kettle");
  const after = getCampaignById(campaign.id)!;
  assert(after.sourceFactsJson === before.sourceFactsJson, "saving an override does not rewrite imported ProductFacts");
  assert(after.affiliateUrl === before.affiliateUrl, "tracking URL on the campaign stays imported");
  assert(after.ctaLabel === before.ctaLabel, "CTA on the campaign stays imported");
  assert(after.updatedAt === before.updatedAt, "the campaign row is not updated");
  assert(after.publicationStatus === "draft", "publication status stays draft");

  const stored = overrides.listManualOverrides(campaign.id);
  assert(stored.length === 1 && stored[0].field === "productName", "only the edited field is stored");

  const resolved = overrides.resolveProductFacts(facts, stored);
  assert(resolved.productName === "Harbor Whistle Kettle", "manual product name wins");
  assert(resolved.features[0] === facts.features[0], "features stay when another field is overridden");
  assert(resolved.ingredientsOrComponents[0] === facts.ingredientsOrComponents[0], "ingredients stay");
  assert(resolved.description === facts.description, "description stays");
  assert(resolved.manufacturer === facts.manufacturer, "manufacturer stays");
  assert(resolved.offerFacts?.[0]?.packageName === "Single", "importer offer cards stay");
  assert(resolved.confidence.productName === "MANUAL", "overridden field confidence is MANUAL");
  assert(resolved.confidence.features === "DIRECT_SOURCE", "untouched field confidence stays imported");

  overrides.saveManualOverride(campaign.id, "features", ["Boils a liter of water", "Whistles when the water boils"]);
  overrides.saveManualOverride(campaign.id, "faq", [{ question: "How loud is it?", answer: "A short whistle." }]);
  overrides.saveManualOverride(campaign.id, "usage", {
    instruction: "Fill before heating.",
    frequency: "Each use",
    amount: "One liter",
    notes: "Do not heat it empty.",
  });
  overrides.saveManualOverride(campaign.id, "guarantee", { duration: "60 days", text: "Return the kettle for a refund." });
  overrides.saveManualOverride(campaign.id, "pricing", [
    {
      packageName: "Pair",
      quantity: "2",
      unitPrice: "35",
      totalPrice: "70",
      savings: "10",
      shipping: "Included",
      bonus: "None",
    },
  ]);
  overrides.saveManualOverride(campaign.id, "trackingUrl", "https://example.test/manual-hop");
  overrides.saveManualOverride(campaign.id, "cta", "Check the kettle");

  const many = overrides.listManualOverrides(campaign.id);
  const merged = overrides.resolveProductFacts(facts, many);
  assert(merged.features[0] === "Boils a liter of water", "manual features replace the imported list");
  assert(merged.sourceSnippets.some((item) => item.field === "features"), "non-FAQ snippets stay");
  assert(merged.sourceSnippets.some((item) => item.question === "How loud is it?" && item.confidence === "MANUAL"), "manual FAQ is stored as a snippet");
  assert(!merged.sourceSnippets.some((item) => item.question === "Does it whistle?"), "the imported FAQ snippet is replaced");
  assert(merged.usageInformation.some((item) => /One liter/.test(item)), "usage amount is kept");
  assert(merged.guaranteeInformation === "60 days. Return the kettle for a refund.", "guarantee duration and text merge");
  assert(/Pair/.test(merged.pricingInformation ?? ""), "package override is reflected in pricing");
  assert(merged.confidence.pricingInformation === "MANUAL", "manual pricing is not labeled as a direct source");
  assert(merged.offerFacts?.length === 0, "pricing override replaces importer packages");
  assert(merged.productName === "Harbor Whistle Kettle", "earlier overrides remain");
  const still = getCampaignById(campaign.id)!;
  assert(still.affiliateUrl === "https://example.test/hop", "tracking override does not change the campaign hop");
  assert(still.ctaLabel === "See price", "CTA override does not change the campaign CTA");

  const model = overrides.buildProductEditorModel(facts, still, many);
  const nameField = model.sections.flatMap((section) => section.fields).find((field) => field.field === "productName");
  assert(nameField?.source === "MANUAL" && nameField.value === "Harbor Whistle Kettle", "editor shows the manual value");
  const warningField = model.sections.flatMap((section) => section.fields).find((field) => field.field === "warnings");
  assert(warningField?.source === "AUTO" && Array.isArray(warningField.value) && warningField.value[0] === "Handle stays hot.", "fields without overrides stay AUTO");

  overrides.resetManualOverride(campaign.id, "productName");
  const reset = overrides.resolveProductFacts(facts, overrides.listManualOverrides(campaign.id));
  assert(reset.productName === "Harbor Kettle", "reset restores the imported name");
  assert(reset.features[0] === "Boils a liter of water", "reset of one field leaves the others");

  const unknown = emptyProductFacts("", "https://example.test/unknown", "IMPORTED");
  assert(JSON.stringify(overrides.resolveProductFacts(unknown, [])) === JSON.stringify(unknown), "unknown product without overrides is unchanged");
  const completed = overrides.resolveProductFacts(unknown, [
    {
      campaignId: 0,
      field: "productName",
      value: "Fernwick Lantern",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ]);
  assert(completed.productName === "Fernwick Lantern", "an unknown product can be completed manually");
  assert(completed.features.length === 0, "completing the name does not invent features");

  const unchangedEngines = [
    "src/lib/import-product.ts",
    "src/lib/presentation-plan.ts",
    "src/lib/product-profile.ts",
    "src/lib/ai/grounding-validator.ts",
    "src/lib/policy-linter.ts",
    "src/lib/affiliate-url.ts",
    "src/lib/clickbank-hop.ts",
  ];
  for (const file of unchangedEngines) {
    const source = fs.readFileSync(file, "utf8");
    assert(!source.includes("manual-overrides") && !source.includes("resolveProductFacts"), `${file} does not read the merge layer`);
  }
  const publication = fs.readFileSync("src/lib/publication.ts", "utf8");
  assert(publication.includes("withResolvedCampaign"), "publication validates the resolved campaign");
  const layer = fs.readFileSync("src/lib/manual-overrides.ts", "utf8");
  assert(!/visiflora|neuro|prodentim|audifort|joint genesis|peakbiome|prime biome|getcedar/i.test(layer), "override layer has no product names");

  resetDbForTests();
  fs.rmSync(dbFile, { force: true });
  console.log("MANUAL_OVERRIDE_TESTS=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
