import type { Defect, GateId, GateResult, GateVerdict, VisualReviewState } from "@/lib/quality-gate/types";

const TECHNICAL_KINDS = new Set(["TYPESCRIPT", "TEST_FAILURE", "LOAD_FAILURE", "MISSING_EVIDENCE_FILE", "CONSOLE_ERROR", "DISK"]);
const GROUNDING_KINDS = new Set(["UNGROUNDED_CLAIM", "CONVERSION_BRIEF"]);
const COMMERCIAL_KINDS = new Set(["INVALID_CTA", "INVALID_LINK", "AUTHORIZATION"]);
const VISUAL_KINDS = new Set(["OVERFLOW", "INVISIBLE_ELEMENT", "RESPONSIVE", "LOW_CONTRAST", "ACCESSIBILITY"]);
const EDITORIAL_KINDS = new Set(["EDITORIAL_QUALITY"]);

function blocking(defects: Defect[]): Defect[] {
  return defects.filter((item) => item.severity === "BLOCKING");
}

function verdictFor(kinds: Set<string>, defects: Defect[]): { verdict: GateVerdict; reasons: string[] } {
  const hits = blocking(defects).filter((item) => kinds.has(item.kind));
  if (hits.length === 0) return { verdict: "PASS", reasons: [] };
  return { verdict: "FAIL", reasons: hits.map((item) => item.message) };
}

export function composeGates(input: {
  defects: Defect[];
  visualReview: VisualReviewState;
  htmlProbed: boolean;
}): Record<GateId, GateResult> {
  const technical = verdictFor(TECHNICAL_KINDS, input.defects);
  const grounding = verdictFor(GROUNDING_KINDS, input.defects);
  const commercial = verdictFor(COMMERCIAL_KINDS, input.defects);
  const visualHits = blocking(input.defects).filter((item) => VISUAL_KINDS.has(item.kind));
  const scopeHits = blocking(input.defects).filter((item) => item.kind === "OUT_OF_SCOPE");
  const editorial = verdictFor(EDITORIAL_KINDS, input.defects);

  let visual: GateResult;
  if (visualHits.length > 0) {
    visual = { id: "VISUAL_REVIEW_GATE", verdict: "FAIL", reasons: visualHits.map((item) => item.message) };
  } else if (!input.htmlProbed) {
    visual = {
      id: "VISUAL_REVIEW_GATE",
      verdict: "NOT_EVALUATED",
      reasons: ["no HTML target was probed", "multimodal aesthetic review is NOT_EVALUATED"],
    };
  } else if (input.visualReview === "DETERMINISTIC_PASS") {
    visual = {
      id: "VISUAL_REVIEW_GATE",
      verdict: "PASS",
      reasons: ["deterministic visual probes passed", "multimodal aesthetic review is NOT_EVALUATED"],
    };
  } else {
    visual = {
      id: "VISUAL_REVIEW_GATE",
      verdict: "NOT_EVALUATED",
      reasons: ["multimodal aesthetic review is NOT_EVALUATED — absence is not visual approval"],
    };
  }

  return {
    TECHNICAL_GATE: { id: "TECHNICAL_GATE", ...technical },
    CONTENT_GROUNDING_GATE: { id: "CONTENT_GROUNDING_GATE", ...grounding },
    COMMERCIAL_AUTHORIZATION_GATE: {
      id: "COMMERCIAL_AUTHORIZATION_GATE",
      verdict: scopeHits.length ? "BLOCKED" : commercial.verdict,
      reasons: [...commercial.reasons, ...scopeHits.map((item) => item.message)],
    },
    EDITORIAL_QUALITY_GATE: { id: "EDITORIAL_QUALITY_GATE", ...editorial },
    VISUAL_REVIEW_GATE: visual,
    HUMAN_APPROVAL_GATE: {
      id: "HUMAN_APPROVAL_GATE",
      verdict: "REQUIRED",
      reasons: ["publication and aesthetic approval stay human — a technical pass is not approval"],
    },
  };
}

export function blockingDefects(defects: Defect[]): Defect[] {
  return blocking(defects);
}

export function technicalGatesPassed(gates: Record<GateId, GateResult>): boolean {
  return (
    gates.TECHNICAL_GATE.verdict === "PASS" &&
    gates.CONTENT_GROUNDING_GATE.verdict === "PASS" &&
    gates.COMMERCIAL_AUTHORIZATION_GATE.verdict === "PASS" &&
    gates.EDITORIAL_QUALITY_GATE.verdict === "PASS" &&
    gates.VISUAL_REVIEW_GATE.verdict !== "FAIL" &&
    gates.VISUAL_REVIEW_GATE.verdict !== "BLOCKED"
  );
}
