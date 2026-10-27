// npx tsx scripts/test-product-review-ux-54v.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { upsertCampaignSource, readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { presentCampaignSources, currentSourceStatus } from "../src/lib/campaign-sources/present.ts";
import { createProductResearchJob, executeProductResearch, snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { decideDiscoveredAsset, decorateDiscoveredAssets, galleryKindFromAsset } from "../src/lib/product-research/assets.ts";
import { indicatorsFromResearch } from "../src/lib/product-research/indicators.ts";
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

const SALES = "https://shop.novalis.example/core";
const AFFILIATE = "https://help.novalis.example/info/affiliates.html";
const CHECKOUT = "https://shop.novalis.example/c/order-now.php";
const HOP = "https://zzzz.hop.clickbank.net/";
const IMG = "https://cdn.novalis.example/bottle-packshot.png";
const IMG2 = "https://cdn.novalis.example/banner-promo.png";

const salesHtml = `<!doctype html><html><head><title>Novalis Core</title></head>
<body><h1>Novalis Core</h1>
<p>Novalis Core is a digital workbook supplied as a PDF.</p>
<img src="${IMG}" alt="packshot" />
<img src="${IMG2}" alt="banner" />
<h2>What's inside</h2><ul><li>Maca Root</li></ul>
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
  const before237 = snapshotProductResearch(237);
  const beforeStatuses = (before237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|");
  const beforeAssets = (before237.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}`).join("|");

  assert(galleryKindFromAsset({ assetUrl: IMG, assetType: "IMAGE", context: "packshot" }) === "PRODUCT_PACKSHOT", "packshot metadata stays packshot");
  assert(galleryKindFromAsset({ assetUrl: "https://cdn.example/file.png", assetType: "IMAGE", context: "Public image" }) === "OTHER", "unknown image is OTHER, not invented");
  assert(galleryKindFromAsset({ assetUrl: IMG2, assetType: "BANNER", context: "banner" }) === "BANNER", "banner type stays banner");

  const isolated = campaign("Novalis 54V UX", `novalis-54v-ux-${Date.now()}`);
  upsertCampaignSource(isolated.id, "SALES_PAGE", CHECKOUT);
  upsertCampaignSource(isolated.id, "SALES_PAGE", SALES);
  upsertCampaignSource(isolated.id, "AFFILIATE_RESOURCE", AFFILIATE);
  upsertCampaignSource(isolated.id, "TRACKING_HOPLINK", HOP);
  const presented = presentCampaignSources(readCampaignSources(isolated.id));
  assert(presented.salesPage?.originalUrl === SALES, "current sales page is not checkout");
  assert(presented.historical.some((item) => item.originalUrl.includes("order-now")), "checkout stays historical");
  assert(presented.trackingHop?.originalUrl.includes("hop.clickbank.net"), "hop is presented as tracking");
  assert(!presented.authorizedDestination, "authorized destination stays empty");
  assert(currentSourceStatus(readCampaignSources(isolated.id), "SALES_PAGE") !== "CHECKOUT_SUSPECTED", "sales badge is not checkout");

  const job = createProductResearchJob({ campaignId: isolated.id, productUrl: SALES, affiliateResourceUrl: AFFILIATE, trackingHopUrl: HOP });
  const run = await executeProductResearch({
    campaignId: isolated.id,
    runId: job.runId,
    fetchPage: async (url) => ok(url, salesHtml),
  });
  const assets = decorateDiscoveredAssets(run.discoveredAssets);
  assert(assets.length >= 1, "research still discovers images");
  const first = assets[0];
  const accepted = decideDiscoveredAsset({ campaignId: isolated.id, runId: run.runId, assetUrl: first.assetUrl, action: "ACCEPT" });
  assert(accepted.discoveredAssets?.find((item) => item.assetUrl === first.assetUrl)?.status === "USER_APPROVED", "asset accept persists");
  const hero = decideDiscoveredAsset({ campaignId: isolated.id, runId: run.runId, assetUrl: first.assetUrl, action: "SET_HERO" });
  assert(hero.discoveredAssets?.find((item) => item.assetUrl === first.assetUrl)?.hero === true, "approved image can be primary");
  const second = assets.find((item) => item.assetUrl !== first.assetUrl);
  if (second) {
    let blocked = false;
    try {
      decideDiscoveredAsset({ campaignId: isolated.id, runId: run.runId, assetUrl: second.assetUrl, action: "SET_HERO" });
    } catch {
      blocked = true;
    }
    assert(blocked, "a pending image cannot be the primary packshot");
    const rejected = decideDiscoveredAsset({ campaignId: isolated.id, runId: run.runId, assetUrl: second.assetUrl, action: "REJECT" });
    assert(rejected.discoveredAssets?.find((item) => item.assetUrl === second.assetUrl)?.status === "REJECTED", "asset reject persists");
  }
  const reloaded = snapshotProductResearch(isolated.id).latest;
  assert(reloaded?.discoveredAssets?.find((item) => item.assetUrl === first.assetUrl)?.status === "USER_APPROVED", "asset approval survives reload");

  const eligible = run.proposals.find((item) => item.suggestedValue.trim() && item.evidenceIds.length);
  if (eligible) {
    decideProductResearchFields({ campaignId: isolated.id, runId: run.runId, fields: [eligible.field], action: "ACCEPT" });
  }
  const indicators = indicatorsFromResearch(snapshotProductResearch(isolated.id).latest);
  assert(indicators.assetApproval.approved >= 1, "asset approval count is separate from coverage");
  assert(indicators.researchCoverage.max === 100, "coverage formula is unchanged");
  assert(indicators.publicationReadiness.status === "BLOCKED", "publication stays blocked");
  assert(indicators.commercialAuthorization === "BLOCKED", "commercial stays blocked");

  const after237 = snapshotProductResearch(237);
  assert((after237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|") === beforeStatuses, "237 fact approvals unchanged");
  assert((after237.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}`).join("|") === beforeAssets, "237 asset approvals unchanged");
  assert(getCampaignById(237)?.name.includes("Sugar Defender"), "237 remains Sugar Defender");

  assert(fileHash(path.join(process.cwd(), "src/components/product-showcase/v4/shell.tsx")) !== null, "Renderer V4 stays readable");
  assert(fileHash(path.join(process.cwd(), "data/affiliate-hops/femicore/hop.json")) !== null, "FemiCore hop stays readable");
  assert(fileHash(path.join(process.cwd(), "data/affiliate-hops/prodentim/hop.json")) !== null, "ProDentim hop stays readable");
  console.log(`PASS test-product-review-ux-54v.ts (${passed} OK) isolated=${isolated.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
