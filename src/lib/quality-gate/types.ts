export const QUALITY_GATE_VERSION = 1 as const;

export type SupervisorStatus =
  | "PENDING"
  | "RUNNING"
  | "FAILED"
  | "FIXING"
  | "REVALIDATING"
  | "PASSED"
  | "HUMAN_REVIEW_REQUIRED";

export type GateId =
  | "TECHNICAL_GATE"
  | "CONTENT_GROUNDING_GATE"
  | "COMMERCIAL_AUTHORIZATION_GATE"
  | "EDITORIAL_QUALITY_GATE"
  | "VISUAL_REVIEW_GATE"
  | "HUMAN_APPROVAL_GATE";

export type GateVerdict = "PASS" | "FAIL" | "BLOCKED" | "NOT_EVALUATED" | "REQUIRED";

export type DefectSeverity = "BLOCKING" | "MAJOR" | "MINOR" | "INFO";

export type DefectKind =
  | "TYPESCRIPT"
  | "TEST_FAILURE"
  | "CONSOLE_ERROR"
  | "LOAD_FAILURE"
  | "INVALID_CTA"
  | "INVALID_LINK"
  | "OVERFLOW"
  | "INVISIBLE_ELEMENT"
  | "RESPONSIVE"
  | "MISSING_EVIDENCE_FILE"
  | "CONVERSION_BRIEF"
  | "AUTHORIZATION"
  | "UNGROUNDED_CLAIM"
  | "LOW_CONTRAST"
  | "OUT_OF_SCOPE"
  | "UNFIXABLE"
  | "ACCESSIBILITY"
  | "DISK"
  | "EDITORIAL_QUALITY";

export type Defect = {
  id: string;
  kind: DefectKind;
  severity: DefectSeverity;
  gate: GateId;
  message: string;
  evidence: string[];
  files: string[];
  fixable: boolean;
  acceptance: string;
};

export type PatchProposal = {
  path: string;
  oldString: string;
  newString: string;
  reason: string;
};

export type FixAttemptStatus =
  | "PROPOSED"
  | "APPLIED"
  | "REJECTED_SCOPE"
  | "REJECTED_POLICY"
  | "FAILED"
  | "EXHAUSTED";

export type FixAttempt = {
  defectId: string;
  attempt: number;
  status: FixAttemptStatus;
  patches: PatchProposal[];
  diff?: string;
  beforeHash?: string;
  afterHash?: string;
  reason: string;
};

export type GateResult = {
  id: GateId;
  verdict: GateVerdict;
  reasons: string[];
};

export type VisualReviewState = "NOT_EVALUATED" | "DETERMINISTIC_PASS" | "DETERMINISTIC_FAIL" | "OBSERVATIONS_ONLY";

export type QaTarget =
  | { kind: "typescript-file"; path: string }
  | { kind: "html-page"; path: string; capture?: boolean }
  | { kind: "claim-document"; path: string }
  | { kind: "out-of-scope-request"; path: string; proposedPatch: PatchProposal }
  | { kind: "conversion-briefs" }
  | { kind: "evidence-files"; directory: string; required: string[] }
  | { kind: "project-typescript" };

export type AcceptanceCriteria = {
  executionId: string;
  maxAttemptsPerDefect: number;
  blockingSeverities: DefectSeverity[];
  requireHumanApproval: true;
  allowPaidVision: false;
  technicalPassDoesNotPublish: true;
};

export type SupervisorInput = {
  executionId: string;
  criteria: AcceptanceCriteria;
  targets: QaTarget[];
  workspaceRoot?: string;
  evidenceDir?: string;
  autoFix?: boolean;
};

export type QualityReport = {
  version: typeof QUALITY_GATE_VERSION;
  executionId: string;
  status: SupervisorStatus;
  gates: Record<GateId, GateResult>;
  defects: Defect[];
  attempts: FixAttempt[];
  changedFiles: string[];
  visualReview: VisualReviewState;
  multimodalReview: "NOT_EVALUATED";
  humanApproval: "REQUIRED";
  notes: string[];
  diskFreeGb: number;
};
