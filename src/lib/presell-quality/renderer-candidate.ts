import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { PRESELL_STANDARD_ID } from "@/lib/presell-template/standard-v1";

export const BEST_KNOWN_CANDIDATE_ID = "54AZ" as const;
export const EXPERIMENTAL_CANDIDATE_ID = PRESELL_STANDARD_ID;
export const CONTROLLED_IMPROVEMENT_EXECUTION_ID = "54BF" as const;
export const RENDERER_CANDIDATE_IDS = [BEST_KNOWN_CANDIDATE_ID, EXPERIMENTAL_CANDIDATE_ID] as const;
export type RendererCandidateId = (typeof RENDERER_CANDIDATE_IDS)[number];

export type RendererCandidateSelection = {
  bestKnownCandidate: typeof BEST_KNOWN_CANDIDATE_ID;
  activePreviewCandidate: RendererCandidateId;
  experimentalCandidate: typeof EXPERIMENTAL_CANDIDATE_ID;
};

export type ResolvedRendererCandidate = {
  id: RendererCandidateId;
  source: "prop" | "query" | "store" | "default";
  selection: RendererCandidateSelection;
  taggedAsStandard: boolean;
  executionId: typeof CONTROLLED_IMPROVEMENT_EXECUTION_ID | typeof BEST_KNOWN_CANDIDATE_ID;
};

function selectionFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "renderer-candidate.json");
}

export function parseRendererCandidateId(value: string | null | undefined): RendererCandidateId | null {
  const normalized = value?.trim();
  if (normalized === BEST_KNOWN_CANDIDATE_ID) return BEST_KNOWN_CANDIDATE_ID;
  if (
    normalized === EXPERIMENTAL_CANDIDATE_ID ||
    normalized === "PRESELL_STANDARD_V1" ||
    normalized === CONTROLLED_IMPROVEMENT_EXECUTION_ID
  ) {
    return EXPERIMENTAL_CANDIDATE_ID;
  }
  return null;
}

export function defaultRendererCandidateSelection(): RendererCandidateSelection {
  return {
    bestKnownCandidate: BEST_KNOWN_CANDIDATE_ID,
    activePreviewCandidate: BEST_KNOWN_CANDIDATE_ID,
    experimentalCandidate: EXPERIMENTAL_CANDIDATE_ID,
  };
}

export function readRendererCandidateSelection(campaignId: number): RendererCandidateSelection {
  const file = selectionFile(campaignId);
  if (!existsSync(file)) return defaultRendererCandidateSelection();
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as Partial<RendererCandidateSelection>;
    const active = parseRendererCandidateId(stored.activePreviewCandidate) ?? BEST_KNOWN_CANDIDATE_ID;
    return {
      bestKnownCandidate: BEST_KNOWN_CANDIDATE_ID,
      activePreviewCandidate: active,
      experimentalCandidate: EXPERIMENTAL_CANDIDATE_ID,
    };
  } catch {
    return defaultRendererCandidateSelection();
  }
}

export function writeActivePreviewCandidate(campaignId: number, candidate: RendererCandidateId): RendererCandidateSelection {
  const next: RendererCandidateSelection = {
    ...readRendererCandidateSelection(campaignId),
    bestKnownCandidate: BEST_KNOWN_CANDIDATE_ID,
    activePreviewCandidate: candidate,
    experimentalCandidate: EXPERIMENTAL_CANDIDATE_ID,
  };
  const file = selectionFile(campaignId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function resolveRendererCandidate(input: {
  requested?: string | null;
  campaignId?: number;
}): ResolvedRendererCandidate {
  const selection = input.campaignId != null ? readRendererCandidateSelection(input.campaignId) : defaultRendererCandidateSelection();
  const fromProp = parseRendererCandidateId(input.requested);
  if (fromProp) {
    return {
      id: fromProp,
      source: "prop",
      selection,
      taggedAsStandard: fromProp === EXPERIMENTAL_CANDIDATE_ID,
      executionId: fromProp === EXPERIMENTAL_CANDIDATE_ID ? CONTROLLED_IMPROVEMENT_EXECUTION_ID : BEST_KNOWN_CANDIDATE_ID,
    };
  }
  if (input.campaignId != null && selection.activePreviewCandidate !== BEST_KNOWN_CANDIDATE_ID) {
    return {
      id: selection.activePreviewCandidate,
      source: "store",
      selection,
      taggedAsStandard: selection.activePreviewCandidate === EXPERIMENTAL_CANDIDATE_ID,
      executionId:
        selection.activePreviewCandidate === EXPERIMENTAL_CANDIDATE_ID
          ? CONTROLLED_IMPROVEMENT_EXECUTION_ID
          : BEST_KNOWN_CANDIDATE_ID,
    };
  }
  return {
    id: BEST_KNOWN_CANDIDATE_ID,
    source: "default",
    selection,
    taggedAsStandard: false,
    executionId: BEST_KNOWN_CANDIDATE_ID,
  };
}

export function rendererCandidateQuery(candidate: RendererCandidateId): string {
  return `candidate=${encodeURIComponent(candidate)}`;
}
