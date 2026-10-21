import type { AcceptanceCriteria } from "@/lib/quality-gate/types";

export const EXECUTION_50D_CRITERIA: AcceptanceCriteria = {
  executionId: "execution-50d",
  maxAttemptsPerDefect: 3,
  blockingSeverities: ["BLOCKING"],
  requireHumanApproval: true,
  allowPaidVision: false,
  technicalPassDoesNotPublish: true,
};

export const DEFAULT_EVIDENCE_DIR = "data/evidence/execution-50d-ai-quality-gate";

export const REQUIRED_EVIDENCE_FILES = [
  "supervisor-report.json",
  "gates.json",
  "defects.json",
  "attempts.json",
  "revalidation.json",
  "files-changed.json",
  "index.json",
] as const;
