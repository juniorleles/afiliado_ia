import { structuralDiversityOf } from "@/lib/validation/diversity";
import type {
  StructureFingerprint,
  ValidationCandidate,
  ValidationProduct,
  ValidationRunSummary,
} from "@/lib/validation/types";

function rate(pass: number, total: number): number | null {
  if (total === 0) return null;
  return Number((pass / total).toFixed(3));
}

export function summarizeValidationRun(
  products: ValidationProduct[],
  candidates: ValidationCandidate[],
): ValidationRunSummary {
  const imports = products.length;
  const importOk = products.filter((product) =>
    candidates.some((candidate) => candidate.productKey === product.key && candidate.stages.some((s) => s.id === "IMPORT" && s.outcome === "OK")),
  ).length;
  const groundingTotal = candidates.filter((c) => c.contentQa.groundingStatus !== "UNAVAILABLE").length;
  const groundingPass = candidates.filter((c) => c.contentQa.groundingStatus === "GROUNDED").length;
  const packshotTotal = candidates.length;
  const packshotOk = candidates.filter((c) => c.assetQa.packshotFound).length;
  const prints = candidates
    .map((c) => c.fingerprint)
    .filter((item): item is StructureFingerprint => Boolean(item));

  return {
    PRODUCTS_TESTED: products.length,
    CANDIDATES_GENERATED: candidates.length,
    IMPORT_SUCCESS_RATE: rate(importOk, imports),
    GROUNDING_PASS_RATE: rate(groundingPass, groundingTotal),
    POLICY_READY_COUNT: candidates.filter((c) => c.contentQa.finalGate === "READY").length,
    POLICY_REVIEW_COUNT: candidates.filter((c) => c.contentQa.finalGate === "REVIEW_REQUIRED").length,
    POLICY_BLOCKED_COUNT: candidates.filter((c) => c.contentQa.finalGate === "BLOCKED").length,
    PACKSHOT_SUCCESS_RATE: rate(packshotOk, packshotTotal),
    VISUAL_PASS_COUNT: candidates.filter((c) => c.visualQa.status === "PASS").length,
    VISUAL_REVIEW_COUNT: candidates.filter((c) => c.visualQa.status === "REVIEW_REQUIRED").length,
    STRUCTURAL_DIVERSITY: structuralDiversityOf(prints),
    PERFORMANCE_PASS_COUNT: candidates.filter(
      (c) => c.performance && c.performance.regressionFlags.length === 0 && !c.performance.overflow,
    ).length,
  };
}
