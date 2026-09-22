import { slugify } from "@/lib/slug";

export function recommendedLpPreviewPath(productName: string, candidateId: string): string {
  const slug = slugify(productName) || "product";
  return `/preview/${encodeURIComponent(slug)}/${encodeURIComponent(candidateId)}`;
}

export function recommendedLpPreviewUrl(
  productName: string,
  candidateId: string,
  origin = process.env.VISUAL_QA_BASE_URL || process.env.APP_BASE_URL || "http://localhost:3000",
): string {
  return `${origin.replace(/\/$/, "")}${recommendedLpPreviewPath(productName, candidateId)}`;
}
