import type { EvidenceInventory } from "@/lib/presell-quality/evidence-inventory";

export const CONTENT_GAP_RESOLUTIONS = ["AUTOMATABLE", "REQUIRES_HUMAN", "MUST_NOT_FILL", "NOT_REQUIRED"] as const;
export type ContentGapResolution = (typeof CONTENT_GAP_RESOLUTIONS)[number];

export type ContentGap = {
  field: string;
  editorialImportance: "HIGH" | "MEDIUM" | "LOW" | "NOT_REQUIRED_FOR_INFORMATIONAL_PRESELL";
  availableEvidence: string;
  missingEvidence: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  potentialSource: string;
  requiredAction: string;
  automationPossible: boolean;
  resolutionClass: ContentGapResolution;
};

export type ContentGapReport = {
  campaignId: number;
  gaps: ContentGap[];
  automatable: number;
  requireReview: number;
  mustNotFill: number;
  notRequired: number;
};

const EDITORIAL_FIELDS: Array<{
  field: string;
  importance: ContentGap["editorialImportance"];
  risk: ContentGap["risk"];
  potentialSource: string;
  requiredAction: string;
  resolutionClass: ContentGapResolution;
  medical: boolean;
}> = [
  { field: "description", importance: "HIGH", risk: "LOW", potentialSource: "Accepted seller page", requiredAction: "Keep the accepted restatement.", resolutionClass: "NOT_REQUIRED", medical: false },
  { field: "ingredients", importance: "HIGH", risk: "LOW", potentialSource: "Accepted seller page", requiredAction: "Keep the accepted ingredient list.", resolutionClass: "NOT_REQUIRED", medical: false },
  { field: "howItWorks", importance: "HIGH", risk: "LOW", potentialSource: "Accepted seller page", requiredAction: "Keep accepted usage quantities and sequence.", resolutionClass: "NOT_REQUIRED", medical: false },
  { field: "guarantee", importance: "HIGH", risk: "MEDIUM", potentialSource: "Accepted seller page", requiredAction: "Keep seller attribution. Do not expand terms.", resolutionClass: "NOT_REQUIRED", medical: false },
  { field: "productFormat", importance: "MEDIUM", risk: "LOW", potentialSource: "Same-host usage copy already accepted", requiredAction: "Human may accept a format restatement only if the accepted usage already names it.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "quantity", importance: "MEDIUM", risk: "LOW", potentialSource: "Offer or label page already seeded", requiredAction: "Do not invent bottle count or serving size.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "shipping", importance: "MEDIUM", risk: "MEDIUM", potentialSource: "Already-fetched informational shipping page", requiredAction: "Human review of stored extracts only. Do not fetch checkout.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "returnsProcess", importance: "MEDIUM", risk: "MEDIUM", potentialSource: "Accepted guarantee plus stored return-policy extract", requiredAction: "Do not add RMA steps that were not accepted.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "sellerContact", importance: "LOW", risk: "MEDIUM", potentialSource: "Already-fetched contact page", requiredAction: "Contact copy stays evidence-only until human acceptance.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "warnings", importance: "MEDIUM", risk: "HIGH", potentialSource: "Pending candidates", requiredAction: "Medical cautions stay blocked. Operational cautions need human review.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "faq", importance: "LOW", risk: "HIGH", potentialSource: "Pending candidates", requiredAction: "Do not publish unverified FAQ copy.", resolutionClass: "REQUIRES_HUMAN", medical: false },
  { field: "pricing", importance: "MEDIUM", risk: "HIGH", potentialSource: "None confirmed", requiredAction: "Do not invent price.", resolutionClass: "MUST_NOT_FILL", medical: false },
  { field: "manufacturer", importance: "MEDIUM", risk: "HIGH", potentialSource: "None confirmed", requiredAction: "Do not infer a maker from a lookalike host.", resolutionClass: "MUST_NOT_FILL", medical: false },
  { field: "benefits", importance: "NOT_REQUIRED_FOR_INFORMATIONAL_PRESELL", risk: "HIGH", potentialSource: "Seller marketing copy", requiredAction: "Do not add benefits, results, or efficacy.", resolutionClass: "MUST_NOT_FILL", medical: true },
  { field: "testimonials", importance: "NOT_REQUIRED_FOR_INFORMATIONAL_PRESELL", risk: "HIGH", potentialSource: "None", requiredAction: "Do not invent testimonials.", resolutionClass: "MUST_NOT_FILL", medical: true },
  { field: "clinicalProof", importance: "NOT_REQUIRED_FOR_INFORMATIONAL_PRESELL", risk: "HIGH", potentialSource: "None", requiredAction: "Independent medical proof is not required for an informational presell.", resolutionClass: "NOT_REQUIRED", medical: true },
];

export function buildContentGapReport(input: { inventory: EvidenceInventory }): ContentGapReport {
  const accepted = new Set(input.inventory.acceptedFacts.map((item) => item.field));
  const byField = new Map<string, typeof input.inventory.candidates>();
  for (const candidate of input.inventory.candidates) {
    const list = byField.get(candidate.field) ?? [];
    list.push(candidate);
    byField.set(candidate.field, list);
  }
  const gaps = EDITORIAL_FIELDS.map((spec) => {
    const haveAccepted = accepted.has(spec.field);
    const pending = byField.get(spec.field) ?? [];
    const medicalPending = pending.filter((item) => item.currentState === "BLOCKED_MEDICAL");
    const resolutionClass =
      spec.medical && spec.resolutionClass === "REQUIRES_HUMAN" ? "MUST_NOT_FILL" : spec.resolutionClass;
    return {
      field: spec.field,
      editorialImportance: spec.importance,
      availableEvidence: haveAccepted
        ? `Accepted ${spec.field} is already on the page.`
        : pending.length
          ? `${pending.length} unapproved candidate(s); ${medicalPending.length} medical-blocked.`
          : "No accepted fact and no usable candidate.",
      missingEvidence: haveAccepted ? "None required." : `No ACCEPTED ${spec.field} fact.`,
      risk: spec.risk,
      potentialSource: spec.potentialSource,
      requiredAction: spec.requiredAction,
      automationPossible: false,
      resolutionClass: haveAccepted ? "NOT_REQUIRED" : resolutionClass,
    } satisfies ContentGap;
  });
  return {
    campaignId: input.inventory.campaignId,
    gaps,
    automatable: gaps.filter((item) => item.resolutionClass === "AUTOMATABLE").length,
    requireReview: gaps.filter((item) => item.resolutionClass === "REQUIRES_HUMAN").length,
    mustNotFill: gaps.filter((item) => item.resolutionClass === "MUST_NOT_FILL").length,
    notRequired: gaps.filter((item) => item.resolutionClass === "NOT_REQUIRED").length,
  };
}
