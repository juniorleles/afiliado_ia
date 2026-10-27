import type { DiscoveredImage, OperationalStatus, ProbableKind } from "@/lib/real-product-assets/types";
import { classifyVisualClass, isLabFixtureUrl, type VisualClass } from "@/lib/real-product-assets/visual-class";

export const GALLERY_SECTIONS = ["packshot", "banner", "supporting", "other", "decorative"] as const;
export type GallerySection = (typeof GALLERY_SECTIONS)[number];

const DECORATIVE = /order[-_]?now|btn|button|checkmark|check[-_]?mark|arrow|close|cart|plus[-_]?icon|favicon|sprite|emoji|lion|smile|seal|badge/i;

export type GalleryCard = {
  id: string;
  fileName: string;
  url: string;
  sourcePage: string;
  originHost: string;
  probableKind: ProbableKind;
  section: GallerySection;
  status: OperationalStatus;
  match: DiscoveredImage["match"];
  width: number | null;
  height: number | null;
  relevant: boolean;
  policyBlock: string | null;
  selectable: boolean;
  displayable: boolean;
  visualClass: VisualClass;
  promotional: boolean;
  fixture: boolean;
};

export function gallerySection(image: Pick<DiscoveredImage, "url" | "fileName" | "probableKind" | "relevant">): GallerySection {
  if (image.probableKind === "icon" || image.probableKind === "logo" || image.probableKind === "tracking") {
    return "decorative";
  }
  if (DECORATIVE.test(image.fileName) || DECORATIVE.test(image.url)) return "decorative";
  if (image.probableKind === "packshot") return "packshot";
  if (image.probableKind === "banner") return "banner";
  if (image.probableKind === "lifestyle" || image.probableKind === "infographic") return "supporting";
  if (image.relevant) return "supporting";
  return "other";
}

export function isDisplayableImageUrl(url: string): boolean {
  if (/^lab-fixture:[\w.-]+$/.test(url)) return true;
  try {
    const path = new URL(url).pathname.replace(/\/+/g, "/");
    return path !== "/" && path !== "";
  } catch {
    return false;
  }
}

export function isSelectableForApproval(status: OperationalStatus): boolean {
  return status !== "BLOCKED_BY_POLICY" && status !== "USER_APPROVED";
}

export function thumbnailPath(productKey: string, imageId: string): string {
  return `/admin/lab/real-assets/thumb/${encodeURIComponent(productKey)}/${encodeURIComponent(imageId)}`;
}

export function toGalleryCard(image: DiscoveredImage): GalleryCard {
  let originHost = "";
  try {
    originHost = new URL(image.sourcePage).host;
  } catch {
    originHost = image.sourcePage;
  }
  return {
    id: image.id,
    fileName: image.fileName,
    url: image.url,
    sourcePage: image.sourcePage,
    originHost,
    probableKind: image.probableKind,
    section: gallerySection(image),
    status: image.status,
    match: image.match,
    width: image.width,
    height: image.height,
    relevant: image.relevant,
    policyBlock: image.policyBlock,
    selectable: isSelectableForApproval(image.status) && classifyVisualClass(image) !== "UNSUITABLE",
    displayable: isDisplayableImageUrl(image.url),
    visualClass: classifyVisualClass(image),
    promotional: classifyVisualClass(image) === "PROMOTIONAL",
    fixture: isLabFixtureUrl(image.url),
  };
}

export function groupGalleryCards(cards: GalleryCard[]): Array<{ section: GallerySection; title: string; cards: GalleryCard[] }> {
  const titles: Record<GallerySection, string> = {
    packshot: "Packshots",
    banner: "Banners promocionais",
    supporting: "Imagens complementares",
    other: "Outros materiais",
    decorative: "Ícones, botões e decorativos",
  };
  return GALLERY_SECTIONS.map((section) => ({
    section,
    title: titles[section],
    cards: cards.filter((card) => card.section === section),
  })).filter((group) => group.cards.length > 0);
}
