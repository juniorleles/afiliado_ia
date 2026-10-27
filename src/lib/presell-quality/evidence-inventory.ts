import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { FieldProposal, ProductResearchRun } from "@/lib/product-research/types";
import { triageFactCandidates, type TriagedFact } from "@/lib/presell-quality/fact-triage";
import type { FactCandidate } from "@/lib/presell-quality/recovery";

export const AUTO_ACCEPT_POLICY_AUTHORIZED = false;

export const REVIEW_QUEUE_STATES = [
  "READY_FOR_REVIEW",
  "NEEDS_INDEPENDENT_EVIDENCE",
  "BLOCKED_MEDICAL",
  "BLOCKED_UNSUPPORTED",
  "DUPLICATE",
] as const;
export type ReviewQueueState = (typeof REVIEW_QUEUE_STATES)[number];

export type InventoryAcceptedFact = {
  factId: string;
  field: string;
  text: string;
  verification: string | null;
  sourceClass: string | null;
  sourceUrl: string | null;
  collectedAt: string | null;
};

export type InventoryCandidate = {
  candidateId: string;
  originalText: string;
  field: string;
  source: string;
  safeUrl: string;
  collectedAt: string | null;
  claimType: string;
  evidenceQuality: string;
  sourceIdentity: string;
  currentState: ReviewQueueState;
  blockReason: string | null;
  editorialUsability: "NOT_USABLE" | "REVIEW_ONLY";
  reviewRequired: true;
  approvedForUse: false;
  triageClass: string | null;
};

export type EvidenceInventory = {
  campaignId: number;
  researchRunId: string | null;
  acceptedFacts: InventoryAcceptedFact[];
  candidates: InventoryCandidate[];
  totals: {
    accepted: number;
    candidates: number;
    readyForReview: number;
    lowRisk: number;
    medicalBlocked: number;
    newFactsAccepted: 0;
  };
  autoAcceptPolicyAuthorized: false;
};

export function reviewStateFromTriage(row: TriagedFact): ReviewQueueState {
  if (row.nextState === "ELIGIBLE_FOR_REVIEW") return "READY_FOR_REVIEW";
  if (row.nextState === "DUPLICATE_EXISTING_FACT") return "DUPLICATE";
  if (row.triageClass === "HEALTH_OR_EFFICACY_CLAIM") return "BLOCKED_MEDICAL";
  if (row.nextState === "NEEDS_INDEPENDENT_EVIDENCE") return "NEEDS_INDEPENDENT_EVIDENCE";
  return "BLOCKED_UNSUPPORTED";
}

export function inventoryAcceptedFacts(run: ProductResearchRun | null): InventoryAcceptedFact[] {
  return acceptedProposals(run).map((item, index) => ({
    factId: `accepted-${item.field}-${index + 1}`,
    field: item.field,
    text: item.currentValue || item.suggestedValue,
    verification: item.verification,
    sourceClass: item.sourceClass,
    sourceUrl: item.sourceUrl ? sanitizeSharedUrl(item.sourceUrl) : null,
    collectedAt: item.collectedAt,
  }));
}

export function inventoryCandidates(input: {
  campaignId: number;
  candidates: FactCandidate[];
  accepted: FieldProposal[];
  officialHosts?: string[];
  idPrefix?: string;
}): InventoryCandidate[] {
  const triaged = triageFactCandidates({
    candidates: input.candidates,
    acceptedTexts: input.accepted.map((item) => item.currentValue || item.suggestedValue),
    officialHosts: input.officialHosts,
  });
  return triaged.map((row, index) => {
    const currentState = reviewStateFromTriage(row);
    return {
      candidateId: `${input.idPrefix ?? "CAND"}-${String(index + 1).padStart(2, "0")}`,
      originalText: row.text,
      field: row.field,
      source: row.sourceClass,
      safeUrl: row.sourceUrl,
      collectedAt: input.candidates[index]?.collectedAt ?? null,
      claimType: row.medicalOrPromotional ? "HEALTH_OR_EFFICACY" : row.triageClass,
      evidenceQuality: row.excerptSupportsCandidate ? row.sourceClass : "EXCERPT_WEAK",
      sourceIdentity: row.notes.some((note) => /identity-uncertain|clone/i.test(note)) ? "UNCERTAIN" : row.sourceClass,
      currentState,
      blockReason: row.notes[0] ?? input.candidates[index]?.blockReason ?? null,
      editorialUsability: currentState === "READY_FOR_REVIEW" ? "REVIEW_ONLY" : "NOT_USABLE",
      reviewRequired: true,
      approvedForUse: false,
      triageClass: row.triageClass,
    };
  });
}

export function buildEvidenceInventory(input: {
  campaignId: number;
  run: ProductResearchRun | null;
  candidates: FactCandidate[];
  officialHosts?: string[];
  idPrefix?: string;
}): EvidenceInventory {
  const accepted = inventoryAcceptedFacts(input.run);
  const candidates = inventoryCandidates({
    campaignId: input.campaignId,
    candidates: input.candidates,
    accepted: acceptedProposals(input.run),
    officialHosts: input.officialHosts,
    idPrefix: input.idPrefix,
  });
  return {
    campaignId: input.campaignId,
    researchRunId: input.run?.runId ?? null,
    acceptedFacts: accepted,
    candidates,
    totals: {
      accepted: accepted.length,
      candidates: candidates.length,
      readyForReview: candidates.filter((item) => item.currentState === "READY_FOR_REVIEW").length,
      lowRisk: candidates.filter((item) => item.triageClass === "DESCRIPTIVE_LOW_RISK").length,
      medicalBlocked: candidates.filter((item) => item.currentState === "BLOCKED_MEDICAL").length,
      newFactsAccepted: 0,
    },
    autoAcceptPolicyAuthorized: false,
  };
}

export function autoAcceptDecision(): { accepted: false; reason: "NO_AUTHORIZED_AUTO_ACCEPT_POLICY" } {
  return { accepted: false, reason: "NO_AUTHORIZED_AUTO_ACCEPT_POLICY" };
}

export function reviewQueueFromInventory(inventory: EvidenceInventory): InventoryCandidate[] {
  return inventory.candidates.filter((item) => item.currentState === "READY_FOR_REVIEW" || item.currentState === "NEEDS_INDEPENDENT_EVIDENCE");
}
