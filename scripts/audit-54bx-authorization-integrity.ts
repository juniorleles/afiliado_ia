import {
  bindOfferCardImage,
  listOfferImagesEligibleForApproval,
  offerImageIsPublishable,
  offerImageLocalPreviewEligible,
  offerImagePublicationBlockers,
  OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
  readOfferImageInventory,
  selectLocalPreviewOfferImage,
  selectRenderableOfferImage,
} from "../src/lib/presell-quality/index.ts";
import { readRendererCandidateSelection } from "../src/lib/presell-quality/renderer-candidate.ts";
import { reopenRejectedOfferImagesForLocalPreview } from "../src/lib/presell-quality/offer-images.ts";

const IDS = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"] as const;
const PACKSHOT = "/media/product/cc835ef78e894f7645c4556b.png";
const fallback = { assetId: "asset-packshot", src: PACKSHOT, productName: "Sugar Defender" };

function main() {
  const inv = readOfferImageInventory(237);
  if (!inv) throw new Error("missing inventory");
  const live = readRendererCandidateSelection(237);

  const assets = IDS.map((id) => {
    const a = inv.assets.find((x) => x.assetId === id);
    if (!a) throw new Error(`missing ${id}`);
    const hist = a.authorizationHistory ?? [];
    const rejectIdx = hist.findIndex((h) => h.action === "REJECT");
    const reopenIdx = hist.findIndex((h) => h.action === "REOPEN_PENDING");
    return {
      assetId: id,
      bottleCount: a.bottleCount,
      usageAuthorization: a.usageAuthorization,
      reviewStatus: a.reviewStatus,
      operatorAttestation: a.operatorAttestation,
      rightsHolderLicenseStatus: a.rightsHolderLicenseStatus ?? "UNPROVEN",
      publicSrc: a.publicSrc,
      localPreviewEligible: offerImageLocalPreviewEligible(a),
      publishable: offerImageIsPublishable(a),
      publicationBlockers: offerImagePublicationBlockers(a),
      rejectEvent: rejectIdx >= 0 ? hist[rejectIdx] : null,
      reopenEvent: reopenIdx >= 0 ? hist[reopenIdx] : null,
      rejectBeforeReopen: rejectIdx >= 0 && reopenIdx > rejectIdx,
      historyActions: hist.map((h) => h.action),
    };
  });

  const binds = [2, 3, 6].map((n) => {
    const local = bindOfferCardImage({
      bottleCount: n,
      fallback,
      inventory: inv,
      mode: OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
      previewGenerationId: "lp-mvs7mja3-0d690e7c",
    });
    const pub = bindOfferCardImage({ bottleCount: n, fallback, inventory: inv });
    return {
      bottles: n,
      selectedLocal: selectLocalPreviewOfferImage({ inventory: inv, bottleCount: n })?.assetId ?? null,
      selectedPublic: selectRenderableOfferImage({ inventory: inv, bottleCount: n })?.assetId ?? null,
      localSrc: local.image.src,
      localAsset: local.image.assetId,
      localRole: local.imageRole,
      publicSrc: pub.image.src,
      publicAsset: pub.image.assetId,
      publicRole: pub.imageRole,
    };
  });

  // Transition validity checks (in-memory only; no writes)
  const alreadyPending = inv.assets.find((a) => a.assetId === "asset-1301445c")!;
  const skipNotRejected = reopenRejectedOfferImagesForLocalPreview({
    inventory: inv,
    assetIds: ["asset-1301445c"],
    justification: "Integrity probe: should skip assets that are not REJECTED.",
  });
  const skipNoOperator = reopenRejectedOfferImagesForLocalPreview({
    inventory: {
      ...inv,
      assets: inv.assets.map((a) =>
        a.assetId === "asset-1301445c"
          ? {
              ...a,
              usageAuthorization: "REJECTED",
              reviewStatus: "REJECTED",
              operatorAttestation: "NONE",
            }
          : a,
      ),
    },
    assetIds: ["asset-1301445c"],
    justification: "Integrity probe: should require OPERATOR_APPROVED.",
  });

  const checks = {
    "1_reject_preserved_in_audit": assets.every((a) => a.rejectEvent != null && a.rejectBeforeReopen),
    "2_reopen_traceable_and_gated":
      assets.every((a) => a.reopenEvent?.action === "REOPEN_PENDING" && Boolean(a.reopenEvent.justification)) &&
      skipNotRejected.reopened.length === 0 &&
      skipNotRejected.skipped[0]?.reasons.includes("not-rejected") === true &&
      skipNoOperator.reopened.length === 0 &&
      skipNoOperator.skipped[0]?.reasons.includes("operator-attestation-required") === true,
    "3_pending_local_preview_only_when_eligible":
      assets.every((a) => a.usageAuthorization === "PENDING" && a.localPreviewEligible) &&
      binds.every(
        (b) =>
          typeof b.localSrc === "string" &&
          b.localSrc.includes(`/offer-images/file/${b.localAsset}`) &&
          b.localRole === "PACKAGE_QUANTITY",
      ) &&
      binds.map((b) => b.localAsset).join(",") === "asset-1301445c,asset-1d63be79,asset-ad4ed3f0",
    "4_pending_not_license_or_public_auth":
      assets.every(
        (a) =>
          a.rightsHolderLicenseStatus === "UNPROVEN" &&
          a.usageAuthorization === "PENDING" &&
          a.reviewStatus === "REQUIRES_HUMAN_REVIEW" &&
          a.publicSrc == null &&
          !a.publishable,
      ),
    "5_public_renderer_blocked":
      binds.every((b) => b.selectedPublic == null && b.publicSrc === PACKSHOT && b.publicRole === "PRODUCT_ILLUSTRATION"),
    "6_publication_gate_requires_rights":
      listOfferImagesEligibleForApproval(inv).length === 0 &&
      assets.every((a) => a.publicationBlockers.some((msg) => /titular|rights-holder|licen/i.test(msg))),
    "7_live_store_54BI": live.activeExecutionId === "54BI",
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  const status = failed.length === 0 ? "PASS" : "BLOCKED";
  console.log(
    JSON.stringify(
      {
        status,
        failed,
        checks,
        liveActiveExecutionId: live.activeExecutionId,
        publicationEligibleCount: listOfferImagesEligibleForApproval(inv).length,
        alreadyPendingAssetId: alreadyPending.assetId,
        assets,
        binds,
        reopenGateProbes: {
          skipNotRejected: skipNotRejected.skipped,
          skipNoOperator: skipNoOperator.skipped,
        },
      },
      null,
      2,
    ),
  );
  if (status !== "PASS") process.exit(2);
}

main();
