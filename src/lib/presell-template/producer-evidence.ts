import { createHash } from "node:crypto";
import { inventoryAcceptedFacts } from "@/lib/presell-quality/evidence-inventory";
import { loadOrReconcileLedger, type LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { ProductResearchRun } from "@/lib/product-research/types";

export const PRODUCER_EVIDENCE_STATES = [
  "COLLECTED",
  "NEEDS_VERIFICATION",
  "APPROVED_FOR_USE",
  "BLOCKED",
  "CONTRADICTED",
] as const;
export type ProducerEvidenceState = (typeof PRODUCER_EVIDENCE_STATES)[number];

export type ProducerEvidenceRecord = {
  evidence_id: string;
  product_id: string;
  source_url: string | null;
  source_type: string | null;
  source_identity: string | null;
  original_text: string;
  normalized_text: string;
  claim_category: string;
  captured_at: string | null;
  content_hash: string;
  review_status: ProducerEvidenceState;
  publication_eligibility: "YES" | "NO" | "PENDING";
};

export type ProducerEvidenceLibrary = {
  campaignId: number;
  storage: "EXISTING_INVENTORY_AND_LEDGER";
  newTablesCreated: false;
  records: ProducerEvidenceRecord[];
  counts: Record<ProducerEvidenceState, number>;
};

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stateFromCandidate(item: LedgerCandidate): ProducerEvidenceState {
  if (/conflict|contradict/i.test(item.blockReason ?? "") || item.duplicateOf) return "CONTRADICTED";
  if (item.blockReason) return "BLOCKED";
  if (item.usable && !item.approvedForUse) return "NEEDS_VERIFICATION";
  return "COLLECTED";
}

export function producerEvidenceLibraryFromRun(input: {
  campaignId: number;
  run: ProductResearchRun | null;
}): ProducerEvidenceLibrary {
  const accepted = inventoryAcceptedFacts(input.run);
  const ledger = loadOrReconcileLedger(input.campaignId);
  const productId = String(input.campaignId);
  const records: ProducerEvidenceRecord[] = [];

  for (const fact of accepted) {
    const original = fact.text;
    records.push({
      evidence_id: fact.factId,
      product_id: productId,
      source_url: fact.sourceUrl,
      source_type: fact.sourceClass,
      source_identity: fact.sourceClass,
      original_text: original,
      normalized_text: normalize(original),
      claim_category: fact.field,
      captured_at: fact.collectedAt,
      content_hash: hashText(`${fact.field}|${original}`),
      review_status: "APPROVED_FOR_USE",
      publication_eligibility: "YES",
    });
  }

  for (const candidate of ledger.candidates) {
    const original = candidate.originalExcerpt || candidate.extractedValue;
    const review_status = stateFromCandidate(candidate);
    records.push({
      evidence_id: candidate.candidateId,
      product_id: productId,
      source_url: candidate.sourceUrl || null,
      source_type: candidate.sourceClass,
      source_identity: candidate.sourceHost || candidate.sourceClass,
      original_text: original,
      normalized_text: normalize(candidate.extractedValue || original),
      claim_category: candidate.field,
      captured_at: candidate.collectedAt,
      content_hash: hashText(`${candidate.field}|${original}`),
      review_status,
      publication_eligibility: review_status === "APPROVED_FOR_USE" ? "YES" : review_status === "NEEDS_VERIFICATION" ? "PENDING" : "NO",
    });
  }

  const counts = {
    COLLECTED: 0,
    NEEDS_VERIFICATION: 0,
    APPROVED_FOR_USE: 0,
    BLOCKED: 0,
    CONTRADICTED: 0,
  } satisfies Record<ProducerEvidenceState, number>;
  for (const row of records) counts[row.review_status] += 1;

  return {
    campaignId: input.campaignId,
    storage: "EXISTING_INVENTORY_AND_LEDGER",
    newTablesCreated: false,
    records,
    counts,
  };
}

export function approvedProducerFacts(run: ProductResearchRun | null): Array<{ field: string; text: string; sourceUrl: string | null }> {
  return acceptedProposals(run).map((item) => ({
    field: item.field,
    text: item.currentValue || item.suggestedValue,
    sourceUrl: item.sourceUrl,
  }));
}
