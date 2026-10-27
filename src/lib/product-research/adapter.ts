import { neutralizeEditorialText } from "@/lib/editorial-neutrality/neutralize";
import type { KnowledgeText } from "@/lib/product-knowledge";
import type { ProductContract } from "@/lib/product-contract/types";
import type { EvidenceRegistry } from "@/lib/presell-enrichment/types";
import type { PriceStatus } from "@/lib/research-coverage/types";
import type { FieldProposal, ProductResearchField } from "@/lib/product-research/types";
import { emptyProductFacts, withImportQuality, type ProductFacts } from "@/lib/product-facts";
import { splitIngredientPresentation } from "@/lib/product-research/approved-facts";

function join(values: string[]): string {
  return values.map((item) => item.trim()).filter(Boolean).join("\n");
}

function editorialLines(
  values: string[],
  role: Parameters<typeof neutralizeEditorialText>[0]["role"],
): { text: string; notes: string[] } {
  const notes: string[] = [];
  const kept: string[] = [];
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const editorial = neutralizeEditorialText({ text: clean, role });
    if (editorial.action === "OMIT" || !editorial.renderedText?.trim()) {
      notes.push(`Omitted a ${role ?? "field"} line that was not editorial-safe.`);
      continue;
    }
    kept.push(editorial.renderedText.trim());
  }
  return { text: join(kept), notes };
}

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

const FIELD_EVIDENCE: Partial<Record<ProductResearchField, string[]>> = {
  description: ["PRODUCT_OVERVIEW", "PRODUCT_PURPOSE"],
  ingredients: ["INGREDIENTS"],
  benefits: ["FEATURES"],
  howItWorks: ["HOW_TO_USE"],
  warnings: ["CAUTIONS"],
  guarantee: ["WARRANTY_OR_GUARANTEE"],
  faq: ["FAQ"],
  manufacturer: ["PRODUCT_OVERVIEW"],
};

function evidenceFor(registry: EvidenceRegistry, field: ProductResearchField, text: string): EvidenceRegistry["entries"] {
  const lines = text.split(/\r?\n/).map((item) => keyOf(item)).filter(Boolean);
  const full = keyOf(text);
  const allowed = new Set(FIELD_EVIDENCE[field] ?? []);
  const matches = registry.entries.filter((item) => {
    const original = keyOf(item.originalText);
    const name = keyOf(item.name ?? "");
    if (full && original === full) return true;
    if (lines.some((line) => line && (original === line || name === line || original.includes(line) || line.includes(original)))) {
      return !allowed.size || allowed.has(item.field) || original === full;
    }
    return false;
  });
  return matches;
}

function proposal(input: {
  field: ProductResearchField;
  current: string;
  suggested: string;
  role: "OVERVIEW" | "FEATURE" | "USAGE" | "FAQ" | "OPERATIONAL" | "GUARANTEE" | "CAUTION" | "OTHER";
  registry: EvidenceRegistry;
  sourceClassByUrl: Map<string, string>;
  notes?: string[];
  forceStatus?: FieldProposal["status"];
  eligibleForBatch?: boolean;
}): FieldProposal {
  const editorial = neutralizeEditorialText({ text: input.suggested, role: input.role });
  const suggested = editorial.action === "OMIT" ? "" : editorial.renderedText ?? "";
  const matches = suggested ? evidenceFor(input.registry, input.field, input.suggested).concat(evidenceFor(input.registry, input.field, suggested)) : [];
  const unique = [...new Map(matches.map((item) => [item.id, item])).values()];
  const match = unique[0];
  const notes = [...(input.notes ?? []), ...editorial.reasons];
  if (editorial.action === "OMIT") notes.push("The remainder was not editorial-safe and was not proposed.");
  if (editorial.action === "NEUTRALIZE" && editorial.renderedText) {
    notes.push("Operational remainder recovered from mixed source copy. Promotional or unsafe clauses were omitted.");
  }
  const incomplete = Boolean(suggested) && unique.length === 0;
  if (incomplete) notes.push("EVIDENCE_INCOMPLETE");
  const status =
    input.forceStatus ??
    (!suggested
      ? "NOT_FOUND"
      : match?.verification === "CONFLICTING"
        ? "CONFLICTING"
        : match?.verification === "UNVERIFIED" || match?.restriction === "NOT_PERMANENT"
          ? "UNVERIFIED"
          : match?.verification === "SELLER_STATED" || editorial.classification === "SELLER_STATED_FACT"
            ? "SELLER_STATED"
            : "FOUND_REVIEW_REQUIRED");
  const batch =
    input.eligibleForBatch ??
    (Boolean(suggested) &&
      !incomplete &&
      (status === "SELLER_STATED" || status === "FOUND_REVIEW_REQUIRED") &&
      input.field !== "benefits" &&
      input.field !== "images" &&
      input.field !== "videos" &&
      input.field !== "pricing");
  return {
    field: input.field,
    currentValue: input.current,
    suggestedValue: suggested,
    status,
    evidenceIds: unique.map((item) => item.id),
    sourceUrl: match?.url ?? null,
    sourceClass: match ? (input.sourceClassByUrl.get(match.url) ?? match.sourceClassification ?? null) : null,
    sourceType: match?.sourceType ?? null,
    verification: match?.verification ?? null,
    restriction: match?.restriction ?? null,
    collectedAt: match?.collectedAt ?? null,
    eligibleForBatch: batch && Boolean(suggested) && !incomplete,
    evidenceIncomplete: incomplete,
    evidenceExcerpt: match?.originalText.slice(0, 220) ?? null,
    notes: [...new Set(notes.filter(Boolean))],
    originalText: editorial.originalText || null,
    recoveredText: editorial.action === "KEEP" || editorial.action === "NEUTRALIZE" ? suggested || null : null,
    proposalKind: editorial.action === "NEUTRALIZE" ? "RECOVERED_OPERATIONAL" : suggested ? "EXTRACTED" : undefined,
    descriptionKind: input.field === "description" ? (suggested ? "EXTRACTED_DESCRIPTION" : "EDITORIAL_REJECTED_DESCRIPTION") : undefined,
  };
}

function formatDeclaredList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function derivedNeutralDescription(input: {
  productName: string;
  ingredientsText: string;
  evidenceNames: string[];
}): string | null {
  const name = input.productName.replace(/\s+/g, " ").trim();
  const items = splitIngredientPresentation(input.ingredientsText, input.evidenceNames).filter(Boolean);
  if (!name || items.length === 0) return null;
  return `${name} is presented by the seller as a product whose declared composition includes ${formatDeclaredList(items)}.`;
}

export function adaptContractToKnowledge(input: {
  current: KnowledgeText;
  contract: ProductContract;
  registry: EvidenceRegistry;
  sourceClassByUrl: Map<string, string>;
  priceStatus: PriceStatus;
  productName?: string;
}): FieldProposal[] {
  const { current, contract, registry, sourceClassByUrl, priceStatus } = input;
  const description = contract.description?.text ?? contract.valueProposition?.headline?.text ?? "";
  const ingredients = editorialLines((contract.components ?? []).map((item) => item.name), "FEATURE");
  const benefitLines = editorialLines(
    [...(contract.benefits ?? []).map((item) => item.text), ...(contract.features ?? []).map((item) => item.text)],
    "FEATURE",
  );
  const usage = editorialLines((contract.usage ?? []).map((item) => item.text), "USAGE");
  const warnings = editorialLines((contract.cautions ?? []).map((item) => item.text), "CAUTION");
  const guarantee = contract.guarantee?.text ?? "";
  const manufacturer = contract.identity.brand ?? contract.complementary?.provenance?.text ?? "";
  const faq = editorialLines(
    (contract.faq ?? []).map((item) => [item.question, item.answer].filter(Boolean).join("\n")),
    "FAQ",
  );
  const images = join((contract.images?.gallery ?? []).map((item) => item.src).concat(contract.images?.hero?.src ?? ""));
  const ingredientProposal = proposal({ field: "ingredients", current: current.ingredients, suggested: ingredients.text, role: "FEATURE", registry, sourceClassByUrl });
  let descriptionProposal = proposal({ field: "description", current: current.description, suggested: description, role: "OVERVIEW", registry, sourceClassByUrl });
  if (!descriptionProposal.suggestedValue.trim() && ingredientProposal.suggestedValue.trim() && input.productName) {
    const evidenceNames = registry.entries.filter((item) => item.field === "INGREDIENTS").map((item) => item.name || item.originalText);
    const derived = derivedNeutralDescription({
      productName: input.productName,
      ingredientsText: ingredientProposal.suggestedValue,
      evidenceNames,
    });
    if (derived) {
      descriptionProposal = {
        ...descriptionProposal,
        suggestedValue: derived,
        status: "FOUND_REVIEW_REQUIRED",
        evidenceIds: ingredientProposal.evidenceIds,
        sourceUrl: ingredientProposal.sourceUrl,
        sourceClass: ingredientProposal.sourceClass,
        sourceType: ingredientProposal.sourceType,
        verification: ingredientProposal.verification,
        restriction: ingredientProposal.restriction,
        collectedAt: ingredientProposal.collectedAt,
        evidenceIncomplete: ingredientProposal.evidenceIds.length === 0,
        evidenceExcerpt: ingredientProposal.evidenceExcerpt,
        eligibleForBatch: false,
        originalText: null,
        recoveredText: derived,
        proposalKind: "DERIVED_NEUTRAL",
        descriptionKind: "DERIVED_NEUTRAL_DESCRIPTION",
        notes: [
          "DERIVED_NEUTRAL_DESCRIPTION. Built from identity and declared composition facts. Not a literal source extract.",
          "Extracted promotional or health overview copy was not restated.",
          ...ingredientProposal.evidenceIds.map((id) => `Lineage fact ${id}`),
        ],
      };
    }
  }
  return [
    descriptionProposal,
    ingredientProposal,
    proposal({
      field: "benefits",
      current: current.benefits,
      suggested: benefitLines.text,
      role: "FEATURE",
      registry,
      sourceClassByUrl,
      notes: [
        "Seller-stated benefits stay attributed. They are not independently verified facts.",
        ...benefitLines.notes,
      ],
      eligibleForBatch: false,
    }),
    proposal({
      field: "howItWorks",
      current: current.howItWorks,
      suggested: usage.text,
      role: "USAGE",
      registry,
      sourceClassByUrl,
      notes: usage.notes,
    }),
    proposal({ field: "warnings", current: current.warnings, suggested: warnings.text, role: "CAUTION", registry, sourceClassByUrl, notes: warnings.notes }),
    proposal({
      field: "pricing",
      current: current.pricing,
      suggested: priceStatus === "PRICE_RECORDED" ? current.pricing : "",
      role: "OPERATIONAL",
      registry,
      sourceClassByUrl,
      forceStatus: priceStatus === "PRICE_RECORDED" ? "FOUND_REVIEW_REQUIRED" : priceStatus === "PRICE_UNVERIFIED" ? "UNVERIFIED" : "NOT_FOUND",
      notes: [
        "Shipping fees are not product prices.",
        priceStatus === "PRICE_UNVERIFIED" ? "A mentioned price was not confirmed for display." : "",
      ],
      eligibleForBatch: false,
    }),
    proposal({ field: "guarantee", current: current.guarantee, suggested: guarantee, role: "GUARANTEE", registry, sourceClassByUrl }),
    proposal({ field: "manufacturer", current: current.manufacturer, suggested: manufacturer, role: "OVERVIEW", registry, sourceClassByUrl }),
    proposal({ field: "faq", current: current.faq, suggested: faq.text, role: "FAQ", registry, sourceClassByUrl, notes: faq.notes }),
    proposal({
      field: "images",
      current: current.images,
      suggested: "",
      role: "OTHER",
      registry,
      sourceClassByUrl,
      forceStatus: images ? "UNVERIFIED" : "NOT_FOUND",
      notes: ["Discovered images are not USER_APPROVED and are not proposed as product assets."],
      eligibleForBatch: false,
    }),
    proposal({
      field: "videos",
      current: current.videos,
      suggested: "",
      role: "OTHER",
      registry,
      sourceClassByUrl,
      forceStatus: "NOT_FOUND",
      notes: ["Discovered videos are not approved and are not proposed."],
      eligibleForBatch: false,
    }),
  ];
}

export function productFactsFromKnowledge(input: {
  productName: string;
  sourceUrl?: string;
  text: KnowledgeText;
}): ProductFacts {
  const facts = emptyProductFacts(input.productName, input.sourceUrl || input.text.productUrl || "", "MANUAL");
  facts.description = input.text.description || undefined;
  facts.ingredientsOrComponents = input.text.ingredients.split("\n").map((item) => item.trim()).filter(Boolean);
  facts.features = input.text.benefits.split("\n").map((item) => item.trim()).filter(Boolean);
  facts.usageInformation = input.text.howItWorks.split("\n").map((item) => item.trim()).filter(Boolean);
  facts.cautions = input.text.warnings.split("\n").map((item) => item.trim()).filter(Boolean);
  facts.pricingInformation = input.text.pricing || undefined;
  facts.guaranteeInformation = input.text.guarantee || undefined;
  facts.manufacturer = input.text.manufacturer || undefined;
  return withImportQuality(facts);
}

export function attachRunSourceFallback(
  proposals: FieldProposal[],
  sources: Array<{ url: string; ok: boolean; sourceClass: string | null; sourceType?: string | null }>,
): FieldProposal[] {
  const usable = sources.find((item) => item.ok && item.sourceType !== "TRACKING_HOPLINK");
  return proposals.map((item) => {
    if (!item.suggestedValue.trim()) return item;
    if (item.evidenceIds.length && item.sourceUrl?.trim()) return item;
    const notes = item.evidenceIds.length ? item.notes : [...item.notes, "EVIDENCE_INCOMPLETE"];
    return {
      ...item,
      sourceUrl: item.sourceUrl?.trim() || usable?.url || null,
      sourceClass: item.sourceClass ?? usable?.sourceClass ?? null,
      sourceType: item.sourceType ?? usable?.sourceType ?? null,
      evidenceIncomplete: !item.evidenceIds.length,
      eligibleForBatch: item.eligibleForBatch && Boolean(item.evidenceIds.length),
      notes: [...new Set(notes.filter(Boolean))],
    };
  });
}

export function mergeFieldDecisions(previous: FieldProposal[] | undefined, next: FieldProposal[]): FieldProposal[] {
  const prior = new Map((previous ?? []).map((item) => [item.field, item]));
  return next.map((item) => {
    const kept = prior.get(item.field);
    if (!kept) return item;
    if (kept.status !== "ACCEPTED" && kept.status !== "REJECTED") {
      if (kept.suggestedValue.trim() && item.suggestedValue.trim() && kept.suggestedValue !== item.suggestedValue) {
        return {
          ...item,
          originalText: item.originalText ?? kept.originalText ?? kept.suggestedValue,
          recoveredText: item.recoveredText ?? item.suggestedValue,
          supersedesNote: item.supersedesNote ?? `A pending ${item.field} proposal was replaced. The previous pending text was not auto-approved.`,
          notes: [
            ...item.notes,
            `Superseded a pending ${item.field} proposal without changing its review status.`,
          ].filter((note, index, all) => note && all.indexOf(note) === index),
        };
      }
      return item;
    }
    const acceptedValue = kept.currentValue || kept.suggestedValue;
    return {
      ...item,
      currentValue: kept.status === "ACCEPTED" ? acceptedValue : item.currentValue,
      suggestedValue: kept.status === "ACCEPTED" ? acceptedValue : item.suggestedValue,
      status: kept.status,
      evidenceIds: kept.evidenceIds.length ? kept.evidenceIds : item.evidenceIds,
      sourceUrl: kept.sourceUrl ?? item.sourceUrl,
      sourceClass: kept.sourceClass ?? item.sourceClass,
      sourceType: kept.sourceType ?? item.sourceType,
      verification: kept.verification ?? item.verification,
      originalText: kept.originalText ?? item.originalText,
      recoveredText: kept.recoveredText ?? item.recoveredText,
      proposalKind: kept.proposalKind ?? item.proposalKind,
      descriptionKind: kept.descriptionKind ?? item.descriptionKind,
      faqKind: kept.faqKind ?? item.faqKind,
      supersedesNote: kept.supersedesNote ?? item.supersedesNote,
      notes: [
        ...item.notes,
        kept.status === "ACCEPTED"
          ? "Previous human acceptance was preserved. A newer suggestion was not auto-applied."
          : "Previous human rejection was preserved.",
      ].filter((note, index, all) => note && all.indexOf(note) === index),
    };
  });
}

export function reviewCompletion(proposals: FieldProposal[]): { accepted: number; total: number; percent: number } {
  const actionable = proposals.filter((item) => item.suggestedValue.trim() || item.currentValue.trim() || item.status === "ACCEPTED");
  const accepted = proposals.filter((item) => item.status === "ACCEPTED" || (item.currentValue.trim() && !item.suggestedValue.trim())).length;
  const total = Math.max(actionable.length, 1);
  return { accepted, total, percent: Math.round((accepted / total) * 100) };
}
