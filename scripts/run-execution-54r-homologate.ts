// npx tsx scripts/run-execution-54r-homologate.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignBySlug } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { classifySubmittedUrl, sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { classifySourceClass } from "../src/lib/research-coverage/classify-source.ts";
import { fetchPublicHttps } from "../src/lib/real-product-assets/fetch.ts";
import { resetBrowserRenderBudget } from "../src/lib/research-coverage/fetch-rendered.ts";

const SALES_OR_ORDER =
  "https://sugardefender24.com/c/order-now.php?hop=zzzzz&hopId=6a6a539e-24ea-4351-a68a-c22d48a65d3f";
const AFFILIATE_RESOURCE = "https://sugardefender.com/info/affiliates.html";
const DIR = path.join("data/evidence/execution-54r-dual-source-affiliate-research");
const SLUG = "sugar-defender-54r";

function writeJson(name: string, value: unknown) {
  writeFileSync(path.join(DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  process.env.AIA_ALLOW_PAID_AI = "0";
  resetBrowserRenderBudget();

  const salesClass = classifySubmittedUrl(SALES_OR_ORDER, "SALES_PAGE");
  const affiliateClass = classifySubmittedUrl(AFFILIATE_RESOURCE, "AFFILIATE_RESOURCE");
  writeJson("url-classifications.json", {
    salesOrOrder: {
      submitted: sanitizeSharedUrl(SALES_OR_ORDER),
      ...salesClass,
    },
    affiliateResource: {
      submitted: sanitizeSharedUrl(AFFILIATE_RESOURCE),
      ...affiliateClass,
    },
    sameOrganizationAssumed: false,
    hopIdIsAuthorization: false,
  });

  if (salesClass.fetchable) {
    throw new Error("The supplied order-now URL was classified as fetchable. Aborting to avoid checkout navigation.");
  }

  const campaign =
    getCampaignBySlug(SLUG) ??
    createCampaign({
      name: "Sugar Defender 54R",
      slug: SLUG,
      headline: "Sugar Defender",
      body: "Sandbox dual-source research.",
      ctaLabel: "See offer",
      affiliateUrl: "",
      headScript: null,
      adHeadline: null,
    });
  getDb()
    .prepare("UPDATE campaigns SET campaignBriefJson = ? WHERE id = ?")
    .run(
      JSON.stringify({
        version: 1,
        notes: "Sandbox dual-source homologation. Not a live campaign.",
        productName: "Sugar Defender",
        marketplace: "clickbank",
        brand: null,
        category: "",
        country: "US",
        language: "en",
        goal: "review",
        research: {
          competitors: false,
          reddit: false,
          reviews: false,
          forums: false,
          youtube: false,
          google: false,
          news: false,
        },
        generation: {
          landingPage: false,
          headlines: false,
          descriptions: false,
          rsa: false,
          seo: false,
          faq: false,
        },
      }),
      campaign.id,
    );

  const before = snapshotProductResearch(campaign.id);
  let affiliateFetch: { ok: boolean; status: number | null; bytes: number; reason: string | null; sample: string } = {
    ok: false,
    status: null,
    bytes: 0,
    reason: "not-attempted",
    sample: "",
  };
  if (affiliateClass.fetchable) {
    const fetched = await fetchPublicHttps(AFFILIATE_RESOURCE);
    affiliateFetch = {
      ok: fetched.ok,
      status: fetched.ok ? fetched.status : fetched.status,
      bytes: fetched.ok ? fetched.body.length : 0,
      reason: fetched.ok ? null : fetched.reason,
      sample: fetched.ok ? fetched.body.toString("utf8").slice(0, 8000) : "",
    };
    if (affiliateFetch.sample) {
      writeFileSync(path.join(DIR, "affiliate-html-sample.txt"), affiliateFetch.sample, "utf8");
    }
  }
  writeJson("fetch-sanitized.json", {
    checkoutFetchAttempted: false,
    affiliate: {
      url: AFFILIATE_RESOURCE,
      ok: affiliateFetch.ok,
      status: affiliateFetch.status,
      bytes: affiliateFetch.bytes,
      reason: affiliateFetch.reason,
      contentClass: affiliateFetch.sample
        ? classifySourceClass({ url: AFFILIATE_RESOURCE, html: affiliateFetch.sample }).sourceClass
        : null,
    },
  });

  const job = createProductResearchJob({
    campaignId: campaign.id,
    productUrl: SALES_OR_ORDER,
    affiliateResourceUrl: AFFILIATE_RESOURCE,
  });
  const run =
    job.status === "QUEUED" || job.status === "RESEARCHING"
      ? await executeProductResearch({ campaignId: campaign.id, runId: job.runId })
      : job;

  const sources = readCampaignSources(campaign.id);
  const proposed = run.proposals.filter((item) => item.suggestedValue.trim());
  writeJson("homologation.json", {
    campaignId: campaign.id,
    slug: campaign.slug,
    checkoutFetchAttempted: false,
    commercialLinkActivated: false,
    paidAiCalls: 0,
    beforeCoverage: before.latest ? `${before.latest.coverageTotal}/${before.latest.coverageMax}` : "none",
    run: {
      runId: run.runId,
      status: run.status,
      seeds: run.seeds,
      seedRejection: run.seedRejection,
      limitations: run.limitations,
      sources: run.sources,
      coverage: `${run.coverageTotal}/${run.coverageMax}`,
      grounding: run.grounding,
      neutrality: run.neutrality,
      contentQuality: run.contentQuality,
      commercialAuthorization: run.commercialAuthorization,
      proposedFields: proposed.map((item) => item.field),
      proposals: run.proposals.map((item) => ({
        field: item.field,
        status: item.status,
        hasSuggestion: Boolean(item.suggestedValue.trim()),
        sourceClass: item.sourceClass,
        evidenceIds: item.evidenceIds,
      })),
      affiliatePolicy: run.affiliatePolicy,
      discoveredAssets: (run.discoveredAssets ?? []).map((item) => ({
        ...item,
        assetUrl: item.assetUrl.slice(0, 180),
      })),
      error: run.error,
    },
    campaignSources: sources.map((item) => ({
      ...item,
      originalUrl: sanitizeSharedUrl(item.originalUrl),
      normalizedUrl: sanitizeSharedUrl(item.normalizedUrl),
    })),
  });
  writeJson("affiliate-policy-contract.json", run.affiliatePolicy);
  writeJson("discovered-assets.json", run.discoveredAssets ?? []);
  writeJson("product-research-run-summary.json", {
    runId: run.runId,
    campaignId: run.campaignId,
    status: run.status,
    seeds: run.seeds,
    sourceCount: run.sources.length,
    proposalCount: proposed.length,
  });

  if (!existsSync(path.join(DIR, "architecture-audit.json"))) {
    throw new Error("Architecture audit is missing.");
  }
  console.log(`54R homologation wrote ${DIR} campaign=${campaign.id} status=${run.status}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
