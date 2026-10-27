// npx tsx scripts/test-legacy-universal-54p.ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign, getCampaignById, writeCampaignSourceFacts } from "../src/lib/campaigns.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { readKnowledgeText, saveProductKnowledge } from "../src/lib/product-knowledge.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { resolveResearchSeeds, isHopLink, isAffiliateProgramUrl } from "../src/lib/product-research/seeds.ts";
import { createProductResearchJob, executeProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { readLatestProductResearch, listProductResearchRuns } from "../src/lib/product-research/store.ts";
import { displayFieldStatus, indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";
import { productFactsFromKnowledge } from "../src/lib/product-research/adapter.ts";
import { analyzeImportCompleteness } from "../src/lib/completeness-engine.ts";
import { predictLpQuality } from "../src/lib/lp-quality-predictor.ts";
import type { SafeFetchResult } from "../src/lib/real-product-assets/fetch.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "aia-54p-"));
process.env.AIA_PRODUCT_RESEARCH_ROOT = tmp;
process.env.AIA_ALLOW_PAID_AI = "0";

const thinSpa = `<!doctype html><html><head>
<title>Novalis Core - Workbook</title>
<meta name="description" content="Novalis Core is a digital workbook product designed to structure morning lessons. Contains 48 numbered pages." />
<meta property="og:description" content="Made in USA with quality ingredients." />
</head><body><div id="root"></div></body></html>`;

const richHtml = `<!doctype html><html><head><title>Novalis Core</title></head>
<body>
<h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF.</p>
<h2>What's inside</h2>
<ul><li>48 pages</li><li>USB-C download card</li></ul>
<h2>How to use</h2>
<p>Open the PDF and complete one lesson each morning.</p>
<h2>Returns</h2>
<p>Customers may request a refund within 14 days.</p>
</body></html>`;

function okFetch(url: string): Promise<SafeFetchResult> {
  const html = url.includes("thin") ? thinSpa : url.includes("empty") ? "<html><body></body></html>" : richHtml;
  return Promise.resolve({
    ok: true,
    url,
    status: 200,
    reason: null,
    body: Buffer.from(html),
    contentType: "text/html",
  });
}

function failFetch(url: string): Promise<SafeFetchResult> {
  return Promise.resolve({ ok: false, url, status: 503, reason: "upstream-unavailable" });
}

function campaign(name: string, slug: string) {
  return createCampaign({
    name,
    slug,
    headline: name,
    body: name,
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
}

async function main() {
  const salesWithHop = "https://shop.novalis.example/?hopId=not-an-authorization";
  assert(!isHopLink(salesWithHop), "a sales host with hopId is not a ClickBank hop");
  assert(!isAffiliateProgramUrl(salesWithHop), "a sales host with hopId is not an affiliate-program host");
  const seeded = resolveResearchSeeds({ productUrl: salesWithHop });
  assert(seeded.seeds.length === 1, "a sales page with a tracking hopId is accepted as a research seed");
  assert(classifySourceClass({ url: salesWithHop }).sourceClass === "AFFILIATE_RESOURCE", "hopId still classifies as affiliate evidence, not independent proof");

  assert(isHopLink("https://aaaa.hop.clickbank.net/?hopId=abc"), "hop.clickbank.net remains a hop");
  assert(resolveResearchSeeds({ productUrl: "https://aaaa.hop.clickbank.net/?hopId=abc" }).seeds.length === 0, "a hop host is not a seed");
  assert(resolveResearchSeeds({ productUrl: "https://www.clickbank.net/marketplace" }).seeds.length === 0, "a marketplace host is not a seed");
  assert(resolveResearchSeeds({ productUrl: "https://not a url" }).seeds.length === 0, "an invalid URL is not a seed");

  const idle = indicatorsFromResearch(null);
  assert(idle.extractionConfidence.status === "UNAVAILABLE", "extraction confidence is unavailable without a documented metric");
  assert(idle.extractionConfidence.percent === null, "no substitute percentage is invented for extraction confidence");
  assert(idle.generationReadiness.status === "NOT_RESEARCHED", "generation stays not researched before a run");
  assert(idle.publicationReadiness.status === "BLOCKED", "publication stays blocked without human approval");
  assert(displayFieldStatus({ researched: false, status: "NOT_FOUND" }) === "NOT_RESEARCHED", "an empty field is not an error before research");

  const a = campaign("Novalis QA P A", `qa-54p-a-${Date.now()}`);
  const b = campaign("Novalis QA P B", `qa-54p-b-${Date.now()}`);
  const queued = createProductResearchJob({ campaignId: a.id, productUrl: "https://shop.novalis.example/core" });
  const done = await executeProductResearch({ campaignId: a.id, runId: queued.runId, fetchPage: okFetch });
  assert(done.status === "COMPLETED", "universal research completes on a public product page");
  assert(done.proposals.some((item) => item.field === "description" && item.suggestedValue), "a description can be proposed from the contract adapter");
  const scored = indicatorsFromResearch(done);
  assert(scored.generationReadiness.status === "SANDBOX_DRAFT", "a completed run is a sandbox draft, not publication ready");
  assert(scored.publicationReadiness.status === "BLOCKED", "research coverage is not publication approval");
  assert(scored.commercialAuthorization === "BLOCKED", "commercial authorization stays blocked");
  assert(scored.editorialQuality.grounding !== undefined, "editorial quality is reported separately from import score");

  const accepted = decideProductResearchFields({
    campaignId: a.id,
    runId: done.runId,
    fields: ["description"],
    action: "ACCEPT",
  });
  assert(accepted.proposals.find((item) => item.field === "description")?.status === "ACCEPTED", "accept is stored as ACCEPTED");
  assert(displayFieldStatus({ researched: true, status: "ACCEPTED" }) === "USER_APPROVED", "ACCEPTED is the existing user-approved state");
  const blocked = decideProductResearchFields({
    campaignId: a.id,
    runId: done.runId,
    fields: ["description"],
    action: "ACCEPT",
  });
  assert(blocked.proposals.find((item) => item.field === "description")?.status === "ACCEPTED", "an approved field is not overwritten without confirmation");
  assert(blocked.decisions.some((item) => item.field === "description" && !item.confirmedOverwrite), "the refused overwrite is recorded");

  const other = createProductResearchJob({ campaignId: b.id, productUrl: "https://shop.novalis.example/other" });
  assert(other.campaignId === b.id, "a second campaign gets its own run");
  assert(!listProductResearchRuns(b.id).includes(done.runId), "runs are not copied across campaigns");
  assert(readLatestProductResearch(a.id)?.runId === done.runId, "campaign A still points at its own run");
  await executeProductResearch({ campaignId: b.id, runId: other.runId, fetchPage: okFetch });

  const emptyCampaign = campaign("Novalis QA P Empty", `qa-54p-empty-${Date.now()}`);
  const emptyJob = createProductResearchJob({ campaignId: emptyCampaign.id, productUrl: "https://shop.novalis.example/empty" });
  const emptyRun = await executeProductResearch({ campaignId: emptyCampaign.id, runId: emptyJob.runId, fetchPage: okFetch });
  assert(emptyRun.status === "COMPLETED" || emptyRun.status === "FAILED", "HTTP 200 without useful copy is recorded");
  assert(!emptyRun.proposals.some((item) => item.suggestedValue.trim() && item.field === "ingredients"), "an empty page does not invent ingredients");

  const failedJob = createProductResearchJob({
    campaignId: createCampaign({
      name: "Novalis QA P C",
      slug: `qa-54p-c-${Date.now()}`,
      headline: "C",
      body: "C",
      ctaLabel: "See offer",
      affiliateUrl: "",
      headScript: null,
      adHeadline: null,
    }).id,
    productUrl: "https://shop.novalis.example/core",
  });
  const failed = await executeProductResearch({ campaignId: failedJob.campaignId, runId: failedJob.runId, fetchPage: failFetch });
  assert(failed.status === "FAILED" || failed.sources.every((item) => !item.ok), "an unavailable source is persisted");

  const thinFacts = extractProductFacts(thinSpa, "https://shop.novalis.example/thin", { operatorProductName: "Novalis Core" });
  assert(Boolean(thinFacts.description && /workbook/i.test(thinFacts.description)), "meta description on a JS shell is recovered by the existing extractor");
  assert(thinFacts.ingredientsOrComponents.length === 0, "ingredients are not invented from a title or meta line");

  const knowledge = readKnowledgeText(getCampaignById(a.id)!, readCampaignBrief(a.id)).text;
  const adapted = productFactsFromKnowledge({ productName: "Novalis Core", text: knowledge });
  assert(adapted.description === knowledge.description, "V2 facts come from approved knowledge, not unreviewed suggestions");
  const completeness = analyzeImportCompleteness({ facts: emptyProductFacts("Novalis Core", "", "MANUAL") });
  const quality = predictLpQuality({ facts: emptyProductFacts("Novalis Core", "", "MANUAL"), report: completeness });
  assert(completeness.blocksGeneration === false, "import completeness still does not block sandbox generation");
  assert(typeof quality.confidence === "number", "the legacy agreement number still exists internally");
  assert(indicatorsFromResearch(null).extractionConfidence.status === "UNAVAILABLE", "that agreement number is not exposed as extraction confidence");

  writeCampaignSourceFacts(a.id, JSON.stringify(emptyProductFacts("Novalis Core", "https://shop.novalis.example/core", "MANUAL")));
  saveProductKnowledge(a.id, { ...knowledge, description: "Kept by the operator." });
  const kept = readKnowledgeText(getCampaignById(a.id)!, readCampaignBrief(a.id)).text;
  assert(kept.description === "Kept by the operator.", "manual approved copy remains writable");

  const libFiles = [
    "src/lib/product-research/seeds.ts",
    "src/lib/product-research/adapter.ts",
    "src/lib/product-research/run.ts",
    "src/lib/product-research/indicators.ts",
    "src/lib/product-research/review.ts",
  ];
  for (const file of libFiles) {
    const body = readFileSync(path.join(process.cwd(), file), "utf8");
    assert(!/lymph tonic|prodentim|femicore/i.test(body), `${file} has no product-specific strings`);
  }

  const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
  const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
  const prodentimHop = path.join(process.cwd(), "data", "affiliate-hops", "prodentim", "hop.json");
  assert(fileHash(femicoreHop) !== null, "FemiCore hop stays readable");
  assert(fileHash(femicoreCatalog) !== null, "FemiCore catalog stays readable");
  assert(fileHash(prodentimHop) !== null, "ProDentim hop stays readable");

  console.log(`PASS test-legacy-universal-54p.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
