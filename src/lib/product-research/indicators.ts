import { assetApprovalCounts } from "@/lib/product-research/asset-display";
import type { FieldProposal, FieldReviewStatus, ProductResearchRun } from "@/lib/product-research/types";

export type ExtractionConfidenceStatus = "UNAVAILABLE";
export type GenerationReadiness = "NOT_RESEARCHED" | "SANDBOX_DRAFT" | "PUBLICATION_READY";

export type ResearchIndicators = {
  extractionConfidence: {
    status: ExtractionConfidenceStatus;
    percent: null;
    note: string;
  };
  researchCoverage: {
    total: number;
    max: number;
    percent: number;
    status: "NOT_RESEARCHED" | "RESEARCHING" | "SCORED";
  };
  reviewCompletion: {
    accepted: number;
    total: number;
    percent: number;
  };
  editorialQuality: {
    grounding: ProductResearchRun["grounding"];
    neutrality: ProductResearchRun["neutrality"];
    contentQuality: ProductResearchRun["contentQuality"];
    status: "NOT_EVALUATED" | "PASS" | "BLOCKED";
  };
  publicationReadiness: {
    status: "BLOCKED" | "READY";
    reason: string;
  };
  generationReadiness: {
    status: GenerationReadiness;
    label: string;
    note: string;
  };
  commercialAuthorization: "BLOCKED";
  assetApproval: {
    approved: number;
    total: number;
    percent: number;
  };
  sandboxGenerationReadiness: {
    status: "NOT_RESEARCHED" | "SANDBOX_DRAFT" | "INSUFFICIENT";
    label: string;
    note: string;
  };
};

const EXTRACTION_NOTE =
  "Extraction confidence is unavailable. Completeness-score agreement is not a measure of extraction quality.";

export function displayFieldStatus(input: {
  researched: boolean;
  status: FieldReviewStatus | null | undefined;
}): string {
  if (!input.researched) return "NOT_RESEARCHED";
  if (!input.status) return "NOT_RESEARCHED";
  if (input.status === "ACCEPTED") return "USER_APPROVED";
  return input.status;
}

export function displayFieldStatuses(run: ProductResearchRun | null): Array<{ field: FieldProposal["field"]; status: string }> {
  const researched = Boolean(run && run.status !== "NOT_RESEARCHED" && run.status !== "NEED_URL" && run.status !== "QUEUED");
  if (!run?.proposals.length) {
    return [];
  }
  return run.proposals.map((item) => ({
    field: item.field,
    status: displayFieldStatus({ researched: researched && run.status !== "RESEARCHING", status: item.status }),
  }));
}

export function indicatorsFromResearch(run: ProductResearchRun | null): ResearchIndicators {
  const researching = run?.status === "QUEUED" || run?.status === "RESEARCHING";
  const scored = Boolean(run && (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "TIMED_OUT"));
  const editorialParts = [run?.grounding, run?.neutrality, run?.contentQuality] as const;
  const editorialStatus = !run || editorialParts.every((item) => !item || item === "NOT_EVALUATED")
    ? "NOT_EVALUATED"
    : editorialParts.some((item) => item === "BLOCKED")
      ? "BLOCKED"
      : "PASS";
  const coverageMax = run?.coverageMax || 100;
  const coverageTotal = run?.coverageTotal ?? 0;
  const reviewTotal = run?.reviewTotal ?? 0;
  const reviewAccepted = run?.reviewAccepted ?? 0;
  const publication = "BLOCKED" as const;
  const generation: GenerationReadiness = !run || run.status === "NOT_RESEARCHED" || run.status === "NEED_URL"
    ? "NOT_RESEARCHED"
    : "SANDBOX_DRAFT";
  const assets = assetApprovalCounts(run?.discoveredAssets);
  const acceptedFacts = run?.proposals.filter((item) => item.status === "ACCEPTED") ?? [];
  const sandboxStatus = generation === "NOT_RESEARCHED"
    ? "NOT_RESEARCHED"
    : acceptedFacts.length === 0
      ? "INSUFFICIENT"
      : "SANDBOX_DRAFT";
  return {
    extractionConfidence: {
      status: "UNAVAILABLE",
      percent: null,
      note: EXTRACTION_NOTE,
    },
    researchCoverage: {
      total: coverageTotal,
      max: coverageMax,
      percent: coverageMax === 0 ? 0 : Math.round((coverageTotal / coverageMax) * 100),
      status: researching ? "RESEARCHING" : scored ? "SCORED" : "NOT_RESEARCHED",
    },
    reviewCompletion: {
      accepted: reviewAccepted,
      total: reviewTotal,
      percent: reviewTotal === 0 ? 0 : Math.round((reviewAccepted / reviewTotal) * 100),
    },
    editorialQuality: {
      grounding: run?.grounding ?? "NOT_EVALUATED",
      neutrality: run?.neutrality ?? "NOT_EVALUATED",
      contentQuality: run?.contentQuality ?? "NOT_EVALUATED",
      status: editorialStatus,
    },
    publicationReadiness: {
      status: publication,
      reason: run?.publicationReason ?? "Publication approval is human. Research coverage is not commercial authorization.",
    },
    generationReadiness: {
      status: generation,
      label: generation === "NOT_RESEARCHED" ? "Not researched" : "Sandbox draft",
      note:
        generation === "NOT_RESEARCHED"
          ? "Empty fields are not errors until research runs."
          : "A sandbox draft may be generated from reviewed facts. It is not publication ready and does not activate a commercial CTA.",
    },
    commercialAuthorization: "BLOCKED",
    assetApproval: {
      approved: assets.approved,
      total: assets.total,
      percent: assets.total === 0 ? 0 : Math.round((assets.approved / assets.total) * 100),
    },
    sandboxGenerationReadiness: {
      status: sandboxStatus,
      label: sandboxStatus === "NOT_RESEARCHED" ? "Not researched" : sandboxStatus === "INSUFFICIENT" ? "Need approved facts" : "Sandbox draft",
      note:
        sandboxStatus === "INSUFFICIENT"
          ? "A sandbox preview needs at least one human-approved fact. Pending proposals are not used."
          : generation === "NOT_RESEARCHED"
            ? "Empty fields are not errors until research runs."
            : "A sandbox draft may be generated from reviewed facts. It is not publication ready and does not activate a commercial CTA.",
    },
  };
}
