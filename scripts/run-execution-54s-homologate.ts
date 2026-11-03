// npx tsx scripts/run-execution-54s-homologate.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignSources, upsertTrackingHopSource } from "../src/lib/campaign-sources/store.ts";
import { validateHopLink } from "../src/lib/campaign-sources/validate-hop.ts";

const CAMPAIGN_ID = 237;
const HOP = "https://61700oo7ykdn1vbgzboni1ly1v.hop.clickbank.net";
const DIR = path.join("data/evidence/execution-54s-hoplink-validation");

function writeJson(name: string, value: unknown) {
  writeFileSync(path.join(DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  process.env.AIA_ALLOW_PAID_AI = "0";
  const campaign = getCampaignById(CAMPAIGN_ID);
  if (!campaign) throw new Error("Campaign 237 not found.");
  if (!/sugar defender/i.test(campaign.name)) throw new Error("Campaign 237 is not the Sugar Defender sandbox campaign.");

  const before = readCampaignSources(CAMPAIGN_ID);
  const other = [191, 1].map((id) => ({ id, hash: existsSync(path.join("data/campaign-sources", String(id), "sources.json"))
    ? readFileSync(path.join("data/campaign-sources", String(id), "sources.json"), "utf8")
    : null }));

  const validation = await validateHopLink({ url: HOP });
  const sources = upsertTrackingHopSource(CAMPAIGN_ID, HOP, {
    sourceStatus: validation.sourceStatus,
    finalUrl: validation.finalUrl,
    sourceClassification: validation.destinationClassification,
    notes: validation.limitations,
    redirectChain: validation.chain.map((item) => ({
      status: item.status,
      host: item.host,
      path: item.path,
      via: item.via,
    })),
    destinationClassification: validation.destinationClassification,
    blockReason: validation.blockReason,
    fetchedAt: validation.fetchedAt,
  });

  const afterOther = [191, 1].map((id) => ({ id, hash: existsSync(path.join("data/campaign-sources", String(id), "sources.json"))
    ? readFileSync(path.join("data/campaign-sources", String(id), "sources.json"), "utf8")
    : null }));

  writeJson("validation.json", {
    campaignId: CAMPAIGN_ID,
    ...validation,
    commercialCtaActivated: false,
    purchaseAttempted: false,
    checkoutNavigated: false,
  });
  writeJson("redirect-chain.json", validation.chain);
  writeJson("destination-classification.json", {
    destinationClassification: validation.destinationClassification,
    checkoutDetected: validation.checkoutDetected,
    finalHost: validation.finalHost,
    finalPath: validation.finalPath,
    authorizedDestinationInferred: false,
  });
  writeJson("campaign-sources-after.json", sources.map((item) => ({
    sourceType: item.sourceType,
    sourceStatus: item.sourceStatus,
    sourceClassification: item.sourceClassification,
    destinationClassification: item.destinationClassification ?? null,
    originalHost: item.originalUrl ? new URL(item.originalUrl.startsWith("http") ? item.originalUrl : "https://invalid.example").host : null,
  })));
  writeJson("isolation.json", {
    campaign237BeforeTypes: before.map((item) => item.sourceType),
    campaign237AfterTypes: sources.map((item) => item.sourceType),
    otherCampaignsUnchanged: JSON.stringify(other) === JSON.stringify(afterOther),
  });

  if (!existsSync(path.join(DIR, "architecture-audit.json"))) {
    throw new Error("Architecture audit is missing.");
  }
  console.log(`54S homologation campaign=${CAMPAIGN_ID} class=${validation.destinationClassification} redirects=${validation.redirectCount}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
