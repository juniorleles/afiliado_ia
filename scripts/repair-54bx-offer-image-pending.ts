/**
 * Restores erroneous REJECT → PENDING for campaign 237 package photos
 * so LOCAL_PREVIEW_ONLY can bind distinct 2/3/6 images. Does not publish.
 */
import {
  offerImageIsPublishable,
  offerImageLocalPreviewEligible,
  readOfferImageInventory,
  reopenRejectedOfferImagesForLocalPreview,
  selectLocalPreviewOfferImage,
  writeOfferImageInventory,
} from "../src/lib/presell-quality/offer-images.ts";

const PACKAGE_IDS = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"] as const;

function main() {
  const inventory = readOfferImageInventory(237);
  if (!inventory) throw new Error("missing inventory for campaign 237");
  const result = reopenRejectedOfferImagesForLocalPreview({
    inventory,
    assetIds: [...PACKAGE_IDS],
    actor: "lab-operator",
    justification:
      "Reopen erroneous REJECT that blocked LOCAL_PREVIEW_ONLY for distinct 2/3/6 package photographs. Publication remains blocked until rights-holder license is PROVEN.",
    evidenceNote:
      "Prior REJECT justification contradicted OPERATOR_APPROVED attestation ('Imagem autorizada pelo produtor'). Restore PENDING + REQUIRES_HUMAN_REVIEW only.",
  });
  writeOfferImageInventory(237, result.inventory);
  const bound = [2, 3, 6].map((bottleCount) => {
    const asset = selectLocalPreviewOfferImage({ inventory: result.inventory, bottleCount });
    return {
      bottleCount,
      assetId: asset?.assetId ?? null,
      eligible: asset ? offerImageLocalPreviewEligible(asset) : false,
      publishable: asset ? offerImageIsPublishable(asset) : false,
      usage: asset?.usageAuthorization ?? null,
    };
  });
  console.log(
    JSON.stringify(
      {
        reopened: result.reopened,
        skipped: result.skipped,
        bound,
        allPending: PACKAGE_IDS.every((id) => result.inventory.assets.find((a) => a.assetId === id)?.usageAuthorization === "PENDING"),
        nonePublishable: PACKAGE_IDS.every((id) => {
          const asset = result.inventory.assets.find((a) => a.assetId === id);
          return asset ? !offerImageIsPublishable(asset) : false;
        }),
      },
      null,
      2,
    ),
  );
}

main();
