// npx tsx scripts/test-research-ui-sync-54t.ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { displaySalesUrl, mergeCampaignSources, readCampaignSources, upsertCampaignSource } from "../src/lib/campaign-sources/store.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { attachRunSourceFallback } from "../src/lib/product-research/adapter.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";
import { buildEvidenceRegistry } from "../src/lib/presell-enrichment/registry.ts";
import { classifySubmittedUrl } from "../src/lib/campaign-sources/classify.ts";
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

const tmp = mkdtempSync(path.join(os.tmpdir(), "aia-54t-"));
process.env.AIA_PRODUCT_RESEARCH_ROOT = tmp;
process.env.AIA_ALLOW_PAID_AI = "0";

const SALES = "https://shop.novalis.example/core";
const AFFILIATE = "https://help.novalis.example/info/affiliates.html";
const CHECKOUT = "https://shop.novalis.example/c/order-now.php";
const HOP = "https://zzzz.hop.clickbank.net/";

const salesHtml = `<!doctype html><html><head><title>Novalis Core</title></head>
<body><h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF.</p>
<h2>What's inside</h2><ul><li>Maca Root</li><li>Guarana</li></ul>
<h2>Returns</h2><p>Customers may request a refund within 60 days.</p>
</body></html>`;

function ok(url: string, html: string): SafeFetchResult {
  return { ok: true, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
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
  assert(classifySubmittedUrl(CHECKOUT).sourceStatus === "CHECKOUT_SUSPECTED", "checkout stays suspected");

  const isolated = campaign("Novalis 54T Sync", `novalis-54t-sync-${Date.now()}`);
  upsertCampaignSource(isolated.id, "SALES_PAGE", CHECKOUT);
  upsertCampaignSource(isolated.id, "SALES_PAGE", SALES);
  upsertCampaignSource(isolated.id, "AFFILIATE_RESOURCE", AFFILIATE);
  upsertCampaignSource(isolated.id, "TRACKING_HOPLINK", HOP);
  const sources = readCampaignSources(isolated.id);
  assert(displaySalesUrl(sources) === SALES, "display sales URL prefers the fetchable sales page");
  assert(sources.some((item) => item.originalUrl.includes("order-now")), "checkout history is kept");
  assert(sources.some((item) => item.sourceType === "TRACKING_HOPLINK"), "hop is preserved");
  const knowledge = readKnowledgeText(getCampaignById(isolated.id)!, readCampaignBrief(isolated.id)).text;
  assert(knowledge.productUrl === SALES, "knowledge product URL is not the checkout URL");

  const job = createProductResearchJob({
    campaignId: isolated.id,
    productUrl: SALES,
    affiliateResourceUrl: AFFILIATE,
    trackingHopUrl: HOP,
  });
  const run = await executeProductResearch({
    campaignId: isolated.id,
    runId: job.runId,
    fetchPage: async (url) => ok(url, salesHtml),
  });
  const snap = snapshotProductResearch(isolated.id);
  const indicators = indicatorsFromResearch(snap.latest);
  assert(indicators.researchCoverage.total === run.coverageTotal, "top coverage uses the same persisted run");
  assert(indicators.researchCoverage.max === run.coverageMax, "coverage max is shared");
  const found = run.proposals.filter((item) => item.suggestedValue.trim());
  assert(found.length > 0, "research still produces reviewable proposals");
  const bound = found.find((item) => item.evidenceIds.length && item.sourceUrl);
  const incompleteFound = found.find((item) => item.evidenceIncomplete);
  assert(Boolean(bound || incompleteFound), "a proposal either has a source URL or is marked incomplete");
  if (bound) {
    assert(bound.sourceUrl === SALES || bound.sourceUrl.startsWith("https://"), "bound proposal keeps an https source URL");
    assert(bound.collectedAt !== new Date().toISOString().slice(0, 16), "collection date is not stamped as now");
    assert(!bound.evidenceIncomplete, "a bound proposal is not incomplete");
  }

  const facts = emptyProductFacts("Novalis Core", SALES, "MANUAL");
  facts.description = "Novalis Core is a digital workbook supplied as a PDF.";
  facts.ingredientsOrComponents = ["Maca Root", "Guarana"];
  const registry = buildEvidenceRegistry({
    sources: [{ url: SALES, html: salesHtml, retrievedAt: "2026-01-02T03:04:05.000Z" }],
    facts,
  });
  assert(registry.entries.some((item) => item.field === "INGREDIENTS" && item.originalText === "Maca Root"), "registry keeps individual ingredient excerpts");
  assert(registry.entries.every((item) => item.collectedAt === "2026-01-02T03:04:05.000Z" || item.collectedAt === null), "registry does not invent a new collection clock");

  const incomplete = attachRunSourceFallback(
    [{
      field: "description",
      currentValue: "",
      suggestedValue: "A claim without evidence",
      status: "FOUND_REVIEW_REQUIRED",
      evidenceIds: [],
      sourceUrl: null,
      sourceClass: null,
      verification: null,
      restriction: null,
      collectedAt: null,
      eligibleForBatch: true,
      notes: [],
    }],
    [{ url: SALES, ok: true, sourceClass: "SELLER", sourceType: "SALES_PAGE" }],
  )[0];
  assert(incomplete.evidenceIncomplete === true, "a proposal without evidence IDs is incomplete");
  assert(incomplete.eligibleForBatch === false, "incomplete proposals are not batch-eligible");

  const acceptCampaign = campaign("Novalis 54T Accept", `novalis-54t-accept-${Date.now()}`);
  const acceptJob = createProductResearchJob({ campaignId: acceptCampaign.id, productUrl: SALES });
  const acceptRun = await executeProductResearch({
    campaignId: acceptCampaign.id,
    runId: acceptJob.runId,
    fetchPage: async (url) => ok(url, salesHtml),
  });
  const eligible = acceptRun.proposals.find((item) => item.suggestedValue.trim() && item.evidenceIds.length);
  const other = acceptRun.proposals.find((item) => item.field !== eligible?.field);
  if (eligible) {
    const accepted = decideProductResearchFields({
      campaignId: acceptCampaign.id,
      runId: acceptRun.runId,
      fields: [eligible.field],
      action: "ACCEPT",
    });
    assert(accepted.proposals.find((item) => item.field === eligible.field)?.status === "ACCEPTED", "accept persists on the proposal");
    const reloaded = snapshotProductResearch(acceptCampaign.id).latest;
    assert(reloaded?.proposals.find((item) => item.field === eligible.field)?.status === "ACCEPTED", "accept survives reload");
    if (other) {
      assert(reloaded?.proposals.find((item) => item.field === other.field)?.status === other.status, "unrelated proposals stay intact");
    }
  }
  const rejectable = acceptRun.proposals.find((item) => item.suggestedValue.trim() && item.field !== eligible?.field);
  if (rejectable) {
    const rejected = decideProductResearchFields({
      campaignId: acceptCampaign.id,
      runId: acceptRun.runId,
      fields: [rejectable.field],
      action: "REJECT",
    });
    assert(rejected.proposals.find((item) => item.field === rejectable.field)?.status === "REJECTED", "reject persists");
  }

  const blockedAccept = decideProductResearchFields({
    campaignId: acceptCampaign.id,
    runId: acceptRun.runId,
    fields: ["videos"],
    action: "ACCEPT",
  });
  assert(blockedAccept.proposals.find((item) => item.field === "videos")?.status !== "ACCEPTED", "a field without evidence is not accepted");

  mergeCampaignSources(isolated.id, { trackingHopUrl: HOP });
  assert(readCampaignSources(isolated.id).some((item) => item.sourceType === "TRACKING_HOPLINK"), "merging sources does not drop the hop");
  assert(!readCampaignSources(isolated.id).some((item) => item.sourceType === "AUTHORIZED_DESTINATION"), "authorized destination stays empty");

  const second = campaign("Novalis 54T Other", `novalis-54t-other-${Date.now()}`);
  assert(snapshotProductResearch(second.id).latest?.runId !== run.runId, "campaigns do not share runs");

  const libFiles = [
    "src/lib/product-research/adapter.ts",
    "src/lib/product-research/run.ts",
    "src/lib/campaign-sources/store.ts",
  ];
  for (const file of libFiles) {
    assert(!/sugar defender|lymph tonic|prodentim|femicore/i.test(readFileSync(file, "utf8")), `${file} has no product-specific strings`);
  }
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json")) !== null, "FemiCore hop stays readable");
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "prodentim", "hop.json")) !== null, "ProDentim hop stays readable");

  console.log(`PASS test-research-ui-sync-54t.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
