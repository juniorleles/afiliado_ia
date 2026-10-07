/**
 * Host record domain: product HTML reader.
 *
 * Copies text, addresses, and structured data the page already contains.
 * A price symbol is not a currency. This module does not request a page.
 */
export interface ProductHtmlCta {
  label: string;
  url: string | null;
}

export interface ProductHtmlRead {
  pageTitle: string | null;
  metaTitle: string | null;
  openGraphTitle: string | null;
  canonicalUrl: string | null;
  h1: string | null;
  h2s: readonly string[];
  structuredData: string | null;
  productName: string | null;
  productNameSource: string | null;
  brand: string | null;
  brandSource: string | null;
  vendor: string | null;
  vendorSource: string | null;
  price: string | null;
  priceSource: string | null;
  currency: string | null;
  currencySource: string | null;
  language: string | null;
  languageSource: string | null;
  primaryCta: ProductHtmlCta | null;
  ctaSource: string | null;
  images: readonly string[];
}

export interface ProductHtmlParser {
  read(html: string): ProductHtmlRead;
}

const IMAGE_LIMIT = 12;
const HEADING_LIMIT = 20;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => fromCode(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => fromCode(Number(`0x${hex}`)));
}

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function textOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  return match ? textOrNull(decodeEntities(match[1] ?? "")) : null;
}

function tags(html: string, tagName: string): string[] {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
}

function elementTexts(html: string, tagName: string, limit: number): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < limit) {
    const text = textOrNull(stripTags(match[1] ?? ""));
    if (text) out.push(text);
  }
  return out;
}

function fieldText(html: string, name: string): string | null {
  const match = new RegExp(`data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, "i").exec(html);
  if (!match) return null;
  return textOrNull(stripTags(match[1] ?? ""));
}

function fieldHref(html: string, name: string): string | null {
  const tag = new RegExp(`<[^>]*data-field=["']${name}["'][^>]*>`, "i").exec(html)?.[0];
  if (!tag) return null;
  return textOrNull(attr(tag, "href"));
}

function metaContent(html: string, attribute: string, value: string): string | null {
  for (const tag of tags(html, "meta")) {
    if ((attr(tag, attribute) ?? "").toLowerCase() === value.toLowerCase()) return textOrNull(attr(tag, "content"));
  }
  return null;
}

function metaContents(html: string, attribute: string, value: string): string[] {
  const out: string[] = [];
  for (const tag of tags(html, "meta")) {
    if ((attr(tag, attribute) ?? "").toLowerCase() !== value.toLowerCase()) continue;
    const content = textOrNull(attr(tag, "content"));
    if (content) out.push(content);
  }
  return out;
}

function linkHref(html: string, rel: string): string | null {
  for (const tag of tags(html, "link")) {
    const tokens = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    if (tokens.includes(rel)) return textOrNull(attr(tag, "href"));
  }
  return null;
}

function structuredBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = (match[1] ?? "").trim();
    if (text) blocks.push(text);
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeNames(value: unknown): string[] {
  if (typeof value === "string") return [value.toLowerCase()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

function isProductType(value: unknown): boolean {
  return typeNames(value).some((name) => name === "product" || name.endsWith("/product") || name === "productgroup");
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void, seen: Set<object>, depth: number): void {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, seen, depth + 1);
    return;
  }
  visit(value as Record<string, unknown>);
  for (const inner of Object.values(value as Record<string, unknown>)) walk(inner, visit, seen, depth + 1);
}

function stringOf(value: unknown): string | null {
  if (typeof value === "string") return textOrNull(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function nameOf(value: unknown): string | null {
  const direct = stringOf(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;
  return stringOf(value.name);
}

function firstOffer(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRecord(item)) return item;
    }
    return null;
  }
  return isRecord(value) ? value : null;
}

function imageUrls(value: unknown, out: string[]): void {
  if (out.length >= IMAGE_LIMIT) return;
  const direct = stringOf(value);
  if (direct) {
    out.push(direct);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) imageUrls(item, out);
    return;
  }
  if (isRecord(value)) {
    const url = stringOf(value.url) ?? stringOf(value.contentUrl);
    if (url) out.push(url);
  }
}

interface StructuredFields {
  productName: string | null;
  brand: string | null;
  vendor: string | null;
  price: string | null;
  currency: string | null;
  language: string | null;
  images: string[];
}

function readStructured(blocks: readonly string[]): StructuredFields {
  const fields: StructuredFields = {
    productName: null,
    brand: null,
    vendor: null,
    price: null,
    currency: null,
    language: null,
    images: [],
  };
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    walk(parsed, (record) => {
      if (!isProductType(record["@type"])) return;
      if (fields.productName === null) fields.productName = nameOf(record.name);
      if (fields.brand === null) fields.brand = nameOf(record.brand);
      if (fields.language === null) fields.language = stringOf(record.inLanguage);
      imageUrls(record.image, fields.images);
      const offer = firstOffer(record.offers);
      if (!offer) return;
      if (fields.price === null) fields.price = stringOf(offer.price);
      if (fields.currency === null) fields.currency = stringOf(offer.priceCurrency);
      if (fields.vendor === null) fields.vendor = nameOf(offer.seller);
    }, new Set(), 0);
  }
  return fields;
}

function currencyMark(html: string): string | null {
  const tag = /<[^>]*data-field=["']visiblePrice["'][^>]*>/i.exec(html)?.[0];
  const marked = tag ? textOrNull(attr(tag, "data-currency")) : null;
  return marked ?? fieldText(html, "currency");
}

function firstCta(html: string): ProductHtmlCta | null {
  const markedUrl = fieldHref(html, "offerUrl") ?? fieldHref(html, "cta");
  if (fieldText(html, "cta") || markedUrl) {
    const label = fieldText(html, "cta") ?? fieldText(html, "offerUrl");
    if (label || markedUrl) return { label: label ?? markedUrl ?? "", url: markedUrl };
  }
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) {
    const label = textOrNull(stripTags(match[2] ?? ""));
    if (!label) continue;
    return { label, url: attr(match[1] ?? "", "href") };
  }
  const button = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  while ((match = button.exec(html))) {
    const label = textOrNull(stripTags(match[1] ?? ""));
    if (label) return { label, url: null };
  }
  return null;
}

function pushUnique(out: string[], value: string | null): void {
  if (!value || out.length >= IMAGE_LIMIT || out.includes(value)) return;
  out.push(value);
}

function emptyRead(): ProductHtmlRead {
  return {
    pageTitle: null,
    metaTitle: null,
    openGraphTitle: null,
    canonicalUrl: null,
    h1: null,
    h2s: [],
    structuredData: null,
    productName: null,
    productNameSource: null,
    brand: null,
    brandSource: null,
    vendor: null,
    vendorSource: null,
    price: null,
    priceSource: null,
    currency: null,
    currencySource: null,
    language: null,
    languageSource: null,
    primaryCta: null,
    ctaSource: null,
    images: [],
  };
}

export function createProductHtmlParser(): ProductHtmlParser {
  return {
    read(html) {
      try {
        if (typeof html !== "string") return emptyRead();
        const blocks = structuredBlocks(html);
        const structured = readStructured(blocks);
        const markedName = fieldText(html, "productName");
        const openGraphTitle = metaContent(html, "property", "og:title");
        const h1s = elementTexts(html, "h1", 1);
        const h1 = h1s[0] ?? null;
        const productName = markedName ?? structured.productName ?? openGraphTitle ?? h1;
        const productNameSource = markedName ? "data-field" : structured.productName ? "structured-data" : openGraphTitle ? "open-graph" : h1 ? "h1" : null;
        const markedBrand = fieldText(html, "brand");
        const brand = markedBrand ?? structured.brand;
        const markedVendor = fieldText(html, "vendor");
        const vendor = markedVendor ?? structured.vendor;
        const markedPrice = fieldText(html, "visiblePrice");
        const price = markedPrice ?? structured.price;
        const markedCurrency = currencyMark(html);
        const currency = markedCurrency ?? structured.currency;
        const root = /<html\b[^>]*>/i.exec(html)?.[0] ?? "";
        const markedLanguage = textOrNull(attr(root, "lang")) ?? fieldText(html, "language");
        const language = markedLanguage ?? structured.language;
        const cta = firstCta(html);
        const images: string[] = [];
        for (const image of metaContents(html, "property", "og:image")) pushUnique(images, image);
        for (const image of structured.images) pushUnique(images, image);
        for (const tag of tags(html, "img")) pushUnique(images, attr(tag, "src"));
        return {
          pageTitle: elementTexts(html, "title", 1)[0] ?? null,
          metaTitle: metaContent(html, "name", "title"),
          openGraphTitle,
          canonicalUrl: linkHref(html, "canonical"),
          h1,
          h2s: elementTexts(html, "h2", HEADING_LIMIT),
          structuredData: blocks.length > 0 ? blocks.join("\n") : null,
          productName,
          productNameSource,
          brand,
          brandSource: markedBrand ? "data-field" : structured.brand ? "structured-data" : null,
          vendor,
          vendorSource: markedVendor ? "data-field" : structured.vendor ? "structured-data" : null,
          price,
          priceSource: markedPrice ? "data-field" : structured.price ? "structured-data" : null,
          currency,
          currencySource: markedCurrency ? "data-field" : structured.currency ? "structured-data" : null,
          language,
          languageSource: markedLanguage ? "html" : structured.language ? "structured-data" : null,
          primaryCta: cta,
          ctaSource: cta === null ? null : fieldText(html, "cta") || fieldHref(html, "offerUrl") ? "data-field" : "document",
          images,
        };
      } catch {
        return emptyRead();
      }
    },
  };
}
