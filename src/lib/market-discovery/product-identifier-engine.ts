/**
 * Host record domain: product identifier engine.
 *
 * Reads identity fields and page evidence that the landing page already
 * shows. A price symbol is not a currency. Structured data is stored as
 * text and is not used to fill the identity. Confidence inputs record which
 * fields were present. This module does not request a page and does not
 * choose an order.
 */
import type { ConfidenceInputs, IdentificationEvidence, ProductIdentity, ProductIssue } from "./product-types";

export interface ProductEngineRead {
  identity: Omit<ProductIdentity, "landingPageId"> | null;
  evidence: Omit<IdentificationEvidence, "landingPageId">;
  confidenceInputs: ConfidenceInputs;
  issues: ProductIssue[];
}

export interface ProductIdentifierEngine {
  read(html: string): ProductEngineRead;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, "i").exec(tag);
  return match ? decodeEntities(match[1] ?? "") : null;
}

function textOrNull(value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function fieldText(html: string, name: string): string | null {
  const match = new RegExp(`data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, "i").exec(html);
  if (!match) return null;
  return textOrNull(stripTags(match[1] ?? ""));
}

function fieldTexts(html: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = textOrNull(stripTags(match[1] ?? ""));
    if (text) out.push(text);
  }
  return out;
}

function fieldHref(html: string, name: string): string | null {
  const tag = new RegExp(`<[^>]*data-field=["']${name}["'][^>]*>`, "i").exec(html)?.[0];
  if (!tag) return null;
  return textOrNull(attr(tag, "href"));
}

function elementText(html: string, tagName: string): string | null {
  const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(html);
  if (!match) return null;
  return textOrNull(stripTags(match[1] ?? ""));
}

function tags(html: string, tagName: string): string[] {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
}

function metaContent(html: string, attribute: string, value: string): string | null {
  for (const tag of tags(html, "meta")) {
    if ((attr(tag, attribute) ?? "").toLowerCase() === value.toLowerCase()) return textOrNull(attr(tag, "content"));
  }
  return null;
}

function linkHref(html: string, rel: string): string | null {
  for (const tag of tags(html, "link")) {
    if ((attr(tag, "rel") ?? "").toLowerCase() === rel) return textOrNull(attr(tag, "href"));
  }
  return null;
}

function structuredData(html: string): string | null {
  const blocks: string[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = (match[1] ?? "").trim();
    if (text) blocks.push(text);
  }
  return blocks.length > 0 ? blocks.join("\n") : null;
}

function languageOf(html: string): string | null {
  const root = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
  return textOrNull(attr(root, "lang")) ?? fieldText(html, "language");
}

function currencyOf(html: string): string | null {
  const tag = /<[^>]*data-field=["']visiblePrice["'][^>]*>/i.exec(html)?.[0];
  const marked = tag ? textOrNull(attr(tag, "data-currency")) : null;
  return marked ?? fieldText(html, "currency");
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return textOrNull(new URL(url).hostname);
  } catch {
    return null;
  }
}

function present(value: string | null): boolean {
  return value !== null;
}

export function createProductIdentifierEngine(): ProductIdentifierEngine {
  return {
    read(html) {
      const htmlTitle = elementText(html, "title");
      const h1 = elementText(html, "h1");
      const data = structuredData(html);
      const visibleProductName = fieldText(html, "productName");
      const visibleBrand = fieldText(html, "brand");
      const visiblePrice = fieldText(html, "visiblePrice");
      const evidence: Omit<IdentificationEvidence, "landingPageId"> = {
        htmlTitle,
        metaTitle: metaContent(html, "name", "title"),
        openGraphTitle: metaContent(html, "property", "og:title"),
        h1,
        canonicalUrl: linkHref(html, "canonical"),
        structuredData: data,
        visibleProductName,
        visibleBrand,
        visibleCtas: fieldTexts(html, "cta"),
        visiblePrice,
        brandMentions: fieldTexts(html, "brandMention"),
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
      };
      const offerUrl = fieldHref(html, "offerUrl");
      const vendor = fieldText(html, "vendor");
      const primaryDomain = fieldText(html, "primaryDomain") ?? hostOf(offerUrl) ?? hostOf(evidence.canonicalUrl);
      const category = fieldText(html, "category");
      const language = languageOf(html);
      const currency = currencyOf(html);
      const identity = visibleProductName === null ? null : {
        productName: visibleProductName,
        brand: visibleBrand,
        vendor,
        primaryOffer: fieldText(html, "primaryOffer"),
        primaryDomain,
        offerUrl,
        category,
        language,
        visiblePrice,
        currency,
        origin: "OBSERVED" as const,
        provenance: "DIRECT_SOURCE" as const,
      };
      const confidenceInputs: ConfidenceInputs = {
        productName: present(visibleProductName),
        brand: present(visibleBrand),
        vendor: present(vendor),
        primaryDomain: present(primaryDomain),
        offerUrl: present(offerUrl),
        category: present(category),
        language: present(language),
        price: present(visiblePrice),
        currency: present(currency),
        htmlTitle: present(htmlTitle),
        h1: present(h1),
        structuredData: present(data),
      };
      if (identity === null) {
        return {
          identity: null,
          evidence,
          confidenceInputs,
          issues: [{ field: "productName", message: "Missing Product Evidence: a product name shown on the page is required." }],
        };
      }
      return { identity, evidence, confidenceInputs, issues: [] };
    },
  };
}
