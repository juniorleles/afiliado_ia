import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { DiscoveredImage } from "@/lib/real-product-assets/types";
import { classifyVisualClass } from "@/lib/real-product-assets/visual-class";
import { catalogDir } from "@/lib/real-product-assets/store";
import type { PresellMode } from "@/lib/search-intent/types";

export const CONTEXTUAL_FITS = [
  "EDITORIAL_SAFE",
  "COMMERCIAL_PROMOTIONAL",
  "REQUIRES_CLAIM_REVIEW",
  "UNSUITABLE",
] as const;
export type ContextualFit = (typeof CONTEXTUAL_FITS)[number];

export type ContextReview = {
  imageId: string;
  fit: ContextualFit;
  observedClaims: string[];
  recordedAt: string;
  actor: string;
  note?: string;
};

export type ContextReviewFile = {
  productKey: string;
  reviews: ContextReview[];
};

const COMMERCIAL_CLAIM =
  /\b(best[-_ ]?value|buy[-_ ]?now|order[-_ ]?now|%\s*off|save\d|bonus|free[-_ ]?shipping|3free|discount)\b/i;
const CLAIM_REVIEW = /\b(badge|seal|burst|guaranteed|clinically|bestseller|#1|number[-_ ]?one)\b/i;

export function contextReviewPath(productKey: string, root?: string): string {
  return path.join(catalogDir(productKey, root), "context-reviews.json");
}

export function readContextReviews(productKey: string, root?: string): ContextReview[] {
  const file = contextReviewPath(productKey, root);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ContextReviewFile;
    return Array.isArray(parsed.reviews) ? parsed.reviews : [];
  } catch {
    return [];
  }
}

export function writeContextReviews(productKey: string, reviews: ContextReview[], root?: string): void {
  const dir = catalogDir(productKey, root);
  mkdirSync(dir, { recursive: true });
  const body: ContextReviewFile = { productKey, reviews };
  writeFileSync(contextReviewPath(productKey, root), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export function classifyContextualFit(
  image: Pick<DiscoveredImage, "id" | "url" | "fileName" | "probableKind" | "policyBlock" | "alt">,
  review?: ContextReview | null,
): ContextualFit {
  const visual = classifyVisualClass(image);
  if (visual === "UNSUITABLE" || image.policyBlock) return "UNSUITABLE";
  if (visual === "PROMOTIONAL") return "COMMERCIAL_PROMOTIONAL";
  if (review?.fit && (CONTEXTUAL_FITS as readonly string[]).includes(review.fit)) return review.fit;
  const hay = `${image.url} ${image.fileName} ${image.alt ?? ""} ${(review?.observedClaims ?? []).join(" ")}`;
  if (COMMERCIAL_CLAIM.test(hay)) return "COMMERCIAL_PROMOTIONAL";
  if (CLAIM_REVIEW.test(hay)) return "REQUIRES_CLAIM_REVIEW";
  return "EDITORIAL_SAFE";
}

export function galleryAllowedForContext(fit: ContextualFit, mode: PresellMode): boolean {
  if (fit === "EDITORIAL_SAFE") return true;
  if (fit === "UNSUITABLE" || fit === "COMMERCIAL_PROMOTIONAL") return false;
  return mode === "PRESELL_BOFU" && fit === "REQUIRES_CLAIM_REVIEW";
}

export function reviewFor(imageId: string, reviews: ContextReview[]): ContextReview | undefined {
  return [...reviews].reverse().find((item) => item.imageId === imageId);
}
