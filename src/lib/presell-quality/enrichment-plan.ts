import type { TriagedFact } from "@/lib/presell-quality/fact-triage";

export type EditorialEnrichmentPlan = {
  authorizedNow: Array<{ field: string; note: string }>;
  pendingHumanReview: TriagedFact[];
  needsIndependentEvidence: TriagedFact[];
  blocked: TriagedFact[];
  restrictions: string[];
  canRegenerateFromAuthorizedFacts: boolean;
  factsAutoApproved: 0;
};

export function buildEditorialEnrichmentPlan(input: {
  acceptedFields: string[];
  triaged: TriagedFact[];
}): EditorialEnrichmentPlan {
  const pendingHumanReview = input.triaged.filter((item) => item.nextState === "ELIGIBLE_FOR_REVIEW");
  const needsIndependentEvidence = input.triaged.filter((item) => item.nextState === "NEEDS_INDEPENDENT_EVIDENCE");
  const blocked = input.triaged.filter((item) => item.nextState === "BLOCKED_UNSUPPORTED" || item.nextState === "REJECTED_CONTRADICTED");
  return {
    authorizedNow: input.acceptedFields.map((field) => ({
      field,
      note: "Already accepted. Restate only. Do not strengthen.",
    })),
    pendingHumanReview,
    needsIndependentEvidence,
    blocked,
    restrictions: [
      "Do not invent benefits, testimonials, prices, manufacturer, or clinical results.",
      "Do not treat seller-stated copy as independent proof.",
      "Do not auto-approve pending candidates.",
      "Do not pad the page with generic wellness copy.",
    ],
    canRegenerateFromAuthorizedFacts: input.acceptedFields.length > 0,
    factsAutoApproved: 0,
  };
}
