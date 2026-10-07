/**
 * Host record domain: SearchApi mapper.
 *
 * Copies a provider JSON document into the Market Discovery search snapshot,
 * SERP records, and sponsored results. Field names used here do not leave
 * this module except as values already stored on those records.
 */
import type { SearchSnapshot } from "../market-discovery/google-search-snapshot";
import type { SerpRecord } from "../market-discovery/serp-types";
import type { SponsoredResult } from "../market-discovery/sponsored-types";
import type { FlatRecord } from "./searchapi-types";
import type { NormalizerView } from "./searchapi-validator";

const RENAMES: Readonly<Record<string, string>> = {
  title: "title",
  link: "url",
  snippet: "description",
  position: "position",
  source: "sourceLabel",
  domain: "domain",
  displayed_link: "displayedUrl",
  tracking_link: "trackingUrl",
  block_position: "blockPosition",
  advertiser_info_token: "advertiserToken",
  sitelinks: "sitelinks",
  favicon: "favicon",
  thumbnail: "thumbnail",
  date: "date",
  snippet_highlighted_words: "highlightedWords",
  images: "images",
  seller: "seller",
  product_link: "productUrl",
  price: "price",
  extracted_price: "priceAmount",
  original_price: "originalPrice",
  extracted_original_price: "originalPriceAmount",
  delivery: "delivery",
  deal: "deal",
  extensions: "extensions",
  rating: "rating",
  reviews: "reviewCount",
  seller_rating: "sellerRating",
  image: "image",
  product_id: "productId",
  product_token: "productToken",
};

const METADATA_RENAMES: Readonly<Record<string, string>> = {
  id: "metadataId",
  status: "metadataStatus",
  created_at: "metadataCreatedAt",
  request_time_taken: "metadataRequestTimeTaken",
  parsing_time_taken: "metadataParsingTimeTaken",
  total_time_taken: "metadataTotalTimeTaken",
  request_url: "metadataRequestUrl",
  html_url: "metadataHtmlUrl",
  json_url: "metadataJsonUrl",
};

const PARAMETER_RENAMES: Readonly<Record<string, string>> = {
  engine: "parameterEngine",
  q: "parameterQuery",
  device: "parameterDevice",
  hl: "parameterLanguage",
  gl: "parameterCountry",
  location: "parameterLocation",
  location_used: "parameterLocationUsed",
};

const INFORMATION_RENAMES: Readonly<Record<string, string>> = {
  query_displayed: "informationQuery",
  detected_location: "informationLocation",
  has_no_results_for: "informationHasNoResults",
  total_results: "informationResultCount",
  time_taken_displayed: "informationTimeTaken",
};

export interface MappedSearch {
  searchSnapshot: SearchSnapshot;
  serpRecords: SerpRecord[];
  sponsoredResults: SponsoredResult[];
  searchMetadata: FlatRecord;
}

function flatValue(value: unknown): string | number | boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return JSON.stringify(value);
}

function assignBlock(target: FlatRecord, source: unknown, renames: Readonly<Record<string, string>>, prefix: string) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) return;
  const record = source as Record<string, unknown>;
  const seen = new Set<string>();
  for (const [from, to] of Object.entries(renames)) {
    if (!(from in record)) continue;
    const value = flatValue(record[from]);
    if (value !== undefined) target[to] = value;
    seen.add(from);
  }
  for (const key of Object.keys(record)) {
    if (seen.has(key)) continue;
    const value = flatValue(record[key]);
    if (value !== undefined) target[`${prefix}${key}`] = value;
  }
}

function preserved(item: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [from, to] of Object.entries(RENAMES)) {
    if (!(from in item)) continue;
    out[to] = item[from];
    seen.add(from);
  }
  for (const key of Object.keys(item)) {
    if (seen.has(key)) continue;
    out[`field_${key}`] = item[key];
  }
  return JSON.stringify(out);
}

function text(item: Record<string, unknown>, key: string): string | null {
  return typeof item[key] === "string" ? item[key] : null;
}

function positionOf(item: Record<string, unknown>): number | null {
  return typeof item.position === "number" ? item.position : null;
}

function recordOf(item: Record<string, unknown>, resultType: string, sponsoredMarker: string | null, organicMarker: string | null): SerpRecord {
  return {
    title: text(item, "title"),
    url: text(item, "link"),
    description: text(item, "snippet"),
    position: positionOf(item),
    resultType,
    sponsoredMarker,
    organicMarker,
    resultMetadata: preserved(item),
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

function sponsoredOf(record: SerpRecord): SponsoredResult {
  return {
    title: record.title,
    url: record.url,
    description: record.description,
    position: record.position,
    sponsoredMarker: record.sponsoredMarker ?? "",
    resultMetadata: record.resultMetadata,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
  };
}

export function mapSearchApi(view: NormalizerView): MappedSearch {
  const searchMetadata: FlatRecord = {};
  assignBlock(searchMetadata, view.raw.search_metadata, METADATA_RENAMES, "metadata_");
  assignBlock(searchMetadata, view.raw.search_parameters, PARAMETER_RENAMES, "parameter_");
  assignBlock(searchMetadata, view.raw.search_information, INFORMATION_RENAMES, "information_");
  for (const [key, value] of Object.entries(view.searchOptions)) searchMetadata[`option_${key}`] = value;

  const serpRecords: SerpRecord[] = [];
  for (const item of view.organic) serpRecords.push(recordOf(item, "organic", null, "organic"));
  for (const item of view.ads) serpRecords.push(recordOf(item, "sponsored", typeof item.block_position === "string" ? item.block_position : "sponsored", null));
  for (const item of view.shoppingAds) serpRecords.push(recordOf(item, "shopping", typeof item.block_position === "string" ? item.block_position : "shopping", null));
  for (const item of view.inlineShopping) serpRecords.push(recordOf(item, "inline", typeof item.block_position === "string" ? item.block_position : "inline", null));
  const sponsoredResults = serpRecords.filter((record) => typeof record.sponsoredMarker === "string").map(sponsoredOf);

  const searchSnapshot: SearchSnapshot = {
    snapshotId: view.snapshotId,
    query: view.keyword,
    language: view.language,
    country: view.country,
    device: view.device,
    market: view.market,
    searchUrl: view.searchUrl,
    html: "",
    collectedAt: view.collectedAt,
    origin: "COLLECTED",
    provenance: "DIRECT_SOURCE",
    metadata: searchMetadata,
  };
  return { searchSnapshot, serpRecords, sponsoredResults, searchMetadata };
}
