import type { DiscoveredImage, VisualRole } from "@/lib/real-product-assets/types";
import { classifyVisualClass } from "@/lib/real-product-assets/visual-class";

const ROLE_FOR_KIND: Record<DiscoveredImage["probableKind"], VisualRole> = {
  packshot: "PRIMARY_PRODUCT",
  lifestyle: "SUPPORTING",
  banner: "PROMO_BANNER",
  infographic: "DETAIL",
  other: "UNASSIGNED",
  logo: "UNASSIGNED",
  icon: "UNASSIGNED",
  tracking: "UNASSIGNED",
};

export function assignVisualRole(image: DiscoveredImage): VisualRole {
  if (image.status !== "USER_APPROVED") return "UNASSIGNED";
  return ROLE_FOR_KIND[image.probableKind];
}

function score(image: DiscoveredImage): number {
  let value = 0;
  if (image.status !== "USER_APPROVED") return -1;
  if (image.policyBlock) return -1;
  if (image.match === "CONTRADICTED") return -1;
  if (image.match === "CONFIRMED") value += 50;
  if (image.match === "PLAUSIBLE") value += 20;
  if (image.probableKind === "packshot") value += 30;
  if (image.probableKind === "lifestyle") value += 10;
  const px = (image.width ?? 0) * (image.height ?? 0);
  if (px >= 400 * 400) value += 15;
  if (px >= 800 * 800) value += 10;
  const ratio = image.width && image.height ? image.width / image.height : 1;
  if (ratio >= 0.7 && ratio <= 1.4) value += 10;
  return value;
}

function pageEligible(image: DiscoveredImage): boolean {
  const visual = classifyVisualClass(image);
  return visual === "PRODUCT_PACKSHOT" || visual === "PRODUCT_GALLERY" || visual === "LIFESTYLE";
}

export function selectApprovedHero(images: DiscoveredImage[]): DiscoveredImage | null {
  const usable = images
    .filter((item) => item.status === "USER_APPROVED" && item.relevant && !item.policyBlock && item.match !== "CONTRADICTED" && pageEligible(item))
    .sort((a, b) => score(b) - score(a));
  return usable[0] ?? null;
}

export function selectApprovedGallery(images: DiscoveredImage[], limit = 3): DiscoveredImage[] {
  const hero = selectApprovedHero(images);
  return images
    .filter((item) => item.status === "USER_APPROVED" && item.relevant && !item.policyBlock && item.id !== hero?.id && pageEligible(item))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
