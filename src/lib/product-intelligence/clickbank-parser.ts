/**
 * Host record domain: ClickBank marketplace parser.
 *
 * Reads raw marketplace HTML (and JSON inside it) and restates labeled
 * fields. It never fetches a page, never invents a missing field, and never
 * judges a marketplace figure. This layer stays offline.
 */
import type { ClickBankExtractedRecord, ClickBankIssue } from "./clickbank-types";

export interface ClickBankParser {
  parse(input: unknown): { record: ClickBankExtractedRecord; issues: ClickBankIssue[] };
}

const FIELD_ALIASES: Record<string, keyof ClickBankExtractedRecord> = {
  productname: "productName",
  name: "productName",
  product: "productName",
  vendor: "vendor",
  vendorname: "vendor",
  vendorid: "vendorId",
  category: "category",
  gravity: "gravity",
  initialsale: "initialSale",
  initial$sale: "initialSale",
  averagesale: "averageSale",
  avg$sale: "averageSale",
  avgsale: "averageSale",
  averagerebill: "averageRebill",
  avg$rebill: "averageRebill",
  avgrebill: "averageRebill",
  commissiontype: "commissionType",
  commission: "commissionType",
  language: "language",
  marketplaceurl: "marketplaceUrl",
  marketplace: "marketplaceUrl",
  affiliatepage: "affiliatePage",
  affiliate: "affiliatePage",
  hop: "affiliatePage",
  supporturl: "supportUrl",
  support: "supportUrl",
  refundpolicy: "refundPolicy",
  refund: "refundPolicy",
  guarantee: "refundPolicy",
  description: "description",
  disclaimer: "disclaimer",
  affiliateresources: "affiliateResources",
  resources: "affiliateResources",
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function emptyRecord(): ClickBankExtractedRecord {
  return {
    productName: null,
    vendor: null,
    vendorId: null,
    category: null,
    gravity: null,
    initialSale: null,
    averageSale: null,
    averageRebill: null,
    commissionType: null,
    language: null,
    marketplaceUrl: null,
    affiliatePage: null,
    supportUrl: null,
    refundPolicy: null,
    affiliateResources: [],
    description: null,
    disclaimer: null,
  };
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

function keyOf(label: string): keyof ClickBankExtractedRecord | null {
  const compact = label.toLowerCase().replace(/[^a-z0-9$]/g, "");
  return FIELD_ALIASES[compact] ?? null;
}

function asText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "") return decodeEntities(value.trim());
  return null;
}

function assign(record: ClickBankExtractedRecord, field: keyof ClickBankExtractedRecord, value: unknown): void {
  if (field === "affiliateResources") {
    if (Array.isArray(value)) {
      const items = value.map((item) => asText(item)).filter((item): item is string => item !== null);
      if (items.length > 0) record.affiliateResources = items;
      return;
    }
    const text = asText(value);
    if (text) record.affiliateResources = text.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
    return;
  }
  const text = asText(value);
  if (text && record[field] == null) (record as unknown as Record<string, unknown>)[field] = text;
}

function applyObject(record: ClickBankExtractedRecord, value: unknown): void {
  if (!isPlainRecord(value)) return;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const field = keyOf(rawKey);
    if (field) assign(record, field, rawValue);
  }
}

function parseJsonBlobs(html: string, record: ClickBankExtractedRecord): void {
  const trimmed = html.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      applyObject(record, JSON.parse(trimmed) as unknown);
    } catch {
      /* not JSON */
    }
  }
  const script = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = script.exec(html))) {
    try {
      applyObject(record, JSON.parse(match[1] ?? "") as unknown);
    } catch {
      /* skip malformed json */
    }
  }
}

function parseDataFields(html: string, record: ClickBankExtractedRecord): void {
  const attr = /data-field=["']([^"']+)["'][^>]*>([\s\S]*?)<\//gi;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(html))) {
    const field = keyOf(match[1] ?? "");
    if (field) assign(record, field, stripTags(match[2] ?? ""));
  }
  const named = /data-([a-zA-Z][a-zA-Z0-9-]*)=["']([^"']+)["']/g;
  while ((match = named.exec(html))) {
    const field = keyOf((match[1] ?? "").replace(/-/g, ""));
    if (field) assign(record, field, match[2]);
  }
}

function parseLabeledPairs(html: string, record: ClickBankExtractedRecord): void {
  const dt = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let match: RegExpExecArray | null;
  while ((match = dt.exec(html))) {
    const field = keyOf(stripTags(match[1] ?? ""));
    if (field) assign(record, field, stripTags(match[2] ?? ""));
  }
  const th = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  while ((match = th.exec(html))) {
    const field = keyOf(stripTags(match[1] ?? ""));
    if (field) assign(record, field, stripTags(match[2] ?? ""));
  }
  const li = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const resources: string[] = [];
  while ((match = li.exec(html))) {
    const href = /href=["']([^"']+)["']/.exec(match[1] ?? "");
    if (href?.[1] && /resource|affiliate/i.test(match[1] ?? "")) resources.push(href[1]);
  }
  if (resources.length > 0 && record.affiliateResources.length === 0) record.affiliateResources = resources;
}

export function createClickBankParser(): ClickBankParser {
  return {
    parse(input) {
      const record = emptyRecord();
      const issues: ClickBankIssue[] = [];
      if (!isPlainRecord(input)) {
        return { record, issues: [{ field: "rawHtml", message: "Missing Product: marketplace HTML is required." }] };
      }
      const html = typeof input.rawHtml === "string" ? input.rawHtml : "";
      parseJsonBlobs(html, record);
      parseDataFields(html, record);
      parseLabeledPairs(html, record);
      if (typeof input.marketplaceUrl === "string" && record.marketplaceUrl == null) record.marketplaceUrl = input.marketplaceUrl.trim();
      return { record, issues };
    },
  };
}
