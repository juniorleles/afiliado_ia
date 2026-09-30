// npx tsx scripts/test-manual-editor.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildLayerCard,
  duplicateValues,
  isHexColor,
  isHttpUrl,
  layerStatus,
  prepareOverrideForSave,
  sanitizePlainText,
  validateFaqOverride,
  validateImageOverride,
  validateListOverride,
} from "../src/lib/editor-layers";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  console.log(`OK: ${message}`);
}

const products = ["VisiFlora", "Prime Biome", "Neuro Serge", "Joint Genesis", "Prodentim", "Audifort", "Unknown Product"];

async function main() {
  assert(layerStatus("Imported kettle", null, false) === "AUTO", "an imported field with no override is AUTO");
  assert(layerStatus("", null, false) === "EMPTY", "a missing field is EMPTY");
  assert(layerStatus("Imported kettle", "Operator kettle", false) === "MANUAL", "a scalar override is MANUAL");
  assert(layerStatus("Whistle\nSteel", "Whistle\nCopper", true) === "MIXED", "a partial list override is MIXED");
  assert(sanitizePlainText("<b>Steel</b> kettle") === "Steel kettle", "rich text is stored as plain text");
  assert(!isHttpUrl("javascript:alert(1)") && isHttpUrl("https://example.test/hop"), "only http(s) URLs pass");
  assert(isHexColor("#0f766e") && !isHexColor("red"), "button color is a hex value");
  const empty = prepareOverrideForSave("productName", "   ");
  assert(!empty.ok, "an empty override is rejected");
  const duplicates = validateListOverride(["Whistle", "whistle"]);
  assert(!duplicates.ok, "duplicate features are rejected");
  const faq = validateFaqOverride([
    { question: "How long", answer: "One minute" },
    { question: "How long", answer: "Two minutes" },
  ]);
  assert(!faq.ok, "duplicate FAQ questions are rejected");
  const broken = validateImageOverride("/tmp/missing.png");
  assert(!broken.ok, "a broken image URL is rejected");
  assert(duplicateValues(["Harbor", "harbor"]).length === 1, "duplicate detection is case-insensitive");

  const card = buildLayerCard({
    field: "description",
    sectionId: "overview",
    label: "Description",
    importedText: "Imported description",
    overrideText: "Operator description",
    confidence: "MANUAL",
    origin: "MANUAL",
    source: "MANUAL",
  });
  assert(card.effectiveText === "Operator description" && card.boundary === "PRODUCT_CONTENT", "effective value is the override");
  assert(card.status === "MANUAL", "the overridden field is highlighted as MANUAL");

  for (const name of products) {
    const status = layerStatus(name, null, false);
    assert(status === "AUTO", `${name} uses the same AUTO rule`);
  }

  const dbFile = path.join(os.tmpdir(), `manual-editor-${Date.now()}.db`);
  process.env.PRESELL_OS_DB = dbFile;
  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const { createCampaign, getCampaignById } = await import("../src/lib/campaigns.ts");
  const { emptyProductFacts } = await import("../src/lib/product-facts.ts");
  const { listManualOverrides, resolveProductFacts } = await import("../src/lib/manual-overrides.ts");
  const presentation = await import("../src/lib/presentation-overrides.ts");

  const facts = emptyProductFacts("Harbor Kettle", "https://example.test/harbor", "IMPORTED");
  facts.description = "A steel kettle.";
  facts.features = ["Whistles"];
  const campaign = createCampaign({
    name: "Harbor kettle draft",
    slug: `harbor-kettle-editor-${Date.now()}`,
    headline: "Harbor headline",
    body: "A steel kettle.",
    ctaLabel: "See price",
    affiliateUrl: "https://example.test/hop",
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify(facts),
  });
  const before = getCampaignById(campaign.id)?.sourceFactsJson;
  const saved = presentation.savePresentationField({
    campaignId: campaign.id,
    field: "presentation.headline",
    raw: "Operator headline",
    section: "navigation",
  });
  assert(saved.ok, "a presentation override is saved");
  const after = getCampaignById(campaign.id)?.sourceFactsJson;
  assert(after === before, "presentation overrides do not change imported ProductFacts");
  assert(!listManualOverrides(campaign.id).some((row) => row.field === "presentation.headline"), "presentation rows stay out of fact resolution");
  const resolved = resolveProductFacts(facts, listManualOverrides(campaign.id));
  assert(resolved.productName === facts.productName && resolved.description === facts.description, "fact resolution ignores presentation rows");
  const overlay = presentation.listPresentationOverlay(campaign.id);
  assert(overlay.headline === "Operator headline", "the effective headline is the override");
  presentation.resetPresentationField(campaign.id, "presentation.headline", "navigation");
  assert(presentation.listPresentationOverlay(campaign.id).headline === null, "reset removes the override and keeps the import");
  const audit = presentation.listOverrideAudit(campaign.id);
  assert(audit.some((row) => row.field === "presentation.headline" && row.operation === "CREATE"), "the override is audited");
  assert(audit.some((row) => row.userName === "operator" && row.oldValue !== undefined), "audit records the operator and previous value");

  const sources = ["src/lib/editor-layers.ts", "src/lib/presentation-overrides.ts"]
    .map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8"))
    .join("\n");
  for (const name of products) assert(!sources.includes(name), `${name} is not hard-coded in the editor or protected engines`);

  resetDbForTests();
  fs.rmSync(dbFile, { force: true });
  console.log("MANUAL_EDITOR_TESTS=PASS");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
