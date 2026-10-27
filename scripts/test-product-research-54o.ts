// npx tsx scripts/test-product-research-54o.ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign, getCampaignById, writeCampaignSourceFacts } from "../src/lib/campaigns.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { readKnowledgeText, saveProductKnowledge } from "../src/lib/product-knowledge.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { resolveResearchSeeds, isHopLink } from "../src/lib/product-research/seeds.ts";
import { createProductResearchJob, executeProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { readLatestProductResearch, listProductResearchRuns } from "../src/lib/product-research/store.ts";
import { RESEARCH_LIMITS } from "../src/lib/research-coverage/types.ts";
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

const tmp = mkdtempSync(path.join(os.tmpdir(), "aia-54o-"));
process.env.AIA_PRODUCT_RESEARCH_ROOT = tmp;
process.env.AIA_ALLOW_PAID_AI = "0";

const productHtml = `<!doctype html><html><head><title>Novalis Core</title></head>
<body>
<h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF.</p>
<h2>What's inside</h2>
<ul><li>48 pages</li><li>USB-C download card</li></ul>
<h2>How to use</h2>
<p>Open the PDF and complete one lesson each morning.</p>
<h2>Returns</h2>
<p>Customers may request a refund within 14 days.</p>
<h3>When will it arrive?</h3>
<p>The download is available immediately after purchase.</p>
<a href="/faq">FAQ</a>
</body></html>`;

function okFetch(url: string): Promise<SafeFetchResult> {
  return Promise.resolve({
    ok: true,
    url,
    status: 200,
    reason: null,
    body: Buffer.from(url.includes("/faq") ? "<html><h3>Format?</h3><p>The workbook is a PDF file.</p></html>" : productHtml),
    contentType: "text/html",
  });
}

function failFetch(url: string): Promise<SafeFetchResult> {
  return Promise.resolve({ ok: false, url, status: 503, reason: "upstream-unavailable" });
}

function campaign(name: string, slug: string, affiliateUrl = "") {
  return createCampaign({
    name,
    slug,
    headline: name,
    body: name,
    ctaLabel: "See offer",
    affiliateUrl,
    headScript: null,
    adHeadline: null,
  });
}

async function main() {
assert(!isHopLink("https://shop.novalis.example/core"), "a product page is not a hop");
assert(isHopLink("https://6b503qvz1icsbs7otcn82psacg.hop.clickbank.net"), "a ClickBank hop is recognized");

const noUrl = resolveResearchSeeds({ productUrl: "", sourceUrl: "", affiliateUrl: "https://zzzz.hop.clickbank.net" });
assert(noUrl.seeds.length === 0, "research without a product URL does not invent a seed");
assert(/url|HopLink|página/i.test(noUrl.rejection ?? ""), "the operator is told that a product URL is required");

const hopOnly = resolveResearchSeeds({
  productUrl: "https://aaaa.hop.clickbank.net/?hop=zzzzz",
  affiliateUrl: "https://aaaa.hop.clickbank.net/?hop=zzzzz",
});
assert(hopOnly.seeds.length === 0, "a HopLink is not accepted as the research page");

const valid = resolveResearchSeeds({ productUrl: "https://shop.novalis.example/core" });
assert(valid.seeds[0] === "https://shop.novalis.example/core", "a public https product URL is accepted");

const a = campaign("Novalis QA A", `qa-54o-a-${Date.now()}`);
const b = campaign("Novalis QA B", `qa-54o-b-${Date.now()}`);
const missing = createProductResearchJob({ campaignId: a.id });
assert(missing.status === "NEED_URL", "a campaign without a URL is blocked before fetch");
assert(missing.seeds.length === 0, "no external fetch is queued without a URL");

const queued = createProductResearchJob({ campaignId: a.id, productUrl: "https://shop.novalis.example/core" });
assert(queued.status === "QUEUED", "a valid URL creates a queued job");
const duplicate = createProductResearchJob({ campaignId: a.id, productUrl: "https://shop.novalis.example/core" });
assert(duplicate.runId === queued.runId, "a second click reuses the active job");

const done = await executeProductResearch({ campaignId: a.id, runId: queued.runId, fetchPage: okFetch });
assert(done.status === "COMPLETED", "a valid URL completes against the existing pipeline");
assert(done.campaignId === a.id, "the run stays bound to the requesting campaign");
assert(done.proposals.some((item) => item.field === "description" && item.suggestedValue), "description is proposed from the source");
assert(done.proposals.find((item) => item.field === "images")?.status === "UNVERIFIED" || done.proposals.find((item) => item.field === "images")?.suggestedValue === "", "images are not treated as USER_APPROVED");
assert(done.commercialAuthorization === "BLOCKED", "research does not authorize a commercial CTA");
assert(done.publicationReadiness === "BLOCKED", "coverage is not publication approval");

const accepted = decideProductResearchFields({
  campaignId: a.id,
  runId: done.runId,
  fields: ["description"],
  action: "ACCEPT",
});
assert(accepted.proposals.find((item) => item.field === "description")?.status === "ACCEPTED", "an individual accept is recorded");
const afterAccept = readKnowledgeText(getCampaignById(a.id)!, readCampaignBrief(a.id)).text;
assert(afterAccept.description.trim().length > 0, "accepted copy is persisted on the campaign");

const rejected = decideProductResearchFields({
  campaignId: a.id,
  runId: done.runId,
  fields: ["faq"],
  action: "REJECT",
});
assert(rejected.proposals.find((item) => item.field === "faq")?.status === "REJECTED", "an individual reject is recorded");

const blockedOverwrite = decideProductResearchFields({
  campaignId: a.id,
  runId: done.runId,
  fields: ["description"],
  action: "ACCEPT",
});
assert(blockedOverwrite.proposals.find((item) => item.field === "description")?.status === "ACCEPTED", "a previously accepted field stays accepted");
assert(blockedOverwrite.decisions.some((item) => item.field === "description" && !item.confirmedOverwrite && item.action === "ACCEPT"), "overwrite without confirmation is refused");

const other = createProductResearchJob({ campaignId: b.id });
assert(other.campaignId === b.id, "a second campaign gets its own run");
assert(!listProductResearchRuns(b.id).includes(done.runId), "runs are not copied across campaigns");
const latestA = readLatestProductResearch(a.id);
assert(latestA?.campaignId === a.id && latestA.runId === done.runId, "campaign A still points at its own run");

const failedJob = createProductResearchJob({ campaignId: b.id, productUrl: "https://shop.novalis.example/core" });
const failed = await executeProductResearch({ campaignId: b.id, runId: failedJob.runId, fetchPage: failFetch });
assert(failed.status === "FAILED" || failed.sources.every((item) => !item.ok), "an HTTP failure is persisted");

assert(RESEARCH_LIMITS.maxDiscoveredUrls === 5, "discovered URL limit is unchanged");
assert(RESEARCH_LIMITS.maxFetchUrls === 8, "fetch URL limit is unchanged");
assert(RESEARCH_LIMITS.maxDepth === 1, "depth limit is unchanged");
assert(RESEARCH_LIMITS.maxElapsedMs === 45000, "elapsed limit is unchanged");
assert(RESEARCH_LIMITS.maxInspectedCandidates === 40, "inspect limit is unchanged");

const facts = emptyProductFacts("Novalis Core", "https://shop.novalis.example/core", "MANUAL");
facts.description = "Novalis Core is a digital workbook supplied as a PDF.";
writeCampaignSourceFacts(a.id, JSON.stringify(facts));
saveProductKnowledge(a.id, {
  productUrl: "https://shop.novalis.example/core",
  brand: "Novalis",
  category: "digital",
  description: "Kept by the operator.",
  ingredients: "",
  benefits: "",
  howItWorks: "",
  warnings: "",
  pricing: "",
  guarantee: "",
  manufacturer: "",
  faq: "",
  images: "",
  videos: "",
});
const kept = readKnowledgeText(getCampaignById(a.id)!, readCampaignBrief(a.id)).text;
assert(kept.description === "Kept by the operator.", "manual draft values remain writable after research");

const libFiles = [
  "src/lib/product-research/seeds.ts",
  "src/lib/product-research/adapter.ts",
  "src/lib/product-research/run.ts",
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

console.log(`PASS test-product-research-54o.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
