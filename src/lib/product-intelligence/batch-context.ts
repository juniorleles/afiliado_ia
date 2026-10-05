/**
 * Host record domain: read-only product batch context.
 *
 * Interface only. The host is given a product list, a marketplace feed, or
 * a list of product URLs, plus flat metadata. It does not fetch a page, does
 * not change the input, and does not publish a campaign.
 */
import type { BatchMetadata } from "./batch-snapshot";

export const BATCH_CONTEXT_MEMBERS = [
  "products",
  "marketplaceFeed",
  "productUrls",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export const BATCH_PRODUCT_MEMBERS = [
  "marketplaceUrl",
  "marketplaceProductId",
  "rawHtml",
  "landingHtml",
  "searchContext",
] as const;

export const BATCH_SOURCES = ["products", "marketplaceFeed", "productUrls"] as const;
export type BatchSource = (typeof BATCH_SOURCES)[number];

export const BATCH_STAGES = [
  "ClickBankImporter",
  "LandingPageIntelligence",
  "GoogleSearchIntelligence",
  "CompetitionIntelligence",
  "CommercialIntelligence",
  "ProductIntelligenceReport",
  "RecommendationEngine",
] as const;

export type BatchStage = (typeof BATCH_STAGES)[number];

/**
 * One offline product record. URL text is read. Page bodies are read only
 * when the caller already has them. Nothing here is fetched.
 */
export interface BatchProductInput {
  marketplaceUrl?: string;
  marketplaceProductId?: string;
  rawHtml?: string;
  landingHtml?: string;
  searchContext?: string;
}

export interface BatchContext {
  products?: readonly BatchProductInput[];
  marketplaceFeed?: readonly BatchProductInput[];
  productUrls?: readonly (string | BatchProductInput)[];
  executionMetadata?: BatchMetadata;
  runtimeMetadata?: BatchMetadata;
  configuration?: BatchMetadata;
}
