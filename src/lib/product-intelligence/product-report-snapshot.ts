/**
 * Host record domain: product intelligence report snapshot.
 *
 * Frozen report records, evidence graph, context contract, and snapshot.
 * Presence means a bundle or construct was observed. It is not a judgment,
 * not an approval, and not a refusal of a product. This module does not
 * fetch a page and does not run another engine.
 */
export type ProductReportMetadata = Record<string, string | number | boolean | null>;

export const PRODUCT_REPORT_STATUSES = ["OK", "REJECTED"] as const;
export type ProductReportStatus = (typeof PRODUCT_REPORT_STATUSES)[number];

export const PRODUCT_REPORT_ORIGINS = ["OBSERVED"] as const;
export type ProductReportOrigin = (typeof PRODUCT_REPORT_ORIGINS)[number];

export const PRODUCT_REPORT_PROVENANCE = ["DIRECT_SOURCE"] as const;
export type ProductReportProvenance = (typeof PRODUCT_REPORT_PROVENANCE)[number];

export const PRODUCT_REPORT_PRESENCE = ["PRESENT", "ABSENT"] as const;
export type ProductReportPresence = (typeof PRODUCT_REPORT_PRESENCE)[number];

export interface ProductReportIssue {
  field: string;
  message: string;
}

export const PRODUCT_REPORT_CONTEXT_MEMBERS = [
  "productFacts",
  "landingPageEvidence",
  "searchEvidence",
  "competitionEvidence",
  "commercialEvidence",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;

export interface ProductReportContext {
  productFacts: Record<string, unknown>;
  landingPageEvidence?: Record<string, unknown>;
  searchEvidence?: Record<string, unknown>;
  competitionEvidence?: Record<string, unknown>;
  commercialEvidence?: Record<string, unknown>;
  executionMetadata?: ProductReportMetadata;
  runtimeMetadata?: ProductReportMetadata;
  configuration?: ProductReportMetadata;
}

export const PRODUCT_REPORT_SOURCE_FACT_KEYS = ["field", "text", "sourceUrl", "confidence"] as const;

export interface ProductReportSourceFact {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: ProductReportProvenance;
}

export const PRODUCT_REPORT_IMPORTED_PRODUCT_KEYS = ["productName", "vendor", "category", "landingPage"] as const;

export interface ProductReportImportedProduct {
  productName: string;
  vendor: string | null;
  category: string | null;
  landingPage: string | null;
}

export const PRODUCT_REPORT_LANDING_PAGE_SUMMARY_KEYS = [
  "headline",
  "primaryCta",
  "priceVisibility",
  "guarantee",
  "refundPolicy",
] as const;

export interface ProductReportLandingPageSummary {
  headline: string | null;
  primaryCta: string | null;
  priceVisibility: ProductReportPresence;
  guarantee: string | null;
  refundPolicy: string | null;
}

export const PRODUCT_REPORT_SEARCH_SUMMARY_KEYS = [
  "searchResultPresence",
  "officialWebsite",
  "sponsoredResultPresence",
  "sponsoredResultCount",
  "reviewWebsites",
] as const;

export interface ProductReportSearchSummary {
  searchResultPresence: ProductReportPresence;
  officialWebsite: string | null;
  sponsoredResultPresence: ProductReportPresence;
  sponsoredResultCount: number;
  reviewWebsites: readonly string[];
}

export const PRODUCT_REPORT_COMPETITION_SUMMARY_KEYS = [
  "numberOfAdvertisers",
  "brandPresence",
  "marketplacePresence",
  "affiliateAdvertisers",
  "reviewSites",
] as const;

export interface ProductReportCompetitionSummary {
  numberOfAdvertisers: number;
  brandPresence: ProductReportPresence;
  marketplacePresence: ProductReportPresence;
  affiliateAdvertisers: readonly string[];
  reviewSites: readonly string[];
}

export const PRODUCT_REPORT_COMMERCIAL_SUMMARY_KEYS = [
  "directPurchaseIntent",
  "priceVisibility",
  "commercialSearchPresence",
  "sponsoredSearchPresence",
  "supportAvailability",
] as const;

export interface ProductReportCommercialSummary {
  directPurchaseIntent: ProductReportPresence;
  priceVisibility: ProductReportPresence;
  commercialSearchPresence: ProductReportPresence;
  sponsoredSearchPresence: ProductReportPresence;
  supportAvailability: ProductReportPresence;
}

export const PRODUCT_REPORT_EVIDENCE_SUMMARY_KEYS = [
  "productFacts",
  "landingPageEvidence",
  "searchEvidence",
  "competitionEvidence",
  "commercialEvidence",
] as const;

export interface ProductReportEvidenceSummary {
  productFacts: ProductReportPresence;
  landingPageEvidence: ProductReportPresence;
  searchEvidence: ProductReportPresence;
  competitionEvidence: ProductReportPresence;
  commercialEvidence: ProductReportPresence;
}

export const PRODUCT_REPORT_DATA_QUALITY_KEYS = ["presentCount", "missingCount"] as const;

export interface ProductReportDataQuality {
  presentCount: number;
  missingCount: number;
}

export const PRODUCT_REPORT_GRAPH_NODE_KEYS = ["id", "kind", "present"] as const;

export interface ProductReportGraphNode {
  id: string;
  kind: string;
  present: ProductReportPresence;
}

export const PRODUCT_REPORT_GRAPH_EDGE_KEYS = ["from", "to"] as const;

export interface ProductReportGraphEdge {
  from: string;
  to: string;
}

export const PRODUCT_REPORT_GRAPH_KEYS = ["nodes", "edges"] as const;

export interface EvidenceGraph {
  nodes: readonly ProductReportGraphNode[];
  edges: readonly ProductReportGraphEdge[];
}

export const PRODUCT_REPORT_KEYS = [
  "importedProduct",
  "landingPageSummary",
  "searchSummary",
  "competitionSummary",
  "commercialSummary",
  "evidenceSummary",
  "dataQuality",
  "missingEvidence",
  "warnings",
  "evidenceGraph",
  "origin",
  "provenance",
  "sourceUrl",
  "sourceFacts",
  "metadata",
] as const;

export interface ProductIntelligenceReport {
  importedProduct: ProductReportImportedProduct;
  landingPageSummary: ProductReportLandingPageSummary | null;
  searchSummary: ProductReportSearchSummary | null;
  competitionSummary: ProductReportCompetitionSummary | null;
  commercialSummary: ProductReportCommercialSummary | null;
  evidenceSummary: ProductReportEvidenceSummary;
  dataQuality: ProductReportDataQuality;
  missingEvidence: readonly string[];
  warnings: readonly string[];
  evidenceGraph: EvidenceGraph;
  origin: ProductReportOrigin;
  provenance: ProductReportProvenance;
  sourceUrl: string;
  sourceFacts: readonly ProductReportSourceFact[];
  metadata: ProductReportMetadata;
}

export const PRODUCT_REPORT_SNAPSHOT_KEYS = [
  "reportId",
  "productName",
  "landingPage",
  "createdAt",
  "metadata",
] as const;

export interface ProductReportSnapshot {
  reportId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata: ProductReportMetadata;
}

export interface ProductReportSnapshotInit {
  reportId: string;
  productName: string;
  landingPage: string | null;
  createdAt: string;
  metadata?: ProductReportMetadata;
}

export const PRODUCT_REPORT_GRAPH_NODE_KINDS = [
  "ProductFacts",
  "LandingPageEvidence",
  "SearchEvidence",
  "CompetitionEvidence",
  "CommercialEvidence",
] as const;

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepProductReport<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepProductReport(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainProductReport<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainProductReport(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainProductReport(inner)])) as T;
  }
  return value;
}

export function createProductReportSnapshot(init: ProductReportSnapshotInit): ProductReportSnapshot {
  return freezeDeepProductReport({
    reportId: init.reportId,
    productName: init.productName,
    landingPage: init.landingPage,
    createdAt: init.createdAt,
    metadata: copyPlainProductReport(init.metadata ?? {}),
  });
}

export function createEvidenceGraph(nodes: readonly ProductReportGraphNode[], edges: readonly ProductReportGraphEdge[]): EvidenceGraph {
  return freezeDeepProductReport({
    nodes: nodes.map((node) => ({ id: node.id, kind: node.kind, present: node.present })),
    edges: edges.map((edge) => ({ from: edge.from, to: edge.to })),
  });
}

export function createProductIntelligenceReportRecord(init: ProductIntelligenceReport): ProductIntelligenceReport {
  return freezeDeepProductReport({
    importedProduct: copyPlainProductReport(init.importedProduct),
    landingPageSummary: init.landingPageSummary ? copyPlainProductReport(init.landingPageSummary) : null,
    searchSummary: init.searchSummary ? copyPlainProductReport(init.searchSummary) : null,
    competitionSummary: init.competitionSummary ? copyPlainProductReport(init.competitionSummary) : null,
    commercialSummary: init.commercialSummary ? copyPlainProductReport(init.commercialSummary) : null,
    evidenceSummary: copyPlainProductReport(init.evidenceSummary),
    dataQuality: copyPlainProductReport(init.dataQuality),
    missingEvidence: [...init.missingEvidence],
    warnings: [...init.warnings],
    evidenceGraph: init.evidenceGraph,
    origin: "OBSERVED",
    provenance: "DIRECT_SOURCE",
    sourceUrl: init.sourceUrl,
    sourceFacts: init.sourceFacts.map((item) => copyPlainProductReport(item)),
    metadata: copyPlainProductReport(init.metadata),
  });
}
