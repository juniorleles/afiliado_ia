import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  offerImageIsPublishable,
  offerImagePublicationBlockers,
  readOfferImageInventory,
  recordOperatorOfferImageAttestation,
  writeOfferImageInventory,
} from "../src/lib/presell-quality/index.ts";

const CAMPAIGN_ID = 237;
const ASSET_IDS = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"];
const NOW = new Date().toISOString();
const ACTOR = "campaign-operator";
const DECLARATION =
  "Campaign operator for Sugar Defender campaign 237 explicitly authorizes PRESELL_USE of the official 2/3/6 bottle package photographs. This is an operator attestation, not a producer rights-holder license.";

const inventory = readOfferImageInventory(CAMPAIGN_ID);
if (!inventory) throw new Error("offer-image inventory missing for campaign 237");

const result = recordOperatorOfferImageAttestation({
  inventory,
  assetIds: ASSET_IDS,
  actor: ACTOR,
  declarationText: DECLARATION,
  evidenceNote: "Explicit operator declaration recorded in the 54BX authorization chat for campaign 237.",
  now: NOW,
  affiliateProgramAudit: {
    sourceUrl: "https://sugardefender.com/info/affiliates.html",
    fetchedAt: "2026-11-03T14:36:26.257Z",
    permittedImageryClause:
      "You are permitted to use the following imagery in your promotions. You are not allowed to use any imagery found on this website aside from that detailed below.",
    permittedBannerFiles: ["person3.jpg", "person6.jpg"],
    packageFilesListed: [],
    note:
      "Affiliate resources permit only listed banners (person3.jpg, person6.jpg). Package photographs SUGARDEFENDERx2/x3/x6-500px.webp are not listed. OPERATOR_APPROVED does not override this restriction or prove producer license.",
  },
});

if (result.error) throw new Error(result.error);
if (result.attested.sort().join(",") !== ASSET_IDS.slice().sort().join(",")) {
  throw new Error(`expected attestation for ${ASSET_IDS.join(",")}, got ${result.attested.join(",")} skipped=${JSON.stringify(result.skipped)}`);
}

const written = writeOfferImageInventory(CAMPAIGN_ID, result.inventory);
const attested = written.assets.filter((asset) => ASSET_IDS.includes(asset.assetId));
if (attested.some((asset) => asset.usageAuthorization === "APPROVED" || offerImageIsPublishable(asset))) {
  throw new Error("operator attestation must not publish or set usageAuthorization APPROVED");
}
if (attested.some((asset) => (asset.rightsHolderLicenseStatus ?? "UNPROVEN") === "PROVEN")) {
  throw new Error("operator attestation must not mark rights-holder license as PROVEN");
}

const evidenceDir = path.join(process.cwd(), "data/evidence/execution-54bx-operator-attestation");
mkdirSync(evidenceDir, { recursive: true });
const report = {
  recordedAt: NOW,
  actor: ACTOR,
  campaignId: CAMPAIGN_ID,
  generationId: "lp-mvs7mja3-0d690e7c",
  declarationText: DECLARATION,
  attestationStatus: "OPERATOR_APPROVED",
  rightsHolderLicenseStatus: "UNPROVEN",
  usageAuthorizationUnchanged: "PENDING",
  publicationBlocked: true,
  affiliateProgramAudit: written.affiliateProgramAudit,
  assets: attested.map((asset) => ({
    assetId: asset.assetId,
    bottleCount: asset.bottleCount,
    operatorAttestation: asset.operatorAttestation,
    operatorAttestedBy: asset.operatorAttestedBy,
    operatorAttestedAt: asset.operatorAttestedAt,
    usageAuthorization: asset.usageAuthorization,
    reviewStatus: asset.reviewStatus,
    rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus,
    publishable: offerImageIsPublishable(asset),
    publicationBlockers: offerImagePublicationBlockers(asset),
    historyTail: (asset.authorizationHistory ?? []).slice(-1),
  })),
  skipped: result.skipped,
};
writeFileSync(path.join(evidenceDir, "operator-attestation.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  path.join(evidenceDir, "execution-summary.md"),
  [
    "# 54BX — Operator attestation",
    "",
    "Recorded `OPERATOR_APPROVED` for package assets `asset-1301445c`, `asset-1d63be79`, and `asset-ad4ed3f0`.",
    "",
    "- Operator attestation is distinct from rights-holder license proof.",
    "- `usageAuthorization` remains `PENDING`.",
    "- `rightsHolderLicenseStatus` remains `UNPROVEN`.",
    "- Publication stays blocked.",
    "- Affiliate program restrictions are preserved on the inventory audit.",
    "",
  ].join("\n"),
);

console.log(JSON.stringify({ attested: result.attested, skipped: result.skipped, publishableCount: attested.filter(offerImageIsPublishable).length }, null, 2));
