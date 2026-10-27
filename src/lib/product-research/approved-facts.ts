import { emptyProductFacts, withImportQuality, type ProductFacts } from "@/lib/product-facts";
import type { FieldProposal, ProductResearchRun } from "@/lib/product-research/types";

export const APPROVED_CONTENT_FIELDS = [
  "description",
  "ingredients",
  "benefits",
  "howItWorks",
  "warnings",
  "pricing",
  "guarantee",
  "manufacturer",
  "faq",
] as const;

export type ApprovedContentStatus = "READY" | "INSUFFICIENT_APPROVED_CONTENT";

function acceptedValue(proposal: FieldProposal): string {
  return (proposal.currentValue || proposal.suggestedValue).replace(/\s+/g, " ").trim();
}

function listValue(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((item) => item.replace(/\.$/, "").trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0].includes(",")) {
    return lines[0]
      .split(",")
      .map((item) => item.replace(/\.$/, "").trim())
      .filter(Boolean);
  }
  return lines;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitIngredientPresentation(text: string, evidenceNames: string[]): string[] {
  const whole = text.replace(/\s+/g, " ").trim();
  const names = [...new Set(evidenceNames.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))];
  const matches = names.filter((name) => {
    if (!name || name.toLowerCase() === whole.toLowerCase()) return false;
    return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(whole);
  });
  if (matches.length >= 2) return matches;
  return listValue(text);
}

export function acceptedProposals(run: ProductResearchRun | null): FieldProposal[] {
  return (run?.proposals ?? []).filter((item) => item.status === "ACCEPTED");
}

export function productFactsFromAcceptedReview(input: {
  run: ProductResearchRun | null;
  productName: string;
  sourceUrl: string;
}): ProductFacts {
  const facts = emptyProductFacts(input.productName, input.sourceUrl, "MANUAL");
  facts.confidence.productName = input.productName.trim() ? "MANUAL" : "NOT_FOUND";
  facts.importWarnings.push("Only human-accepted review fields enter the contract. Missing fields stay absent.");
  for (const proposal of acceptedProposals(input.run)) {
    const value = acceptedValue(proposal);
    if (!value) continue;
    const provenance = proposal.evidenceIds.length ? "DIRECT_SOURCE" : "MANUAL";
    if (proposal.field === "description") {
      facts.description = value;
      facts.confidence.description = provenance;
    } else if (proposal.field === "ingredients") {
      const evidenceNames = (input.run?.evidenceRegistry?.entries ?? [])
        .filter((item) => item.field === "INGREDIENTS" && (proposal.evidenceIds.includes(item.id) || value.includes(item.originalText)))
        .map((item) => item.originalText);
      facts.ingredientsOrComponents = splitIngredientPresentation(value, evidenceNames);
      facts.confidence.ingredientsOrComponents = provenance;
    } else if (proposal.field === "benefits") {
      facts.features = listValue(value);
      facts.confidence.features = provenance;
      facts.importWarnings.push("Accepted benefit text stays seller-stated. It is not independent proof of efficacy.");
    } else if (proposal.field === "howItWorks") {
      facts.usageInformation = listValue(value);
      facts.confidence.usageInformation = provenance;
    } else if (proposal.field === "warnings") {
      facts.cautions = listValue(value);
      facts.confidence.cautions = provenance;
    } else if (proposal.field === "pricing") {
      facts.pricingInformation = value;
      facts.confidence.pricingInformation = provenance;
    } else if (proposal.field === "guarantee") {
      facts.guaranteeInformation = value;
      facts.confidence.guaranteeInformation = provenance;
      facts.importWarnings.push("Guarantee text is seller-stated. It is not an independent platform guarantee.");
    } else if (proposal.field === "manufacturer") {
      facts.manufacturer = value;
      facts.confidence.manufacturer = provenance;
    }
  }
  return withImportQuality(facts);
}

export function approvedContentStatus(run: ProductResearchRun | null): ApprovedContentStatus {
  const accepted = acceptedProposals(run);
  if (accepted.length === 0) return "INSUFFICIENT_APPROVED_CONTENT";
  const fields = new Set(accepted.map((item) => item.field));
  if (fields.has("description") || fields.has("benefits")) return "READY";
  return "INSUFFICIENT_APPROVED_CONTENT";
}
