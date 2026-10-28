import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import {
  compareEvaluationIdentities,
  type ComparisonStatus,
  type VisualEvaluationIdentity,
} from "@/lib/presell-quality/evaluation-comparability";
import { QUALITY_SCORE_TARGET, VISUAL_SCORE_TARGET } from "@/lib/presell-quality/premium-design";

export const PRESELL_BEST_CANDIDATE_SELECTOR = "PRESELL_BEST_CANDIDATE_SELECTOR";

export const CANDIDATE_STATES = [
  "CANDIDATE",
  "EVALUATED",
  "BEST_KNOWN",
  "QUALITY_APPROVED",
  "QUALITY_BLOCKED",
  "EVALUATION_UNAVAILABLE",
] as const;
export type CandidateState = (typeof CANDIDATE_STATES)[number];

export type BestCandidateRecord = {
  selector: typeof PRESELL_BEST_CANDIDATE_SELECTOR;
  campaignId: number;
  generationId: string;
  state: CandidateState;
  contentSafetyPass: boolean;
  evaluationValid: boolean;
  desktopVisualScore: number | null;
  mobileVisualScore: number | null;
  editorialScore: number | null;
  identity: VisualEvaluationIdentity;
  qualityApproved: false;
  humanReviewUnlocked: false;
  notes: string[];
};

export type BestCandidateDecision = {
  best: BestCandidateRecord;
  previous: BestCandidateRecord | null;
  updated: boolean;
  comparisonStatus: ComparisonStatus | "NONE";
  reason: string;
};

function belowTargets(record: BestCandidateRecord): boolean {
  return (
    (record.desktopVisualScore ?? 0) < VISUAL_SCORE_TARGET ||
    (record.mobileVisualScore ?? 0) < VISUAL_SCORE_TARGET ||
    (record.editorialScore ?? 0) < QUALITY_SCORE_TARGET
  );
}

function provenImprovement(current: BestCandidateRecord, incoming: BestCandidateRecord): boolean {
  if (incoming.desktopVisualScore == null || incoming.mobileVisualScore == null || incoming.editorialScore == null) return false;
  if (current.desktopVisualScore == null || current.mobileVisualScore == null || current.editorialScore == null) return false;
  const notWorse =
    incoming.desktopVisualScore + 1e-9 >= current.desktopVisualScore &&
    incoming.mobileVisualScore + 1e-9 >= current.mobileVisualScore &&
    incoming.editorialScore + 1e-9 >= current.editorialScore;
  const better =
    incoming.desktopVisualScore > current.desktopVisualScore ||
    incoming.mobileVisualScore > current.mobileVisualScore ||
    incoming.editorialScore > current.editorialScore;
  return notWorse && better;
}

export function candidateStateOf(record: Omit<BestCandidateRecord, "state" | "qualityApproved" | "humanReviewUnlocked" | "selector">): CandidateState {
  if (!record.evaluationValid) return "EVALUATION_UNAVAILABLE";
  if (belowTargets({ ...record, selector: PRESELL_BEST_CANDIDATE_SELECTOR, state: "EVALUATED", qualityApproved: false, humanReviewUnlocked: false })) {
    return "QUALITY_BLOCKED";
  }
  return "EVALUATED";
}

export function selectBestCandidate(input: {
  current: BestCandidateRecord | null;
  incoming: Omit<BestCandidateRecord, "selector" | "state" | "qualityApproved" | "humanReviewUnlocked">;
  criticalRegressions?: string[];
}): BestCandidateDecision {
  const incoming: BestCandidateRecord = {
    ...input.incoming,
    selector: PRESELL_BEST_CANDIDATE_SELECTOR,
    state: candidateStateOf(input.incoming),
    qualityApproved: false,
    humanReviewUnlocked: false,
  };
  if (!input.current) {
    return {
      best: { ...incoming, state: incoming.state === "EVALUATION_UNAVAILABLE" ? "EVALUATION_UNAVAILABLE" : "BEST_KNOWN" },
      previous: null,
      updated: true,
      comparisonStatus: "NONE",
      reason: "No previous best candidate existed.",
    };
  }
  if (!incoming.contentSafetyPass) {
    return { best: input.current, previous: input.current, updated: false, comparisonStatus: "NONE", reason: "Incoming candidate failed content safety." };
  }
  if (!incoming.evaluationValid) {
    return { best: input.current, previous: input.current, updated: false, comparisonStatus: "NONE", reason: "Incoming evaluation is not valid." };
  }
  const comparison = compareEvaluationIdentities(input.current.identity, incoming.identity);
  if (comparison.status !== "COMPARABLE") {
    return {
      best: input.current,
      previous: input.current,
      updated: false,
      comparisonStatus: comparison.status,
      reason: `Comparison is ${comparison.status}; the previous best candidate is preserved.`,
    };
  }
  if (input.criticalRegressions?.length) {
    return {
      best: input.current,
      previous: input.current,
      updated: false,
      comparisonStatus: comparison.status,
      reason: `Critical regressions: ${input.criticalRegressions.join("; ")}`,
    };
  }
  if (!provenImprovement(input.current, incoming)) {
    return {
      best: input.current,
      previous: input.current,
      updated: false,
      comparisonStatus: comparison.status,
      reason: "Incoming scores are not a proven improvement.",
    };
  }
  return {
    best: { ...incoming, state: "BEST_KNOWN" },
    previous: input.current,
    updated: true,
    comparisonStatus: comparison.status,
    reason: "Incoming candidate is comparable and scored higher without regressions.",
  };
}

export function bestCandidateFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "best-candidate.json");
}

export function readBestCandidate(campaignId: number): BestCandidateRecord | null {
  const file = bestCandidateFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BestCandidateRecord;
  } catch {
    return null;
  }
}

export function writeBestCandidate(record: BestCandidateRecord): BestCandidateRecord {
  const file = bestCandidateFile(record.campaignId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
