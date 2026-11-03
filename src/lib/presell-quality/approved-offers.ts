import type { CommercialReuseManifest, SellerStatedPackage } from "@/lib/presell-quality/commercial-reuse";
import { presentPackageShipping } from "@/lib/presell-quality/visual-optimization-agent/copy";
import {
  OFFER_IMAGE_LOCAL_PREVIEW_ONLY,
  offerImageAdminFilePath,
  offerImagePublicSrc,
  selectLocalPreviewOfferImage,
  selectRenderableOfferImage,
  type OfferImageInventory,
} from "@/lib/presell-quality/offer-images";

export const PREMIUM_OFFER_CARDS_ID = "PREMIUM_OFFER_CARDS" as const;

export const UNVERIFIED_POPULARITY_LABEL =
  /\b(most popular|best seller|customer favorite|limited stock|only today|recommended by doctors|5-star rated|thousands of happy customers|best value|try two)\b/i;

export type AffiliateDestinationStatus = "APPROVED" | "PENDING" | "REJECTED";
export type OfferImageRole = "PACKAGE_QUANTITY" | "PRODUCT_ILLUSTRATION";
export type OfferFeaturedReason = "LOWEST_UNIT_PRICE";

export type ApprovedOffer = {
  id: string;
  bottleCount: number;
  supplyDays: number | null;
  quantityLabel: string;
  supplyLabel: string | null;
  unitPriceLabel: string;
  totalPriceLabel: string;
  currency: string;
  comparisonTotalLabel: string | null;
  comparisonQualifier: "SELLER_LISTED_COMPARISON" | null;
  shippingDescription: string;
  bonuses: string[];
  productImageAssetId: string | null;
  productImageSrc: string | null;
  productImageAlt: string;
  imageRole: OfferImageRole;
  imageRepresentsBottleCount: boolean;
  affiliateDestination: string | null;
  affiliateDestinationStatus: AffiliateDestinationStatus;
  featuredReason: OfferFeaturedReason | null;
  buyLabel: string;
  commercialNavigationEnabled: boolean;
};

export type AffiliateOfferAudit = {
  registeredDestination: string | null;
  distinctDestinations: string[];
  affiliateLinkVerified: boolean;
  packageSpecificLinksAvailable: boolean;
  affiliateTrackingVerified: boolean;
  commercialDestinationApproved: boolean;
  hopUnchanged: boolean;
  hopIdUnchanged: boolean;
  limitation: string;
};

export type OfferImageInput = {
  assetId: string | null;
  src: string | null;
  productName: string;
};

const TRACKING_QUERY = /\b(hop|hopid)\b/i;

export function parseBottleCount(quantity: string): number | null {
  const match = quantity.match(/(\d+)\s*bottles?/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function parseSupplyDays(duration: string): number | null {
  const match = duration.match(/(\d+)\s*days?/i);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isInteger(days) && days > 0 ? days : null;
}

export function parseMoneyAmount(value: string): number | null {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

export function presentOfferShipping(term: string): string {
  const stripped = presentPackageShipping(term);
  if (/shipping is extra|shipping extra/i.test(stripped)) return "Shipping extra";
  if (/\bus shipping included\b/i.test(stripped) || /\bshipping included\b/i.test(stripped)) return "US shipping included";
  return stripped;
}

export function presentOfferBonus(bonus: string): string {
  const cleaned = bonus
    .replace(/^Seller-stated extras:\s*/i, "")
    .replace(/^Includes\s+/i, "")
    .replace(/\s+listed on this package\.?$/i, "")
    .trim();
  if (!cleaned) return "";
  return /^includes\b/i.test(cleaned) ? cleaned : `Includes ${cleaned}`;
}

export function quantityDisplayLabel(bottleCount: number): string {
  return `${bottleCount} ${bottleCount === 1 ? "bottle" : "bottles"}`;
}

export function buyButtonLabel(bottleCount: number): string {
  return `Buy ${bottleCount} ${bottleCount === 1 ? "bottle" : "bottles"}`;
}

export function commercialOfferNavigationAllowed(input: {
  affiliateDestinationStatus: AffiliateDestinationStatus;
  contentSafetyPass: boolean;
  qualityGateApproved: boolean;
  operationalAuthorization: boolean;
  hopEnabled: boolean;
}): boolean {
  return (
    input.affiliateDestinationStatus === "APPROVED" &&
    input.contentSafetyPass &&
    input.qualityGateApproved &&
    input.operationalAuthorization &&
    input.hopEnabled
  );
}

export function auditAffiliateOfferDestination(manifest: CommercialReuseManifest | null): AffiliateOfferAudit {
  const registered = manifest?.finalUrl?.trim() || manifest?.sourceUrl?.trim() || null;
  const packageUrls = [
    ...new Set(
      (manifest?.items ?? [])
        .filter((item) => item.field === "package" || item.field === "price")
        .map((item) => item.source_url.trim())
        .filter(Boolean),
    ),
  ];
  const distinctDestinations = [...new Set([registered, ...packageUrls].filter((item): item is string => Boolean(item)))];
  const packageSpecific = distinctDestinations.length > 1;
  let hopUnchanged = true;
  let hopIdUnchanged = true;
  if (registered) {
    try {
      const parsed = new URL(registered);
      hopUnchanged = parsed.searchParams.has("hop");
      hopIdUnchanged = parsed.searchParams.has("hopId");
    } catch {
      hopUnchanged = false;
      hopIdUnchanged = false;
    }
  }
  const trackingVerified = Boolean(registered && TRACKING_QUERY.test(registered) && hopUnchanged && hopIdUnchanged);
  return {
    registeredDestination: registered,
    distinctDestinations,
    affiliateLinkVerified: Boolean(registered),
    packageSpecificLinksAvailable: packageSpecific,
    affiliateTrackingVerified: trackingVerified,
    commercialDestinationApproved: false,
    hopUnchanged,
    hopIdUnchanged,
    limitation: packageSpecific
      ? "Multiple registered destinations exist. Do not invent additional package parameters."
      : "Only a generic order-page destination is registered. Package buttons cannot claim they select a specific bottle count.",
  };
}

function isPublicMediaSrc(value: string | null): boolean {
  if (!value) return false;
  return value.startsWith("/media/") || /^https:\/\//i.test(value);
}

export function bindOfferCardImage(input: {
  bottleCount: number;
  fallback: OfferImageInput;
  inventory?: OfferImageInventory | null;
  mode?: "PUBLISH" | typeof OFFER_IMAGE_LOCAL_PREVIEW_ONLY;
  previewGenerationId?: string | null;
}): { image: OfferImageInput; imageRole: OfferImageRole; imageRepresentsBottleCount: boolean } {
  if (input.mode === OFFER_IMAGE_LOCAL_PREVIEW_ONLY && input.previewGenerationId) {
    const preview = selectLocalPreviewOfferImage({ inventory: input.inventory, bottleCount: input.bottleCount });
    if (preview) {
      return {
        image: {
          assetId: preview.assetId,
          src: offerImageAdminFilePath(input.previewGenerationId, preview.assetId),
          productName: input.fallback.productName,
        },
        imageRole: "PACKAGE_QUANTITY",
        imageRepresentsBottleCount: true,
      };
    }
  }
  const approved = selectRenderableOfferImage({ inventory: input.inventory, bottleCount: input.bottleCount });
  const src = approved ? offerImagePublicSrc(approved) : null;
  if (approved && src && isPublicMediaSrc(src)) {
    return {
      image: {
        assetId: approved.assetId,
        src,
        productName: input.fallback.productName,
      },
      imageRole: "PACKAGE_QUANTITY",
      imageRepresentsBottleCount: true,
    };
  }
  return {
    image: input.fallback,
    imageRole: "PRODUCT_ILLUSTRATION",
    imageRepresentsBottleCount: false,
  };
}

export function approvedOffersFromManifest(input: {
  manifest: CommercialReuseManifest;
  image: OfferImageInput;
  navigationAllowed?: boolean;
  offerImages?: OfferImageInventory | null;
  mode?: "PUBLISH" | typeof OFFER_IMAGE_LOCAL_PREVIEW_ONLY;
  previewGenerationId?: string | null;
}): ApprovedOffer[] {
  const packages = input.manifest.approvedPackages.filter((item) => parseBottleCount(item.quantity) != null);
  const lowest = packages.reduce(
    (best, item) => {
      const amount = parseMoneyAmount(item.unitPrice);
      if (amount == null) return best;
      return amount < best.amount ? { amount, id: item.id } : best;
    },
    { amount: Number.POSITIVE_INFINITY, id: "" },
  );
  const audit = auditAffiliateOfferDestination(input.manifest);
  const destinationStatus: AffiliateDestinationStatus = audit.commercialDestinationApproved ? "APPROVED" : audit.affiliateLinkVerified ? "PENDING" : "REJECTED";
  const navigationAllowed = input.navigationAllowed === true && destinationStatus === "APPROVED";
  return packages.map((item) => {
    const bottleCount = parseBottleCount(item.quantity) ?? 0;
    const bound = bindOfferCardImage({
      bottleCount,
      fallback: input.image,
      inventory: input.offerImages,
      mode: input.mode,
      previewGenerationId: input.previewGenerationId,
    });
    return offerFromApprovedPackage({
      item,
      image: bound.image,
      imageRole: bound.imageRole,
      imageRepresentsBottleCount: bound.imageRepresentsBottleCount,
      featured: item.id === lowest.id,
      affiliateDestination: audit.packageSpecificLinksAvailable ? null : audit.registeredDestination,
      affiliateDestinationStatus: destinationStatus,
      commercialNavigationEnabled: navigationAllowed,
    });
  });
}

export function offerFromApprovedPackage(input: {
  item: SellerStatedPackage;
  image: OfferImageInput;
  featured: boolean;
  affiliateDestination: string | null;
  affiliateDestinationStatus: AffiliateDestinationStatus;
  commercialNavigationEnabled: boolean;
  imageRole?: OfferImageRole;
  imageRepresentsBottleCount?: boolean;
}): ApprovedOffer {
  const bottleCount = parseBottleCount(input.item.quantity) ?? 0;
  const supplyDays = parseSupplyDays(input.item.duration);
  const imageSrc = input.image.src?.trim() || null;
  const packageImage = input.imageRole === "PACKAGE_QUANTITY" && input.imageRepresentsBottleCount === true;
  return {
    id: input.item.id,
    bottleCount,
    supplyDays,
    quantityLabel: quantityDisplayLabel(bottleCount),
    supplyLabel: supplyDays != null ? `${supplyDays}-day supply` : null,
    unitPriceLabel: input.item.unitPrice,
    totalPriceLabel: input.item.currentTotal,
    currency: "USD",
    comparisonTotalLabel: input.item.comparedTotal,
    comparisonQualifier: input.item.comparedTotal ? "SELLER_LISTED_COMPARISON" : null,
    shippingDescription: presentOfferShipping(input.item.shippingTerm),
    bonuses: input.item.bonuses.map(presentOfferBonus).filter(Boolean),
    productImageAssetId: input.image.assetId,
    productImageSrc: imageSrc,
    productImageAlt: packageImage
      ? `${input.image.productName}. ${quantityDisplayLabel(bottleCount)}.`
      : `${input.image.productName} product image. ${quantityDisplayLabel(bottleCount)}.`,
    imageRole: input.imageRole ?? "PRODUCT_ILLUSTRATION",
    imageRepresentsBottleCount: input.imageRepresentsBottleCount === true,
    affiliateDestination: input.commercialNavigationEnabled ? input.affiliateDestination : null,
    affiliateDestinationStatus: input.affiliateDestinationStatus,
    featuredReason: input.featured ? "LOWEST_UNIT_PRICE" : null,
    buyLabel: buyButtonLabel(bottleCount),
    commercialNavigationEnabled: input.commercialNavigationEnabled,
  };
}

export function displayKicker(offer: ApprovedOffer): string {
  if (offer.featuredReason === "LOWEST_UNIT_PRICE") return "Lowest price per bottle";
  return offer.quantityLabel;
}

export function labelIsUnverifiedPopularity(label: string): boolean {
  return UNVERIFIED_POPULARITY_LABEL.test(label);
}
