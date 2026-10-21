// npx tsx scripts/test-quality-gate.ts
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXECUTION_50D_CRITERIA, REQUIRED_EVIDENCE_FILES } from "../src/lib/quality-gate/criteria.ts";
import { diskFreeGb } from "../src/lib/quality-gate/disk.ts";
import { attemptFix, applyPatches, fileHash, resetAttemptCounts, safeEditorAvailability } from "../src/lib/quality-gate/fix.ts";
import { auditLabConversionBriefs } from "../src/lib/quality-gate/qa.ts";
import { assertFixPathAllowed } from "../src/lib/quality-gate/scope.ts";
import { runSupervisor } from "../src/lib/quality-gate/supervisor.ts";
import { reviewVisualOptional } from "../src/lib/quality-gate/visual.ts";
import type { Defect, QualityReport } from "../src/lib/quality-gate/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const EVIDENCE = path.join("data", "evidence", "execution-50d-ai-quality-gate");
const WORK = path.join("scripts", "fixtures", "quality-gate", "work");
const FIXTURES = path.join("scripts", "fixtures", "quality-gate");

const free = diskFreeGb();
assert(Number.isFinite(free), "disk free space is measurable");
assert(free >= 5, `C: has ${free} GB free (>= 5)`);

const protectedFiles = [
  "src/lib/product-assets/authorization.ts",
  "src/app/p/[slug]/page.tsx",
  "src/app/visual-frame/[slug]/page.tsx",
  "src/lib/conversion-strategy/build.ts",
  "src/lib/product-contract/build.ts",
];
const beforeProtect = Object.fromEntries(protectedFiles.map((rel) => [rel, fileHash(path.join(ROOT, rel))]));

mkdirSync(path.join(ROOT, WORK), { recursive: true });
mkdirSync(path.join(ROOT, EVIDENCE), { recursive: true });

function copyWork(name: string, destName: string): string {
  const from = path.join(FIXTURES, name);
  const to = path.join(WORK, destName);
  copyFileSync(from, to);
  return path.posix.join("scripts/fixtures/quality-gate/work", destName);
}

async function main() {
  const tsWork = copyWork("typescript-error.broken.ts", "typescript-error.ts");
  const overflowWork = copyWork("overflow.broken.html", "overflow.html");
  const contrastWork = copyWork("low-contrast.broken.html", "low-contrast.html");
  const unfixableWork = copyWork("unfixable.broken.json", "unfixable.json");

  const editor = safeEditorAvailability();
  assert(editor.autonomousAiEditing === false, "does not claim general AI editing");
  assert(editor.scopedPatchExecutor === true, "scoped patch executor is present");
  assert(reviewVisualOptional().state === "NOT_EVALUATED", "multimodal review stays NOT_EVALUATED without a paid call");

  const briefDefects = auditLabConversionBriefs();
  assert(briefDefects.length === 0, "six synthetic conversion briefs still validate");

  const tsReport = await runSupervisor({
    executionId: "execution-50d-typescript",
    criteria: EXECUTION_50D_CRITERIA,
    evidenceDir: path.join(EVIDENCE, "typescript-error"),
    autoFix: true,
    targets: [{ kind: "typescript-file", path: tsWork }],
  });
  assert(tsReport.attempts.some((item) => item.status === "APPLIED"), "typescript defect was patched");
  assert(tsReport.status === "PASSED", `typescript revalidation passed (status=${tsReport.status})`);
  assert(tsReport.humanApproval === "REQUIRED", "typescript pass is not human approval");
  assert(readFileSync(path.join(ROOT, tsWork), "utf8").includes("export const broken: number = 123"), "typescript fixture is now valid");

  const overflowReport = await runSupervisor({
    executionId: "execution-50d-overflow",
    criteria: EXECUTION_50D_CRITERIA,
    evidenceDir: path.join(EVIDENCE, "overflow"),
    autoFix: true,
    targets: [{ kind: "html-page", path: overflowWork, capture: true }],
  });
  assert(overflowReport.attempts.some((item) => item.status === "APPLIED" && item.diff), "overflow produced an applied diff");
  assert(overflowReport.status === "PASSED", `overflow revalidation passed (status=${overflowReport.status})`);
  assert(!/width:\s*2400px/i.test(readFileSync(path.join(ROOT, overflowWork), "utf8")), "overflow width was corrected");
  assert(overflowReport.gates.VISUAL_REVIEW_GATE.verdict !== "FAIL", "overflow visual gate is no longer FAIL");
  assert(overflowReport.multimodalReview === "NOT_EVALUATED", "overflow did not fake a multimodal pass");

  const contrastReport = await runSupervisor({
    executionId: "execution-50d-contrast",
    criteria: EXECUTION_50D_CRITERIA,
    evidenceDir: path.join(EVIDENCE, "low-contrast"),
    autoFix: true,
    targets: [{ kind: "html-page", path: contrastWork, capture: true }],
  });
  assert(contrastReport.attempts.some((item) => item.status === "APPLIED"), "low-contrast CTA was patched");
  assert(contrastReport.status === "PASSED", `contrast revalidation passed (status=${contrastReport.status})`);
  assert(/color: #101828; background: #ffffff/.test(readFileSync(path.join(ROOT, contrastWork), "utf8")), "CTA contrast tokens were raised");

  const unfixableReport = await runSupervisor({
    executionId: "execution-50d-unfixable",
    criteria: EXECUTION_50D_CRITERIA,
    evidenceDir: path.join(EVIDENCE, "unfixable"),
    autoFix: true,
    targets: [{ kind: "claim-document", path: unfixableWork }],
  });
  assert(unfixableReport.defects.some((item) => item.kind === "UNGROUNDED_CLAIM"), "ungrounded claim was detected");
  assert(unfixableReport.attempts.every((item) => item.status === "REJECTED_POLICY" || item.status === "EXHAUSTED"), "ungrounded claim was not auto-fixed");
  assert(unfixableReport.status === "HUMAN_REVIEW_REQUIRED", `unfixable ends in human review (status=${unfixableReport.status})`);
  assert(readFileSync(path.join(ROOT, unfixableWork), "utf8").includes("Clinically proven"), "unfixable fixture was left unchanged");

  const outOfScopeReport = await runSupervisor({
    executionId: "execution-50d-out-of-scope",
    criteria: EXECUTION_50D_CRITERIA,
    evidenceDir: path.join(EVIDENCE, "out-of-scope"),
    autoFix: true,
    targets: [
      {
        kind: "out-of-scope-request",
        path: "src/lib/product-assets/authorization.ts",
        proposedPatch: {
          path: "src/lib/product-assets/authorization.ts",
          oldString: "PROHIBITED_ORIGINS",
          newString: "PROHIBITED_ORIGINS_DISABLED",
          reason: "weaken the commercial authorization policy",
        },
      },
    ],
  });
  assert(outOfScopeReport.defects.some((item) => item.kind === "OUT_OF_SCOPE"), "out-of-scope request was classified");
  assert(outOfScopeReport.attempts.some((item) => item.status === "REJECTED_SCOPE"), "out-of-scope patch was rejected");
  assert(outOfScopeReport.status === "FAILED", "out-of-scope request fails closed");
  assert(!assertFixPathAllowed("src/lib/product-assets/authorization.ts", ROOT).ok, "authorization policy is denied");

  const forced = applyPatches({
    patches: [
      {
        path: "src/lib/product-assets/authorization.ts",
        oldString: "PROHIBITED_ORIGINS",
        newString: "PROHIBITED_ORIGINS_DISABLED",
        reason: "should never apply",
      },
    ],
    workspaceRoot: ROOT,
  });
  assert(forced.attempts[0]?.status === "REJECTED_SCOPE", "direct apply on policy file is rejected");
  assert(forced.changedFiles.length === 0, "no policy file was written");

  resetAttemptCounts();
  const fakeUnfixable: Defect = {
    id: "limit-demo",
    kind: "UNGROUNDED_CLAIM",
    severity: "BLOCKING",
    gate: "CONTENT_GROUNDING_GATE",
    message: "invented claim",
    evidence: [],
    files: [unfixableWork],
    fixable: false,
    acceptance: "cannot invent evidence",
  };
  const tries = [1, 2, 3, 4].map(() => attemptFix({ defect: fakeUnfixable, workspaceRoot: ROOT, maxAttempts: 3 }));
  assert(tries.slice(0, 3).every((item) => item.status === "REJECTED_POLICY"), "first three unfixable attempts are refused");
  assert(tries[3].status === "EXHAUSTED", "fourth attempt is exhausted");

  for (const rel of protectedFiles) {
    assert(fileHash(path.join(ROOT, rel)) === beforeProtect[rel], `${rel} was not modified`);
  }

  assert(tsReport.gates.HUMAN_APPROVAL_GATE.verdict === "REQUIRED", "human approval gate stays REQUIRED after a technical pass");
  assert(tsReport.gates.TECHNICAL_GATE.verdict === "PASS", "typescript technical gate is PASS after fix");
  assert(overflowReport.changedFiles.length >= 1, "overflow records changed files");
  assert(contrastReport.changedFiles.length >= 1, "contrast records changed files");

  const comparison = {
    scenarios: [
      row("typescript-error", tsReport),
      row("overflow", overflowReport),
      row("low-contrast", contrastReport),
      row("unfixable", unfixableReport),
      row("out-of-scope", outOfScopeReport),
    ],
    editor,
    multimodal: reviewVisualOptional(),
    diskFreeGb: free,
  };
  writeFileSync(path.join(ROOT, EVIDENCE, "comparison.json"), JSON.stringify(comparison, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify({
    typescript: tsReport.gates,
    overflow: overflowReport.gates,
    contrast: contrastReport.gates,
    unfixable: unfixableReport.gates,
    outOfScope: outOfScopeReport.gates,
  }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify({
    typescript: tsReport.defects,
    overflow: overflowReport.defects,
    contrast: contrastReport.defects,
    unfixable: unfixableReport.defects,
    outOfScope: outOfScopeReport.defects,
  }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "attempts.json"), JSON.stringify({
    typescript: tsReport.attempts,
    overflow: overflowReport.attempts,
    contrast: contrastReport.attempts,
    unfixable: unfixableReport.attempts,
    outOfScope: outOfScopeReport.attempts,
    attemptLimit: tries,
  }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify({
    typescript: tsReport,
    overflow: overflowReport,
    contrast: contrastReport,
    unfixable: unfixableReport,
    outOfScope: outOfScopeReport,
  }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({
    typescript: tsReport.status,
    overflow: overflowReport.status,
    contrast: contrastReport.status,
    unfixable: unfixableReport.status,
    outOfScope: outOfScopeReport.status,
  }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "files-changed.json"), JSON.stringify({
    typescript: tsReport.changedFiles,
    overflow: overflowReport.changedFiles,
    contrast: contrastReport.changedFiles,
    unfixable: unfixableReport.changedFiles,
    outOfScope: outOfScopeReport.changedFiles,
    protectedUnchanged: protectedFiles,
  }, null, 2));
  const diffsDir = path.join(ROOT, EVIDENCE, "diffs");
  mkdirSync(diffsDir, { recursive: true });
  for (const [name, report] of [
    ["typescript-error", tsReport],
    ["overflow", overflowReport],
    ["low-contrast", contrastReport],
  ] as const) {
    const diff = report.attempts.map((item) => item.diff).filter(Boolean).join("\n\n");
    if (diff) writeFileSync(path.join(diffsDir, `${name}.diff`), diff);
  }
  const shots = ["overflow", "low-contrast"].flatMap((name) =>
    [1440, 768, 390].map((width) => path.posix.join(name, "screenshots", `${name}-${width}.jpg`)),
  );
  writeFileSync(path.join(ROOT, EVIDENCE, "screenshots.json"), JSON.stringify({ files: shots }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "disk.json"), JSON.stringify({ freeGb: free }, null, 2));
  writeFileSync(
    path.join(ROOT, EVIDENCE, "index.json"),
    JSON.stringify({ execution: "50d", comparison, required: REQUIRED_EVIDENCE_FILES }, null, 2),
  );

  const evidenceCheck = await runSupervisor({
    executionId: "execution-50d-evidence",
    criteria: EXECUTION_50D_CRITERIA,
    evidenceDir: path.join(EVIDENCE, "evidence-check"),
    autoFix: false,
    targets: [{ kind: "evidence-files", directory: EVIDENCE.replace(/\\/g, "/"), required: [...REQUIRED_EVIDENCE_FILES] }],
  });
  assert(evidenceCheck.defects.filter((item) => item.kind === "MISSING_EVIDENCE_FILE").length === 0, "required evidence files exist");

  writeFileSync(
    path.join(ROOT, EVIDENCE, "test-results.json"),
    JSON.stringify({ ok: passed, passed, hash: createHash("sha256").update(JSON.stringify(comparison)).digest("hex").slice(0, 12) }, null, 2),
  );

  assert(["typescript-error.ts", "overflow.html", "low-contrast.html"].every((name) => existsSync(path.join(ROOT, WORK, name))), "work copies remain isolated");

  console.log("QUALITY_GATE_OK");
  console.log(`OK_COUNT=${passed}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

function row(id: string, report: QualityReport) {
  return {
    id,
    status: report.status,
    gates: Object.fromEntries(Object.entries(report.gates).map(([key, value]) => [key, value.verdict])),
    defectKinds: [...new Set(report.defects.map((item) => item.kind))],
    attemptStatuses: report.attempts.map((item) => item.status),
    changedFiles: report.changedFiles,
    visualReview: report.visualReview,
    multimodalReview: report.multimodalReview,
    humanApproval: report.humanApproval,
  };
}
