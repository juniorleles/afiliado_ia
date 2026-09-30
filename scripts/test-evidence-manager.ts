// npx tsx scripts/test-evidence-manager.ts
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const dbFile = path.join(os.tmpdir(), `evidence-manager-${Date.now()}.db`);
process.env.PRESELL_OS_DB = dbFile;

async function main() {
  const { resetDbForTests } = await import("../src/lib/db.ts");
  resetDbForTests();
  const { createCampaign, getCampaignById, updateCampaign } = await import("../src/lib/campaigns.ts");
  const overrides = await import("../src/lib/manual-overrides.ts");
  const evidence = await import("../src/lib/evidence-manager.ts");
  const { emptyProductFacts } = await import("../src/lib/product-facts.ts");

  const facts = emptyProductFacts("Harbor Kettle", "https://example.test/harbor", "IMPORTED");
  facts.description = "A steel kettle for boiling water.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["Whistles when the water boils"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.sourceSnippets = [
    {
      field: "description",
      text: "A steel kettle for boiling water.",
      sourceUrl: facts.sourceUrl,
      confidence: "DIRECT_SOURCE",
      sourceUnit: "Overview",
      retrievedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  const campaign = createCampaign({
    name: "Harbor kettle draft",
    slug: "harbor-kettle-evidence",
    headline: "Harbor Kettle",
    body: "A steel kettle for boiling water.",
    ctaLabel: "See price",
    affiliateUrl: "https://example.test/hop",
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify(facts),
  });
  const baselineInput = {
    campaignId: campaign.id,
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    createdAt: campaign.createdAt,
    overrides: [],
  };
  evidence.ensureEvidenceBaseline(baselineInput);
  evidence.ensureEvidenceBaseline(baselineInput);
  const first = evidence.listFieldEvidence(campaign.id).find((field) => field.field === "description");
  assert(first?.revision === 1 && first.origin === "IMPORTER" && first.confidence === "DIRECT_SOURCE", "first revision is the importer capture");
  assert(first?.source.section === "Overview", "source section is kept");
  assert(first?.source.snippet === "A steel kettle for boiling water.", "evidence snippet is the source text");
  assert(first?.source.screenshotRef === null, "screenshot reference stays empty until one exists");
  assert(evidence.listFieldEvidence(campaign.id).find((field) => field.field === "description")?.revisions.length === 1, "baseline does not append twice");

  overrides.saveManualOverride(campaign.id, "description", "Operator description.");
  evidence.recordManualEdit({ campaignId: campaign.id, field: "description", value: "Operator description.", reason: "Manual edit" });
  evidence.recordManualEdit({ campaignId: campaign.id, field: "description", value: "Operator correction.", reason: "Manual correction" });
  const edited = evidence.listFieldEvidence(campaign.id).find((field) => field.field === "description");
  assert(edited?.revisions.length === 3, "manual edits append revisions");
  assert(edited?.revisions[0]?.status === "HISTORICAL" && edited.revisions[0].origin === "IMPORTER", "importer revision is kept");
  assert(edited?.origin === "MANUAL" && edited.revision === 3, "current revision is the latest manual edit");
  assert(getCampaignById(campaign.id)?.sourceFactsJson === JSON.stringify(facts), "manual evidence does not rewrite importer facts");

  overrides.resetManualOverride(campaign.id, "description");
  evidence.recordResetToImporter({
    campaignId: campaign.id,
    field: "description",
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    reason: "Reset to importer",
  });
  const reset = evidence.listFieldEvidence(campaign.id).find((field) => field.field === "description");
  assert(reset?.revisions.length === 4 && reset.origin === "IMPORTER" && reset.revisions[3]?.operation === "RESET", "reset appends an importer revision");
  assert(overrides.listManualOverrides(campaign.id).every((row) => row.field !== "description"), "reset clears the active override");

  overrides.saveManualOverride(campaign.id, "description", "Keep this manual text.");
  evidence.recordManualEdit({ campaignId: campaign.id, field: "description", value: "Keep this manual text.", reason: null });
  const refreshedFacts = { ...facts, description: "Reimported kettle copy.", confidence: { ...facts.confidence, description: "DIRECT_SOURCE" } };
  updateCampaign(campaign.id, {
    name: campaign.name,
    slug: campaign.slug,
    headline: campaign.headline,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    affiliateUrl: campaign.affiliateUrl,
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify(refreshedFacts),
  });
  const afterRefresh = evidence.listFieldEvidence(campaign.id).find((field) => field.field === "description");
  assert(afterRefresh?.origin === "MANUAL", "import refresh leaves the manual value current");
  assert(afterRefresh?.revisions.some((revision) => revision.operation === "IMPORT_REFRESH" && revision.status === "RECORDED"), "import refresh is stored beside the manual revision");
  assert(overrides.listManualOverrides(campaign.id).some((row) => row.field === "description"), "import refresh does not delete the override");
  const resolved = overrides.loadResolvedProductFacts(getCampaignById(campaign.id)!);
  assert(resolved?.description === "Keep this manual text.", "resolved facts still use the manual description");

  const beforeRestore = afterRefresh?.revisions.length ?? 0;
  evidence.restoreRevision({
    campaignId: campaign.id,
    field: "description",
    revision: 1,
    sourceFactsJson: getCampaignById(campaign.id)?.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    reason: null,
  });
  const restored = evidence.listFieldEvidence(campaign.id).find((field) => field.field === "description");
  assert((restored?.revisions.length ?? 0) === beforeRestore + 1, "restore appends a revision");
  assert(restored?.revisions[0]?.revision === 1, "revision 1 is still present");

  const exported = evidence.exportAudit(campaign.id);
  assert(exported.revisions.length > 0 && exported.auditLog.length > 0, "audit export contains revisions and the log");
  assert(exported.auditLog.some((entry) => entry.operation === "IMPORT_REFRESH"), "audit export includes import refresh");
  assert(!("pdf" in exported), "audit export is JSON data");

  const unknown = emptyProductFacts("", "https://example.test/unknown", "IMPORTED");
  const unknownCampaign = createCampaign({
    name: "Unknown draft",
    slug: "unknown-evidence",
    headline: "Unknown",
    body: "Empty draft.",
    ctaLabel: "See price",
    affiliateUrl: "https://example.test/hop",
    headScript: null,
    adHeadline: null,
    sourceFactsJson: JSON.stringify(unknown),
  });
  evidence.ensureEvidenceBaseline({
    campaignId: unknownCampaign.id,
    sourceFactsJson: unknownCampaign.sourceFactsJson ?? null,
    affiliateUrl: unknownCampaign.affiliateUrl,
    ctaLabel: unknownCampaign.ctaLabel,
    createdAt: unknownCampaign.createdAt,
    overrides: [],
  });
  const unknownFeatures = evidence.listFieldEvidence(unknownCampaign.id).find((field) => field.field === "features");
  assert(unknownFeatures?.revisions[0]?.valueJson === "[]", "unknown product does not invent features");
  assert(evidence.matchesEvidenceFilter(unknownFeatures!, "low"), "missing confidence is low confidence");

  evidence.recordSourcedEvidence({
    campaignId: unknownCampaign.id,
    field: "features",
    origin: "RESEARCH",
    confidence: "DIRECT_SOURCE",
    value: [],
    reason: "Research note",
  });
  const researched = evidence.listFieldEvidence(unknownCampaign.id).find((field) => field.field === "features");
  const researchedValue = researched?.revisions.find((revision) => revision.status === "CURRENT")?.valueJson;
  assert(researched?.origin === "RESEARCH", "research origin can be recorded without changing the fact value");
  assert(evidence.matchesEvidenceFilter(researched!, "research"), "research filter matches a research revision");
  assert(researchedValue === "[]", "research metadata does not invent feature text");

  const stored = [
    ["VisiFlora", null],
    ["Joint Genesis", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"],
    ["Prime Biome", null],
    ["Prodentim", "data/generic-lp-engine/v1/prodentim-replay-04/product-facts.json"],
    ["Neuro Serge", "data/multi-product-validation/neuro-serge/import-facts.json"],
    ["Audifort", "data/generic-lp-engine/v1/audifort-final-controlled-v1/product-facts.json"],
  ] as const;
  for (const [label, file] of stored) {
    const raw = file ? (JSON.parse(readFileSync(file, "utf8")) as { productName?: string; facts?: { productName?: string } }) : null;
    const productFacts = raw ? (raw.productName ? raw : raw.facts) : emptyProductFacts(label, "https://example.test/item", "IMPORTED");
    const row = createCampaign({
      name: `${label} evidence`,
      slug: `evidence-${label.toLowerCase().replace(/\s+/g, "-")}`,
      headline: label,
      body: "Evidence baseline.",
      ctaLabel: "See price",
      affiliateUrl: "https://example.test/hop",
      headScript: null,
      adHeadline: null,
      sourceFactsJson: JSON.stringify(productFacts),
    });
    evidence.ensureEvidenceBaseline({
      campaignId: row.id,
      sourceFactsJson: row.sourceFactsJson ?? null,
      affiliateUrl: row.affiliateUrl,
      ctaLabel: row.ctaLabel,
      createdAt: row.createdAt,
      overrides: [],
    });
    const identity = evidence.listFieldEvidence(row.id).find((field) => field.field === "productName");
    const storedName = String((productFacts as { productName?: string }).productName ?? "");
    const currentValue = identity?.revisions.find((revision) => revision.status === "CURRENT")?.valueJson ?? "";
    assert(identity?.revisions.length === 1, `${label} has an importer revision`);
    assert(currentValue.includes(storedName), `${label} revision keeps the stored name`);
  }

  const shares = evidence.evidenceOriginPercents(campaign.id);
  assert(shares.auto + shares.manual + shares.unknown + shares.research === 100, "origin shares account for every current field");

  const source = readFileSync("src/lib/evidence-manager.ts", "utf8");
  assert(!/visiflora|neuro serge|prodentim|audifort|joint genesis|prime biome|harbor|clickbank/i.test(source), "evidence manager has no product or domain names");
  for (const file of [
    "src/lib/import-product.ts",
    "src/lib/product-facts.ts",
    "src/lib/presentation-plan.ts",
    "src/lib/ai/grounding-validator.ts",
    "src/lib/policy-linter.ts",
    "src/lib/publication.ts",
    "src/lib/affiliate-url.ts",
    "src/lib/manual-overrides.ts",
  ]) {
    assert(!readFileSync(file, "utf8").includes("evidence-manager"), `${file} is unchanged`);
  }

  resetDbForTests();
  console.log("EVIDENCE_MANAGER_TESTS=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
