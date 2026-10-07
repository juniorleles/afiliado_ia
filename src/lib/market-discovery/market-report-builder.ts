/**
 * Host record domain: market intelligence report builder.
 *
 * Copies supplied search, SERP, sponsored, landing page, and observed product
 * artifacts into summaries, coverage, warnings, and an evidence graph. Lists
 * stay in the order they were given. This module does not reach an outside
 * system.
 */
import type { LandingPageSnapshot } from "./landing-page-snapshot";
import { createEvidenceGraph, createMarketIntelligenceReportRecord } from "./market-report-snapshot";
import type { EvidenceCoverage, MarketEvidenceGraph, MarketGraphEdge, MarketGraphNode, MarketIntelligenceReport, MarketReportPresence } from "./market-report-types";
import type { ObservedProduct, ProductIdentity } from "./product-types";
import type { SearchSnapshot } from "./google-search-snapshot";
import type { SerpRecord } from "./serp-types";
import type { SponsoredResult } from "./sponsored-types";

export interface MarketReportEnvelope {
  searchSnapshot: SearchSnapshot;
  serpRecords: readonly SerpRecord[];
  sponsoredResults: readonly SponsoredResult[];
  landingPageSnapshots: readonly LandingPageSnapshot[];
  observedProducts: readonly (ProductIdentity | ObservedProduct)[];
}

export interface MarketReportCounts {
  searchCount: number;
  serpCount: number;
  sponsoredCount: number;
  landingPageCount: number;
  observedProductCount: number;
  warningCount: number;
  missingCount: number;
}

export interface MarketReportDraft {
  report: MarketIntelligenceReport;
  graph: MarketEvidenceGraph;
  counts: MarketReportCounts;
}

export interface MarketReportBuilder {
  build(input: MarketReportEnvelope): MarketReportDraft;
}

function presence(count: number): MarketReportPresence {
  return count > 0 ? "PRESENT" : "ABSENT";
}

function readIdentity(product: ProductIdentity | ObservedProduct): ProductIdentity {
  if ("identity" in product) return product.identity;
  return product;
}

export function createMarketReportBuilder(): MarketReportBuilder {
  return {
    build(input) {
      const search = input.searchSnapshot;
      const serp = input.serpRecords;
      const sponsored = input.sponsoredResults;
      const pages = input.landingPageSnapshots;
      const products = input.observedProducts.map((product) => readIdentity(product));
      const pageIds = new Set(pages.map((page) => page.landingPageId.trim()));
      const pageUrls = new Set(pages.map((page) => page.destinationUrl.trim()));
      const warnings: string[] = [];
      for (const result of sponsored) {
        const url = result.url?.trim() ?? "";
        if (url !== "" && !pageUrls.has(url)) warnings.push(`Sponsored result url has no landing page snapshot: ${url}`);
      }
      for (const product of products) {
        const id = product.landingPageId.trim();
        if (id !== "" && !pageIds.has(id)) warnings.push(`Observed product has no landing page snapshot: ${id}`);
      }
      const missingEvidence: string[] = [];
      if (serp.length === 0) missingEvidence.push("serpRecords");
      if (sponsored.length === 0) missingEvidence.push("sponsoredResults");
      if (pages.length === 0) missingEvidence.push("landingPages");
      if (products.length === 0) missingEvidence.push("observedProducts");
      const coverage: EvidenceCoverage = {
        search: "PRESENT",
        serp: presence(serp.length),
        sponsored: presence(sponsored.length),
        landingPages: presence(pages.length),
        observedProducts: presence(products.length),
      };
      const nodes: MarketGraphNode[] = [
        { id: "search", kind: "SearchSnapshot", present: coverage.search },
        { id: "serp", kind: "SERPRecords", present: coverage.serp },
        { id: "sponsored", kind: "SponsoredResults", present: coverage.sponsored },
        { id: "landing-pages", kind: "LandingPageSnapshots", present: coverage.landingPages },
        { id: "observed-products", kind: "ObservedProducts", present: coverage.observedProducts },
      ];
      const edges: MarketGraphEdge[] = [
        { from: "search", to: "serp" },
        { from: "serp", to: "sponsored" },
        { from: "sponsored", to: "landing-pages" },
        { from: "landing-pages", to: "observed-products" },
      ];
      const graph = createEvidenceGraph(nodes, edges);
      const report = createMarketIntelligenceReportRecord({
        searchSummary: {
          snapshotId: search.snapshotId,
          query: search.query,
          language: search.language,
          country: search.country,
          device: search.device,
          market: search.market,
          searchUrl: search.searchUrl,
          htmlLength: search.html.length,
          collectedAt: search.collectedAt,
        },
        serpSummary: {
          count: serp.length,
          titles: serp.map((item) => item.title),
          urls: serp.map((item) => item.url),
          descriptions: serp.map((item) => item.description),
          positions: serp.map((item) => item.position),
        },
        sponsoredSummary: {
          count: sponsored.length,
          titles: sponsored.map((item) => item.title),
          urls: sponsored.map((item) => item.url),
          descriptions: sponsored.map((item) => item.description),
          positions: sponsored.map((item) => item.position),
        },
        landingPageSummary: {
          count: pages.length,
          landingPageIds: pages.map((page) => page.landingPageId),
          destinationUrls: pages.map((page) => page.destinationUrl),
          finalUrls: pages.map((page) => page.finalUrl),
          htmlLength: pages.reduce((sum, page) => sum + page.html.length, 0),
        },
        observedProductSummary: {
          count: products.length,
          productNames: products.map((item) => item.productName),
          brands: products.map((item) => item.brand),
          vendors: products.map((item) => item.vendor),
          offerUrls: products.map((item) => item.offerUrl),
          categories: products.map((item) => item.category),
          languages: products.map((item) => item.language),
          landingPageIds: products.map((item) => item.landingPageId),
        },
        marketCoverage: {
          keywords: [search.query],
          observedDomains: products.map((item) => item.primaryDomain),
          observedLandingPages: pages.map((page) => page.destinationUrl),
          observedOffers: products.map((item) => item.offerUrl),
          observedBrands: products.map((item) => item.brand),
          observedCategories: products.map((item) => item.category),
          observedPrices: products.map((item) => item.visiblePrice),
          observedLanguages: products.map((item) => item.language),
        },
        marketMetadata: {
          query: search.query,
          language: search.language,
          country: search.country,
          device: search.device,
          market: search.market,
        },
        evidenceCoverage: coverage,
        warnings,
        missingEvidence,
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
      });
      return {
        report,
        graph,
        counts: {
          searchCount: 1,
          serpCount: serp.length,
          sponsoredCount: sponsored.length,
          landingPageCount: pages.length,
          observedProductCount: products.length,
          warningCount: warnings.length,
          missingCount: missingEvidence.length,
        },
      };
    },
  };
}
