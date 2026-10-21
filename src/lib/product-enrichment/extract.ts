import { extractProductFacts } from "@/lib/import-product";
import { extractOperationalFactsFromHtml } from "@/lib/operational-evidence";
import { extractProductImageCandidates } from "@/lib/product-image";
import { emptyProductFacts, type OfferFact, type ProductFacts, type SpecificationFact, type SourceFact } from "@/lib/product-facts";
import type { EnrichmentSource, StructuredRecord } from "@/lib/product-enrichment/types";

export type ExtractedBatch = {
  facts: ProductFacts;
  snippets: SourceFact[];
  specs: SpecificationFact[];
  offers: OfferFact[];
  visualCandidates: Array<{ url: string; sourceUrl: string }>;
};

function retrieved(source: EnrichmentSource): string | undefined {
  return source.retrievedAt;
}

function specFrom(record: StructuredRecord, source: EnrichmentSource): SpecificationFact | null {
  const name = (record.name ?? "").trim();
  const value = (record.value ?? record.text ?? "").trim();
  if (!name || !value) return null;
  return {
    name,
    value,
    unit: record.unit,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: source.url,
    sourcePageCategory: source.pageCategory ?? "PRODUCT_DETAILS",
    retrievedAt: retrieved(source),
  };
}

function offerFrom(record: StructuredRecord, source: EnrichmentSource): OfferFact | null {
  const packageName = (record.packageName ?? "").trim();
  const totalPrice = (record.totalPrice ?? "").trim();
  const unitPrice = (record.unitPrice ?? totalPrice).trim();
  if (!packageName || !unitPrice) return null;
  return {
    packageName,
    unitPrice,
    totalPrice: totalPrice || unitPrice,
    quantity: record.quantity,
    sourceUrl: source.url,
    confidence: "DIRECT_SOURCE",
  };
}

function applyRecords(batch: ExtractedBatch, source: EnrichmentSource): void {
  for (const record of source.records ?? []) {
    const text = (record.text ?? record.value ?? "").trim();
    const at = retrieved(source);
    if (record.field === "specification") {
      const spec = specFrom(record, source);
      if (spec) batch.specs.push(spec);
      continue;
    }
    if (record.field === "offer") {
      const offer = offerFrom(record, source);
      if (offer) batch.offers.push(offer);
      continue;
    }
    if (!text) continue;
    if (record.field === "faq" && record.question) {
      batch.snippets.push({
        field: "faq",
        text,
        question: record.question,
        sourceUrl: source.url,
        confidence: "DIRECT_SOURCE",
        sourcePageCategory: source.pageCategory ?? "FAQ",
        retrievedAt: at,
      });
      continue;
    }
    if (record.field === "feature") batch.facts.features.push(text);
    if (record.field === "component") batch.facts.ingredientsOrComponents.push(text);
    if (record.field === "usage") batch.facts.usageInformation.push(text);
    if (record.field === "caution") batch.facts.cautions.push(text);
    if (record.field === "description" && !batch.facts.description) batch.facts.description = text;
    if (record.field === "pricing" && !batch.facts.pricingInformation) batch.facts.pricingInformation = text;
    if (record.field === "guarantee" && !batch.facts.guaranteeInformation) batch.facts.guaranteeInformation = text;
    if (record.field === "manufacturer" && !batch.facts.manufacturer) batch.facts.manufacturer = text;
    if (record.field === "returns") {
      batch.facts.returnsInformation = [
        ...(batch.facts.returnsInformation ?? []),
        {
          statement: text,
          kind: (record.kind as "RETURN_WINDOW") ?? "OTHER",
          provenance: "DIRECT_SOURCE",
          copyEligibility: "YES",
          policyFindings: [],
          sourceUrl: source.url,
          sourcePageCategory: source.pageCategory ?? "RETURNS",
          retrievedAt: at,
        },
      ];
    }
    if (record.field === "shipping") {
      batch.facts.shippingInformation = [
        ...(batch.facts.shippingInformation ?? []),
        {
          statement: text,
          kind: (record.kind as "PROCESSING") ?? "OTHER",
          provenance: "DIRECT_SOURCE",
          copyEligibility: "YES",
          policyFindings: [],
          sourceUrl: source.url,
          sourcePageCategory: source.pageCategory ?? "SHIPPING",
          retrievedAt: at,
        },
      ];
    }
    batch.snippets.push({
      field: record.field,
      text,
      sourceUrl: source.url,
      confidence: "DIRECT_SOURCE",
      sourcePageCategory: source.pageCategory,
      retrievedAt: at,
    });
  }
}

export function extractSources(sources: EnrichmentSource[]): ExtractedBatch {
  const batch: ExtractedBatch = {
    facts: emptyProductFacts("", sources[0]?.url ?? "", "IMPORTED"),
    snippets: [],
    specs: [],
    offers: [],
    visualCandidates: [],
  };

  for (const source of sources) {
    if (source.html) {
      const extracted = extractProductFacts(source.html, source.url);
      batch.facts.features.push(...extracted.features);
      batch.facts.ingredientsOrComponents.push(...extracted.ingredientsOrComponents);
      batch.facts.usageInformation.push(...extracted.usageInformation);
      batch.facts.cautions.push(...extracted.cautions);
      if (!batch.facts.description && extracted.description) batch.facts.description = extracted.description;
      if (!batch.facts.pricingInformation && extracted.pricingInformation) batch.facts.pricingInformation = extracted.pricingInformation;
      if (!batch.facts.guaranteeInformation && extracted.guaranteeInformation) batch.facts.guaranteeInformation = extracted.guaranteeInformation;
      if (!batch.facts.manufacturer && extracted.manufacturer) batch.facts.manufacturer = extracted.manufacturer;
      batch.snippets.push(...extracted.sourceSnippets);
      batch.specs.push(...(extracted.specifications ?? []));
      batch.offers.push(...(extracted.offerFacts ?? []));
      if (source.pageCategory === "RETURNS" || source.pageCategory === "SHIPPING" || source.pageCategory === "REFUNDS") {
        const operational = extractOperationalFactsFromHtml(source.html, source.url, source.pageCategory, source.retrievedAt);
        batch.facts.returnsInformation = [...(batch.facts.returnsInformation ?? []), ...operational.returns];
        batch.facts.shippingInformation = [...(batch.facts.shippingInformation ?? []), ...operational.shipping];
      }
      for (const image of extractProductImageCandidates(source.html, source.url)) {
        batch.visualCandidates.push({ url: image.url, sourceUrl: source.url });
      }
    }
    applyRecords(batch, source);
  }
  return batch;
}
