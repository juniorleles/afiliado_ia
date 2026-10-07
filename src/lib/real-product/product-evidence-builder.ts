/**
 * Host record domain: product evidence builder.
 *
 * Turns one page reading into a frozen observed product, its evidence, and
 * the graph of fields that were present. It does not request a page.
 */
import type { RealProductMetadata } from "./product-context";
import type { ProductHtmlRead } from "./product-html-parser";

export const REAL_PRODUCT_STATUSES = ["OK", "REJECTED"] as const;
export type RealProductStatus = (typeof REAL_PRODUCT_STATUSES)[number];

export const REAL_PRODUCT_ORIGINS = ["OBSERVED"] as const;
export type RealProductOrigin = (typeof REAL_PRODUCT_ORIGINS)[number];

export const REAL_PRODUCT_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type RealProductProvenance = (typeof REAL_PRODUCT_PROVENANCE)[number];

export interface RealProductIssue {
  field: string;
  message: string;
}

export const REAL_PRODUCT_CTA_KEYS = ["label", "url"] as const;

export interface RealProductCta {
  label: string;
  url: string | null;
}

export const REAL_PRODUCT_IDENTITY_KEYS = [
  "landingPageId",
  "productName",
  "brand",
  "vendor",
  "price",
  "currency",
  "language",
  "primaryCta",
  "primaryDomain",
  "offerUrl",
  "canonicalUrl",
  "origin",
  "provenance",
] as const;

export interface RealProductIdentity {
  landingPageId: string;
  productName: string;
  brand: string | null;
  vendor: string | null;
  price: string | null;
  currency: string | null;
  language: string | null;
  primaryCta: RealProductCta | null;
  primaryDomain: string | null;
  offerUrl: string | null;
  canonicalUrl: string | null;
  origin: RealProductOrigin;
  provenance: RealProductProvenance;
}

export const REAL_PRODUCT_EVIDENCE_KEYS = [
  "landingPageId",
  "pageTitle",
  "metaTitle",
  "openGraphTitle",
  "canonicalUrl",
  "h1",
  "h2s",
  "structuredData",
  "productName",
  "brand",
  "vendor",
  "price",
  "currency",
  "language",
  "primaryCtaLabel",
  "primaryCtaUrl",
  "images",
  "origin",
  "provenance",
] as const;

export interface RealProductEvidence {
  landingPageId: string;
  pageTitle: string | null;
  metaTitle: string | null;
  openGraphTitle: string | null;
  canonicalUrl: string | null;
  h1: string | null;
  h2s: readonly string[];
  structuredData: string | null;
  productName: string | null;
  brand: string | null;
  vendor: string | null;
  price: string | null;
  currency: string | null;
  language: string | null;
  primaryCtaLabel: string | null;
  primaryCtaUrl: string | null;
  images: readonly string[];
  origin: RealProductOrigin;
  provenance: RealProductProvenance;
}

export const REAL_PRODUCT_EVIDENCE_METADATA_KEYS = [
  "productNameSource",
  "brandSource",
  "vendorSource",
  "priceSource",
  "currencySource",
  "languageSource",
  "ctaSource",
] as const;

export interface RealProductEvidenceMetadata {
  productNameSource: string | null;
  brandSource: string | null;
  vendorSource: string | null;
  priceSource: string | null;
  currencySource: string | null;
  languageSource: string | null;
  ctaSource: string | null;
}

export const REAL_PRODUCT_CONFIDENCE_KEYS = [
  "productName",
  "brand",
  "vendor",
  "price",
  "currency",
  "language",
  "pageTitle",
  "metaTitle",
  "openGraphTitle",
  "canonicalUrl",
  "h1",
  "h2",
  "structuredData",
  "primaryCta",
  "primaryImages",
] as const;

/** Which observed fields were present. These are inputs, not a computed figure. */
export interface RealProductConfidenceInputs {
  productName: boolean;
  brand: boolean;
  vendor: boolean;
  price: boolean;
  currency: boolean;
  language: boolean;
  pageTitle: boolean;
  metaTitle: boolean;
  openGraphTitle: boolean;
  canonicalUrl: boolean;
  h1: boolean;
  h2: boolean;
  structuredData: boolean;
  primaryCta: boolean;
  primaryImages: boolean;
}

export const REAL_OBSERVED_PRODUCT_KEYS = ["identity", "evidence", "evidenceMetadata", "confidenceInputs"] as const;

export interface RealObservedProduct {
  identity: RealProductIdentity;
  evidence: RealProductEvidence;
  evidenceMetadata: RealProductEvidenceMetadata;
  confidenceInputs: RealProductConfidenceInputs;
}

export const REAL_PRODUCT_GRAPH_NODE_KEYS = ["id", "kind", "label"] as const;

export interface RealProductGraphNode {
  id: string;
  kind: string;
  label: string;
}

export const REAL_PRODUCT_GRAPH_EDGE_KEYS = ["from", "to"] as const;

export interface RealProductGraphEdge {
  from: string;
  to: string;
}

export const REAL_PRODUCT_GRAPH_KEYS = ["nodes", "edges"] as const;

export interface RealProductEvidenceGraph {
  nodes: readonly RealProductGraphNode[];
  edges: readonly RealProductGraphEdge[];
}

export const REAL_PRODUCT_STATISTICS_KEYS = ["pageCount", "observedProductCount", "issueCount", "executionTime"] as const;

export interface RealProductStatistics {
  pageCount: number;
  observedProductCount: number;
  issueCount: number;
  executionTime: number;
}

export const REAL_PRODUCT_CONTEXT_RECORD_KEYS = ["landingPageIds"] as const;

export interface RealProductContextRecord {
  landingPageIds: readonly string[];
}

export const REAL_PRODUCT_SESSION_KEYS = [
  "sessionId",
  "products",
  "graph",
  "statistics",
  "context",
  "createdAt",
  "origin",
  "provenance",
  "metadata",
] as const;

export interface RealProductSessionSnapshot {
  sessionId: string;
  products: readonly RealObservedProduct[];
  graph: RealProductEvidenceGraph;
  statistics: RealProductStatistics;
  context: RealProductContextRecord;
  createdAt: string;
  origin: RealProductOrigin;
  provenance: RealProductProvenance;
  metadata: RealProductMetadata;
}

export const REAL_PRODUCT_RESULT_KEYS = [
  "status",
  "issues",
  "products",
  "graph",
  "statistics",
  "snapshot",
  "metadata",
  "executionTime",
] as const;

export interface RealProductResult {
  status: RealProductStatus;
  issues: RealProductIssue[];
  products: readonly RealObservedProduct[] | null;
  graph: RealProductEvidenceGraph | null;
  statistics: RealProductStatistics;
  snapshot: RealProductSessionSnapshot | null;
  metadata: RealProductMetadata;
  executionTime: number;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepRealProduct<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepRealProduct(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainRealProduct<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainRealProduct(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainRealProduct(inner)])) as T;
  }
  return value;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function absoluteUrl(value: string | null, base: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, base ?? undefined).toString();
  } catch {
    return value;
  }
}

function present(value: unknown): boolean {
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && value !== null && "label" in value && "url" in value) {
    const cta = value as RealProductCta;
    return cta.label !== "" || cta.url !== null;
  }
  return false;
}

const GRAPH_FIELDS = [
  ["pageTitle", "PageTitle"],
  ["metaTitle", "MetaTitle"],
  ["openGraphTitle", "OpenGraphTitle"],
  ["canonicalUrl", "CanonicalUrl"],
  ["h1", "H1"],
  ["h2s", "H2"],
  ["structuredData", "StructuredData"],
  ["productName", "ProductName"],
  ["brand", "Brand"],
  ["vendor", "Vendor"],
  ["price", "Price"],
  ["currency", "Currency"],
  ["language", "Language"],
  ["primaryCtaLabel", "PrimaryCta"],
  ["images", "PrimaryImages"],
] as const;

export interface ProductEvidenceBuilder {
  build(landingPageId: string, finalUrl: string | null, read: ProductHtmlRead): RealObservedProduct;
  graph(products: readonly RealObservedProduct[]): RealProductEvidenceGraph;
}

export function createProductEvidenceBuilder(): ProductEvidenceBuilder {
  return {
    build(landingPageId, finalUrl, read) {
      const offerUrl = absoluteUrl(read.primaryCta?.url ?? null, finalUrl) ?? absoluteUrl(read.canonicalUrl, finalUrl) ?? finalUrl;
      const canonicalUrl = absoluteUrl(read.canonicalUrl, finalUrl);
      const primaryCta = read.primaryCta
        ? { label: read.primaryCta.label, url: absoluteUrl(read.primaryCta.url, finalUrl) }
        : null;
      const identity: RealProductIdentity = {
        landingPageId,
        productName: read.productName ?? "",
        brand: read.brand,
        vendor: read.vendor,
        price: read.price,
        currency: read.currency,
        language: read.language,
        primaryCta,
        primaryDomain: hostOf(finalUrl) ?? hostOf(canonicalUrl) ?? hostOf(offerUrl),
        offerUrl,
        canonicalUrl,
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
      };
      const evidence: RealProductEvidence = {
        landingPageId,
        pageTitle: read.pageTitle,
        metaTitle: read.metaTitle,
        openGraphTitle: read.openGraphTitle,
        canonicalUrl: read.canonicalUrl,
        h1: read.h1,
        h2s: [...read.h2s],
        structuredData: read.structuredData,
        productName: read.productName,
        brand: read.brand,
        vendor: read.vendor,
        price: read.price,
        currency: read.currency,
        language: read.language,
        primaryCtaLabel: read.primaryCta?.label ?? null,
        primaryCtaUrl: read.primaryCta?.url ?? null,
        images: [...read.images],
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
      };
      const evidenceMetadata: RealProductEvidenceMetadata = {
        productNameSource: read.productNameSource,
        brandSource: read.brandSource,
        vendorSource: read.vendorSource,
        priceSource: read.priceSource,
        currencySource: read.currencySource,
        languageSource: read.languageSource,
        ctaSource: read.ctaSource,
      };
      const confidenceInputs: RealProductConfidenceInputs = {
        productName: present(read.productName),
        brand: present(read.brand),
        vendor: present(read.vendor),
        price: present(read.price),
        currency: present(read.currency),
        language: present(read.language),
        pageTitle: present(read.pageTitle),
        metaTitle: present(read.metaTitle),
        openGraphTitle: present(read.openGraphTitle),
        canonicalUrl: present(read.canonicalUrl),
        h1: present(read.h1),
        h2: read.h2s.length > 0,
        structuredData: present(read.structuredData),
        primaryCta: primaryCta !== null,
        primaryImages: read.images.length > 0,
      };
      return freezeDeepRealProduct({ identity, evidence, evidenceMetadata, confidenceInputs });
    },
    graph(products) {
      const nodes: RealProductGraphNode[] = [];
      const edges: RealProductGraphEdge[] = [];
      for (const product of products) {
        const pageId = `page-${product.identity.landingPageId}`;
        const productId = `product-${product.identity.landingPageId}`;
        nodes.push({ id: pageId, kind: "LandingPage", label: product.identity.landingPageId });
        nodes.push({ id: productId, kind: "ObservedProduct", label: product.identity.productName });
        edges.push({ from: pageId, to: productId });
        for (const [field, kind] of GRAPH_FIELDS) {
          const value = product.evidence[field];
          if (!present(value)) continue;
          const fieldId = `${productId}-${kind}`;
          const label = typeof value === "string" && value.length <= 180 ? value : kind;
          nodes.push({ id: fieldId, kind, label });
          edges.push({ from: productId, to: fieldId });
        }
      }
      return freezeDeepRealProduct({ nodes, edges });
    },
  };
}

export function createRealProductStatistics(init: RealProductStatistics): RealProductStatistics {
  return freezeDeepRealProduct({
    pageCount: init.pageCount,
    observedProductCount: init.observedProductCount,
    issueCount: init.issueCount,
    executionTime: init.executionTime,
  });
}

export function createRealProductSessionSnapshot(init: {
  sessionId: string;
  products: readonly RealObservedProduct[];
  graph: RealProductEvidenceGraph;
  statistics: RealProductStatistics;
  context: RealProductContextRecord;
  createdAt: string;
  metadata?: RealProductMetadata;
}): RealProductSessionSnapshot {
  return freezeDeepRealProduct({
    sessionId: init.sessionId,
    products: init.products,
    graph: init.graph,
    statistics: init.statistics,
    context: { landingPageIds: [...init.context.landingPageIds] },
    createdAt: init.createdAt,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    metadata: { ...(init.metadata ?? {}) },
  });
}
