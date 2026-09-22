export const CACHE_POLICY = {
  publishedHtml: "private, no-store",
  reason: "PAGE_VIEW is recorded during render",
  productMedia: "public, max-age=86400, stale-while-revalidate=604800",
  mediaInvalidation: "content-hash filenames; replace creates a new URL",
  staticAssets: "immutable hashed /_next/static",
  admin: "no-store",
  tracking: "no-store",
  clickbankIns: "no-store",
  health: "no-store",
} as const;

export function cacheInvalidationAfter(event: "publish" | "unpublish" | "edit" | "asset-replace"): string {
  if (event === "asset-replace") return CACHE_POLICY.mediaInvalidation;
  return "HTML is no-store, so publication state is read from SQLite on the next request.";
}
