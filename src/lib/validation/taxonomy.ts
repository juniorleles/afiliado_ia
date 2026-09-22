import type {
  FailureType,
  PipelineStageId,
  ValidationCandidate,
  ValidationFailure,
} from "@/lib/validation/types";
import { FAILURE_TYPES } from "@/lib/validation/types";

export function isFailureType(value: string): value is FailureType {
  return (FAILURE_TYPES as readonly string[]).includes(value);
}

export function classifyStageFailure(stage: PipelineStageId, message: string): FailureType {
  switch (stage) {
    case "IMPORT":
      return "IMPORT_FAILURE";
    case "PRODUCT_FACTS":
      return /insufficient/i.test(message) ? "SOURCE_INSUFFICIENT" : "IMPORT_FAILURE";
    case "AI_CONTENT":
    case "DESIGN_PLAN":
    case "CREATIVE_COMPOSITION":
      return "GENERATION_FAILURE";
    case "GROUNDING":
      return "GROUNDING_FAILURE";
    case "POLICY_LINTER":
      return "POLICY_BLOCK";
    case "DESKTOP_RENDER":
    case "VISUAL_QA":
      return "VISUAL_FAILURE";
    case "MOBILE_RENDER":
      return "MOBILE_FAILURE";
    case "PERFORMANCE_QA":
      return "PERFORMANCE_FAILURE";
    default:
      return "GENERATION_FAILURE";
  }
}

export function collectCandidateFailures(candidate: Pick<ValidationCandidate, "stages" | "contentQa" | "assetQa" | "visualQa" | "performance" | "fingerprint">): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const stage of candidate.stages) {
    if (stage.outcome === "FAIL" || stage.outcome === "BLOCKED") {
      failures.push({
        type: classifyStageFailure(stage.id, stage.error || stage.notes),
        stage: stage.id,
        message: stage.error || stage.notes || `${stage.id} ${stage.outcome}`,
      });
    }
  }
  if (candidate.contentQa.groundingStatus === "UNGROUNDED") {
    pushUnique(failures, {
      type: "GROUNDING_FAILURE",
      stage: "GROUNDING",
      message: "Grounding status UNGROUNDED",
    });
  }
  if (candidate.contentQa.policyGate === "BLOCKED" || candidate.contentQa.finalGate === "BLOCKED") {
    pushUnique(failures, {
      type: "POLICY_BLOCK",
      stage: "POLICY_LINTER",
      message: candidate.contentQa.blockingRules.join("; ") || "Policy gate BLOCKED",
    });
  }
  if (!candidate.assetQa.packshotFound) {
    pushUnique(failures, {
      type: "ASSET_FAILURE",
      stage: "PRODUCT_FACTS",
      message: "No packshot found",
    });
  }
  if (candidate.visualQa.status === "REVIEW_REQUIRED") {
    const mobile = candidate.visualQa.overflowViewports.some((vp) => vp.startsWith("375") || vp.startsWith("390"));
    pushUnique(failures, {
      type: mobile ? "MOBILE_FAILURE" : "VISUAL_FAILURE",
      stage: mobile ? "MOBILE_RENDER" : "VISUAL_QA",
      message: `Visual QA ${candidate.visualQa.status}; HIGH=${candidate.visualQa.highCount}`,
    });
  }
  if (candidate.performance && candidate.performance.regressionFlags.length > 0) {
    pushUnique(failures, {
      type: "PERFORMANCE_FAILURE",
      stage: "PERFORMANCE_QA",
      message: candidate.performance.regressionFlags.join("; "),
    });
  }
  return failures;
}

function pushUnique(list: ValidationFailure[], item: ValidationFailure) {
  if (list.some((existing) => existing.type === item.type && existing.stage === item.stage && existing.message === item.message)) {
    return;
  }
  list.push(item);
}
