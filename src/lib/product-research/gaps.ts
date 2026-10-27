import type { CoverageSlot } from "@/lib/research-coverage/types";
import type { FieldProposal } from "@/lib/product-research/types";

const FIELD_GAPS: Partial<Record<FieldProposal["field"], CoverageSlot[]>> = {
  description: ["features", "identity"],
  benefits: ["features"],
  howItWorks: ["usage"],
  warnings: ["cautions"],
  faq: ["faq"],
  pricing: ["price"],
  manufacturer: ["provenance", "identity"],
  guarantee: ["guarantee"],
  ingredients: ["composition"],
};

export function coverageGapsFromProposals(proposals: FieldProposal[] | undefined): CoverageSlot[] {
  const gaps = new Set<CoverageSlot>();
  for (const proposal of proposals ?? []) {
    const empty = !proposal.suggestedValue.trim() || proposal.status === "NOT_FOUND";
    if (!empty) continue;
    for (const slot of FIELD_GAPS[proposal.field] ?? []) gaps.add(slot);
  }
  if (!gaps.size) {
    for (const slot of ["usage", "faq", "cautions", "features", "price", "commercial"] as const) gaps.add(slot);
  }
  return [...gaps];
}

export function classifyMissingFieldCause(proposal: FieldProposal | undefined): string {
  if (!proposal) return "NOT_FOUND";
  const notes = proposal.notes.join(" ").toLowerCase();
  if (proposal.status === "ACCEPTED" || proposal.suggestedValue.trim()) return "FOUND";
  if (notes.includes("not editorial-safe") || notes.includes("health or efficacy") || notes.includes("medical")) {
    return "EDITORIAL_REJECTED";
  }
  if (notes.includes("evidence_incomplete")) return "EVIDENCE_INCOMPLETE";
  if (notes.includes("long copy without a separable")) return "EDITORIAL_REJECTED";
  if (notes.includes("empty text")) return "NOT_FOUND";
  return "NOT_FOUND";
}
