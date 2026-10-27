import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import type { SourceStatus, SourceType } from "@/lib/campaign-sources/types";

const CHECKOUT_PATH =
  /\/(cart|checkout|payment|pay|billing|order-now|ordernow|buy-now|buynow|add-to-cart|place-order)(\/|$|\.)/i;
const HOP_HOST = /(^|\.)hop\.clickbank\.net$/i;
const AFFILIATE_PATH = /\/(info\/)?affiliates?(\/|$|\.)/i;
const HELP_AFFILIATE = /\/help\/(affiliates?|publishers?|partners?)(\/|$|\.)/i;
const MANUFACTURER_HINT = /\/(manufacturer|official-site|brand)(\/|$)/i;

export type UrlPurpose = {
  sourceType: SourceType;
  sourceStatus: SourceStatus;
  fetchable: boolean;
  notes: string[];
};

export function sanitizeSharedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(hop|hopid|tid|sid|affid|affiliateid|clickid|subid)$/i.test(key)) {
        url.searchParams.set(key, "REDACTED");
      }
    }
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

export function classifySubmittedUrl(raw: string, declared?: SourceType): UrlPurpose {
  const notes: string[] = [];
  const inspected = inspectPublicHttpsUrl(raw);
  if (!inspected.ok) {
    return {
      sourceType: declared ?? "OTHER",
      sourceStatus: "BLOCKED",
      fetchable: false,
      notes: [inspected.reason],
    };
  }
  const url = inspected.url;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (HOP_HOST.test(host) || (declared === "TRACKING_HOPLINK" && /hopid|hop=/i.test(url.search))) {
    notes.push("Tracking hop is not a research page and is not a commercial authorization.");
    return { sourceType: "TRACKING_HOPLINK", sourceStatus: "RESTRICTED", fetchable: false, notes };
  }

  if (CHECKOUT_PATH.test(path)) {
    notes.push("Checkout or order path detected. Do not navigate, extract, or authorize.");
    return { sourceType: declared ?? "OTHER", sourceStatus: "CHECKOUT_SUSPECTED", fetchable: false, notes };
  }

  if (declared === "AUTHORIZED_DESTINATION") {
    notes.push("Operator-declared destination remains unverified until commercial authorization review.");
    return { sourceType: "AUTHORIZED_DESTINATION", sourceStatus: "REVIEW_REQUIRED", fetchable: false, notes };
  }

  if (declared === "TRACKING_HOPLINK") {
    notes.push("Operator-declared hop is metadata only.");
    return { sourceType: "TRACKING_HOPLINK", sourceStatus: "RESTRICTED", fetchable: false, notes };
  }

  if (declared === "AFFILIATE_RESOURCE" || AFFILIATE_PATH.test(path) || HELP_AFFILIATE.test(path)) {
    notes.push("Affiliate-resource candidate. Classification depends on observed content.");
    return { sourceType: "AFFILIATE_RESOURCE", sourceStatus: "NOT_CHECKED", fetchable: true, notes };
  }

  if (declared === "MANUFACTURER_RESOURCE" || MANUFACTURER_HINT.test(path)) {
    notes.push("Manufacturer label is not inferred from a product name in the hostname.");
    return { sourceType: declared ?? "OTHER", sourceStatus: "REVIEW_REQUIRED", fetchable: true, notes };
  }

  return {
    sourceType: declared ?? "SALES_PAGE",
    sourceStatus: "NOT_CHECKED",
    fetchable: true,
    notes,
  };
}

export function isCheckoutSuspectedUrl(raw: string): boolean {
  return classifySubmittedUrl(raw).sourceStatus === "CHECKOUT_SUSPECTED";
}

export function isTrackingHopUrl(raw: string): boolean {
  return classifySubmittedUrl(raw).sourceType === "TRACKING_HOPLINK";
}
