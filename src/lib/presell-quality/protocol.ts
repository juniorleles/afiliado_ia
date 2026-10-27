export const TEN_PRODUCT_PROTOCOL_VERSION = 1 as const;

export type PilotProductSlot = {
  slot: number;
  campaignId: number | null;
  productName: string | null;
  category: string | null;
  sources: string[];
  researchCoverage: { total: number; max: number } | null;
  approvedFacts: number | null;
  eligibleImages: number | null;
  firstAssessmentId: string | null;
  problems: string[];
  proposedCorrections: string[];
  iterations: number;
  finalScore: number | null;
  elapsedMs: number | null;
  aiCostUsd: number;
  humanReviewEligibility: "NOT_ELIGIBLE" | "ELIGIBLE";
};

export function emptyPilotSlot(slot: number, campaignId?: number, productName?: string): PilotProductSlot {
  return {
    slot,
    campaignId: campaignId ?? null,
    productName: productName ?? null,
    category: null,
    sources: [],
    researchCoverage: null,
    approvedFacts: null,
    eligibleImages: null,
    firstAssessmentId: null,
    problems: [],
    proposedCorrections: [],
    iterations: 0,
    finalScore: null,
    elapsedMs: null,
    aiCostUsd: 0,
    humanReviewEligibility: "NOT_ELIGIBLE",
  };
}

export function tenProductProtocol(): PilotProductSlot[] {
  return [
    emptyPilotSlot(1, 237, "Sugar Defender"),
    ...Array.from({ length: 9 }, (_, index) => emptyPilotSlot(index + 2)),
  ];
}
