/**
 * Host record domain: SearchApi normalizer validator.
 *
 * Accepts a provider response and rejects a broken envelope, a missing search
 * metadata block, a broken ad list, a broken organic list, or a snapshot that
 * cannot become a search snapshot. It does not change what it is given.
 */
import { PROVIDER_RESPONSE_KEYS, SEARCHAPI_PROVIDER_NAME, SEARCHAPI_SNAPSHOT_KEYS } from "../search-provider/searchapi-types";
import type { FlatRecord, NormalizerIssue } from "./searchapi-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const LANGUAGE = /^[a-z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const MARKET = /^[a-z][a-z0-9-]*$/;
const DEVICES = ["desktop", "mobile", "tablet"] as const;
const TEXT_KEYS = [
  "title",
  "link",
  "snippet",
  "source",
  "domain",
  "displayed_link",
  "tracking_link",
  "block_position",
  "date",
  "seller",
  "product_link",
  "price",
  "original_price",
  "delivery",
  "deal",
  "favicon",
  "thumbnail",
  "image",
  "product_id",
  "product_token",
  "advertiser_info_token",
] as const;
const NUMBER_KEYS = ["extracted_price", "extracted_original_price", "rating", "reviews", "seller_rating"] as const;

export interface NormalizerView {
  snapshotId: string;
  keyword: string;
  country: string;
  language: string;
  device: (typeof DEVICES)[number];
  market: string;
  collectedAt: string;
  searchUrl: string;
  searchOptions: Record<string, string>;
  raw: Record<string, unknown>;
  organic: Record<string, unknown>[];
  ads: Record<string, unknown>[];
  shoppingAds: Record<string, unknown>[];
  inlineShopping: Record<string, unknown>[];
  executionMetadata: FlatRecord;
}

export interface SearchApiNormalizerValidator {
  validate(input: unknown): { issues: NormalizerIssue[]; view: NormalizerView | null };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFlat(value: unknown): value is FlatRecord {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && (inner === null || typeof inner === "string" || typeof inner === "boolean" || (typeof inner === "number" && Number.isFinite(inner))));
}

function malformed(message: string): NormalizerIssue {
  return { field: "providerResponse", message: `Malformed Provider Response: ${message}` };
}

function invalidSnapshot(message: string): NormalizerIssue {
  return { field: "snapshot", message: `Invalid Provider Snapshot: ${message}` };
}

function itemIssues(items: readonly Record<string, unknown>[], label: "Malformed Ads" | "Malformed Organic Results"): NormalizerIssue[] {
  const issues: NormalizerIssue[] = [];
  items.forEach((item, index) => {
    for (const key of TEXT_KEYS) {
      if (key in item && item[key] !== null && typeof item[key] !== "string") {
        issues.push({ field: `${label}.${index}.${key}`, message: `${label}: "${key}" must be text or null.` });
      }
    }
    for (const key of NUMBER_KEYS) {
      if (key in item && item[key] !== null && (typeof item[key] !== "number" || !Number.isFinite(item[key]))) {
        issues.push({ field: `${label}.${index}.${key}`, message: `${label}: "${key}" must be a finite number or null.` });
      }
    }
    if ("position" in item && item.position !== null && (typeof item.position !== "number" || !Number.isInteger(item.position) || item.position < 1)) {
      issues.push({ field: `${label}.${index}.position`, message: `${label}: position must be an integer of 1 or more, or null.` });
    }
  });
  return issues;
}

function readList(raw: Record<string, unknown>, key: string, label: "Malformed Ads" | "Malformed Organic Results", required: boolean): { issues: NormalizerIssue[]; items: Record<string, unknown>[] } {
  if (!(key in raw) || raw[key] === undefined) {
    if (!required) return { issues: [], items: [] };
    return { issues: [{ field: key, message: `${label}: ${key} must be a list.` }], items: [] };
  }
  if (!Array.isArray(raw[key])) return { issues: [{ field: key, message: `${label}: ${key} must be a list.` }], items: [] };
  const issues: NormalizerIssue[] = [];
  const items: Record<string, unknown>[] = [];
  raw[key].forEach((item, index) => {
    if (!isPlainRecord(item)) {
      issues.push({ field: `${key}.${index}`, message: `${label}: a list item must be a plain record.` });
      return;
    }
    items.push(item);
  });
  issues.push(...itemIssues(items, label));
  return { issues, items };
}

export function createSearchApiNormalizerValidator(): SearchApiNormalizerValidator {
  function validate(input: unknown): { issues: NormalizerIssue[]; view: NormalizerView | null } {
    if (!isPlainRecord(input)) return { issues: [malformed("a provider response is required.")], view: null };
    const issues: NormalizerIssue[] = [];
    for (const key of PROVIDER_RESPONSE_KEYS) {
      if (!(key in input)) issues.push(malformed(`response member "${key}" is missing.`));
    }
    if (input.status !== "OK") issues.push(malformed("only a successful provider response can be normalized."));
    if (!Array.isArray(input.issues)) issues.push(malformed("issues must be a list."));
    if (!isFlat(input.metadata)) issues.push(malformed("execution metadata must be a flat record."));
    if (!isPlainRecord(input.statistics)) issues.push(malformed("statistics must be a record."));
    if (!isPlainRecord(input.snapshot)) {
      issues.push(invalidSnapshot("a provider snapshot is required."));
      return { issues, view: null };
    }
    const snapshot = input.snapshot;
    for (const key of SEARCHAPI_SNAPSHOT_KEYS) {
      if (!(key in snapshot)) issues.push(invalidSnapshot(`snapshot member "${key}" is missing.`));
    }
    if (snapshot.provider !== SEARCHAPI_PROVIDER_NAME) issues.push(invalidSnapshot("provider must be SEARCHAPI."));
    if (typeof snapshot.snapshotId !== "string" || !SNAPSHOT_ID.test(snapshot.snapshotId)) issues.push(invalidSnapshot("a well-formed snapshot id is required."));
    if (typeof snapshot.keyword !== "string" || snapshot.keyword.trim() === "") issues.push(invalidSnapshot("a keyword is required."));
    if (typeof snapshot.country !== "string" || !COUNTRY.test(snapshot.country)) issues.push(invalidSnapshot("country must be a two-letter code."));
    if (typeof snapshot.language !== "string" || !LANGUAGE.test(snapshot.language)) issues.push(invalidSnapshot("language must be a two-letter code."));
    if (typeof snapshot.device !== "string" || !(DEVICES as readonly string[]).includes(snapshot.device)) issues.push(invalidSnapshot("device must be desktop, mobile, or tablet."));
    if (typeof snapshot.collectedAt !== "string" || !ISO.test(snapshot.collectedAt)) issues.push(invalidSnapshot("collectedAt must be an ISO-8601 instant in UTC."));
    if (snapshot.origin !== "COLLECTED" || snapshot.provenance !== "DIRECT_SOURCE") issues.push(invalidSnapshot("origin and provenance must stay COLLECTED and DIRECT_SOURCE."));
    if (!isPlainRecord(snapshot.searchOptions) || Object.values(snapshot.searchOptions).some((value) => typeof value !== "string")) {
      issues.push(invalidSnapshot("search options must be a flat record of text."));
    }
    if (!isPlainRecord(snapshot.raw)) {
      issues.push(invalidSnapshot("raw JSON must be a plain record."));
      return { issues, view: null };
    }
    const raw = snapshot.raw;
    if (!isPlainRecord(raw.search_metadata)) {
      issues.push({ field: "search_metadata", message: "Missing Search Metadata: search metadata is required." });
    } else if (typeof raw.search_metadata.request_url !== "string" || !HTTPS.test(raw.search_metadata.request_url)) {
      issues.push(invalidSnapshot("request_url must be a well-formed https address."));
    }
    if ("search_parameters" in raw && raw.search_parameters !== undefined && !isPlainRecord(raw.search_parameters)) {
      issues.push(malformed("search parameters must be a plain record."));
    }
    if ("search_information" in raw && raw.search_information !== undefined && !isPlainRecord(raw.search_information)) {
      issues.push(malformed("search information must be a plain record."));
    }
    const organic = readList(raw, "organic_results", "Malformed Organic Results", true);
    const ads = readList(raw, "ads", "Malformed Ads", false);
    const shoppingAds = readList(raw, "shopping_ads", "Malformed Ads", false);
    const inlineShopping = readList(raw, "inline_shopping", "Malformed Ads", false);
    issues.push(...organic.issues, ...ads.issues, ...shoppingAds.issues, ...inlineShopping.issues);
    if (issues.length > 0 || !isPlainRecord(raw.search_metadata) || typeof snapshot.keyword !== "string" || typeof snapshot.country !== "string") return { issues, view: null };
    const options = snapshot.searchOptions as Record<string, string>;
    const market = typeof options.market === "string" && MARKET.test(options.market) ? options.market : snapshot.country.toLowerCase();
    return {
      issues: [],
      view: {
        snapshotId: snapshot.snapshotId as string,
        keyword: snapshot.keyword.trim(),
        country: snapshot.country,
        language: snapshot.language as string,
        device: snapshot.device as NormalizerView["device"],
        market,
        collectedAt: snapshot.collectedAt as string,
        searchUrl: raw.search_metadata.request_url as string,
        searchOptions: { ...options },
        raw,
        organic: organic.items,
        ads: ads.items,
        shoppingAds: shoppingAds.items,
        inlineShopping: inlineShopping.items,
        executionMetadata: { ...(input.metadata as FlatRecord) },
      },
    };
  }

  return { validate };
}
