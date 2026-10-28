import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { classifySubmittedUrl, sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { classifyUrlRoles } from "@/lib/campaign-sources/roles";
import {
  publicAffiliateView,
  readUserProvidedAffiliateUrl,
  type UserProvidedAffiliateRecord,
} from "@/lib/campaign-sources/user-provided";

export const PRIMARY_AFFILIATE_LANDING_PAGE = "PRIMARY_AFFILIATE_LANDING_PAGE" as const;
export type PrimaryAffiliatePageKind = typeof PRIMARY_AFFILIATE_LANDING_PAGE;

export const SOURCE_PRIORITY = {
  PRIMARY_AFFILIATE_LANDING_PAGE: 1,
  LINKED_COMMERCIAL_MATERIAL: 2,
  OTHER_RELIABLE_SOURCE: 3,
} as const;
export type SourcePriorityLevel = (typeof SOURCE_PRIORITY)[keyof typeof SOURCE_PRIORITY];

const HOP_HOST = /(^|\.)hop\.clickbank\.net$/i;
const CHECKOUT_PATH =
  /\/(cart|checkout|payment|pay|billing|order-now|ordernow|buy-now|buynow|add-to-cart|place-order)(\/|$|\.)/i;
const INFO_PATH =
  /\/(info|faq|faqs|help|support|ingredients?|guarantee|refund|returns?|shipping|about|privacy|terms)(\/|$|\.)/i;

export type PrimaryAffiliatePage = {
  kind: PrimaryAffiliatePageKind;
  campaignId: number;
  publicUrl: string;
  host: string;
  path: string;
  checkoutPathSuspected: boolean;
  trackingHop: boolean;
  readAllowed: boolean;
  transactionalActionsBlocked: true;
  commerciallyAuthorized: false;
  usedAsActiveCta: false;
  verificationStatus: "UNVERIFIED";
  notes: string[];
};

export function landingPageKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    const path = (url.pathname || "/").replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.hostname.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

export function sameLandingPage(left: string, right: string): boolean {
  const a = landingPageKey(left);
  const b = landingPageKey(right);
  return Boolean(a && b && a === b);
}

export function publicLandingUrl(raw: string): string {
  const cleaned = sanitizeSharedUrl(raw);
  try {
    const url = new URL(cleaned);
    if (HOP_HOST.test(url.hostname)) return "https://hop.clickbank.net/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return cleaned;
  }
}

export function isTrackingHopHost(raw: string): boolean {
  try {
    return HOP_HOST.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function primaryAffiliatePageOf(
  record: UserProvidedAffiliateRecord | null,
): PrimaryAffiliatePage | null {
  if (!record) return null;
  const roles = classifyUrlRoles(record.originalUrl);
  const purpose = classifySubmittedUrl(record.originalUrl);
  const ssrf = inspectPublicHttpsUrl(record.originalUrl);
  const trackingHop = isTrackingHopHost(record.originalUrl);
  const checkoutPathSuspected = Boolean(roles.checkout || CHECKOUT_PATH.test(record.path));
  const notes = [
    "PRIMARY_AFFILIATE_LANDING_PAGE is the user-provided commercial URL.",
    "Read access is not commercial authorization and is not a public CTA.",
    "Transactional clicks, checkout, and payment remain blocked.",
    trackingHop ? "ClickBank hop hosts are tracking metadata, not product pages." : "",
    checkoutPathSuspected
      ? "The path looks like an order page. Content may be read; buy/checkout actions stay blocked."
      : "",
    ssrf.ok ? "" : ssrf.reason,
    ...purpose.notes,
  ].filter(Boolean);
  const readAllowed = ssrf.ok && !trackingHop;
  return {
    kind: PRIMARY_AFFILIATE_LANDING_PAGE,
    campaignId: record.campaignId,
    publicUrl: record.publicUrl,
    host: record.host,
    path: record.path,
    checkoutPathSuspected,
    trackingHop,
    readAllowed,
    transactionalActionsBlocked: true,
    commerciallyAuthorized: false,
    usedAsActiveCta: false,
    verificationStatus: "UNVERIFIED",
    notes,
  };
}

export function readPrimaryAffiliatePage(campaignId: number): PrimaryAffiliatePage | null {
  return primaryAffiliatePageOf(readUserProvidedAffiliateUrl(campaignId));
}

export function publicPrimaryAffiliateView(campaignId: number) {
  const record = readUserProvidedAffiliateUrl(campaignId);
  const page = primaryAffiliatePageOf(record);
  if (!record || !page) return null;
  const published = publicAffiliateView(record);
  return {
    ...page,
    publicUrl: published.originalUrl,
    attribution: published.attribution,
  };
}

export function isRegisteredPrimaryUrl(campaignId: number, raw: string): boolean {
  const record = readUserProvidedAffiliateUrl(campaignId);
  if (!record) return false;
  return sameLandingPage(record.originalUrl, raw);
}

export function isPrimaryAffiliateReadAllowed(campaignId: number, raw: string): boolean {
  const page = readPrimaryAffiliatePage(campaignId);
  if (!page?.readAllowed) return false;
  return isRegisteredPrimaryUrl(campaignId, raw);
}

export function sourcePriorityOf(input: {
  url: string;
  campaignId?: number;
  linkedCommercial?: boolean;
}): SourcePriorityLevel {
  if (input.campaignId != null && isRegisteredPrimaryUrl(input.campaignId, input.url)) {
    return SOURCE_PRIORITY.PRIMARY_AFFILIATE_LANDING_PAGE;
  }
  if (input.linkedCommercial) return SOURCE_PRIORITY.LINKED_COMMERCIAL_MATERIAL;
  try {
    const path = new URL(input.url).pathname.toLowerCase();
    if (INFO_PATH.test(path) && !CHECKOUT_PATH.test(path)) return SOURCE_PRIORITY.LINKED_COMMERCIAL_MATERIAL;
  } catch {
    /* ignore */
  }
  return SOURCE_PRIORITY.OTHER_RELIABLE_SOURCE;
}

export function secondaryResearchAllowed(input: {
  primaryProcessed: boolean;
  primaryReadAttempted: boolean;
  missingFields?: string[];
}): { allowed: boolean; reason: string } {
  if (!input.primaryReadAttempted) {
    return { allowed: false, reason: "Secondary research waits until the primary affiliate page is attempted." };
  }
  if (!input.primaryProcessed) {
    return {
      allowed: true,
      reason: "Primary page access was limited. Secondary sources may fill documented gaps only.",
    };
  }
  if (input.missingFields && input.missingFields.length === 0) {
    return { allowed: false, reason: "Primary inventory is complete for accessible fields. Secondary research is not required yet." };
  }
  return {
    allowed: true,
    reason: "Secondary sources may be used only for missing information, contradictions, or identity evidence.",
  };
}

export function redactPrivateUrlText(value: string): string {
  return value
    .replace(/([?&](?:hop|hopid|tid|sid|affid|affiliateid|clickid|subid)=)[^&\s"]+/gi, "$1REDACTED")
    .replace(/https?:\/\/[^\s"]+/g, (url) => sanitizeSharedUrl(url));
}
