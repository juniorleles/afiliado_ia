import type { DiscoveredImage, ProbableKind } from "@/lib/real-product-assets/types";

export const VISUAL_CLASSES = [
  "PRODUCT_PACKSHOT",
  "PRODUCT_GALLERY",
  "LIFESTYLE",
  "PROMOTIONAL",
  "UNSUITABLE",
] as const;
export type VisualClass = (typeof VISUAL_CLASSES)[number];

const PROMO =
  /\b(order[-_ ]?now|buy[-_ ]?now|discount|save\d|bonus|free[-_ ]?shipping|3free|credit[-_ ]?cards?|checkout|cta|btn|button|guaranteed?_badge|price|offer)\b/i;
const PACKSHOT = /\b(pack(shot)?|bottle|box|tub|pouch|sachet|jar|product[-_ ]?(shot|image)|packaging)\b/i;
const LIFESTYLE = /\b(lifestyle|in[-_ ]use|context|scene)\b/i;
const UNSUITABLE =
  /\b(doctor|testimonial|review[-_ ]?face|stars?|checkmark|check[-_ ]?mark|favicon|sprite|pixel|tracking|logo)\b/i;

export function classifyVisualClass(input: {
  url: string;
  fileName: string;
  probableKind: ProbableKind;
  policyBlock?: string | null;
  alt?: string | null;
}): VisualClass {
  const hay = `${input.url} ${input.fileName} ${input.alt ?? ""} ${input.probableKind}`;
  if (input.policyBlock || input.probableKind === "tracking" || input.probableKind === "icon" || UNSUITABLE.test(hay)) {
    return "UNSUITABLE";
  }
  if (input.probableKind === "banner" || PROMO.test(hay)) return "PROMOTIONAL";
  if (input.probableKind === "lifestyle" || LIFESTYLE.test(hay)) return "LIFESTYLE";
  if (input.probableKind === "packshot" || PACKSHOT.test(hay)) return "PRODUCT_PACKSHOT";
  if (input.probableKind === "logo") return "UNSUITABLE";
  return "PRODUCT_GALLERY";
}

export function isPromotionalVisual(image: Pick<DiscoveredImage, "url" | "fileName" | "probableKind" | "policyBlock" | "alt">): boolean {
  return classifyVisualClass(image) === "PROMOTIONAL";
}

export function isLabFixtureUrl(url: string): boolean {
  return /^lab-fixture:[\w.-]+$/.test(url);
}
