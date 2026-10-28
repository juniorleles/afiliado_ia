import type { ContentGap } from "@/lib/presell-quality/content-gap-report";
import type { PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";
import { candidateSupportsGap } from "@/lib/presell-quality/operational-theme";

export type MappedContentGap = ContentGap & {
  relatedCandidateIds: string[];
  relatedStates: string[];
  resolutionPossible: "NOW" | "AFTER_IDENTITY" | "AFTER_HUMAN_ACCEPT" | "BLOCKED" | "NOT_APPLICABLE";
  requiredNextAction: string;
};

export function mapContentGapsToCandidates(input: {
  gaps: ContentGap[];
  queue: PreparedReviewCandidate[];
}): MappedContentGap[] {
  return input.gaps.map((gap) => {
    const related = input.queue.filter((item) => candidateSupportsGap(gap.field, item));
    const ready = related.filter((item) => item.eligible);
    const identity = related.filter((item) => item.state === "SOURCE_IDENTITY_UNRESOLVED");
    const blocked = related.filter((item) => item.state === "HIGH_RISK_CLAIM");
    let resolutionPossible: MappedContentGap["resolutionPossible"] = "NOT_APPLICABLE";
    let requiredNextAction = gap.requiredAction;
    if (gap.resolutionClass === "MUST_NOT_FILL" || gap.resolutionClass === "NOT_REQUIRED") {
      resolutionPossible = gap.resolutionClass === "MUST_NOT_FILL" ? "BLOCKED" : "NOT_APPLICABLE";
    } else if (ready.length) {
      resolutionPossible = "AFTER_HUMAN_ACCEPT";
      requiredNextAction = "Human may accept an eligible candidate as seller-stated.";
    } else if (identity.length) {
      resolutionPossible = "AFTER_IDENTITY";
      requiredNextAction = "Confirm source identity with documentation before any accept.";
    } else if (blocked.length) {
      resolutionPossible = "BLOCKED";
    } else if (gap.resolutionClass === "REQUIRES_HUMAN") {
      resolutionPossible = "AFTER_HUMAN_ACCEPT";
      requiredNextAction = "No eligible candidate yet. Request or review stored extracts.";
    }
    return {
      ...gap,
      relatedCandidateIds: related.map((item) => item.candidateId),
      relatedStates: [...new Set(related.map((item) => item.state))],
      resolutionPossible,
      requiredNextAction,
    };
  });
}
