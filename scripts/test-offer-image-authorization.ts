import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  bindOfferCardImage,
  decideEligibleOfferImages,
  decideOfferImage,
  filterOfferImageAssets,
  listOfferImagesEligibleForApproval,
  offerImageApprovalEligibility,
  offerImageIsPublishable,
  offerImagePublicationBlockers,
  recordOperatorOfferImageAttestation,
  recordRightsHolderLicense,
  readOfferImageInventory,
  resolveOfferImageAuthorization,
  selectLocalPreviewOfferImage,
  selectRenderableOfferImage,
  reopenRejectedOfferImagesForLocalPreview,
  OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
  OFFER_PACKAGE_IMAGE,
} from "../src/lib/presell-quality/index.ts";
import type { OfferImageAsset, OfferImageInventory } from "../src/lib/presell-quality/offer-images.ts";
import { OfferImageReviewBoard, type OfferImageReviewRow } from "../src/app/admin/lab/lp-generator/[id]/offer-images/review-board.tsx";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const PACKSHOT = "/media/product/cc835ef78e894f7645c4556b.png";
const CSS = readFileSync(path.join(process.cwd(), "src/app/admin/lab/lp-generator/[id]/offer-images/offer-images-review.css"), "utf8");

function fakeAsset(partial: Partial<OfferImageAsset> = {}): OfferImageAsset {
  return {
    assetId: "asset-x2",
    productId: "prod",
    offerId: "offer-2",
    bottleCount: 2,
    sourceUrl: "https://producer.example/x2.webp",
    sourcePageUrl: "https://producer.example/order-now.php",
    sha256: "a".repeat(64),
    mimeType: "image/webp",
    width: 667,
    height: 500,
    classification: OFFER_PACKAGE_IMAGE,
    associationConfidence: 0.94,
    associationRationale: ["Alt names 2 units."],
    evidenceStatus: "VERIFIED",
    usageAuthorization: "PENDING",
    reviewStatus: "REQUIRES_HUMAN_REVIEW",
    localFile: "/media/product/package-2.webp",
    collectedAt: "2026-11-03T00:00:00.000Z",
    duplicateOf: null,
    exclusionReason: null,
    publicSrc: null,
    authorizedBy: null,
    authorizedAt: null,
    authorizationJustification: null,
    authorizationEvidenceNote: null,
    authorizationHistory: [],
    ...partial,
  };
}

function inventoryOf(assets: OfferImageAsset[]): OfferImageInventory {
  return {
    version: 1,
    productId: "prod",
    sourcePageUrl: "https://producer.example/order-now.php",
    collectedAt: "2026-11-03T00:00:00.000Z",
    assets,
    discarded: [],
  };
}

const fallback = { assetId: "asset-packshot", src: PACKSHOT, productName: "Harbor Tonic" };
const rightsNote = "Producer written license covers this package photograph.";
const now = "2026-11-03T15:00:00.000Z";

const auto = resolveOfferImageAuthorization({
  assetId: "asset-x2",
  sourceUrl: "https://producer.example/x2.webp",
  sha256: "a".repeat(64),
  declaration: null,
  discoveredAssets: [],
});
assert(auto.usageAuthorization === "PENDING" && auto.reviewStatus === "REQUIRES_HUMAN_REVIEW", "VERIFIED origin evidence does not auto-approve usage");

const pending = fakeAsset();
assert(!offerImageApprovalEligibility(pending).ok, "VERIFIED pending image is not publication-eligible without rights-holder license");
assert(offerImageApprovalEligibility(pending).reasons.includes("rights-holder-license-unproven"), "approval eligibility names the missing rights-holder license");
assert(!offerImageIsPublishable(pending), "eligible is not the same as publishable");
assert(selectRenderableOfferImage({ inventory: inventoryOf([pending]), bottleCount: 2 }) == null, "pending images cannot render on the landing page");
assert(
  bindOfferCardImage({ bottleCount: 2, fallback, inventory: inventoryOf([pending]) }).image.src === PACKSHOT,
  "pending images keep the approved packshot fallback",
);

const operatorOnly = recordOperatorOfferImageAttestation({
  inventory: inventoryOf([pending]),
  assetIds: ["asset-x2"],
  actor: "campaign-operator",
  declarationText: "Campaign operator authorizes these package images for the Sugar Defender presell.",
  evidenceNote: "Explicit operator declaration in the 54BX authorization thread.",
  now,
  affiliateProgramAudit: {
    sourceUrl: "https://producer.example/affiliates.html",
    fetchedAt: now,
    permittedImageryClause: "Only listed banners may be used.",
    permittedBannerFiles: ["person3.jpg"],
    packageFilesListed: [],
    note: "Package photographs are not listed as permitted affiliate imagery.",
  },
});
assert(operatorOnly.attested.join(",") === "asset-x2", "operator attestation records OPERATOR_APPROVED");
assert(
  operatorOnly.inventory.assets[0]?.operatorAttestation === "OPERATOR_APPROVED" &&
    operatorOnly.inventory.assets[0]?.usageAuthorization === "PENDING" &&
    operatorOnly.inventory.assets[0]?.rightsHolderLicenseStatus === "UNPROVEN",
  "OPERATOR_APPROVED is distinct from usage APPROVED and rights-holder PROVEN",
);
{
  const incomplete = fakeAsset({
    assetId: "asset-incomplete",
    evidenceStatus: "INSUFFICIENT",
    bottleCount: null,
    sha256: null,
    localFile: null,
    operatorAttestation: "NONE",
  });
  const admin = recordOperatorOfferImageAttestation({
    inventory: inventoryOf([incomplete]),
    assetIds: ["asset-incomplete"],
    actor: "system-owner",
    declarationText: "Administrative approval independent of technical integrity for incomplete asset.",
    mode: "ADMINISTRATIVE",
    now,
  });
  assert(admin.attested.join(",") === "asset-incomplete", "ADMINISTRATIVE mode can approve incomplete assets");
  assert(
    admin.inventory.assets[0]?.operatorAttestation === "OPERATOR_APPROVED" &&
      admin.inventory.assets[0]?.evidenceStatus === "INSUFFICIENT" &&
      admin.inventory.assets[0]?.bottleCount == null &&
      admin.inventory.assets[0]?.sha256 == null &&
      admin.inventory.assets[0]?.localFile == null &&
      admin.inventory.assets[0]?.rightsHolderLicenseStatus === "UNPROVEN" &&
      admin.promoted.length === 0 &&
      !offerImageIsPublishable(admin.inventory.assets[0]!),
    "ADMINISTRATIVE approval preserves technical fields and never publishes",
  );
  const again = recordOperatorOfferImageAttestation({
    inventory: admin.inventory,
    assetIds: ["asset-incomplete"],
    actor: "system-owner",
    declarationText: "Administrative approval independent of technical integrity for incomplete asset.",
    mode: "ADMINISTRATIVE",
    now,
  });
  assert(again.attested.length === 0 && again.skipped[0]?.reasons.includes("already-operator-approved"), "ADMINISTRATIVE approval is idempotent");
}
assert(operatorOnly.inventory.affiliateProgramAudit?.permittedBannerFiles.includes("person3.jpg"), "affiliate program restrictions are preserved on the inventory");
assert(
  !offerImageIsPublishable(operatorOnly.inventory.assets[0]!) &&
    offerImagePublicationBlockers(operatorOnly.inventory.assets[0]!).some((item) => /titular/i.test(item)),
  "operator attestation alone keeps publication blocked",
);
assert(
  !decideOfferImage({
    inventory: operatorOnly.inventory,
    assetId: "asset-x2",
    action: "APPROVE",
    actor: "lab-operator",
    justification: rightsNote,
    now,
  }).ok,
  "publication approval remains blocked while rights-holder license is unproven",
);
assert(
  !recordRightsHolderLicense({
    inventory: operatorOnly.inventory,
    assetIds: ["asset-x2"],
    actor: "lab-operator",
    licenseEvidence: "short",
    now,
  }).licensed.length,
  "license registration without evidence is rejected",
);
const batchLicense = recordRightsHolderLicense({
  inventory: inventoryOf([
    fakeAsset({
      assetId: "asset-x2",
      operatorAttestation: "OPERATOR_APPROVED",
      operatorAttestedBy: "campaign-operator",
      operatorAttestedAt: now,
    }),
    fakeAsset({
      assetId: "asset-x3",
      bottleCount: 3,
      offerId: "offer-3",
      sourceUrl: "https://producer.example/x3.webp",
      localFile: "/media/product/package-3.webp",
      operatorAttestation: "OPERATOR_APPROVED",
      operatorAttestedBy: "campaign-operator",
      operatorAttestedAt: now,
    }),
  ]),
  assetIds: ["asset-x2", "asset-x3"],
  actor: "lab-operator",
  licenseEvidence: rightsNote,
  evidenceNote: "Single vendor grant covering package photographs.",
  now,
});
assert(batchLicense.licensed.join(",") === "asset-x2,asset-x3", "one license record can cover multiple images");
assert(batchLicense.promoted.join(",") === "asset-x2,asset-x3", "OPERATOR_APPROVED plus proven license promotes without a second operator approval");
assert(
  batchLicense.inventory.assets.every(
    (asset) => asset.rightsHolderLicenseStatus === "PROVEN" && asset.usageAuthorization === "APPROVED" && offerImageIsPublishable(asset),
  ),
  "promoted images become publishable after license evidence",
);
assert(
  recordRightsHolderLicense({
    inventory: inventoryOf([fakeAsset({ rightsHolderLicenseStatus: "DENIED" })]),
    assetIds: ["asset-x2"],
    actor: "lab-operator",
    licenseEvidence: rightsNote,
    now,
  }).skipped.some((item) => item.reasons.includes("rights-holder-license-denied")),
  "DENIED licenses stay blocked",
);

const missingJustification = decideOfferImage({
  inventory: inventoryOf([fakeAsset({ rightsHolderLicenseStatus: "PROVEN", rightsHolderLicenseEvidence: "MK-1" })]),
  assetId: "asset-x2",
  action: "APPROVE",
  actor: "lab-operator",
  justification: "short",
  now,
});
assert(!missingJustification.ok && missingJustification.error === "justification-required", "approval requires a recorded justification");

const insufficient = fakeAsset({
  assetId: "asset-weak",
  evidenceStatus: "INSUFFICIENT",
  bottleCount: null,
  offerId: null,
  localFile: "/media/product/weak.webp",
  rightsHolderLicenseStatus: "PROVEN",
});
assert(!offerImageApprovalEligibility(insufficient).ok, "INSUFFICIENT evidence is not eligible for approval");
assert(
  !decideOfferImage({
    inventory: inventoryOf([insufficient]),
    assetId: "asset-weak",
    action: "APPROVE",
    actor: "lab-operator",
    justification: rightsNote,
    now,
  }).ok,
  "ineligible images cannot be approved",
);

const licensed = fakeAsset({
  rightsHolderLicenseStatus: "PROVEN",
  rightsHolderLicenseEvidence: "License file attached to the producer declaration.",
});
const approved = decideOfferImage({
  inventory: inventoryOf([licensed]),
  assetId: "asset-x2",
  action: "APPROVE",
  actor: "lab-operator",
  justification: rightsNote,
  evidenceNote: "License file attached to the producer declaration.",
  now,
});
assert(approved.ok, "human approval with usage-rights evidence is recorded");
if (approved.ok) {
  assert(approved.asset.usageAuthorization === "APPROVED" && approved.asset.reviewStatus === "APPROVED", "approval persists usage and review status");
  assert(approved.asset.authorizedBy === "lab-operator" && approved.asset.authorizedAt === now, "approval records actor and timestamp");
  assert(approved.asset.authorizationJustification === rightsNote, "approval stores the justification");
  assert((approved.asset.authorizationHistory?.length ?? 0) >= 1, "approval appends history");
  assert(offerImageIsPublishable(approved.asset), "approved verified associated image becomes publishable");
  const persisted = JSON.parse(JSON.stringify(approved.inventory)) as OfferImageInventory;
  assert(persisted.assets[0]?.usageAuthorization === "APPROVED", "approved status survives JSON persistence");
  assert(
    bindOfferCardImage({ bottleCount: 2, fallback, inventory: approved.inventory }).image.src === "/media/product/package-2.webp",
    "approved package image can bind to the matching offer card",
  );
  assert(
    bindOfferCardImage({ bottleCount: 6, fallback, inventory: approved.inventory }).image.src === PACKSHOT,
    "an approved 2-bottle image cannot publish on a 6-bottle card",
  );
}

const rejected = decideOfferImage({
  inventory: inventoryOf([pending]),
  assetId: "asset-x2",
  action: "REJECT",
  actor: "lab-operator",
  justification: "No producer permission is on file for this asset.",
  now,
});
assert(rejected.ok && rejected.ok && rejected.asset.usageAuthorization === "REJECTED", "rejection records REJECTED authorization");
if (rejected.ok) {
  assert(rejected.asset.reviewStatus === "REJECTED", "rejection completes review as REJECTED");
  assert(!offerImageIsPublishable(rejected.asset), "rejected images are not publishable");
  assert(selectRenderableOfferImage({ inventory: rejected.inventory, bottleCount: 2 }) == null, "rejected images cannot render");
  const persisted = JSON.parse(JSON.stringify(rejected.inventory)) as OfferImageInventory;
  assert(persisted.assets[0]?.usageAuthorization === "REJECTED", "rejected status survives JSON persistence");
}

const mixed = inventoryOf([
  fakeAsset({ assetId: "asset-ok", rightsHolderLicenseStatus: "PROVEN", rightsHolderLicenseEvidence: "MK-1" }),
  fakeAsset({
    assetId: "asset-dup",
    evidenceStatus: "INSUFFICIENT",
    duplicateOf: "asset-ok",
    localFile: "/media/product/dup.webp",
    rightsHolderLicenseStatus: "PROVEN",
  }),
  fakeAsset({
    assetId: "asset-six",
    bottleCount: 6,
    offerId: "offer-6",
    sourceUrl: "https://producer.example/x6.webp",
    localFile: "/media/product/package-6.webp",
    rightsHolderLicenseStatus: "PROVEN",
    rightsHolderLicenseEvidence: "MK-1",
  }),
]);
const batch = decideEligibleOfferImages({
  inventory: mixed,
  assetIds: ["asset-ok", "asset-dup", "asset-six", "asset-missing"],
  action: "APPROVE",
  actor: "lab-operator",
  justification: rightsNote,
  now,
});
assert(batch.approved.join(",") === "asset-ok,asset-six", "batch approval accepts only eligible images");
assert(batch.skipped.some((item) => item.assetId === "asset-dup"), "batch approval skips duplicates and insufficient evidence");
assert(batch.skipped.some((item) => item.assetId === "asset-missing"), "batch approval skips unknown ids");
assert(batch.inventory.assets.find((item) => item.assetId === "asset-dup")?.usageAuthorization === "PENDING", "ineligible images stay pending after batch approval");

const approvedWithoutMedia = fakeAsset({
  usageAuthorization: "APPROVED",
  reviewStatus: "APPROVED",
  rightsHolderLicenseStatus: "PROVEN",
  localFile: "C:\\workspace\\afiliado_ia\\data\\evidence\\not-public.webp",
  publicSrc: null,
});
assert(!offerImageIsPublishable(approvedWithoutMedia), "approval without a public media file cannot publish");

const filtered = filterOfferImageAssets(mixed.assets, { authorization: "PENDING", bottles: "2" });
assert(filtered.every((item) => item.bottleCount === 2), "bottle-count filter keeps the selected quantity");

function reviewRow(partial: Partial<OfferImageReviewRow> = {}): OfferImageReviewRow {
  return {
    assetId: "asset-x2",
    productName: "Harbor Tonic",
    bottleCount: 2,
    sourceHost: "producer.example",
    sourceFile: "x2.webp",
    sourceUrl: "https://producer.example/assets/img/very-long-package-filename-x2.webp",
    thumbSrc: "/admin/lab/lp-generator/lp-test/offer-images/file/asset-x2",
    evidenceStatus: "VERIFIED",
    usageAuthorization: "PENDING",
    reviewStatus: "REQUIRES_HUMAN_REVIEW",
    mimeType: "image/webp",
    width: 667,
    height: 500,
    sha256: "a".repeat(64),
    eligible: false,
    eligibilityReasons: ["rights-holder-license-unproven"],
    publishable: false,
    publicationBlockers: [
      "Licença do titular dos direitos não comprovada (OPERATOR_APPROVED não substitui permissão do produtor).",
      "Autorização de uso para publicação ainda não está APPROVED.",
    ],
    operatorAttestation: "OPERATOR_APPROVED",
    operatorAttestedBy: "campaign-operator",
    operatorAttestedAt: now,
    operatorAttestationNote: "Campaign operator authorizes package images.",
    rightsHolderLicenseStatus: "UNPROVEN",
    rightsHolderLicenseEvidence: null,
    history: [],
    authorizedBy: null,
    authorizedAt: null,
    justification: null,
    evidenceNote: null,
    associationRationale: ["Alt names 2 units."],
    exclusionReason: null,
    duplicateOf: null,
    ...partial,
  };
}

const markup = renderToStaticMarkup(
  createElement(OfferImageReviewBoard, {
    generationId: "lp-test",
    productName: "Harbor Tonic",
    sourcePageUrl: "https://producer.example/order-now.php",
    packages: ["2 Bottles", "3 Bottles", "6 Bottles"],
    flash: null,
    rows: [
      reviewRow(),
      reviewRow({
        assetId: "asset-unmapped",
        bottleCount: null,
        eligible: false,
        eligibilityReasons: ["unmapped-quantity", "evidence-not-verified"],
        evidenceStatus: "INSUFFICIENT",
        sourceFile: "hero-wide.png",
      }),
    ],
  }),
);
assert(markup.includes("data-offer-image-table"), "admin review renders a thumbnail table");
assert(markup.includes("oir-thumb") && markup.includes("oir-badge"), "admin review shows thumbnails and status badges");
assert(markup.includes("data-filter=\"authorization\"") && markup.includes("data-filter=\"bottles\""), "admin review exposes authorization and bottle filters");
assert(markup.includes("Aprovar elegíveis selecionadas"), "admin review exposes eligible batch approval");
assert(/<code>x2\.webp<\/code>/.test(markup), "origin column shows the filename instead of the raw URL");
assert(
  markup.includes('title="https://producer.example/assets/img/very-long-package-filename-x2.webp"'),
  "full source URL stays on the tooltip, not as a table cell",
);
assert(markup.includes("oir-table-wrap") && markup.includes("data-layout=\"table\""), "desktop markup uses a scrollable table layout");
assert(CSS.includes("overflow-x: auto") && CSS.includes("table-layout: fixed") && CSS.includes("@media (max-width: 900px)"), "review CSS prevents overflow and stacks on small screens");
assert(markup.includes("oir-lightbox"), "enlarged image preview is available");
assert(markup.includes("data-publication-blockers") && markup.includes("data-operator-attestation"), "admin review shows operator attestation and publication blockers");
assert(markup.includes("rights-holder-license-unproven") || markup.includes("titular"), "admin review names the missing rights-holder license");

{
  const rejectedSample = fakeAsset({
    assetId: "asset-reopen",
    bottleCount: 2,
    usageAuthorization: "REJECTED",
    reviewStatus: "REJECTED",
    operatorAttestation: "OPERATOR_APPROVED",
    rightsHolderLicenseStatus: "UNPROVEN",
  });
  const reopened = reopenRejectedOfferImagesForLocalPreview({
    inventory: inventoryOf([rejectedSample]),
    assetIds: ["asset-reopen"],
    justification: "Restore local preview after erroneous reject without publication approval.",
  });
  assert(reopened.reopened.join(",") === "asset-reopen", "REOPEN_PENDING restores a rejected package image");
  assert(
    reopened.inventory.assets[0]?.usageAuthorization === "PENDING" &&
      reopened.inventory.assets[0]?.reviewStatus === "REQUIRES_HUMAN_REVIEW" &&
      reopened.inventory.assets[0]?.publicSrc == null &&
      !offerImageIsPublishable(reopened.inventory.assets[0]!),
    "REOPEN_PENDING does not publish or prove rights-holder license",
  );
}

const live = readOfferImageInventory(237);
assert(Boolean(live?.assets.length), "campaign 237 inventory is available for eligibility reporting");
const packageIds = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"];
const operatorApproved = (live?.assets ?? []).filter((asset) => packageIds.includes(asset.assetId));
assert(
  operatorApproved.length === 3 &&
    operatorApproved.every(
      (asset) =>
        asset.operatorAttestation === "OPERATOR_APPROVED" &&
        asset.usageAuthorization === "PENDING" &&
        (asset.rightsHolderLicenseStatus ?? "UNPROVEN") === "UNPROVEN" &&
        !offerImageIsPublishable(asset),
    ),
  "live package images keep OPERATOR_APPROVED without publication approval",
);
assert(
  [2, 3, 6].every((count) => selectLocalPreviewOfferImage({ inventory: live, bottleCount: count }) != null),
  "LOCAL_PREVIEW_ONLY can select the 2/3/6 package images while license stays UNPROVEN",
);
assert(
  bindOfferCardImage({
    bottleCount: 2,
    fallback,
    inventory: live,
    mode: OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
    previewGenerationId: "lp-mvs7mja3-0d690e7c",
  }).image.src?.includes("/admin/lab/lp-generator/lp-mvs7mja3-0d690e7c/offer-images/file/asset-1301445c"),
  "local preview binds admin-only thumbnail routes",
);
assert(
  bindOfferCardImage({ bottleCount: 2, fallback, inventory: live }).image.src === PACKSHOT,
  "public/publish binding still falls back while license is UNPROVEN",
);
assert(
  (live?.assets ?? [])
    .filter((asset) => packageIds.includes(asset.assetId))
    .every((asset) => (asset.rightsHolderLicenseStatus ?? "UNPROVEN") === "UNPROVEN"),
  "LOCAL_PREVIEW_ONLY does not mark rights-holder license PROVEN",
);
assert(Boolean(live?.affiliateProgramAudit?.permittedBannerFiles?.length), "live inventory preserves affiliate program restrictions");
const eligible = listOfferImagesEligibleForApproval(live);
assert(eligible.length === 0, "no live images are publication-eligible without proven rights-holder license");
assert(
  (live?.assets ?? []).every((asset) => asset.usageAuthorization !== "APPROVED"),
  "tests did not write simulated usage APPROVED into the live inventory",
);
assert(existsSync(path.join(process.cwd(), "src/app/admin/lab/lp-generator/[id]/offer-images/actions.ts")), "authorization actions reuse the existing inventory");

console.log(`PASS ${passed}`);
console.log(
  JSON.stringify(
    {
      operatorApproved: operatorApproved.map((asset) => ({
        assetId: asset.assetId,
        bottleCount: asset.bottleCount,
        operatorAttestation: asset.operatorAttestation,
        rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus ?? "UNPROVEN",
        usageAuthorization: asset.usageAuthorization,
        blockers: offerImagePublicationBlockers(asset),
      })),
      publicationEligible: eligible.map((asset) => asset.assetId),
      affiliateProgramAudit: live?.affiliateProgramAudit ?? null,
    },
    null,
    2,
  ),
);
