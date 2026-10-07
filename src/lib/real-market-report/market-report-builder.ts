/**
 * Host record domain: real market report builder.
 *
 * Copies supplied search, SERP, sponsored, landing page, and observed product
 * artifacts into summaries, coverage, warnings, and an evidence graph. Lists
 * stay in the order they were given. Repeated aggregate values are kept once.
 * This module does not reach an outside system.
 */
import {
  freezeDeepRealMarketReport,
  type RealMarketEvidenceCoverage,
  type RealMarketEvidenceGraph,
  type RealMarketGraphEdge,
  type RealMarketGraphNode,
  type RealMarketReportPresence,
  type RealMarketReportRecord,
} from "./market-report-snapshot";

export interface RealMarketReportDraft {
  report: RealMarketReportRecord;
  graph: RealMarketEvidenceGraph;
  context: {
    query: string;
    sponsoredUrls: readonly string[];
    landingPageIds: readonly string[];
    productNames: readonly string[];
  };
}

export interface RealMarketReportBuilder {
  build(input: Record<string, unknown>): RealMarketReportDraft;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function identityOf(value: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(value.identity)) return value.identity;
  return value;
}

function unique(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const host = new URL(url).hostname.trim();
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

function pageAddress(page: Record<string, unknown>): string {
  return textOf(page.originalUrl) ?? textOf(page.destinationUrl) ?? "";
}

function presence(count: number): RealMarketReportPresence {
  return count > 0 ? "PRESENT" : "ABSENT";
}

function listSummary(items: readonly Record<string, unknown>[]) {
  return {
    count: items.length,
    titles: items.map((item) => textOf(item.title)),
    urls: items.map((item) => textOf(item.url)),
    descriptions: items.map((item) => textOf(item.description)),
    positions: items.map((item) => numberOrNull(item.position)),
  };
}

export function createRealMarketReportBuilder(): RealMarketReportBuilder {
  return {
    build(input) {
      const search = input.searchSnapshot as Record<string, unknown>;
      const serp = input.serpRecords as readonly Record<string, unknown>[];
      const sponsored = input.sponsoredResults as readonly Record<string, unknown>[];
      const pages = input.landingPageSnapshots as readonly Record<string, unknown>[];
      const products = (input.observedProducts as readonly Record<string, unknown>[]).map((item) => identityOf(item));
      const html = typeof search.html === "string" ? search.html : "";
      const pageIds = pages.map((page) => textOf(page.landingPageId) ?? "");
      const pageUrls = new Set(pages.flatMap((page) => [pageAddress(page), textOf(page.finalUrl) ?? ""].filter((url) => url !== "")));
      const productIds = new Set(products.map((product) => textOf(product.landingPageId) ?? "").filter((id) => id !== ""));
      const warnings: string[] = [];
      for (const result of sponsored) {
        const url = textOf(result.url) ?? "";
        if (url !== "" && !pageUrls.has(url)) warnings.push(`Sponsored result url has no landing page snapshot: ${url}`);
      }
      for (const page of pages) {
        const id = textOf(page.landingPageId) ?? "";
        if (id !== "" && !productIds.has(id)) warnings.push(`Landing page snapshot has no observed product: ${id}`);
      }
      for (const product of products) {
        const id = textOf(product.landingPageId) ?? "";
        if (id !== "" && !pageIds.includes(id)) warnings.push(`Observed product has no landing page snapshot: ${id}`);
      }
      const brands = products.map((product) => textOf(product.brand));
      const categories = products.map((product) => textOf(product.category));
      const languages = products.map((product) => textOf(product.language));
      const prices = products.map((product) => textOf(product.price) ?? textOf(product.visiblePrice));
      const currencies = products.map((product) => textOf(product.currency));
      const priceLabels = products.map((product, index) => {
        const price = prices[index];
        if (price === null) return null;
        const currency = currencies[index];
        return currency === null ? price : `${price} ${currency}`;
      });
      const domains = unique([
        ...products.map((product) => textOf(product.primaryDomain)),
        ...pages.map((page) => hostOf(textOf(page.finalUrl) ?? pageAddress(page))),
        ...sponsored.map((result) => hostOf(textOf(result.url))),
      ]);
      const observedBrands = unique(brands);
      const observedCategories = unique(categories);
      const observedPrices = unique(priceLabels);
      const observedLanguages = unique(languages);
      const missingEvidence: string[] = [];
      if (serp.length === 0) missingEvidence.push("serpRecords");
      if (observedBrands.length === 0) missingEvidence.push("observedBrands");
      if (domains.length === 0) missingEvidence.push("observedDomains");
      if (observedCategories.length === 0) missingEvidence.push("observedCategories");
      if (observedPrices.length === 0) missingEvidence.push("observedPrices");
      if (observedLanguages.length === 0) missingEvidence.push("observedLanguages");
      const evidenceCoverage: RealMarketEvidenceCoverage = {
        search: "PRESENT",
        serp: presence(serp.length),
        sponsored: "PRESENT",
        landingPages: "PRESENT",
        observedProducts: "PRESENT",
        brands: presence(observedBrands.length),
        domains: presence(domains.length),
        categories: presence(observedCategories.length),
        prices: presence(observedPrices.length),
        languages: presence(observedLanguages.length),
      };
      const nodes: RealMarketGraphNode[] = [
        { id: "search", kind: "SearchSnapshot", label: textOf(search.snapshotId) ?? "", present: "PRESENT" },
        { id: "serp", kind: "SERPRecords", label: String(serp.length), present: evidenceCoverage.serp },
        { id: "sponsored", kind: "SponsoredResults", label: String(sponsored.length), present: "PRESENT" },
        { id: "landing-pages", kind: "LandingPageSnapshots", label: String(pages.length), present: "PRESENT" },
        { id: "observed-products", kind: "ObservedProducts", label: String(products.length), present: "PRESENT" },
      ];
      const edges: RealMarketGraphEdge[] = [
        { from: "search", to: "serp" },
        { from: "serp", to: "sponsored" },
        { from: "sponsored", to: "landing-pages" },
        { from: "landing-pages", to: "observed-products" },
      ];
      pages.forEach((page) => {
        const id = textOf(page.landingPageId) ?? "";
        if (id === "") return;
        nodes.push({ id: `page-${id}`, kind: "LandingPage", label: id, present: "PRESENT" });
        edges.push({ from: "landing-pages", to: `page-${id}` });
      });
      products.forEach((product) => {
        const id = textOf(product.landingPageId) ?? "";
        const name = textOf(product.productName) ?? "";
        if (id === "" || name === "") return;
        const productId = `product-${id}`;
        nodes.push({ id: productId, kind: "ObservedProduct", label: name, present: "PRESENT" });
        edges.push({ from: "observed-products", to: productId });
        if (pageIds.includes(id)) edges.push({ from: `page-${id}`, to: productId });
      });
      sponsored.forEach((result, index) => {
        const url = textOf(result.url) ?? "";
        if (url === "") return;
        const nodeId = `sponsored-${index + 1}`;
        nodes.push({ id: nodeId, kind: "SponsoredResult", label: url, present: "PRESENT" });
        edges.push({ from: "sponsored", to: nodeId });
      });
      serp.forEach((record, index) => {
        const url = textOf(record.url) ?? "";
        if (url === "") return;
        const nodeId = `serp-${index + 1}`;
        nodes.push({ id: nodeId, kind: "SERPRecord", label: url, present: "PRESENT" });
        edges.push({ from: "serp", to: nodeId });
      });
      const report: RealMarketReportRecord = {
        searchSummary: {
          snapshotId: textOf(search.snapshotId) ?? "",
          query: textOf(search.query) ?? "",
          language: textOf(search.language) ?? "",
          country: textOf(search.country) ?? "",
          device: textOf(search.device) ?? "",
          market: textOf(search.market) ?? "",
          searchUrl: textOf(search.searchUrl) ?? "",
          htmlLength: html.length,
          collectedAt: textOf(search.collectedAt) ?? "",
        },
        serpSummary: listSummary(serp),
        sponsoredSummary: listSummary(sponsored),
        landingPageSummary: {
          count: pages.length,
          landingPageIds: pageIds,
          originalUrls: pages.map((page) => pageAddress(page)),
          finalUrls: pages.map((page) => textOf(page.finalUrl) ?? ""),
          htmlLength: pages.reduce((sum, page) => sum + (typeof page.html === "string" ? page.html.length : 0), 0),
        },
        observedProductSummary: {
          count: products.length,
          productNames: products.map((product) => textOf(product.productName) ?? ""),
          brands,
          vendors: products.map((product) => textOf(product.vendor)),
          prices,
          currencies,
          languages,
          categories,
          domains: products.map((product) => textOf(product.primaryDomain)),
          landingPageIds: products.map((product) => textOf(product.landingPageId) ?? ""),
          offerUrls: products.map((product) => textOf(product.offerUrl)),
        },
        observedBrands,
        observedDomains: domains,
        observedCategories,
        observedPrices,
        observedLanguages,
        evidenceCoverage,
        missingEvidence,
        warnings,
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
      };
      return {
        report: freezeDeepRealMarketReport(report),
        graph: freezeDeepRealMarketReport({ nodes, edges }),
        context: {
          query: report.searchSummary.query,
          sponsoredUrls: sponsored.map((result) => textOf(result.url) ?? ""),
          landingPageIds: pageIds,
          productNames: report.observedProductSummary.productNames,
        },
      };
    },
  };
}
