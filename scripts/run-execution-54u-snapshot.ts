// npx tsx scripts/run-execution-54u-snapshot.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";

const CAMPAIGN_ID = 237;
const DIR = path.join("data/evidence/execution-54u-review-e2e");
const EXPECTED_HOP_HOST = "61700oo7ykdn1vbgzboni1ly1v.hop.clickbank.net";

function writeJson(name: string, value: unknown) {
  mkdirSync(path.join(DIR, "reports"), { recursive: true });
  writeFileSync(path.join(DIR, "reports", name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const campaign = getCampaignById(CAMPAIGN_ID);
  if (!campaign || !/sugar defender/i.test(campaign.name)) {
    throw new Error("Campaign 237 is not the Sugar Defender sandbox.");
  }
  const sources = readCampaignSources(CAMPAIGN_ID);
  const knowledge = readKnowledgeText(campaign, readCampaignBrief(CAMPAIGN_ID)).text;
  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const indicators = indicatorsFromResearch(snap.latest);
  const hop = sources.find((item) => item.sourceType === "TRACKING_HOPLINK");
  const sales = sources.filter((item) => item.sourceType === "SALES_PAGE");
  const affiliate = sources.find((item) => item.sourceType === "AFFILIATE_RESOURCE");
  const authorized = sources.find((item) => item.sourceType === "AUTHORIZED_DESTINATION");
  const proposals = (snap.latest?.proposals ?? []).map((item) => ({
    field: item.field,
    status: item.status,
    suggestedValue: item.suggestedValue,
    currentValue: item.currentValue,
    evidenceIds: item.evidenceIds,
    sourceUrl: item.sourceUrl,
    sourceType: item.sourceType ?? null,
    sourceClass: item.sourceClass,
    collectedAt: item.collectedAt,
    verification: item.verification,
    evidenceIncomplete: item.evidenceIncomplete ?? false,
    evidenceExcerpt: item.evidenceExcerpt ?? null,
    eligibleForBatch: item.eligibleForBatch,
    notes: item.notes,
  }));
  const decisions = snap.latest?.decisions ?? [];
  const payload = {
    capturedAt: new Date().toISOString(),
    campaign: { id: campaign.id, name: campaign.name, slug: campaign.slug, affiliateUrl: campaign.affiliateUrl || "" },
    coverage: {
      run: snap.latest ? `${snap.latest.coverageTotal}/${snap.latest.coverageMax}` : null,
      indicators: `${indicators.researchCoverage.total}/${indicators.researchCoverage.max}`,
      matches: Boolean(snap.latest && snap.latest.coverageTotal === indicators.researchCoverage.total),
    },
    reviewCompletion: {
      runPercent: snap.latest && snap.latest.reviewTotal ? Math.round((snap.latest.reviewAccepted / snap.latest.reviewTotal) * 100) : 0,
      indicatorsPercent: indicators.reviewCompletion.percent,
      accepted: indicators.reviewCompletion.accepted,
      total: indicators.reviewCompletion.total,
    },
    gates: {
      commercialAuthorization: indicators.commercialAuthorization,
      publicationReadiness: indicators.publicationReadiness.status,
      generationReadiness: indicators.generationReadiness.status,
      grounding: snap.latest?.grounding ?? null,
      neutrality: snap.latest?.neutrality ?? null,
      contentQuality: snap.latest?.contentQuality ?? null,
    },
    knowledge: {
      productUrl: knowledge.productUrl,
      affiliateResourceUrl: knowledge.affiliateResourceUrl ?? "",
      trackingHopUrl: knowledge.trackingHopUrl ? sanitizeSharedUrl(knowledge.trackingHopUrl) : "",
      authorizedDestinationUrl: knowledge.authorizedDestinationUrl ?? "",
      ingredients: knowledge.ingredients,
      guarantee: knowledge.guarantee,
    },
    sources: sources.map((item) => ({
      sourceType: item.sourceType,
      sourceStatus: item.sourceStatus,
      originalUrl: sanitizeSharedUrl(item.originalUrl),
      destinationClassification: item.destinationClassification ?? null,
    })),
    hop: {
      persisted: Boolean(hop),
      hostMatchesExpected: Boolean(hop?.originalUrl.includes(EXPECTED_HOP_HOST)),
      campaignAffiliateUrlEmpty: !campaign.affiliateUrl.trim(),
      generateFormStartsEmpty: true,
      generatePlaceholder: "https://example.com/your-hop",
      diagnosis: !campaign.affiliateUrl.trim()
        ? "PLACEHOLDER_EMPTY_FORM — Generate Affiliate URL is local empty state; TRACKING_HOPLINK remains in Campaign Sources."
        : "CAMPAIGN_AFFILIATE_URL_SET",
    },
    salesPages: sales.map((item) => ({ url: sanitizeSharedUrl(item.originalUrl), status: item.sourceStatus })),
    affiliateResource: affiliate ? sanitizeSharedUrl(affiliate.originalUrl) : null,
    authorizedDestination: authorized ? sanitizeSharedUrl(authorized.originalUrl) : null,
    runId: snap.latest?.runId ?? null,
    proposalStatuses: proposals.map((item) => item.status),
    acceptedCount: proposals.filter((item) => item.status === "ACCEPTED").length,
    rejectedCount: proposals.filter((item) => item.status === "REJECTED").length,
    decisionsCount: decisions.length,
    proposals,
    rendererV4Hash: fileHash(path.join(process.cwd(), "src/components/product-showcase/v4/shell.tsx")),
    femicoreHop: fileHash(path.join(process.cwd(), "data/affiliate-hops/femicore/hop.json")),
    prodentimHop: fileHash(path.join(process.cwd(), "data/affiliate-hops/prodentim/hop.json")),
    lymphTonicHop: fileHash(path.join(process.cwd(), "data/affiliate-hops/lymph-tonic/hop.json")),
  };
  writeJson("campaign-237-initial.json", payload);
  writeJson("campaign-237-sources.json", payload.sources);
  writeJson("campaign-237-proposals.json", proposals);
  console.log(
    `54U snapshot campaign=${CAMPAIGN_ID} coverage=${payload.coverage.indicators} review=${payload.reviewCompletion.indicatorsPercent}% hop=${payload.hop.persisted} sales=${knowledge.productUrl}`,
  );
}

main();
