import type { FindingSeverity, VisualQaFinding, VisualQaStatus } from "@/lib/visual-qa/types";

export type AiVisualReviewState = "OK" | "UNAVAILABLE" | "PARSE_FAILED";

/**
 * CONTENT_GATE (Policy/Grounding) is independent. Visual QA never
 * upgrades or loosens READY / REVIEW_REQUIRED / BLOCKED.
 *
 * Missing multimodal review is never treated as approval.
 */
export function composeVisualQaGate(input: {
  findings: VisualQaFinding[];
  aiVisualReview: AiVisualReviewState;
}): VisualQaStatus {
  if (input.aiVisualReview !== "OK") return "REVIEW_REQUIRED";
  const blocking = input.findings.some(
    (item) => item.severity === "HIGH" || item.severity === "WARNING",
  );
  return blocking ? "REVIEW_REQUIRED" : "PASS";
}

export function highPriorityFindings(findings: VisualQaFinding[]): VisualQaFinding[] {
  return findings.filter((item) => item.severity === "HIGH");
}

export function otherFindings(findings: VisualQaFinding[]): VisualQaFinding[] {
  return findings.filter((item) => item.severity !== "HIGH");
}

export function findingsForViewport(findings: VisualQaFinding[], viewport: string): VisualQaFinding[] {
  return findings.filter((item) => item.viewport === viewport || item.viewport.startsWith(viewport));
}

export function isFindingSeverity(value: string): value is FindingSeverity {
  return value === "INFO" || value === "WARNING" || value === "HIGH";
}
