import type { CampaignSource, SourceType } from "@/lib/campaign-sources/types";

const CHECKOUT_PATH =
  /\/(cart|checkout|payment|pay|billing|order-now|ordernow|buy-now|buynow|add-to-cart|place-order)(\/|$|\.)/i;

export type PresentedSources = {
  salesPage: CampaignSource | null;
  affiliateResource: CampaignSource | null;
  trackingHop: CampaignSource | null;
  authorizedDestination: CampaignSource | null;
  historical: CampaignSource[];
};

function looksLikeCheckout(url: string): boolean {
  try {
    return CHECKOUT_PATH.test(new URL(url).pathname);
  } catch {
    return CHECKOUT_PATH.test(url);
  }
}

export function currentSalesUrl(sources: CampaignSource[]): string {
  const sales = sources.find((item) => {
    if (item.sourceType !== "SALES_PAGE") return false;
    if (item.sourceStatus === "CHECKOUT_SUSPECTED" || looksLikeCheckout(item.originalUrl)) return false;
    return /^https?:\/\//i.test(item.originalUrl);
  });
  return sales?.originalUrl ?? "";
}

function sameUrl(left: string, right: string): boolean {
  return left.replace(/\/$/, "") === right.replace(/\/$/, "");
}

function currentOf(sources: CampaignSource[], type: SourceType): CampaignSource | null {
  if (type === "SALES_PAGE") {
    const url = currentSalesUrl(sources);
    return sources.find((item) => item.sourceType === "SALES_PAGE" && sameUrl(item.originalUrl, url)) ?? null;
  }
  return sources.find((item) => item.sourceType === type && item.sourceStatus !== "CHECKOUT_SUSPECTED") ?? null;
}

export function presentCampaignSources(sources: CampaignSource[]): PresentedSources {
  const salesPage = currentOf(sources, "SALES_PAGE");
  const affiliateResource = currentOf(sources, "AFFILIATE_RESOURCE");
  const trackingHop = currentOf(sources, "TRACKING_HOPLINK");
  const authorizedDestination = currentOf(sources, "AUTHORIZED_DESTINATION");
  const currentIds = new Set(
    [salesPage, affiliateResource, trackingHop, authorizedDestination].filter(Boolean).map((item) => item!.sourceId),
  );
  return {
    salesPage,
    affiliateResource,
    trackingHop,
    authorizedDestination,
    historical: sources.filter((item) => !currentIds.has(item.sourceId) || item.sourceStatus === "CHECKOUT_SUSPECTED"),
  };
}

export function currentSourceStatus(sources: CampaignSource[], type: SourceType): string {
  const current = currentOf(sources, type);
  if (current) return current.sourceStatus;
  return "NOT_CHECKED";
}

export function isHistoricalCheckout(source: CampaignSource): boolean {
  return source.sourceStatus === "CHECKOUT_SUSPECTED" || looksLikeCheckout(source.originalUrl);
}
