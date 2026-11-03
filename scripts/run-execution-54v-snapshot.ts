// npx tsx scripts/run-execution-54v-snapshot.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { presentCampaignSources } from "../src/lib/campaign-sources/present.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { readCampaignBrief } from "../src/lib/campaign-brief.ts";
import { readKnowledgeText } from "../src/lib/product-knowledge.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";
import { decorateDiscoveredAssets } from "../src/lib/product-research/assets.ts";

const DIR = path.join("data/evidence/execution-54v-product-review-ux/reports");

function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  mkdirSync(DIR, { recursive: true });
  const campaign = getCampaignById(237);
  if (!campaign) throw new Error("Campaign 237 missing.");
  const sources = readCampaignSources(237);
  const presented = presentCampaignSources(sources);
  const snap = snapshotProductResearch(237);
  const indicators = indicatorsFromResearch(snap.latest);
  const knowledge = readKnowledgeText(campaign, readCampaignBrief(237)).text;
  const payload = {
    campaign: { id: campaign.id, name: campaign.name },
    coverage: `${indicators.researchCoverage.total}/${indicators.researchCoverage.max}`,
    review: `${indicators.reviewCompletion.accepted}/${indicators.reviewCompletion.total}`,
    assets: `${indicators.assetApproval.approved}/${indicators.assetApproval.total}`,
    publication: indicators.publicationReadiness.status,
    commercial: indicators.commercialAuthorization,
    sales: presented.salesPage?.originalUrl ?? null,
    affiliate: presented.affiliateResource?.originalUrl ?? null,
    hop: presented.trackingHop ? sanitizeSharedUrl(presented.trackingHop.originalUrl) : null,
    authorized: presented.authorizedDestination?.originalUrl ?? null,
    historical: presented.historical.map((item) => ({ type: item.sourceType, status: item.sourceStatus, url: sanitizeSharedUrl(item.originalUrl) })),
    productUrl: knowledge.productUrl,
    proposals: (snap.latest?.proposals ?? []).map((item) => ({ field: item.field, status: item.status })),
    discoveredAssets: decorateDiscoveredAssets(snap.latest?.discoveredAssets).map((item) => ({
      kind: item.galleryKind,
      status: item.status,
      hero: item.hero ?? false,
      sourceUrl: item.sourceUrl,
    })),
  };
  writeFileSync(path.join(DIR, "campaign-237-final.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`54V snapshot coverage=${payload.coverage} review=${payload.review} assets=${payload.assets} sales=${payload.sales}`);
}

main();
