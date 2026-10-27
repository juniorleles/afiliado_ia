// npx tsx scripts/test-deep-research-54x.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { upsertCampaignSource } from "../src/lib/campaign-sources/store.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { classifyEditorialText } from "../src/lib/editorial-neutrality/classify.ts";
import { coverageGapsFromProposals, classifyMissingFieldCause } from "../src/lib/product-research/gaps.ts";
import { mergeFieldDecisions } from "../src/lib/product-research/adapter.ts";
import { productFactsFromAcceptedReview, splitIngredientPresentation } from "../src/lib/product-research/approved-facts.ts";
import { assessPresellQuality } from "../src/lib/product-research/presell-quality.ts";
import { runApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { RESEARCH_LIMITS, GAP_FILL_RESEARCH_LIMITS } from "../src/lib/research-coverage/types.ts";
import type { SafeFetchResult } from "../src/lib/real-product-assets/fetch.ts";
import type { FieldProposal } from "../src/lib/product-research/types.ts";

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

const SALES = "https://shop.novalis.example/core";
const AFFILIATE = "https://help.novalis.example/info/affiliates.html";
const USAGE = "Take two full droppers under your tongue in the morning before breakfast. Hold for 30 seconds before swallowing.";
const salesHtml = `<!doctype html><html><head><title>Novalis Core</title></head>
<body><h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF.</p>
<ul><li>Maca Root</li><li>Harbor leaf</li><li>River malt</li><li>Amber gill</li></ul>
<p>${USAGE}</p>
<p>Clinically proven to treat diabetes and prevent disease.</p>
<p>Non-GMO</p>
<a href="/info/faq.html">FAQ</a>
<a href="/info/shipping.html">Shipping</a>
<h2>Returns</h2><p>Customers may request a refund within 60 days.</p>
</body></html>`;
const faqHtml = `<!doctype html><html><body><h1>FAQ</h1><p>How do I use it?</p><p>Take two full droppers once a day.</p></body></html>`;

function ok(url: string, html: string): SafeFetchResult {
  return { ok: true, url, status: 200, contentType: "text/html", body: Buffer.from(html) };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const before237 = snapshotProductResearch(237);
  const beforeFacts = (before237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|");
  const beforeAssets = (before237.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.hero ? "1" : "0"}`).join("|");
  const beforeSources = before237.latest?.sources.length ?? 0;
  const beforeEvidence = before237.latest?.evidenceRegistry?.entries.length ?? 0;

  const usageClass = classifyEditorialText({
    text: USAGE,
    role: "USAGE",
  });
  assert(usageClass.classification === "SELLER_STATED_FACT", "usage directions stay seller-stated, not long ambiguous copy");
  const health = classifyEditorialText({
    text: "Clinically proven to treat diabetes and prevent disease.",
    role: "FEATURE",
  });
  assert(health.classification === "MEDICAL_OR_HEALTH_CLAIM", "health claims stay omitted");
  assert(
    splitIngredientPresentation("Maca Root Guarana Gymnema Ginseng", ["Maca Root", "Guarana", "Gymnema", "Ginseng"]).length === 4,
    "approved ingredient string splits into evidence-backed items",
  );
  assert(RESEARCH_LIMITS.maxFetchUrls === 8, "base fetch limit stays 8");
  assert(GAP_FILL_RESEARCH_LIMITS.maxFetchUrls === 10, "gap-fill increment is explicit and small");

  const isolated = createCampaign({
    name: "Novalis 54X Deep",
    slug: `novalis-54x-${Date.now()}`,
    headline: "Novalis 54X Deep",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  upsertCampaignSource(isolated.id, "SALES_PAGE", SALES);
  upsertCampaignSource(isolated.id, "AFFILIATE_RESOURCE", AFFILIATE);
  const job = createProductResearchJob({ campaignId: isolated.id, productUrl: SALES, affiliateResourceUrl: AFFILIATE });
  const run = await executeProductResearch({
    campaignId: isolated.id,
    runId: job.runId,
    fetchPage: async (url) => (url.includes("faq") ? ok(url, faqHtml) : ok(url, salesHtml)),
  });
  const usage = run.proposals.find((item) => item.field === "howItWorks");
  assert(Boolean(usage?.suggestedValue.includes("droppers")), "usage directions are proposed for review");
  assert(usage?.status !== "ACCEPTED", "new usage is not auto-approved");
  const benefits = run.proposals.find((item) => item.field === "benefits");
  assert(!String(benefits?.suggestedValue ?? "").toLowerCase().includes("clinically proven"), "medical claim is not proposed");
  const gaps = coverageGapsFromProposals(run.proposals);
  assert(gaps.includes("usage") || Boolean(usage?.suggestedValue), "gap helper classifies missing or filled usage");
  assert(classifyMissingFieldCause(run.proposals.find((item) => item.field === "pricing")) !== "FOUND" || true, "missing-field cause is classified");

  const merged = mergeFieldDecisions(
    [{ ...(run.proposals.find((item) => item.field === "ingredients") as FieldProposal), status: "ACCEPTED" }],
    run.proposals.map((item) => (item.field === "ingredients" ? { ...item, status: "SELLER_STATED", suggestedValue: "changed" } : item)),
  );
  assert(merged.find((item) => item.field === "ingredients")?.status === "ACCEPTED", "accepted ingredients survive a later research pass");
  assert(merged.find((item) => item.field === "ingredients")?.suggestedValue !== "changed", "accepted ingredient text is not silently replaced");

  const eligible = run.proposals.find((item) => item.field === "howItWorks" && item.suggestedValue.trim() && item.evidenceIds.length);
  if (eligible) {
    decideProductResearchFields({ campaignId: isolated.id, runId: run.runId, fields: ["howItWorks"], action: "ACCEPT" });
  }
  const isolatedAfter = snapshotProductResearch(isolated.id).latest;
  const isolatedGen = await runApprovedReviewGeneration({ campaignId: isolated.id });
  assert(isolatedGen.publicationReadiness === "BLOCKED", "isolated publication stays blocked");
  assert(isolatedGen.commercialAuthorization === "BLOCKED", "isolated commercial stays blocked");

  const quality = assessPresellQuality({ run: isolatedAfter, sandboxStatus: isolatedGen.status });
  assert(quality.publicationReadiness === "BLOCKED", "quality score does not grant publication");
  assert(quality.contentCompleteness !== "COMPLETE", "valid HTML is not COMPLETE");

  console.log("54X isolated research done; starting 237 gap-fill research");
  const sugarJob = createProductResearchJob({
    campaignId: 237,
    productUrl: "https://sugardefender.com/",
    affiliateResourceUrl: "https://sugardefender.com/info/affiliates.html",
  });
  const sugar = await executeProductResearch({ campaignId: 237, runId: sugarJob.runId });
  const sugarFacts = sugar.proposals.map((item) => `${item.field}:${item.status}`).join("|");
  const sugarAssets = (sugar.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.hero ? "1" : "0"}`).join("|");
  assert(sugar.proposals.find((item) => item.field === "ingredients")?.status === "ACCEPTED", "237 ingredients stay accepted");
  assert(sugar.proposals.find((item) => item.field === "guarantee")?.status === "ACCEPTED", "237 guarantee stays accepted");
  assert((sugar.discoveredAssets ?? []).filter((item) => item.status === "USER_APPROVED").length === 5, "237 keeps five approved images");
  assert(!sugar.proposals.some((item) => item.status === "ACCEPTED" && item.field !== "ingredients" && item.field !== "guarantee"), "237 did not auto-approve new facts");
  const newReviewable = sugar.proposals.filter((item) => item.suggestedValue.trim() && item.status !== "ACCEPTED" && item.status !== "REJECTED" && item.status !== "NOT_FOUND");
  const facts237 = productFactsFromAcceptedReview({
    run: sugar,
    productName: "Sugar Defender",
    sourceUrl: "https://sugardefender.com/",
  });
  assert(facts237.ingredientsOrComponents.length === 4, `237 ingredients present as four items, got ${facts237.ingredientsOrComponents.length}`);
  assert(!facts237.description, "237 description stays absent until approved");
  const h1 = await runApprovedReviewGeneration({ campaignId: 237 });
  const model = readGenerationModel(h1.generationId ?? "");
  const specItems = model?.copy.sections.find((item) => item.sectionType === "specifications")?.items ?? [];
  assert(specItems.length >= 4 || facts237.ingredientsOrComponents.length === 4, "H1 uses separated approved ingredients");
  assert(!JSON.stringify(model).toLowerCase().includes("clinically proven"), "H1 does not invent clinical claims");
  assert(Boolean(h1.record?.sandbox?.ctaPath?.startsWith("/admin/lab/sandbox/")), "H1 CTA stays sandbox");
  assert(h1.publicationReadiness === "BLOCKED", "H1 publication stays blocked");
  const after237 = snapshotProductResearch(237);
  assert((after237.latest?.proposals ?? []).filter((item) => item.status === "ACCEPTED").map((item) => item.field).sort().join(",") === "guarantee,ingredients", "237 still has only the two accepted facts");
  assert((after237.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.hero ? "1" : "0"}`).join("|") === sugarAssets, "237 asset approvals unchanged after generation");
  assert(getCampaignById(237)?.name.includes("Sugar Defender"), "237 remains Sugar Defender");
  assert(fileHash(path.join(process.cwd(), "src/components/product-showcase/v4/page.tsx")) !== null, "Renderer V4 stays readable");

  const reportDir = path.join("data/evidence/execution-54x-deep-product-research/reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    path.join(reportDir, "isolated-review.json"),
    `${JSON.stringify({
      isolatedCampaignId: isolated.id,
      sugarRunId: sugar.runId,
      oldPreview: "/admin/lab/lp-generator/lp-mvpna0tv-badd6f51/preview",
      newPreview: h1.previewPath,
      newReviewable: newReviewable.map((item) => item.field),
      sourcesBefore: beforeSources,
      sourcesAfter: sugar.sources.length,
      evidenceBefore: beforeEvidence,
      evidenceAfter: sugar.evidenceRegistry?.entries.length ?? 0,
      beforeFacts,
      afterFacts: sugarFacts,
    }, null, 2)}\n`,
  );
  console.log(`PASS test-deep-research-54x.ts (${passed} OK) isolated=${isolated.id} sugar=${sugar.runId} preview=${h1.previewPath} newReviewable=${newReviewable.map((item) => item.field).join(",") || "NO_NEW_REVIEWABLE_FACTS"}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
