/**
 * Host record domain: product opportunity mapper.
 *
 * Reads a Product Intelligence bundle and restates a Discovery candidate, an
 * Opportunity signal context, an evidence-provider context, and an evidence
 * mapping. Field names match those engines. It never calls them, never
 * judges a product, and never invents a missing field. This layer stays
 * offline.
 */
import { PRODUCT_OPPORTUNITY_GRAPH_FIELDS, PRODUCT_OPPORTUNITY_GRAPH_KINDS, type ProductOpportunityContext } from "./product-opportunity-context";
import {
  copyPlainProductOpportunity,
  createEvidenceMapping,
  type DiscoveryReadyContext,
  type EvidenceProviderReadyContext,
  type OpportunityReadyContext,
  type ProductOpportunityEvidenceMapping,
  type ProductOpportunityIssue,
  type ProductOpportunityMappingEntry,
  type ProductOpportunityMetadata,
} from "./product-opportunity-snapshot";

export interface ProductOpportunityMapped {
  discoveryContext: DiscoveryReadyContext;
  opportunityContext: OpportunityReadyContext;
  evidenceProvider: EvidenceProviderReadyContext;
  evidenceMapping: ProductOpportunityEvidenceMapping;
  productName: string;
  landingPage: string;
}

export interface ProductOpportunityMapper {
  map(input: unknown, createdAt: string, metadata?: ProductOpportunityMetadata): { mapped: ProductOpportunityMapped | null; issues: ProductOpportunityIssue[] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function slugOf(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.startsWith("-") || slug === "" ? "" : slug;
}

function push(entries: ProductOpportunityMappingEntry[], from: string, to: string, text: string | null) {
  if (!text || text === "ABSENT") return;
  entries.push({ from, to, text });
}

export function createProductOpportunityMapper(): ProductOpportunityMapper {
  return {
    map(input, createdAt, metadata = {}) {
      if (!isPlainRecord(input) || !isPlainRecord(input.productFacts)) {
        return { mapped: null, issues: [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }] };
      }
      const draft = input as unknown as ProductOpportunityContext;
      const facts = draft.productFacts;
      const productName = textOf(facts.productName) ?? textOf(facts.name) ?? "";
      const landingPage = textOf(facts.landingPage) ?? textOf(facts.affiliatePage) ?? "";
      const slug = slugOf(productName);
      if (slug === "" || landingPage === "") {
        return { mapped: null, issues: [{ field: "landingPage", message: "Invalid Mapping: a product name and a landing page are required." }] };
      }
      const vendor = textOf(facts.vendor);
      const category = textOf(facts.category);
      const discoveryContext: DiscoveryReadyContext = {
        id: slug,
        source: "product-intelligence",
        url: landingPage,
        title: productName,
        status: "NEW",
        createdAt,
      };
      const executionMetadata = copyPlainProductOpportunity(metadata);
      const runtime = isPlainRecord(draft.runtimeMetadata) ? copyPlainProductOpportunity(draft.runtimeMetadata) : {};
      const configuration = isPlainRecord(draft.configuration) ? copyPlainProductOpportunity(draft.configuration) : {};
      const importedMetadata: ProductOpportunityMetadata = {
        productName,
        vendor,
        category,
        landingPage,
        source: "product-intelligence",
      };
      const opportunityContext: OpportunityReadyContext = {
        candidate: { ...discoveryContext },
        importedMetadata,
        executionMetadata,
        configuration,
        runtime,
        extensions: {},
      };
      const resolved: Record<string, unknown> = {};
      for (const kind of PRODUCT_OPPORTUNITY_GRAPH_KINDS) {
        const field = PRODUCT_OPPORTUNITY_GRAPH_FIELDS[kind];
        const bundle = draft[field];
        if (isPlainRecord(bundle)) resolved[field] = copyPlainProductOpportunity(bundle);
      }
      if (isPlainRecord(draft.evidenceGraph)) resolved.evidenceGraph = copyPlainProductOpportunity(draft.evidenceGraph);
      if (isPlainRecord(draft.productIntelligenceReport)) resolved.productIntelligenceReport = copyPlainProductOpportunity(draft.productIntelligenceReport);
      const evidenceProvider: EvidenceProviderReadyContext = {
        candidate: { ...discoveryContext },
        resolvedProductData: resolved,
        metadata: { ...executionMetadata },
        runtime: { ...runtime },
        configuration: { ...configuration },
        extensions: {},
      };
      const entries: ProductOpportunityMappingEntry[] = [];
      push(entries, "ProductFacts.productName", "DiscoveryContext.title", productName);
      push(entries, "ProductFacts.landingPage", "DiscoveryContext.url", landingPage);
      push(entries, "ProductFacts.vendor", "OpportunityContext.importedMetadata.vendor", vendor);
      push(entries, "ProductFacts.category", "OpportunityContext.importedMetadata.category", category);
      push(entries, "EvidenceGraph", "EvidenceProvider.resolvedProductData", "PRESENT");
      const page = isPlainRecord(draft.landingPageEvidence) ? draft.landingPageEvidence : {};
      const search = isPlainRecord(draft.searchEvidence) ? draft.searchEvidence : {};
      const commercial = isPlainRecord(draft.commercialEvidence) ? draft.commercialEvidence : {};
      push(entries, "CommercialEvidence.directPurchaseIntent", "SignalPipeline.PURCHASE_INTENT", textOf(commercial.directPurchaseIntent));
      push(entries, "LandingPageEvidence.priceVisibility", "SignalPipeline.PRICE_VISIBILITY", textOf(page.priceVisibility) ?? textOf(commercial.priceVisibility));
      push(entries, "LandingPageEvidence.primaryCta", "SignalPipeline.OFFER_VISIBILITY", textOf(page.primaryCta));
      push(entries, "SearchEvidence.faqResults", "SignalPipeline.PROBLEM_AWARENESS", Array.isArray(search.faqResults) ? textOf(search.faqResults[0]) : null);
      push(entries, "SearchEvidence.officialWebsite", "SignalPipeline.SOLUTION_AWARENESS", textOf(search.officialWebsite));
      push(entries, "CommercialEvidence.vendorReputation", "SignalPipeline.CONSUMER_TRUST", textOf(commercial.vendorReputation));
      push(entries, "SearchEvidence.searchResultPresence", "SignalPipeline.MARKET_DEMAND", textOf(search.searchResultPresence));
      push(entries, "CommercialEvidence.checkoutPresence", "SignalPipeline.BUYER_READINESS", textOf(commercial.checkoutPresence));
      push(entries, "CommercialEvidence.recurringBilling", "SignalPipeline.RECURRING_PURCHASE_POTENTIAL", textOf(commercial.recurringBilling));
      push(entries, "CommercialEvidence.upsellPresence", "SignalPipeline.UPSELL_POTENTIAL", textOf(commercial.upsellPresence));
      return {
        mapped: {
          discoveryContext,
          opportunityContext,
          evidenceProvider,
          evidenceMapping: createEvidenceMapping(entries),
          productName,
          landingPage,
        },
        issues: [],
      };
    },
  };
}
