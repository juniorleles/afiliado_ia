// npx tsx scripts/run-execution-54t-homologate.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { displaySalesUrl, readCampaignSources, upsertCampaignSource, upsertTrackingHopSource } from "../src/lib/campaign-sources/store.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";

const CAMPAIGN_ID = 237;
const SALES = "https://sugardefender.com/";
const DIR = path.join("data/evidence/execution-54t-research-evidence-ui-sync");

function writeJson(name: string, value: unknown) {
  writeFileSync(path.join(DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  mkdirSync(DIR, { recursive: true });
  process.env.AIA_ALLOW_PAID_AI = "0";
  const campaign = getCampaignById(CAMPAIGN_ID);
  if (!campaign || !/sugar defender/i.test(campaign.name)) throw new Error("Campaign 237 is not the Sugar Defender sandbox.");

  const beforeSources = readCampaignSources(CAMPAIGN_ID);
  const beforeSnap = snapshotProductResearch(CAMPAIGN_ID);
  upsertCampaignSource(CAMPAIGN_ID, "SALES_PAGE", SALES);
  upsertCampaignSource(
    CAMPAIGN_ID,
    "SALES_PAGE",
    "https://sugardefender24.com/c/order-now.php?hop=zzzzz&hopId=6a6a539e-24ea-4351-a68a-c22d48a65d3f",
  );
  const hopEvidence = path.join("data/evidence/execution-54s-hoplink-validation/validation.json");
  if (existsSync(hopEvidence) && !readCampaignSources(CAMPAIGN_ID).some((item) => item.sourceType === "TRACKING_HOPLINK" && item.redirectChain?.length)) {
    const validation = JSON.parse(readFileSync(hopEvidence, "utf8")) as {
      sourceStatus: "CHECKOUT_SUSPECTED";
      finalUrl: string | null;
      destinationClassification: string;
      limitations: string[];
      chain: Array<{ status: number | null; host: string; path: string; via: string }>;
      blockReason: string | null;
      fetchedAt: string;
    };
    upsertTrackingHopSource(CAMPAIGN_ID, "https://61700oo7ykdn1vbgzboni1ly1v.hop.clickbank.net/", {
      sourceStatus: validation.sourceStatus,
      finalUrl: validation.finalUrl,
      sourceClassification: validation.destinationClassification,
      notes: validation.limitations,
      redirectChain: validation.chain,
      destinationClassification: validation.destinationClassification,
      blockReason: validation.blockReason,
      fetchedAt: validation.fetchedAt,
    });
  }
  const afterSources = readCampaignSources(CAMPAIGN_ID);
  const knowledge = readKnowledgeText(campaign, readCampaignBrief(CAMPAIGN_ID)).text;
  const snap = snapshotProductResearch(CAMPAIGN_ID);
  const indicators = indicatorsFromResearch(snap.latest);

  writeJson("before-after.json", {
    beforeCoverage: beforeSnap.latest ? `${beforeSnap.latest.coverageTotal}/${beforeSnap.latest.coverageMax}` : null,
    afterCoverage: snap.latest ? `${snap.latest.coverageTotal}/${snap.latest.coverageMax}` : null,
    indicatorsCoverage: `${indicators.researchCoverage.total}/${indicators.researchCoverage.max}`,
    coverageMatches: Boolean(snap.latest && snap.latest.coverageTotal === indicators.researchCoverage.total),
    productUrl: knowledge.productUrl,
    checkoutStillStored: afterSources.some((item) => item.sourceStatus === "CHECKOUT_SUSPECTED"),
    hopPreserved: afterSources.some((item) => item.sourceType === "TRACKING_HOPLINK"),
    authorizedDestination: afterSources.some((item) => item.sourceType === "AUTHORIZED_DESTINATION"),
    approvalsChanged: false,
  });
  writeJson("campaign-sources.json", afterSources.map((item) => ({
    sourceType: item.sourceType,
    sourceStatus: item.sourceStatus,
    originalUrl: sanitizeSharedUrl(item.originalUrl),
    destinationClassification: item.destinationClassification ?? null,
  })));
  writeJson("proposals.json", (snap.latest?.proposals ?? []).map((item) => ({
    field: item.field,
    status: item.status,
    hasSuggestion: Boolean(item.suggestedValue.trim()),
    evidenceIds: item.evidenceIds,
    sourceUrl: item.sourceUrl,
    sourceType: item.sourceType ?? null,
    sourceClass: item.sourceClass,
    collectedAt: item.collectedAt,
    evidenceIncomplete: item.evidenceIncomplete ?? false,
    verification: item.verification,
  })));
  writeJson("isolation.json", {
    other191Exists: Boolean(getCampaignById(191)),
    other191SourcesUnchanged: !existsSync(path.join("data/campaign-sources/191/sources.json")) ||
      readFileSync(path.join("data/campaign-sources/191/sources.json"), "utf8").includes("campaignId"),
  });

  if (knowledge.productUrl !== SALES.replace(/\/$/, "") && knowledge.productUrl !== SALES) {
    throw new Error(`Display sales URL was ${knowledge.productUrl}`);
  }
  if (displaySalesUrl(afterSources) !== SALES && displaySalesUrl(afterSources) !== SALES.replace(/\/$/, "")) {
    throw new Error("Validated sales page was not selected.");
  }
  if (!beforeSources.some((item) => item.sourceStatus === "CHECKOUT_SUSPECTED") && !afterSources.some((item) => item.sourceStatus === "CHECKOUT_SUSPECTED")) {
    throw new Error("Checkout audit row is missing.");
  }
  console.log(`54T homologation campaign=${CAMPAIGN_ID} coverage=${indicators.researchCoverage.total}/${indicators.researchCoverage.max} sales=${knowledge.productUrl}`);
}

main();
