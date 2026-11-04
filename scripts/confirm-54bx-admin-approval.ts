/**
 * Confirms system-owner administrative approval for campaign 237 package assets.
 * Does not rewrite inventory when OPERATOR_APPROVED is already in force.
 * Does not register rights-holder license or publish.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  bindOfferCardImage,
  offerImageIsPublishable,
  offerImageLocalPreviewEligible,
  offerImagePublicationBlockers,
  OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
  readOfferImageInventory,
  selectLocalPreviewOfferImage,
  selectRenderableOfferImage,
} from "../src/lib/presell-quality/index.ts";
import { readRendererCandidateSelection } from "../src/lib/presell-quality/renderer-candidate.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const ASSET_IDS = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"] as const;
const PACKSHOT = "/media/product/cc835ef78e894f7645c4556b.png";
const fallback = { assetId: "asset-packshot", src: PACKSHOT, productName: "Sugar Defender" };
const NOW = new Date().toISOString();
const ACTOR = "system-owner";
const DECISION =
  "System owner administratively confirms OPERATOR_APPROVED for Sugar Defender campaign 237 package assets asset-1301445c (2), asset-1d63be79 (3), and asset-ad4ed3f0 (6) for LOCAL_PREVIEW_ONLY / administrative preview use. This confirmation does not prove rights-holder license and does not authorize public publication.";

async function capturePreviewCards() {
  const { chromium } = await import("playwright");
  const url = `http://127.0.0.1:3000/admin/lab/lp-generator/${GENERATION_ID}/preview?visualCapture=visitor&candidate=54BX`;
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("[data-seller-package] img")] as HTMLImageElement[];
    return imgs.length === 3 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20_000 }).catch(() => undefined);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("[data-seller-package]")].map((el) => {
      const img = el.querySelector("img") as HTMLImageElement | null;
      return {
        bottles: el.getAttribute("data-bottle-count"),
        assetId: img?.getAttribute("data-packshot-asset") ?? null,
        role: img?.getAttribute("data-image-role") ?? null,
        src: img?.getAttribute("src") ?? null,
        naturalWidth: img?.naturalWidth ?? 0,
      };
    }),
  );
  const out = path.join(process.cwd(), "data/evidence/execution-54bx-admin-approval");
  mkdirSync(out, { recursive: true });
  await page.locator("#seller-stated-packages").screenshot({ path: path.join(out, "desktop-packages-admin-preview.png") });
  await browser.close();
  return cards;
}

async function main() {
  const inventory = readOfferImageInventory(CAMPAIGN_ID);
  if (!inventory) throw new Error("missing inventory");
  const live = readRendererCandidateSelection(CAMPAIGN_ID);
  const assets = ASSET_IDS.map((id) => {
    const asset = inventory.assets.find((item) => item.assetId === id);
    if (!asset) throw new Error(`missing ${id}`);
    return {
      assetId: id,
      bottleCount: asset.bottleCount,
      operatorAttestation: asset.operatorAttestation,
      operatorAttestedBy: asset.operatorAttestedBy,
      operatorAttestedAt: asset.operatorAttestedAt,
      operatorAttestationNote: asset.operatorAttestationNote,
      usageAuthorization: asset.usageAuthorization,
      reviewStatus: asset.reviewStatus,
      rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus ?? "UNPROVEN",
      rightsHolderLicenseEvidence: asset.rightsHolderLicenseEvidence ?? null,
      localPreviewEligible: offerImageLocalPreviewEligible(asset),
      publishable: offerImageIsPublishable(asset),
      publicationBlockers: offerImagePublicationBlockers(asset),
      historyActions: (asset.authorizationHistory ?? []).map((h) => h.action),
    };
  });

  const binds = [2, 3, 6].map((n) => {
    const local = bindOfferCardImage({
      bottleCount: n,
      fallback,
      inventory,
      mode: OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
      previewGenerationId: GENERATION_ID,
    });
    const pub = bindOfferCardImage({ bottleCount: n, fallback, inventory });
    return {
      bottles: n,
      selectedLocal: selectLocalPreviewOfferImage({ inventory, bottleCount: n })?.assetId ?? null,
      selectedPublic: selectRenderableOfferImage({ inventory, bottleCount: n })?.assetId ?? null,
      localAsset: local.image.assetId,
      localSrc: local.image.src,
      publicSrc: pub.image.src,
    };
  });

  const alreadyApproved = assets.every((a) => a.operatorAttestation === "OPERATOR_APPROVED");
  const rightsUnproven = assets.every((a) => a.rightsHolderLicenseStatus === "UNPROVEN" && a.rightsHolderLicenseEvidence == null);
  const notPublishable = assets.every((a) => !a.publishable && a.usageAuthorization === "PENDING");
  const localDistinct =
    binds.map((b) => b.selectedLocal).join(",") === ASSET_IDS.join(",") &&
    binds.every((b) => typeof b.localSrc === "string" && b.localSrc.includes(`/offer-images/file/${b.localAsset}`));
  const publicBlocked = binds.every((b) => b.selectedPublic == null && b.publicSrc === PACKSHOT);

  const previewCards = await capturePreviewCards();
  const previewOk =
    previewCards.find((c) => c.bottles === "2")?.assetId === "asset-1301445c" &&
    previewCards.find((c) => c.bottles === "3")?.assetId === "asset-1d63be79" &&
    previewCards.find((c) => c.bottles === "6")?.assetId === "asset-ad4ed3f0" &&
    previewCards.every((c) => (c.naturalWidth ?? 0) > 0);

  const inventoryMutated = false;
  const status =
    alreadyApproved && rightsUnproven && notPublishable && localDistinct && publicBlocked && previewOk && live.activeExecutionId === "54BI"
      ? "PASS"
      : "FAIL";

  const report = {
    status,
    recordedAt: NOW,
    actor: ACTOR,
    decision: DECISION,
    inventoryMutated,
    reasonInventoryUnchanged:
      "Assets already carry OPERATOR_APPROVED via prior OPERATOR_ATTEST. Re-attestation is gated by already-operator-approved; system-owner confirmation is recorded in this evidence file without rewriting inventory history, inventing RIGHTS_HOLDER_LICENSE, or publishing.",
    campaignId: CAMPAIGN_ID,
    generationId: GENERATION_ID,
    liveActiveExecutionId: live.activeExecutionId,
    checks: {
      alreadyApproved,
      rightsUnproven,
      notPublishable,
      localDistinct,
      publicBlocked,
      previewOk,
      liveStore54BI: live.activeExecutionId === "54BI",
    },
    assets,
    binds,
    previewCards,
  };

  const out = path.join(process.cwd(), "data/evidence/execution-54bx-admin-approval");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "admin-approval-confirmation.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (status !== "PASS") process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
