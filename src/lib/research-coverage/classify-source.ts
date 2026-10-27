import { cleanHtmlText } from "@/lib/source-html";
import type { PublisherIdentity, SourceClass, SourceRelation } from "@/lib/research-coverage/types";

const MARKETPLACE_HOST = /(^|\.)(amazon|amzn|ebay|walmart|etsy|aliexpress|mercadolivre|mercadolibre)\./i;
const INDEPENDENT_HOST = /(^|\.)(edu|gov)$|(wikipedia\.org|nih\.gov|pubmed\.ncbi|who\.int|ftc\.gov)/i;
const AFFILIATE_HOST = /(hop\.clickbank\.net|clickbank\.net|digistore24|jvzoo|warriorplus)/i;
const AFFILIATE_QUERY = /(?:\?|&)(hop|hopid|tid|aff|affiliate|clickid)=/i;
const AFFILIATE_COPY =
  /\b(epc|top affiliates|autoship|copywriters?|vsl crafted|massive income|a-list copy)\b/i;
const REVIEW_PATH = /\/(reviews?|testimonials?)(\/|$)/i;
const POLICY_PATH = /\/(faq|help|support|returns?|refund|shipping|privacy|terms|guarantee|warranty)(\/|$|\.)/i;
const AFFILIATE_PAGE = /\/(info\/)?affiliates?(\/|$|\.)/i;
const OFFICIAL_TITLE = /\bofficial (?:web)?site\b/i;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function meta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (a?.[1]) return cleanHtmlText(a[1]);
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"));
  return b?.[1] ? cleanHtmlText(b[1]) : null;
}

function titleOf(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? cleanHtmlText(match[1]) : null;
}

function jsonLdNames(html: string): string[] {
  const names: string[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1] ?? "null") as unknown;
      const stack = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of stack) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const graph = Array.isArray(row["@graph"]) ? row["@graph"] : [];
        for (const node of [row, ...graph]) {
          if (!node || typeof node !== "object") continue;
          const rec = node as Record<string, unknown>;
          const type = String(rec["@type"] ?? "");
          if (/Organization|Brand|WebSite/i.test(type) && typeof rec.name === "string") names.push(rec.name.trim());
        }
      }
    } catch {
      /* malformed JSON-LD is not identity evidence */
    }
  }
  return names.filter(Boolean);
}

export function classifySourceClass(input: {
  url: string;
  html?: string;
  pageCategory?: string;
}): { sourceClass: SourceClass; relation: SourceRelation; publisher: PublisherIdentity; notes: string[] } {
  const url = input.url;
  const html = input.html ?? "";
  const host = hostnameOf(url) ?? "";
  const title = html ? titleOf(html) : null;
  const siteName = html ? meta(html, "og:site_name") : null;
  const organizations = html ? jsonLdNames(html) : [];
  const notes: string[] = [];
  const signals: string[] = [];

  const hop = AFFILIATE_HOST.test(host) || AFFILIATE_QUERY.test(url) || /hopid/i.test(url);
  const affiliatePage = AFFILIATE_PAGE.test(url);
  const affiliateCopy = Boolean(html && AFFILIATE_COPY.test(html));
  const marketplace = MARKETPLACE_HOST.test(host);
  const independent = INDEPENDENT_HOST.test(host);
  const review = REVIEW_PATH.test(url) || /\/reviews?/i.test(url) || Boolean(html && /\bverified buyer|★★|testimonial\b/i.test(html) && /review/i.test(url));
  const policy = POLICY_PATH.test(url) || /RETURNS|SHIPPING|FAQ|TERMS|PRIVACY/i.test(input.pageCategory ?? "");
  const officialTitle = Boolean(title && OFFICIAL_TITLE.test(title));
  if (officialTitle) notes.push("An 'Official Website' title is not treated as manufacturer identity by itself.");

  let sourceClass: SourceClass = "UNKNOWN";
  if (hop || affiliateCopy || affiliatePage) {
    sourceClass = "AFFILIATE_RESOURCE";
    signals.push(hop ? "affiliate-hop-or-query" : affiliatePage ? "affiliate-resource-path" : "affiliate-program-copy");
    if (affiliatePage) notes.push("An affiliate-resource page is not independent evidence of health claims.");
  } else if (marketplace) {
    sourceClass = "MARKETPLACE";
    signals.push("marketplace-host");
  } else if (independent) {
    sourceClass = "INDEPENDENT_REFERENCE";
    signals.push("independent-host");
  } else if (review) {
    sourceClass = "REVIEW_OR_TESTIMONIAL";
    signals.push("review-path-or-widget");
  } else if (organizations.length && policy && !/\b(buy now|order now|add to cart)\b/i.test(html)) {
    sourceClass = "MANUFACTURER_OR_BRAND";
    signals.push("organization-jsonld-and-policy");
  } else if (/\b(add to cart|checkout|your cart)\b/i.test(html) && !hop) {
    sourceClass = "SELLER";
    signals.push("checkout-language");
  } else if (/\/help\//i.test(url) && !independent && !marketplace) {
    sourceClass = "AFFILIATE_RESOURCE";
    signals.push("help-page-on-sales-domain");
    notes.push("A help page on a sales domain is not an independent reference.");
  }

  let relation: SourceRelation = "UNKNOWN";
  if (sourceClass === "AFFILIATE_RESOURCE") relation = "AFFILIATE_SALES";
  else if (sourceClass === "INDEPENDENT_REFERENCE") relation = "INDEPENDENT_MENTION";
  else if (policy) relation = "SUPPORTING_POLICY";
  else if (sourceClass === "SELLER" || sourceClass === "MANUFACTURER_OR_BRAND" || sourceClass === "MARKETPLACE") {
    relation = "PRIMARY_PRODUCT_PAGE";
  }

  const confidence: PublisherIdentity["confidence"] =
    signals.length >= 2 ? "HIGH" : signals.length === 1 ? "MEDIUM" : "LOW";

  return {
    sourceClass,
    relation,
    publisher: {
      siteName: siteName || organizations[0] || null,
      organization: organizations[0] ?? null,
      title,
      confidence,
    },
    notes,
  };
}

export function domainOf(url: string): string | null {
  return hostnameOf(url);
}
