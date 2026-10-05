/**
 * Host record domain: product intelligence report builder.
 *
 * Reads duck-typed ProductFacts and evidence records and restates an
 * imported product, summaries, evidence graph, data quality, missing
 * evidence, and warnings. Presence tokens mean a bundle was observed.
 * They are not judgments. It never fetches a page and never invents a
 * missing field. This layer stays offline.
 */
import {
  createEvidenceGraph,
  createProductIntelligenceReportRecord,
  type ProductIntelligenceReport,
  type ProductReportContext,
  type ProductReportGraphEdge,
  type ProductReportGraphNode,
  type ProductReportIssue,
  type ProductReportLandingPageSummary,
  type ProductReportMetadata,
  type ProductReportPresence,
  type ProductReportSearchSummary,
  type ProductReportSourceFact,
  type ProductReportCompetitionSummary,
  type ProductReportCommercialSummary,
} from "./product-report-snapshot";

export interface ProductReportBuilder {
  build(input: unknown, metadata?: ProductReportMetadata): { report: ProductIntelligenceReport | null; issues: ProductReportIssue[] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function listOf(value: unknown): string[] {
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

function presenceOf(value: unknown): ProductReportPresence {
  if (value === "PRESENT" || value === true) return "PRESENT";
  if (Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim() !== "")) return "PRESENT";
  if (typeof value === "string" && value.trim() !== "" && value !== "ABSENT") return "PRESENT";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return "PRESENT";
  return "ABSENT";
}

function countOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return 0;
}

function sourceFact(field: string, text: string | null, sourceUrl: string): ProductReportSourceFact | null {
  if (!text) return null;
  return { field, text, sourceUrl, confidence: "DIRECT_SOURCE" };
}

const BUNDLES = [
  { key: "productFacts", kind: "ProductFacts", id: "productFacts", required: true },
  { key: "landingPageEvidence", kind: "LandingPageEvidence", id: "landingPageEvidence", required: false },
  { key: "searchEvidence", kind: "SearchEvidence", id: "searchEvidence", required: false },
  { key: "competitionEvidence", kind: "CompetitionEvidence", id: "competitionEvidence", required: false },
  { key: "commercialEvidence", kind: "CommercialEvidence", id: "commercialEvidence", required: false },
] as const;

const EDGES: readonly ProductReportGraphEdge[] = [
  { from: "productFacts", to: "landingPageEvidence" },
  { from: "productFacts", to: "searchEvidence" },
  { from: "landingPageEvidence", to: "competitionEvidence" },
  { from: "searchEvidence", to: "competitionEvidence" },
  { from: "competitionEvidence", to: "commercialEvidence" },
];

function landingSummaryOf(page: Record<string, unknown>): ProductReportLandingPageSummary {
  return {
    headline: textOf(page.headline),
    primaryCta: textOf(page.primaryCta),
    priceVisibility: presenceOf(page.priceVisibility),
    guarantee: textOf(page.guarantee),
    refundPolicy: textOf(page.refundPolicy),
  };
}

function searchSummaryOf(search: Record<string, unknown>): ProductReportSearchSummary {
  return {
    searchResultPresence: presenceOf(search.searchResultPresence),
    officialWebsite: textOf(search.officialWebsite),
    sponsoredResultPresence: presenceOf(search.sponsoredResultPresence),
    sponsoredResultCount: countOf(search.sponsoredResultCount),
    reviewWebsites: listOf(search.reviewWebsites),
  };
}

function competitionSummaryOf(competition: Record<string, unknown>): ProductReportCompetitionSummary {
  return {
    numberOfAdvertisers: countOf(competition.numberOfAdvertisers),
    brandPresence: presenceOf(competition.brandPresence),
    marketplacePresence: presenceOf(competition.marketplacePresence),
    affiliateAdvertisers: listOf(competition.affiliateAdvertisers),
    reviewSites: listOf(competition.reviewSites),
  };
}

function commercialSummaryOf(commercial: Record<string, unknown>): ProductReportCommercialSummary {
  return {
    directPurchaseIntent: presenceOf(commercial.directPurchaseIntent),
    priceVisibility: presenceOf(commercial.priceVisibility),
    commercialSearchPresence: presenceOf(commercial.commercialSearchPresence),
    sponsoredSearchPresence: presenceOf(commercial.sponsoredSearchPresence),
    supportAvailability: presenceOf(commercial.supportAvailability),
  };
}

export function createProductReportBuilder(): ProductReportBuilder {
  return {
    build(input, metadata = {}) {
      if (!isPlainRecord(input) || !isPlainRecord(input.productFacts)) {
        return { report: null, issues: [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }] };
      }
      const draft = input as unknown as ProductReportContext;
      const facts = draft.productFacts;
      const page = isPlainRecord(draft.landingPageEvidence) ? draft.landingPageEvidence : null;
      const search = isPlainRecord(draft.searchEvidence) ? draft.searchEvidence : null;
      const competition = isPlainRecord(draft.competitionEvidence) ? draft.competitionEvidence : null;
      const commercial = isPlainRecord(draft.commercialEvidence) ? draft.commercialEvidence : null;
      const productName = textOf(facts.productName) ?? textOf(facts.name) ?? "";
      const vendor = textOf(facts.vendor);
      const category = textOf(facts.category);
      const landingPage = textOf(facts.landingPage) ?? textOf(facts.affiliatePage);
      const sourceUrl = landingPage ?? "";
      const present = {
        productFacts: "PRESENT" as const,
        landingPageEvidence: page ? ("PRESENT" as const) : ("ABSENT" as const),
        searchEvidence: search ? ("PRESENT" as const) : ("ABSENT" as const),
        competitionEvidence: competition ? ("PRESENT" as const) : ("ABSENT" as const),
        commercialEvidence: commercial ? ("PRESENT" as const) : ("ABSENT" as const),
      };
      const missingEvidence = BUNDLES.filter((bundle) => !bundle.required && present[bundle.key] === "ABSENT").map((bundle) => bundle.kind);
      const warnings = missingEvidence.map((kind) => `${kind} is absent.`);
      const presentCount = 1 + (page ? 1 : 0) + (search ? 1 : 0) + (competition ? 1 : 0) + (commercial ? 1 : 0);
      const nodes: ProductReportGraphNode[] = BUNDLES.map((bundle) => ({
        id: bundle.id,
        kind: bundle.kind,
        present: present[bundle.key],
      }));
      const factsList: ProductReportSourceFact[] = [];
      const push = (field: string, text: string | null) => {
        const item = sourceFact(field, text, sourceUrl);
        if (item) factsList.push(item);
      };
      push("productName", productName);
      push("vendor", vendor);
      push("category", category);
      push("landingPage", landingPage);
      for (const kind of missingEvidence) push("missingEvidence", kind);
      const report = createProductIntelligenceReportRecord({
        importedProduct: { productName, vendor, category, landingPage },
        landingPageSummary: page ? landingSummaryOf(page) : null,
        searchSummary: search ? searchSummaryOf(search) : null,
        competitionSummary: competition ? competitionSummaryOf(competition) : null,
        commercialSummary: commercial ? commercialSummaryOf(commercial) : null,
        evidenceSummary: present,
        dataQuality: { presentCount, missingCount: missingEvidence.length },
        missingEvidence,
        warnings,
        evidenceGraph: createEvidenceGraph(nodes, EDGES),
        origin: "OBSERVED",
        provenance: "DIRECT_SOURCE",
        sourceUrl,
        sourceFacts: factsList,
        metadata,
      });
      return { report, issues: [] };
    },
  };
}
