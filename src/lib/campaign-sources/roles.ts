import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { classifySubmittedUrl } from "@/lib/campaign-sources/classify";

export const URL_ROLES = [
  "AFFILIATE_TRACKING_URL",
  "SELLER_INFORMATION_PAGE",
  "SALES_LANDING_PAGE",
  "CHECKOUT_OR_ORDER_PAGE",
  "AFFILIATE_RESOURCE_PAGE",
  "UNKNOWN_DESTINATION",
] as const;
export type UrlRole = (typeof URL_ROLES)[number];

const CHECKOUT_PATH =
  /\/(cart|checkout|payment|pay|billing|order-now|ordernow|buy-now|buynow|add-to-cart|place-order)(\/|$|\.)/i;
const HOP_HOST = /(^|\.)hop\.clickbank\.net$/i;
const AFFILIATE_PATH = /\/(info\/)?affiliates?(\/|$|\.)/i;
const INFO_PATH =
  /\/(info|faq|faqs|help|support|ingredients?|composition|supplement-facts|specifications?|specs|directions?|how-to|usage|guarantee|warranty|refund|returns?|shipping|about|privacy|terms|disclaim|contact)(\/|$|\.)/i;
const ATTRIBUTION_KEYS = /^(hop|hopid|tid|sid|affid|affiliateid|clickid|subid)$/i;

export type UrlRoleReport = {
  url: string;
  host: string | null;
  path: string | null;
  roles: UrlRole[];
  fetchable: boolean;
  checkout: boolean;
  historicalFixture: boolean;
  notes: string[];
};

export function isHistoricalHopFixture(raw: string): boolean {
  try {
    const hop = new URL(raw).searchParams.get("hop");
    return Boolean(hop && /^z+$/i.test(hop));
  } catch {
    return false;
  }
}

export function hasAttributionParams(raw: string): boolean {
  try {
    const url = new URL(raw);
    return [...url.searchParams.keys()].some((key) => ATTRIBUTION_KEYS.test(key));
  } catch {
    return false;
  }
}

export function classifyUrlRoles(raw: string): UrlRoleReport {
  const notes: string[] = [];
  const inspected = inspectPublicHttpsUrl(raw);
  let host: string | null = null;
  let path: string | null = null;
  const roles = new Set<UrlRole>();
  try {
    const url = new URL(raw);
    host = url.hostname.toLowerCase();
    path = url.pathname || "/";
  } catch {
    notes.push("The URL is not parseable.");
  }

  const purpose = classifySubmittedUrl(raw);
  const historicalFixture = isHistoricalHopFixture(raw);
  const checkout = Boolean(path && CHECKOUT_PATH.test(path)) || purpose.sourceStatus === "CHECKOUT_SUSPECTED";
  const trackingHost = Boolean(host && HOP_HOST.test(host));
  const attribution = hasAttributionParams(raw);

  if (trackingHost || (attribution && !historicalFixture)) roles.add("AFFILIATE_TRACKING_URL");
  if (path && AFFILIATE_PATH.test(path)) roles.add("AFFILIATE_RESOURCE_PAGE");
  if (path && INFO_PATH.test(path) && !checkout) roles.add("SELLER_INFORMATION_PAGE");
  if (checkout) {
    roles.add("CHECKOUT_OR_ORDER_PAGE");
    notes.push("Checkout or order path detected. Do not navigate, extract, or authorize.");
  } else if (purpose.sourceType === "SALES_PAGE" && purpose.fetchable && !roles.has("SELLER_INFORMATION_PAGE") && !roles.has("AFFILIATE_RESOURCE_PAGE")) {
    roles.add("SALES_LANDING_PAGE");
  }
  if (!roles.size) roles.add("UNKNOWN_DESTINATION");
  if (historicalFixture) notes.push("Historical hop fixture (hop=z+). Not the current user-provided affiliate URL.");
  if (trackingHost) notes.push("ClickBank hop hosts are tracking metadata, not research pages.");
  if (attribution && checkout) notes.push("Attribution parameters do not make a checkout path extractable.");
  if (!inspected.ok) notes.push(inspected.reason);

  return {
    url: raw,
    host,
    path,
    roles: [...roles],
    fetchable: purpose.fetchable && !checkout,
    checkout,
    historicalFixture,
    notes,
  };
}
