import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_EVIDENCE_DIR, EXECUTION_50D_CRITERIA } from "@/lib/quality-gate/criteria";
import { diskFreeGb, diskIsBelowStop } from "@/lib/quality-gate/disk";
import { attemptFix, resetAttemptCounts } from "@/lib/quality-gate/fix";
import { blockingDefects, composeGates, technicalGatesPassed } from "@/lib/quality-gate/gates";
import { runQa } from "@/lib/quality-gate/qa";
import type { Defect, QualityReport, SupervisorInput, SupervisorStatus, VisualReviewState } from "@/lib/quality-gate/types";

function visualState(htmlProbed: boolean, defects: Defect[]): VisualReviewState {
  if (!htmlProbed) return "NOT_EVALUATED";
  if (defects.some((item) => item.severity === "BLOCKING" && item.gate === "VISUAL_REVIEW_GATE")) {
    return "DETERMINISTIC_FAIL";
  }
  return "DETERMINISTIC_PASS";
}

function writeJson(dir: string, name: string, value: unknown): void {
  writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2));
}

export async function runSupervisor(input: SupervisorInput): Promise<QualityReport> {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const evidenceDir = path.resolve(workspaceRoot, input.evidenceDir ?? DEFAULT_EVIDENCE_DIR);
  mkdirSync(evidenceDir, { recursive: true });
  resetAttemptCounts();

  const notes: string[] = [
    "Supervisor PASSED is a technical verdict. It is never publication approval.",
    "Multimodal aesthetic review is optional and is never inferred as a pass.",
  ];
  const free = diskFreeGb();
  if (diskIsBelowStop(free)) {
    const report: QualityReport = {
      version: 1,
      executionId: input.executionId,
      status: "FAILED",
      gates: composeGates({ defects: [], visualReview: "NOT_EVALUATED", htmlProbed: false }),
      defects: [
        {
          id: "disk",
          kind: "DISK",
          severity: "BLOCKING",
          gate: "TECHNICAL_GATE",
          message: `C: free space ${free} GB is below 5 GB`,
          evidence: [`${free}`],
          files: [],
          fixable: false,
          acceptance: "stop heavy work below 5 GB free",
        },
      ],
      attempts: [],
      changedFiles: [],
      visualReview: "NOT_EVALUATED",
      multimodalReview: "NOT_EVALUATED",
      humanApproval: "REQUIRED",
      notes,
      diskFreeGb: free,
    };
    persistReport(evidenceDir, report);
    return report;
  }

  let status: SupervisorStatus = "RUNNING";
  const criteria = input.criteria ?? EXECUTION_50D_CRITERIA;
  const changedFiles: QualityReport["changedFiles"] = [];
  const attempts: QualityReport["attempts"] = [];

  let qa = await runQa({ targets: input.targets, workspaceRoot, evidenceDir });
  notes.push(...qa.notes);

  const scopeBlock = qa.defects.some((item) => item.kind === "OUT_OF_SCOPE");
  if (scopeBlock) {
    const proposed = input.targets.find((item) => item.kind === "out-of-scope-request");
    if (proposed && proposed.kind === "out-of-scope-request") {
      attempts.push(
        attemptFix({
          defect: qa.defects.find((item) => item.kind === "OUT_OF_SCOPE")!,
          workspaceRoot,
          maxAttempts: criteria.maxAttemptsPerDefect,
        }),
      );
    }
    const report = finish({
      status: "FAILED",
      qa,
      attempts,
      changedFiles,
      notes: [...notes, "out-of-scope edit was blocked before any write"],
      executionId: input.executionId,
      diskFreeGb: free,
      evidenceDir,
    });
    return report;
  }

  let round = 0;
  while (input.autoFix !== false) {
    const blocking = blockingDefects(qa.defects);
    const seen = new Set<string>();
    const fixable = blocking.filter((item) => {
      if (!item.fixable) return false;
      const key = `${item.kind}:${item.files[0] ?? item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const unfixable = blocking.filter((item) => !item.fixable);
    if (blocking.length === 0) break;
    if (fixable.length === 0) {
      status = "HUMAN_REVIEW_REQUIRED";
      for (const defect of unfixable) {
        attempts.push(attemptFix({ defect, workspaceRoot, maxAttempts: criteria.maxAttemptsPerDefect }));
      }
      break;
    }
    if (round >= criteria.maxAttemptsPerDefect) {
      status = "FAILED";
      notes.push(`attempt limit ${criteria.maxAttemptsPerDefect} reached`);
      break;
    }
    status = "FIXING";
    for (const defect of fixable) {
      const attempt = attemptFix({
        defect,
        workspaceRoot,
        maxAttempts: criteria.maxAttemptsPerDefect,
      });
      attempts.push(attempt);
      if (attempt.status === "APPLIED" && attempt.patches[0]) changedFiles.push(attempt.patches[0].path);
      if (attempt.status === "EXHAUSTED") {
        status = "FAILED";
        notes.push(`defect ${defect.id} exhausted attempts`);
      }
    }
    if (status === "FAILED") break;
    status = "REVALIDATING";
    qa = await runQa({ targets: input.targets, workspaceRoot, evidenceDir });
    notes.push(`revalidation round ${round + 1}`);
    round += 1;
  }

  const report = finish({
    status:
      status === "HUMAN_REVIEW_REQUIRED" || status === "FAILED"
        ? status
        : blockingDefects(qa.defects).length
          ? blockingDefects(qa.defects).every((item) => !item.fixable)
            ? "HUMAN_REVIEW_REQUIRED"
            : "FAILED"
          : "PASSED",
    qa,
    attempts,
    changedFiles: [...new Set(changedFiles)],
    notes,
    executionId: input.executionId,
    diskFreeGb: free,
    evidenceDir,
  });
  return report;
}

function finish(input: {
  status: SupervisorStatus;
  qa: Awaited<ReturnType<typeof runQa>>;
  attempts: QualityReport["attempts"];
  changedFiles: string[];
  notes: string[];
  executionId: string;
  diskFreeGb: number;
  evidenceDir: string;
}): QualityReport {
  const visualReview = visualState(input.qa.htmlProbed, input.qa.defects);
  const gates = composeGates({
    defects: input.qa.defects,
    visualReview,
    htmlProbed: input.qa.htmlProbed,
  });
  let status = input.status;
  if (status === "PASSED" && !technicalGatesPassed(gates)) {
    status = blockingDefects(input.qa.defects).every((item) => !item.fixable) ? "HUMAN_REVIEW_REQUIRED" : "FAILED";
  }
  const report: QualityReport = {
    version: 1,
    executionId: input.executionId,
    status,
    gates,
    defects: input.qa.defects,
    attempts: input.attempts,
    changedFiles: input.changedFiles,
    visualReview,
    multimodalReview: "NOT_EVALUATED",
    humanApproval: "REQUIRED",
    notes: input.notes,
    diskFreeGb: input.diskFreeGb,
  };
  persistReport(input.evidenceDir, report);
  return report;
}

export function persistReport(evidenceDir: string, report: QualityReport): void {
  mkdirSync(evidenceDir, { recursive: true });
  writeJson(evidenceDir, "supervisor-report.json", report);
  writeJson(evidenceDir, "gates.json", report.gates);
  writeJson(evidenceDir, "defects.json", report.defects);
  writeJson(evidenceDir, "attempts.json", report.attempts);
  writeJson(evidenceDir, "files-changed.json", report.changedFiles);
  writeJson(evidenceDir, "revalidation.json", {
    status: report.status,
    visualReview: report.visualReview,
    multimodalReview: report.multimodalReview,
    humanApproval: report.humanApproval,
  });
}
