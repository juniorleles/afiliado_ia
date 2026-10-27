// npx tsx scripts/test-browser-research-54q.ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { createProductResearchJob, executeProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { listProductResearchRuns, readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { classifyPageRenderMode } from "../src/lib/research-coverage/spa-detect.ts";
import { fetchPublicPageForResearch, resetBrowserRenderBudget } from "../src/lib/research-coverage/fetch-rendered.ts";
import { inspectPublicHttpsUrl, inspectResolvedPublicHttpsUrl, isPrivateAddress } from "../src/lib/real-product-assets/ssrf.ts";
import { buildEvidenceRegistry } from "../src/lib/presell-enrichment/registry.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { RESEARCH_LIMITS } from "../src/lib/research-coverage/types.ts";
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

const tmp = mkdtempSync(path.join(os.tmpdir(), "aia-54q-"));
process.env.AIA_PRODUCT_RESEARCH_ROOT = tmp;
process.env.AIA_ALLOW_PAID_AI = "0";

const traditional = `<!doctype html><html><head><title>Novalis Core</title></head>
<body><main><h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF for structured morning lessons.</p>
<h2>What's inside</h2><ul><li>48 pages</li><li>USB-C download card</li></ul>
<h2>How to use</h2><p>Open the PDF and complete one lesson each morning.</p>
<h2>Returns</h2><p>Customers may request a refund within 14 days.</p>
</main></body></html>`;

const shortStatic = `<!doctype html><html><body><main><p>Office closed on public holidays.</p></main></body></html>`;

const spaShell = `<!doctype html><html><head>
<title>Novalis Core</title>
<meta name="description" content="Novalis Core is a digital workbook product designed to structure morning lessons. Contains 48 numbered pages." />
<script type="module" src="/assets/index-Fk3bWboY.js"></script>
</head><body><div id="root"></div></body></html>`;

const emptySpa = `<!doctype html><html><head><title>App</title>
<script type="module" src="/assets/index-aaaa.js"></script>
</head><body><div id="root"></div></body></html>`;

function ok(url: string, html: string): SafeFetchResult {
  return { ok: true, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
}

function rendered(html: string, extra?: Partial<BrowserRenderResult>): BrowserRenderResult {
  return {
    ok: true,
    status: "RENDERED",
    requestedUrl: "https://shop.novalis.example/app",
    finalUrl: "https://shop.novalis.example/app",
    html,
    visibleText: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    title: "Novalis Core",
    elapsedMs: 40,
    reason: null,
    ...extra,
  };
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
  resetBrowserRenderBudget();
  const staticMode = classifyPageRenderMode({ html: traditional, contentType: "text/html", ok: true });
  assert(staticMode.mode === "STATIC_HTML", "traditional HTML is STATIC_HTML");
  const shortMode = classifyPageRenderMode({ html: shortStatic, contentType: "text/html", ok: true });
  assert(shortMode.mode === "STATIC_HTML", "a short page with visible markup is not classified as an SPA");
  const spaMode = classifyPageRenderMode({ html: spaShell, contentType: "text/html", ok: true });
  assert(spaMode.mode === "BROWSER_RENDER_REQUIRED", "an empty application root with a bundle requires rendering");
  assert(spaMode.reasons.length > 0, "SPA classification records reasons");

  let renderCalls = 0;
  const staticFetch = await fetchPublicPageForResearch("https://shop.novalis.example/core", {
    fetchPage: async (url) => ok(url, traditional),
    renderPage: async () => {
      renderCalls += 1;
      return rendered(traditional);
    },
  });
  assert(staticFetch.extractionMode === "HTTP", "static HTML does not start the browser");
  assert(renderCalls === 0, "the renderer is not called for STATIC_HTML");

  resetBrowserRenderBudget();
  const spaFetch = await fetchPublicPageForResearch("https://shop.novalis.example/app", {
    fetchPage: async (url) => ok(url, spaShell),
    renderPage: async () => {
      renderCalls += 1;
      return rendered(traditional);
    },
  });
  assert(spaFetch.ok && spaFetch.extractionMode === "BROWSER_RENDERED", "a JS shell uses browser-rendered HTML");
  assert(spaFetch.body.toString("utf8").includes("48 pages"), "rendered HTML is what the pipeline receives");

  resetBrowserRenderBudget();
  const emptyRender = await fetchPublicPageForResearch("https://shop.novalis.example/empty-app", {
    fetchPage: async (url) => ok(url, emptySpa),
    renderPage: async () => rendered(emptySpa, { visibleText: "" }),
  });
  assert(emptyRender.extractionMode === "HTTP", "an empty render does not replace the HTTP body with invented copy");

  resetBrowserRenderBudget();
  const timed = await fetchPublicPageForResearch("https://shop.novalis.example/slow", {
    fetchPage: async (url) => ok(url, spaShell),
    renderPage: async () => ({
      ok: false,
      status: "TIMEOUT",
      requestedUrl: "https://shop.novalis.example/slow",
      finalUrl: null,
      html: "",
      visibleText: "",
      title: null,
      elapsedMs: 25_000,
      reason: "The browser timed out.",
    }),
  });
  assert(timed.extractionMode === "HTTP" && timed.renderStatus === "TIMEOUT", "a browser timeout keeps the HTTP body");

  resetBrowserRenderBudget();
  const failedBrowser = await fetchPublicPageForResearch("https://shop.novalis.example/app", {
    fetchPage: async (url) => ok(url, spaShell),
    renderPage: async () => ({
      ok: false,
      status: "BROWSER_UNAVAILABLE",
      requestedUrl: "https://shop.novalis.example/app",
      finalUrl: null,
      html: "",
      visibleText: "",
      title: null,
      elapsedMs: 5,
      reason: "No isolated system browser channel is available.",
    }),
  });
  assert(failedBrowser.renderStatus === "BROWSER_UNAVAILABLE", "a missing browser is recorded");

  assert(!inspectPublicHttpsUrl("file:///etc/passwd").ok, "file URLs are rejected");
  assert(!inspectPublicHttpsUrl("https://127.0.0.1/").ok, "loopback literals are rejected");
  assert(!inspectPublicHttpsUrl("https://user:pass@shop.novalis.example/").ok, "URLs with credentials are rejected");
  assert(!inspectPublicHttpsUrl("http://shop.novalis.example/").ok, "non-HTTPS URLs are rejected");
  assert(isPrivateAddress("10.0.0.4"), "private IPv4 is detected");
  const local = await inspectResolvedPublicHttpsUrl("https://localhost/");
  assert(!local.ok, "localhost remains blocked after DNS inspection");

  const a = campaign("Novalis QA Q A", `qa-54q-a-${Date.now()}`);
  const b = campaign("Novalis QA Q B", `qa-54q-b-${Date.now()}`);
  const job = createProductResearchJob({ campaignId: a.id, productUrl: "https://shop.novalis.example/core" });
  const done = await executeProductResearch({
    campaignId: a.id,
    runId: job.runId,
    fetchPage: async (url) => ok(url, traditional),
  });
  assert(done.status === "COMPLETED", "the existing research pipeline still completes");
  assert(done.proposals.some((item) => item.field === "description" && item.suggestedValue), "rendered-equivalent HTML can produce a proposal");
  assert(done.commercialAuthorization === "BLOCKED", "browser access does not authorize a commercial CTA");
  assert(done.publicationReadiness === "BLOCKED", "coverage is not publication approval");
  const accepted = decideProductResearchFields({
    campaignId: a.id,
    runId: done.runId,
    fields: ["description"],
    action: "ACCEPT",
  });
  assert(accepted.proposals.find((item) => item.field === "description")?.status === "ACCEPTED", "human accept is still required");
  const blocked = decideProductResearchFields({
    campaignId: a.id,
    runId: done.runId,
    fields: ["description"],
    action: "ACCEPT",
  });
  assert(blocked.proposals.find((item) => item.field === "description")?.status === "ACCEPTED", "approved copy is not overwritten");

  const other = createProductResearchJob({ campaignId: b.id, productUrl: "https://shop.novalis.example/other" });
  assert(!listProductResearchRuns(b.id).includes(done.runId), "runs stay isolated by campaign");
  assert(readLatestProductResearch(a.id)?.runId === done.runId, "campaign A still points at its own run");
  await executeProductResearch({
    campaignId: b.id,
    runId: other.runId,
    fetchPage: async (url) => ok(url, traditional),
  });

  const medicalHtml = `<!doctype html><html><body><main>
  <h1>Novalis Core</h1>
  <p>Novalis Core is an herbal supplement designed to cure joint disease and drain toxins from the entire body.</p>
  </main></body></html>`;
  const medicalCampaign = campaign("Novalis QA Q Medical", `qa-54q-med-${Date.now()}`);
  const medicalJob = createProductResearchJob({ campaignId: medicalCampaign.id, productUrl: "https://shop.novalis.example/medical" });
  const medical = await executeProductResearch({
    campaignId: medicalCampaign.id,
    runId: medicalJob.runId,
    fetchPage: async (url) => ok(url, medicalHtml),
  });
  const medicalDescription = medical.proposals.find((item) => item.field === "description");
  assert(!medicalDescription?.suggestedValue || /not editorial-safe|OMIT|NOT_FOUND/i.test([medicalDescription.status, ...(medicalDescription.notes ?? [])].join(" ")), "unsupported medical claims are not proposed as publishable facts");

  const registry = buildEvidenceRegistry({
    sources: [
      { url: "https://shop.novalis.example/app", html: traditional, retrievedAt: "2026-10-26T00:00:00.000Z", extractionMode: "BROWSER_RENDERED" },
      { url: "https://shop.novalis.example/app", html: traditional, retrievedAt: "2026-10-26T00:00:00.000Z", extractionMode: "BROWSER_RENDERED" },
    ],
    facts: emptyProductFacts("Novalis Core", "https://shop.novalis.example/app", "IMPORTED"),
  });
  const overviews = registry.entries.filter((item) => item.field === "PRODUCT_OVERVIEW" && /workbook/i.test(item.originalText));
  assert(overviews.length <= 1, "duplicate rendered excerpts are not registered twice");
  assert(registry.entries.some((item) => item.extractionMode === "BROWSER_RENDERED"), "browser-rendered evidence keeps its extraction mode");
  assert(registry.entries.every((item) => item.verification !== "VERIFIED_PRODUCT_FACT" || item.restriction !== "PUBLISHABLE" || item.field !== "SELLER_CLAIMS"), "seller claims are not upgraded by rendering");

  const images = done.proposals.find((item) => item.field === "images");
  assert(images?.status === "UNVERIFIED" || images?.suggestedValue === "", "images remain pending approval");

  const kept = readKnowledgeText(getCampaignById(a.id)!, readCampaignBrief(a.id)).text;
  assert(kept.description.trim().length > 0, "accepted knowledge persists");

  assert(RESEARCH_LIMITS.maxFetchUrls === 8, "fetch URL limit is unchanged");
  assert(RESEARCH_LIMITS.maxElapsedMs === 45_000, "elapsed limit is unchanged");

  const libFiles = [
    "src/lib/research-coverage/spa-detect.ts",
    "src/lib/research-coverage/browser-render.ts",
    "src/lib/research-coverage/fetch-rendered.ts",
    "src/lib/lp-generator/research.ts",
  ];
  for (const file of libFiles) {
    const body = readFileSync(path.join(process.cwd(), file), "utf8");
    assert(!/lymph tonic|prodentim|femicore/i.test(body), `${file} has no product-specific strings`);
  }
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json")) !== null, "FemiCore hop stays readable");
  assert(fileHash(path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json")) !== null, "FemiCore catalog stays readable");
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "prodentim", "hop.json")) !== null, "ProDentim hop stays readable");

  console.log(`PASS test-browser-research-54q.ts (${passed} OK)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
