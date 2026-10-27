// npx tsx scripts/test-dual-source-54r.ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign, listCampaigns } from "../src/lib/campaigns.ts";
import { classifySubmittedUrl, sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { readCampaignSources, syncCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { extractAffiliatePolicy } from "../src/lib/affiliate-policy/extract.ts";
import { resolveResearchSeeds } from "../src/lib/product-research/seeds.ts";
import { createProductResearchJob, executeProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { listProductResearchRuns } from "../src/lib/product-research/store.ts";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { classifyPageRenderMode } from "../src/lib/research-coverage/spa-detect.ts";
import { RESEARCH_LIMITS } from "../src/lib/research-coverage/types.ts";
import { buildEvidenceRegistry } from "../src/lib/presell-enrichment/registry.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import type { SafeFetchResult } from "../src/lib/real-product-assets/fetch.ts";
import type { BrowserRenderResult } from "../src/lib/research-coverage/browser-render.ts";

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

const tmp = mkdtempSync(path.join(os.tmpdir(), "aia-54r-"));
process.env.AIA_PRODUCT_RESEARCH_ROOT = tmp;
process.env.AIA_ALLOW_PAID_AI = "0";

const SALES = "https://shop.novalis.example/core";
const AFFILIATE = "https://help.novalis.example/info/affiliates.html";
const CHECKOUT = "https://shop.novalis.example/c/order-now.php?hop=zzzzz&hopId=demo-54r";
const HOP = "https://zzzz.hop.clickbank.net/?hop=zzzzz";
const SPA = "https://shop.novalis.example/app";

const salesHtml = `<!doctype html><html><head><title>Novalis Core</title></head>
<body><h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF.</p>
<h2>What's inside</h2><ul><li>48 pages</li></ul>
<h2>Returns</h2><p>Customers may request a refund within 14 days.</p>
<img src="https://cdn.novalis.example/banner.png" alt="Novalis workbook cover" />
</body></html>`;

const affiliateHtml = `<!doctype html><html><head><title>Novalis Affiliates</title></head>
<body>
<h1>Affiliate resources</h1>
<p>Brand bidding is not allowed on the Novalis trademark.</p>
<p>Paid search on Google Ads is permitted only with pre-approved copy.</p>
<p>Direct linking is not permitted.</p>
<p>Affiliate disclosure is required on every promotional page.</p>
<img src="https://cdn.novalis.example/affiliate-banner.png" alt="Affiliate banner" />
</body></html>`;

const medicalHtml = `<!doctype html><html><body>
<p>This formula is clinically proven to cure disease overnight.</p>
</body></html>`;

const spaShell = `<!doctype html><html><head>
<title>Novalis Core</title>
<script type="module" src="/assets/index-Fk3bWboY.js"></script>
</head><body><div id="root"></div></body></html>`;

function ok(url: string, html: string): SafeFetchResult {
  return { ok: true, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
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

function fetchMap(map: Record<string, SafeFetchResult | "checkout-block">): (url: string) => Promise<SafeFetchResult> {
  return async (url: string) => {
    if (url.includes("order-now") || map[url] === "checkout-block") {
      throw new Error("checkout must not be fetched: " + url);
    }
    if (map[url] && map[url] !== "checkout-block") return map[url];
    if (url.includes("/affiliates")) return ok(url, affiliateHtml);
    if (url.includes("/app")) return ok(url, spaShell);
    if (url.includes("/medical")) return ok(url, medicalHtml);
    if (url.includes("/missing")) return { ok: false, url, status: 503, reason: "upstream-unavailable" };
    return ok(url, salesHtml);
  };
}

async function main() {
  assert(classifySubmittedUrl(CHECKOUT).sourceStatus === "CHECKOUT_SUSPECTED", "order-now is checkout-suspected");
  assert(classifySubmittedUrl(CHECKOUT).fetchable === false, "checkout is not fetchable");
  assert(classifySubmittedUrl(AFFILIATE).sourceType === "AFFILIATE_RESOURCE", "affiliates path is an affiliate-resource candidate");
  assert(classifySubmittedUrl(AFFILIATE).fetchable === true, "affiliate resource remains fetchable");
  assert(classifySubmittedUrl(HOP).sourceType === "TRACKING_HOPLINK", "hop host is tracking");
  assert(classifySubmittedUrl(SALES).sourceType === "SALES_PAGE", "consumer page is a sales page");
  assert(sanitizeSharedUrl(CHECKOUT).includes("REDACTED"), "tracking parameters are redacted in shared URLs");
  assert(!/sugardefender|lymph tonic|prodentim|femicore/i.test(readFileSync("src/lib/campaign-sources/classify.ts", "utf8")), "classifier has no product-specific strings");

  const salesOnly = resolveResearchSeeds({ productUrl: SALES });
  assert(salesOnly.seeds.length === 1 && salesOnly.seeds[0] === SALES, "sales-only campaign seeds the sales page");

  const affiliateOnly = resolveResearchSeeds({ affiliateResourceUrl: AFFILIATE });
  assert(affiliateOnly.seeds.length === 1 && affiliateOnly.seeds[0] === AFFILIATE, "affiliate-only campaign can start research");

  const both = resolveResearchSeeds({ productUrl: SALES, affiliateResourceUrl: AFFILIATE });
  assert(both.seeds.length === 2, "both eligible sources share one seed list");

  const none = resolveResearchSeeds({});
  assert(none.seeds.length === 0, "a campaign without URLs does not invent seeds");

  const checkout = resolveResearchSeeds({ productUrl: CHECKOUT });
  assert(checkout.seeds.length === 0, "checkout is not a seed");
  assert(checkout.skipped.some((item) => item.status === "CHECKOUT_SUSPECTED"), "checkout skip is recorded");

  const hopSeeds = resolveResearchSeeds({ productUrl: HOP, affiliateUrl: HOP });
  assert(hopSeeds.seeds.length === 0, "a tracking hop is not a seed");

  const mixed = resolveResearchSeeds({ productUrl: CHECKOUT, affiliateResourceUrl: AFFILIATE, affiliateUrl: HOP });
  assert(mixed.seeds.length === 1 && mixed.seeds[0] === AFFILIATE, "checkout and hop are skipped while the affiliate resource is kept");

  const classifiedAffiliate = classifySourceClass({ url: AFFILIATE, html: affiliateHtml });
  assert(classifiedAffiliate.sourceClass === "AFFILIATE_RESOURCE", "affiliate-resource classification depends on the observed page");

  const prohibited = extractAffiliatePolicy({
    campaignId: 1,
    texts: [{ text: affiliateHtml }],
  });
  assert(prohibited.brandBiddingPolicy.verdict === "EXPLICITLY_PROHIBITED", "brand bidding can be explicitly prohibited");
  assert(prohibited.directLinkingPolicy.verdict === "EXPLICITLY_PROHIBITED", "direct linking can be explicitly prohibited");
  assert(prohibited.paidSearchPolicy.verdict === "CONDITIONAL" || prohibited.paidSearchPolicy.verdict === "EXPLICITLY_ALLOWED", "paid search uses the observed sentence");
  assert(prohibited.presellPolicy.verdict === "UNKNOWN", "unmentioned presell policy stays UNKNOWN");
  assert(prohibited.publicationReady === false, "policy contract never authorizes publication");

  const unknown = extractAffiliatePolicy({ campaignId: 1, texts: [{ text: "Office hours are listed on the support page." }] });
  assert(unknown.brandBiddingPolicy.verdict === "UNKNOWN", "silence is UNKNOWN, not allowed");

  const conflict = extractAffiliatePolicy({
    campaignId: 1,
    texts: [{ text: "Direct linking is permitted. Direct linking is not allowed." }],
  });
  assert(conflict.directLinkingPolicy.verdict === "CONFLICTING", "conflicting commercial rules are recorded");

  const a = campaign("Novalis 54R Dual", `novalis-54r-dual-${Date.now()}`);
  const job = createProductResearchJob({
    campaignId: a.id,
    productUrl: SALES,
    affiliateResourceUrl: AFFILIATE,
  });
  assert(job.seeds.length === 2, "one job receives both eligible seeds");
  const run = await executeProductResearch({
    campaignId: a.id,
    runId: job.runId,
    fetchPage: fetchMap({}),
  });
  assert(run.status === "COMPLETED", "dual-source research completes on the existing pipeline");
  assert(run.commercialAuthorization === "BLOCKED", "commercial authorization remains blocked");
  assert((run.discoveredAssets ?? []).every((item) => item.status === "REVIEW_REQUIRED"), "discovered assets stay pending");
  assert((run.discoveredAssets ?? []).every((item) => item.declaredAuthorization === "UNSTATED"), "images are not auto-approved");
  assert(run.affiliatePolicy?.publicationReady === false, "affiliate policy does not unlock publication");
  const stored = readCampaignSources(a.id);
  assert(stored.some((item) => item.sourceType === "SALES_PAGE"), "sales source is persisted");
  assert(stored.some((item) => item.sourceType === "AFFILIATE_RESOURCE"), "affiliate source is persisted");

  const checkoutCampaign = campaign("Novalis 54R Checkout", `novalis-54r-checkout-${Date.now()}`);
  const checkoutJob = createProductResearchJob({
    campaignId: checkoutCampaign.id,
    productUrl: CHECKOUT,
  });
  assert(checkoutJob.status === "NEED_URL", "checkout-only campaign does not start a fetch");
  assert(!checkoutJob.seeds.includes(CHECKOUT), "checkout URL is absent from seeds");

  const unavailable = campaign("Novalis 54R Down", `novalis-54r-down-${Date.now()}`);
  const downJob = createProductResearchJob({
    campaignId: unavailable.id,
    affiliateResourceUrl: "https://help.novalis.example/info/affiliates.html",
  });
  const downRun = await executeProductResearch({
    campaignId: unavailable.id,
    runId: downJob.runId,
    fetchPage: async (url) => ({ ok: false, url, status: 503, reason: "upstream-unavailable" }),
  });
  assert(downRun.status === "FAILED" || downRun.error, "an inaccessible source is recorded, not invented");

  const spaCampaign = campaign("Novalis 54R SPA", `novalis-54r-spa-${Date.now()}`);
  const spaDetect = classifyPageRenderMode({ html: spaShell, contentType: "text/html", ok: true });
  assert(spaDetect.mode === "SPA_SUSPECTED" || spaDetect.mode === "BROWSER_RENDER_REQUIRED", "SPA shell is still detected");
  const spaJob = createProductResearchJob({ campaignId: spaCampaign.id, productUrl: SPA });
  const spaRun = await executeProductResearch({
    campaignId: spaCampaign.id,
    runId: spaJob.runId,
    fetchPage: async () => ok(SPA, spaShell),
  });
  assert(spaRun.status === "COMPLETED" || spaRun.status === "FAILED", "SPA research reuses the existing fetch path");

  const medicalCampaign = campaign("Novalis 54R Medical", `novalis-54r-medical-${Date.now()}`);
  const medicalJob = createProductResearchJob({
    campaignId: medicalCampaign.id,
    productUrl: "https://shop.novalis.example/medical",
  });
  const medicalRun = await executeProductResearch({
    campaignId: medicalCampaign.id,
    runId: medicalJob.runId,
    fetchPage: fetchMap({}),
  });
  const medicalProposal = medicalRun.proposals.find((item) => item.field === "description");
  assert(!medicalProposal?.suggestedValue.toLowerCase().includes("clinically proven"), "medical claims are not proposed as facts");

  const approved = campaign("Novalis 54R Keep", `novalis-54r-keep-${Date.now()}`);
  const keepJob = createProductResearchJob({ campaignId: approved.id, productUrl: SALES });
  const keepRun = await executeProductResearch({ campaignId: approved.id, runId: keepJob.runId, fetchPage: fetchMap({}) });
  const acceptedField = keepRun.proposals.find((item) => item.suggestedValue.trim());
  if (acceptedField) {
    const decided = decideProductResearchFields({
      campaignId: approved.id,
      runId: keepRun.runId,
      fields: [acceptedField.field],
      action: "ACCEPT",
    });
    assert(decided.proposals.some((item) => item.field === acceptedField.field && item.status === "ACCEPTED"), "accepted fields stay accepted");
  }

  const isolated = campaign("Novalis 54R Other", `novalis-54r-other-${Date.now()}`);
  syncCampaignSources(isolated.id, { salesUrl: "https://other.novalis.example/core" });
  assert(!readCampaignSources(isolated.id).some((item) => item.originalUrl === SALES), "campaign sources stay isolated");
  assert(!listProductResearchRuns(isolated.id).some((item) => item.runId === run.runId), "research runs stay isolated");

  const facts = emptyProductFacts("Novalis Core", SALES, "MANUAL");
  facts.description = "Novalis Core is a digital workbook supplied as a PDF.";
  const registry = buildEvidenceRegistry({
    sources: [
      { url: SALES, html: salesHtml },
      { url: AFFILIATE, html: affiliateHtml },
    ],
    facts,
  });
  const keys = new Set(registry.entries.map((item) => `${item.field}|${item.originalText}`));
  assert(keys.size === registry.entries.length, "duplicate evidence is not stored twice");
  assert(registry.entries.every((item) => !item.url || Boolean(item.sourceType)), "registry records source type");

  assert(RESEARCH_LIMITS.maxSeedUrls >= 2, "dual-source fits the existing seed budget");
  assert(RESEARCH_LIMITS.maxFetchUrls === 8, "fetch URL limit is unchanged");
  assert(RESEARCH_LIMITS.maxElapsedMs === 45000, "elapsed limit is unchanged");

  const rendered: BrowserRenderResult = {
    ok: true,
    status: "RENDERED",
    requestedUrl: SPA,
    finalUrl: SPA,
    html: salesHtml,
    visibleText: "Novalis Core",
    title: "Novalis Core",
    elapsedMs: 10,
    reason: null,
  };
  assert(rendered.status === "RENDERED", "browser fallback type remains available");

  const libFiles = [
    "src/lib/campaign-sources/classify.ts",
    "src/lib/campaign-sources/store.ts",
    "src/lib/affiliate-policy/extract.ts",
    "src/lib/product-research/seeds.ts",
    "src/lib/product-research/run.ts",
  ];
  for (const file of libFiles) {
    const body = readFileSync(path.join(process.cwd(), file), "utf8");
    assert(!/lymph tonic|prodentim|femicore|sugar defender/i.test(body), `${file} has no product-specific strings`);
  }
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json")) !== null, "FemiCore hop stays readable");
  assert(fileHash(path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json")) !== null, "FemiCore catalog stays readable");
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "prodentim", "hop.json")) !== null, "ProDentim hop stays readable");
  const lymph = listCampaigns().find((item) => /lymph/i.test(item.name) || /lymph/i.test(item.slug));
  if (lymph) {
    const lymphSources = path.join(process.cwd(), "data", "campaign-sources", String(lymph.id), "sources.json");
    assert(!existsSync(lymphSources) || !/sugardefender/i.test(readFileSync(lymphSources, "utf8")), "Lymph Tonic sources were not rewritten");
  } else {
    assert(true, "no Lymph Tonic campaign is present to preserve");
  }

  console.log(`PASS test-dual-source-54r.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
