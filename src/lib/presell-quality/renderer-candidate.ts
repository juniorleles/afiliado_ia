import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { PRESELL_STANDARD_ID } from "@/lib/presell-template/standard-v1";

export const BEST_KNOWN_CANDIDATE_ID = "54AZ" as const;
export const EXPERIMENTAL_CANDIDATE_ID = PRESELL_STANDARD_ID;
export const PREMIUM_STRUCTURAL_COMPOSITION_ID = "PREMIUM_STRUCTURAL_V2" as const;
export const PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID = "PREMIUM_PRODUCER_CONTENT_V1" as const;
export const PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID = "PREMIUM_PRODUCER_CONTENT_V2" as const;
export const PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID = "PREMIUM_VISUAL_OPTIMIZATION_V1" as const;
export const PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID = "54BH" as const;
export const FROZEN_IMPROVEMENT_EXECUTION_ID = "54BI" as const;
export const RECENT_CONTROLLED_IMPROVEMENT_EXECUTION_ID = "54BI" as const;
export const VISUAL_HIERARCHY_EXECUTION_ID = "54BJ" as const;
export const STRUCTURAL_COMPOSITION_EXECUTION_ID = "54BL" as const;
export const PRODUCER_CONTENT_EXECUTION_ID = "54BN" as const;
export const PRODUCER_CONTENT_V2_EXECUTION_ID = "54BO" as const;
export const CONTROLLED_IMPROVEMENT_EXECUTION_ID = "54BP" as const;
export const LEGACY_CONTROLLED_IMPROVEMENT_EXECUTION_ID = "54BF" as const;
export const RENDERER_CANDIDATE_IDS = [BEST_KNOWN_CANDIDATE_ID, EXPERIMENTAL_CANDIDATE_ID] as const;
export type RendererCandidateId = (typeof RENDERER_CANDIDATE_IDS)[number];
export type ExperimentalExecutionId =
  | typeof CONTROLLED_IMPROVEMENT_EXECUTION_ID
  | typeof PRODUCER_CONTENT_V2_EXECUTION_ID
  | typeof PRODUCER_CONTENT_EXECUTION_ID
  | typeof STRUCTURAL_COMPOSITION_EXECUTION_ID
  | typeof FROZEN_IMPROVEMENT_EXECUTION_ID
  | typeof RECENT_CONTROLLED_IMPROVEMENT_EXECUTION_ID
  | typeof VISUAL_HIERARCHY_EXECUTION_ID
  | typeof PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID
  | typeof LEGACY_CONTROLLED_IMPROVEMENT_EXECUTION_ID;
export type PresellExecutionId = ExperimentalExecutionId | typeof BEST_KNOWN_CANDIDATE_ID;

export type RendererCandidateSelection = {
  bestKnownCandidate: typeof BEST_KNOWN_CANDIDATE_ID;
  activePreviewCandidate: RendererCandidateId;
  experimentalCandidate: typeof EXPERIMENTAL_CANDIDATE_ID;
  activeExecutionId: ExperimentalExecutionId;
};

export type ResolvedRendererCandidate = {
  id: RendererCandidateId;
  source: "prop" | "query" | "store" | "default";
  selection: RendererCandidateSelection;
  taggedAsStandard: boolean;
  executionId: PresellExecutionId;
};

function selectionFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "renderer-candidate.json");
}

export function experimentalExecutionIdOf(
  requested?: string | null,
  stored?: string | null,
): ExperimentalExecutionId {
  const normalized = requested?.trim();
  if (normalized === FROZEN_IMPROVEMENT_EXECUTION_ID || normalized === RECENT_CONTROLLED_IMPROVEMENT_EXECUTION_ID) {
    return FROZEN_IMPROVEMENT_EXECUTION_ID;
  }
  if (normalized === VISUAL_HIERARCHY_EXECUTION_ID) return VISUAL_HIERARCHY_EXECUTION_ID;
  if (normalized === STRUCTURAL_COMPOSITION_EXECUTION_ID || normalized === PREMIUM_STRUCTURAL_COMPOSITION_ID) {
    return STRUCTURAL_COMPOSITION_EXECUTION_ID;
  }
  if (normalized === PRODUCER_CONTENT_EXECUTION_ID || normalized === PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID) {
    return PRODUCER_CONTENT_EXECUTION_ID;
  }
  if (normalized === PRODUCER_CONTENT_V2_EXECUTION_ID || normalized === PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID) {
    return PRODUCER_CONTENT_V2_EXECUTION_ID;
  }
  if (normalized === CONTROLLED_IMPROVEMENT_EXECUTION_ID || normalized === PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID) {
    return CONTROLLED_IMPROVEMENT_EXECUTION_ID;
  }
  if (
    !normalized &&
    (stored === FROZEN_IMPROVEMENT_EXECUTION_ID ||
      stored === CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
      stored === PRODUCER_CONTENT_V2_EXECUTION_ID ||
      stored === PRODUCER_CONTENT_EXECUTION_ID ||
      stored === STRUCTURAL_COMPOSITION_EXECUTION_ID ||
      stored === VISUAL_HIERARCHY_EXECUTION_ID)
  ) {
    return stored;
  }
  return CONTROLLED_IMPROVEMENT_EXECUTION_ID;
}

export function usesPremiumStructuralComposition(executionId?: string | null): boolean {
  const normalized = executionId?.trim();
  if (
    normalized === FROZEN_IMPROVEMENT_EXECUTION_ID ||
    normalized === RECENT_CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
    normalized === VISUAL_HIERARCHY_EXECUTION_ID ||
    normalized === PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
    normalized === LEGACY_CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
    normalized === BEST_KNOWN_CANDIDATE_ID
  ) {
    return false;
  }
  const resolved = experimentalExecutionIdOf(normalized);
  return (
    resolved === STRUCTURAL_COMPOSITION_EXECUTION_ID ||
    resolved === PRODUCER_CONTENT_EXECUTION_ID ||
    resolved === PRODUCER_CONTENT_V2_EXECUTION_ID ||
    resolved === CONTROLLED_IMPROVEMENT_EXECUTION_ID
  );
}

export function usesPremiumProducerContent(executionId?: string | null): boolean {
  const resolved = experimentalExecutionIdOf(executionId);
  return (
    resolved === PRODUCER_CONTENT_EXECUTION_ID ||
    resolved === PRODUCER_CONTENT_V2_EXECUTION_ID ||
    resolved === CONTROLLED_IMPROVEMENT_EXECUTION_ID
  );
}

export function usesPremiumProducerContentV2(executionId?: string | null): boolean {
  return experimentalExecutionIdOf(executionId) === PRODUCER_CONTENT_V2_EXECUTION_ID;
}

export function usesPremiumVisualOptimization(executionId?: string | null): boolean {
  return (
    experimentalExecutionIdOf(executionId) === CONTROLLED_IMPROVEMENT_EXECUTION_ID &&
    executionId?.trim() !== PRODUCER_CONTENT_V2_EXECUTION_ID &&
    executionId?.trim() !== PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID &&
    executionId?.trim() !== PRODUCER_CONTENT_EXECUTION_ID &&
    executionId?.trim() !== PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID
  );
}

export function parseRendererCandidateId(value: string | null | undefined): RendererCandidateId | null {
  const normalized = value?.trim();
  if (normalized === BEST_KNOWN_CANDIDATE_ID) return BEST_KNOWN_CANDIDATE_ID;
  if (
    normalized === EXPERIMENTAL_CANDIDATE_ID ||
    normalized === "PRESELL_STANDARD_V1" ||
    normalized === PREMIUM_STRUCTURAL_COMPOSITION_ID ||
    normalized === PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID ||
    normalized === PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID ||
    normalized === PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID ||
    normalized === CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
    normalized === PRODUCER_CONTENT_V2_EXECUTION_ID ||
    normalized === PRODUCER_CONTENT_EXECUTION_ID ||
    normalized === STRUCTURAL_COMPOSITION_EXECUTION_ID ||
    normalized === FROZEN_IMPROVEMENT_EXECUTION_ID ||
    normalized === RECENT_CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
    normalized === VISUAL_HIERARCHY_EXECUTION_ID ||
    normalized === PRIOR_CONTROLLED_IMPROVEMENT_EXECUTION_ID ||
    normalized === LEGACY_CONTROLLED_IMPROVEMENT_EXECUTION_ID
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
    activeExecutionId: FROZEN_IMPROVEMENT_EXECUTION_ID,
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
      activeExecutionId: experimentalExecutionIdOf(null, stored.activeExecutionId ?? FROZEN_IMPROVEMENT_EXECUTION_ID),
    };
  } catch {
    return defaultRendererCandidateSelection();
  }
}

export function writeActivePreviewCandidate(
  campaignId: number,
  candidate: RendererCandidateId,
  executionId?: ExperimentalExecutionId,
): RendererCandidateSelection {
  const current = readRendererCandidateSelection(campaignId);
  const next: RendererCandidateSelection = {
    ...current,
    bestKnownCandidate: BEST_KNOWN_CANDIDATE_ID,
    activePreviewCandidate: candidate,
    experimentalCandidate: EXPERIMENTAL_CANDIDATE_ID,
    activeExecutionId:
      candidate === EXPERIMENTAL_CANDIDATE_ID
        ? experimentalExecutionIdOf(executionId ?? CONTROLLED_IMPROVEMENT_EXECUTION_ID, current.activeExecutionId)
        : current.activeExecutionId,
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
      executionId:
        fromProp === EXPERIMENTAL_CANDIDATE_ID
          ? experimentalExecutionIdOf(input.requested, selection.activeExecutionId)
          : BEST_KNOWN_CANDIDATE_ID,
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
          ? experimentalExecutionIdOf(null, selection.activeExecutionId)
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

export function rendererCandidateQuery(candidate: RendererCandidateId | ExperimentalExecutionId): string {
  return `candidate=${encodeURIComponent(candidate)}`;
}
