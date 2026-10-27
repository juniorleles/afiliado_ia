// npx tsx scripts/test-review-e2e-54u.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { generateDeterministicThinCopy } from "../src/lib/ai/deterministic-thin-generation.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { displaySalesUrl, readCampaignSources, upsertCampaignSource } from "../src/lib/campaign-sources/store.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";
import { productFactsFromKnowledge } from "../src/lib/product-research/adapter.ts";
import type { SafeFetchResult } from "../src/lib/real-product-assets/fetch.ts";

const DIR = path.join("data/evidence/execution-54u-review-e2e");
const CAMPAIGN_237 = 237;
const SALES = "https://shop.novalis.example/core";
const AFFILIATE = "https://help.novalis.example/info/affiliates.html";
const HOP = "https://zzzz.hop.clickbank.net/";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function writeJson(name: string, value: unknown) {
  mkdirSync(path.join(DIR, "reports"), { recursive: true });
  writeFileSync(path.join(DIR, "reports", name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

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
  process.env.AIA_ALLOW_PAID_AI = "0";
  const real237 = getCampaignById(CAMPAIGN_237);
  assert(Boolean(real237 && /sugar defender/i.test(real237.name)), "campaign 237 remains Sugar Defender sandbox");
  const before237 = snapshotProductResearch(CAMPAIGN_237);
  const beforeStatuses = (before237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|");
  const beforeDecisions = before237.latest?.decisions?.length ?? 0;

  const isolated = campaign("Novalis 54U Review", `novalis-54u-review-${Date.now()}`);
  upsertCampaignSource(isolated.id, "SALES_PAGE", SALES);
  upsertCampaignSource(isolated.id, "AFFILIATE_RESOURCE", AFFILIATE);
  upsertCampaignSource(isolated.id, "TRACKING_HOPLINK", HOP);
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
  assert(displaySalesUrl(readCampaignSources(isolated.id)) === SALES, "isolated sales URL is the test page");

  const found = run.proposals.filter((item) => item.suggestedValue.trim());
  const eligible = found.find((item) => item.evidenceIds.length && !item.evidenceIncomplete);
  const rejectable = found.find((item) => item.field !== eligible?.field && item.suggestedValue.trim());
  assert(Boolean(eligible), "isolated campaign has a proposal with evidence IDs");
  assert(Boolean(rejectable), "isolated campaign has a second proposal to reject");

  const accepted = decideProductResearchFields({
    campaignId: isolated.id,
    runId: run.runId,
    fields: [eligible!.field],
    action: "ACCEPT",
  });
  assert(accepted.proposals.find((item) => item.field === eligible!.field)?.status === "ACCEPTED", "accept updates the proposal");
  const afterAccept = snapshotProductResearch(isolated.id).latest;
  assert(afterAccept?.proposals.find((item) => item.field === eligible!.field)?.status === "ACCEPTED", "accept survives reload");
  const knowledgeAfterAccept = readKnowledgeText(getCampaignById(isolated.id)!, readCampaignBrief(isolated.id)).text;
  const acceptedValue = eligible!.suggestedValue.trim();
  const contractHasAccepted = Object.values(knowledgeAfterAccept).some((value) => String(value).includes(acceptedValue.split("\n")[0] ?? acceptedValue));
  assert(contractHasAccepted, "accepted value is written to the product contract");

  const rejected = decideProductResearchFields({
    campaignId: isolated.id,
    runId: run.runId,
    fields: [rejectable!.field],
    action: "REJECT",
  });
  assert(rejected.proposals.find((item) => item.field === rejectable!.field)?.status === "REJECTED", "reject updates the proposal");
  const afterReject = snapshotProductResearch(isolated.id).latest;
  assert(afterReject?.proposals.find((item) => item.field === rejectable!.field)?.status === "REJECTED", "reject survives reload");
  assert(afterReject?.proposals.find((item) => item.field === eligible!.field)?.status === "ACCEPTED", "unrelated accepted proposal stays accepted");

  const blocked = decideProductResearchFields({
    campaignId: isolated.id,
    runId: run.runId,
    fields: ["videos"],
    action: "ACCEPT",
  });
  assert(blocked.proposals.find((item) => item.field === "videos")?.status !== "ACCEPTED", "proposal without evidence IDs is not accepted");

  const batchFields = afterReject!.proposals
    .filter((item) => item.eligibleForBatch && item.status !== "ACCEPTED" && item.status !== "REJECTED" && item.evidenceIds.length)
    .map((item) => item.field);
  let batchAccepted = 0;
  if (batchFields.length) {
    const batched = decideProductResearchFields({
      campaignId: isolated.id,
      runId: run.runId,
      fields: batchFields,
      action: "ACCEPT",
    });
    batchAccepted = batched.proposals.filter((item) => batchFields.includes(item.field) && item.status === "ACCEPTED").length;
    assert(batchAccepted === batchFields.length, "batch accept only applies to eligible fields");
  } else {
    assert(true, "no remaining batch-eligible fields after accept/reject");
  }

  const review = indicatorsFromResearch(snapshotProductResearch(isolated.id).latest);
  assert(review.reviewCompletion.accepted >= 1, "review completion counts the accepted field");
  const facts = productFactsFromKnowledge({
    productName: "Novalis Core",
    sourceUrl: SALES,
    text: readKnowledgeText(getCampaignById(isolated.id)!, readCampaignBrief(isolated.id)).text,
  });
  if (rejectable!.field === "ingredients") {
    assert(facts.ingredientsOrComponents.length === 0, "rejected ingredients do not enter approved facts");
  }
  if (rejectable!.field === "guarantee") {
    assert(!facts.guaranteeInformation, "rejected guarantee does not enter approved facts");
  }
  const pendingStillPending = afterReject!.proposals.filter((item) => item.status === "FOUND_REVIEW_REQUIRED" || item.status === "SELLER_STATED");
  for (const item of pendingStillPending) {
    if (item.field === "ingredients") {
      assert(facts.ingredientsOrComponents.length === 0 || knowledgeAfterAccept.ingredients.includes(eligible!.suggestedValue.split("\n")[0] ?? ""), "pending ingredients are not silently approved unless accepted");
    }
  }

  const after237 = snapshotProductResearch(CAMPAIGN_237);
  const afterStatuses = (after237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|");
  assert(afterStatuses === beforeStatuses, "campaign 237 proposal statuses were not changed");
  assert((after237.latest?.decisions?.length ?? 0) === beforeDecisions, "campaign 237 decisions were not changed");
  assert(after237.latest?.runId !== run.runId, "isolated run is not the 237 run");

  const other = campaign("Novalis 54U Other", `novalis-54u-other-${Date.now()}`);
  assert(snapshotProductResearch(other.id).latest?.runId !== run.runId, "a second campaign does not share the isolated run");

  const plan = createGenerationPlan(facts);
  let generationStatus = "BLOCKED_BY_PAID_AI";
  let generationRoute = plan.generationRoute;
  if (plan.generationRoute === "DETERMINISTIC_THIN") {
    const projection = projectEvidenceClaims(facts, plan);
    const slotPlan = createEvidenceSlotPlan(facts, plan, undefined, projection);
    const generated = generateDeterministicThinCopy({ plan, slotPlan, projection });
    const joined = generated.fills.map((item) => item.content ?? "").join(" ");
    assert(!/clinically proven|cures diabetes|guaranteed weight loss/i.test(joined), "deterministic draft does not invent medical claims");
    assert(!/\$\d+/.test(joined) || Boolean(facts.pricingInformation), "deterministic draft does not invent a price");
    generationStatus = "DETERMINISTIC_THIN_SANDBOX";
  } else {
    assert(process.env.AIA_ALLOW_PAID_AI === "0", "paid AI stays blocked");
  }

  const hop237 = readCampaignSources(CAMPAIGN_237).find((item) => item.sourceType === "TRACKING_HOPLINK");
  assert(Boolean(hop237), "campaign 237 still stores TRACKING_HOPLINK");
  assert(!readCampaignSources(CAMPAIGN_237).some((item) => item.sourceType === "AUTHORIZED_DESTINATION"), "authorized destination stays empty on 237");

  writeJson("isolated-review.json", {
    isolatedCampaignId: isolated.id,
    isolatedRunId: run.runId,
    acceptedField: eligible!.field,
    rejectedField: rejectable!.field,
    batchAccepted,
    reviewPercent: review.reviewCompletion.percent,
    coverage: `${review.researchCoverage.total}/${review.researchCoverage.max}`,
    generationStatus,
    generationRoute,
    campaign237Unchanged: afterStatuses === beforeStatuses,
  });
  writeJson("sandbox-generation.json", {
    status: generationStatus,
    route: generationRoute,
    paidAi: process.env.AIA_ALLOW_PAID_AI,
    publicationReadiness: review.publicationReadiness.status,
    commercialAuthorization: review.commercialAuthorization,
  });

  assert(fileHash(path.join(process.cwd(), "src/components/product-showcase/v4/shell.tsx")) !== null, "Renderer V4 shell stays readable");
  assert(fileHash(path.join(process.cwd(), "data/affiliate-hops/femicore/hop.json")) !== null, "FemiCore hop stays readable");
  assert(fileHash(path.join(process.cwd(), "data/affiliate-hops/prodentim/hop.json")) !== null, "ProDentim hop stays readable");

  console.log(`PASS test-review-e2e-54u.ts (${passed} OK) isolated=${isolated.id} generation=${generationStatus}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
