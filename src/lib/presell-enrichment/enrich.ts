import { classifyAttribute, isRenderableIngredient } from "@/lib/attribute-class";
import { isProductDefiningDescription } from "@/lib/import-heuristics";
import { isIncompleteFragment } from "@/lib/lp-generator/structure";
import { faqEntryAllowed } from "@/lib/presell-copy/faq-select";
import { emptyProductFacts, type ProductFacts } from "@/lib/product-facts";
import type { ConflictRecord, EnrichmentSource } from "@/lib/product-enrichment/types";
import { buildPresellPlan } from "@/lib/presell-strategy/plan";
import type { ProductContract } from "@/lib/product-contract/types";
import { classifyEvidence, isCharacteristicNotBenefit } from "@/lib/presell-enrichment/classify";
import { buildEvidenceRegistry, publishableEntries } from "@/lib/presell-enrichment/registry";
import type {
  EnrichedFieldPayload,
  PresellEnrichmentResult,
  PresellSemanticField,
  PresellSectionTrace,
} from "@/lib/presell-enrichment/types";
import { PRESELL_ENRICHMENT_VERSION, PRESELL_SEMANTIC_FIELDS } from "@/lib/presell-enrichment/types";
import {
  composeNeutralOverviewFromFacts,
  needsGuaranteeRestatement,
  restateOperationalGuarantee,
} from "@/lib/presell-copy/restate";

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function keepComponent(text: string): boolean {
  if (isIncompleteFragment(text)) return false;
  if (/\b(formula|system|complex|blend|support\w*)\b/i.test(text) && text.trim().split(/\s+/).length <= 4 && !/\d/.test(text)) {
    return false;
  }
  return isRenderableIngredient(text);
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function payload(field: PresellSemanticField, registry: ReturnType<typeof buildEvidenceRegistry>): EnrichedFieldPayload {
  const rows = publishableEntries(registry, field);
  return {
    field,
    texts: unique(rows.map((item) => item.originalText)),
    evidenceIds: rows.map((item) => item.id),
    publishable: rows.length > 0,
    reason: rows.length ? "Publishable source-stated evidence is available." : "No publishable evidence for this field.",
  };
}

function applyFacts(base: ProductFacts, registry: ReturnType<typeof buildEvidenceRegistry>, added: string[]): ProductFacts {
  const facts: ProductFacts = {
    ...base,
    features: [...base.features],
    ingredientsOrComponents: [...base.ingredientsOrComponents],
    usageInformation: [...base.usageInformation],
    cautions: [...base.cautions],
    specifications: [...(base.specifications ?? [])],
    sourceSnippets: [...(base.sourceSnippets ?? [])],
    confidence: { ...base.confidence },
  };

  const leftoverFeatures: string[] = [];
  facts.ingredientsOrComponents = unique(facts.ingredientsOrComponents.filter((text) => {
    if (keepComponent(text)) return true;
    if (classifyAttribute(text).class === "PRODUCT_FEATURE") leftoverFeatures.push(text);
    return false;
  }));
  facts.features = unique([...facts.features, ...leftoverFeatures]);
  facts.sourceSnippets = facts.sourceSnippets.filter((snippet) => {
    if (snippet.field.toLowerCase() !== "faq") return true;
    return faqEntryAllowed(snippet.question ?? "", snippet.text).ok;
  });
  if (facts.description) {
    const classified = classifyEvidence({ field: "PRODUCT_OVERVIEW", text: facts.description });
    if (classified.restriction !== "PUBLISHABLE" && classified.restriction !== "ATTRIBUTED_ONLY") {
      facts.description = undefined;
      facts.confidence.description = "NOT_FOUND";
    }
  }

  const overview = payload("PRODUCT_OVERVIEW", registry);
  const purpose = payload("PRODUCT_PURPOSE", registry);
  const identityOverview = [...overview.texts, ...purpose.texts].find(
    (text) => isProductDefiningDescription(text) || /\b(is a|is an|supplied as|formulated as|sold as)\b/i.test(text),
  );
  if (!facts.description) {
    const text = identityOverview ?? composeNeutralOverviewFromFacts(facts);
    if (text) {
      facts.description = text;
      facts.confidence.description = text === identityOverview ? "DIRECT_SOURCE" : "MANUAL";
      added.push("description");
    }
  }

  const features = unique([
    ...facts.features,
    ...payload("FEATURES", registry).texts.filter(isCharacteristicNotBenefit),
    ...payload("DIFFERENTIATORS", registry).texts.filter(isCharacteristicNotBenefit),
  ]);
  if (features.length > facts.features.length) added.push("features");
  facts.features = features;
  if (facts.features.length) facts.confidence.features = facts.confidence.features === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.features;

  const ingredients = unique([
    ...facts.ingredientsOrComponents,
    ...payload("INGREDIENTS", registry).texts.filter(keepComponent),
  ]);
  if (ingredients.length > facts.ingredientsOrComponents.length) added.push("ingredientsOrComponents");
  facts.ingredientsOrComponents = ingredients;
  if (facts.ingredientsOrComponents.length) {
    facts.confidence.ingredientsOrComponents =
      facts.confidence.ingredientsOrComponents === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.ingredientsOrComponents;
  }

  const usage = unique([
    ...facts.usageInformation,
    ...payload("HOW_TO_USE", registry).texts,
    ...payload("HOW_IT_WORKS", registry).texts,
  ]);
  if (usage.length > facts.usageInformation.length) added.push("usageInformation");
  facts.usageInformation = usage;
  if (facts.usageInformation.length) {
    facts.confidence.usageInformation = facts.confidence.usageInformation === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.usageInformation;
  }

  const cautions = unique([...facts.cautions, ...payload("CAUTIONS", registry).texts]);
  if (cautions.length > facts.cautions.length) added.push("cautions");
  facts.cautions = cautions;
  if (facts.cautions.length) facts.confidence.cautions = facts.confidence.cautions === "NOT_FOUND" ? "DIRECT_SOURCE" : facts.confidence.cautions;

  const specs = [...(facts.specifications ?? [])];
  const haveSpec = new Set(specs.map((item) => keyOf(item.name)));
  for (const row of publishableEntries(registry, "SPECIFICATIONS")) {
    const name = row.name ?? row.originalText;
    if (!name || haveSpec.has(keyOf(name))) continue;
    haveSpec.add(keyOf(name));
    specs.push({
      name,
      value: row.value ?? row.originalText,
      unit: row.unit,
      provenance: "DIRECT_SOURCE",
      copyEligibility: "YES",
      policyFindings: [],
      sourceUrl: row.url,
      sourcePageCategory: "PRODUCT_DETAILS",
      retrievedAt: row.collectedAt ?? undefined,
    });
    added.push("specifications");
  }
  facts.specifications = specs;

  const guaranteePool = [
    facts.guaranteeInformation,
    ...payload("WARRANTY_OR_GUARANTEE", registry).texts,
    ...registry.entries
      .filter((item) => /money[- ]back|refund|guarantee/i.test(item.originalText))
      .map((item) => item.originalText),
  ].filter((item): item is string => Boolean(item));
  if (!facts.guaranteeInformation || needsGuaranteeRestatement(facts.guaranteeInformation)) {
    for (const candidate of guaranteePool) {
      const restated = restateOperationalGuarantee(candidate);
      if (restated) {
        facts.guaranteeInformation = restated;
        facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
        added.push("guaranteeInformation");
        break;
      }
    }
    if (!facts.guaranteeInformation) {
      const guarantee = payload("WARRANTY_OR_GUARANTEE", registry).texts[0];
      if (guarantee) {
        facts.guaranteeInformation = guarantee;
        facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
        added.push("guaranteeInformation");
      }
    }
  }

  const haveFaq = new Set(
    facts.sourceSnippets.filter((item) => item.field === "faq").map((item) => keyOf(item.question ?? "")),
  );
  for (const row of publishableEntries(registry, "FAQ")) {
    if (!row.question || haveFaq.has(keyOf(row.question))) continue;
    haveFaq.add(keyOf(row.question));
    facts.sourceSnippets.push({
      field: "faq",
      text: row.originalText,
      question: row.question,
      sourceUrl: row.url,
      confidence: "DIRECT_SOURCE",
      retrievedAt: row.collectedAt ?? undefined,
    });
    added.push("faq");
  }

  return facts;
}

const SLOT_FIELDS: Record<string, PresellSemanticField[]> = {
  HERO: [],
  PRODUCT_OVERVIEW: ["PRODUCT_OVERVIEW", "PRODUCT_PURPOSE"],
  KEY_DIFFERENTIATORS: ["FEATURES", "DIFFERENTIATORS"],
  HOW_IT_WORKS: ["HOW_TO_USE", "HOW_IT_WORKS"],
  INGREDIENTS_OR_SPECIFICATIONS: ["INGREDIENTS", "SPECIFICATIONS"],
  PRODUCT_CONSIDERATIONS: ["CAUTIONS"],
  FAQ: ["FAQ"],
  OFFICIAL_OFFER_HANDOFF: [],
  LEGAL_DISCLOSURE: ["SOURCE_REFERENCES"],
};

const SLOT_CONTRACT_FIELDS: Record<string, string[]> = {
  HERO: ["productFormat", "productName"],
  PRODUCT_OVERVIEW: ["description"],
  KEY_DIFFERENTIATORS: ["features"],
  HOW_IT_WORKS: ["usageInformation"],
  INGREDIENTS_OR_SPECIFICATIONS: ["ingredientsOrComponents", "specifications"],
  PRODUCT_CONSIDERATIONS: ["cautions", "returnsInformation", "shippingInformation"],
  FAQ: ["faq"],
  OFFICIAL_OFFER_HANDOFF: ["offerFacts"],
  LEGAL_DISCLOSURE: [],
};

function sectionTrace(contract: ProductContract | null, registry: ReturnType<typeof buildEvidenceRegistry>): PresellSectionTrace[] {
  if (!contract) return [];
  const plan = buildPresellPlan(contract);
  return plan.slots.map((slot) => {
    const registryIds = (SLOT_FIELDS[slot.slot] ?? []).flatMap((field) => publishableEntries(registry, field).map((item) => item.id));
    const contractIds = contract.evidence
      .filter((item) => (SLOT_CONTRACT_FIELDS[slot.slot] ?? []).includes(item.field))
      .map((item) => item.id);
    return {
      slot: slot.slot,
      status: slot.include ? "SELECTED" : "OMITTED",
      evidenceIds: [...new Set([...registryIds, ...contractIds])],
      selectionReason: slot.include ? slot.reason : null,
      omissionReason: slot.include ? null : slot.reason,
    };
  });
}

export function enrichPresellContent(input: {
  facts: ProductFacts;
  sources: EnrichmentSource[];
  withheld?: Array<{ field: string; text: string; reason: string }>;
  conflicts?: ConflictRecord[];
  contract?: ProductContract | null;
}): PresellEnrichmentResult {
  const registry = buildEvidenceRegistry({
    sources: input.sources,
    facts: input.facts,
    withheld: input.withheld,
    conflicts: input.conflicts,
  });
  const addedFields: string[] = [];
  const facts = applyFacts(input.facts ?? emptyProductFacts("", "", "IMPORTED"), registry, addedFields);
  const fields = PRESELL_SEMANTIC_FIELDS.map((field) => payload(field, registry));
  const benefitCandidates = unique(
    registry.entries
      .filter((item) => item.field === "SELLER_CLAIMS" && item.restriction === "ATTRIBUTED_ONLY")
      .map((item) => item.originalText),
  );
  const limitations: string[] = [];
  if (!input.sources.some((source) => source.html || (source.records ?? []).length)) {
    limitations.push("No source HTML or structured records were available. Only already persisted facts were used.");
  }
  if (registry.blocked.length) {
    limitations.push(`${registry.blocked.length} evidence items were blocked and were not restated as facts.`);
  }
  if (registry.conflicts.length) {
    limitations.push("Conflicting values were recorded and not silently selected.");
  }

  return {
    version: PRESELL_ENRICHMENT_VERSION,
    facts,
    registry,
    fields,
    benefitCandidates,
    addedFields: unique(addedFields),
    omittedEmpty: fields.filter((item) => !item.publishable).map((item) => item.field),
    sections: sectionTrace(input.contract ?? null, registry),
    limitations,
  };
}
