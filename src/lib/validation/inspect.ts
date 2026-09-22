import fs from "node:fs";
import path from "node:path";
import { analyzeLayoutSnapshot } from "@/lib/visual-qa/deterministic";
import { composeVisualQaGate } from "@/lib/visual-qa/gate";
import { inspectRenderedPresell } from "@/lib/visual-qa/browser";
import { visualQaBaseUrl } from "@/lib/visual-qa/run";
import type { ScreenshotPayload } from "@/lib/visual-qa/multimodal";
import { runIndividualAiVisualReview } from "@/lib/validation/ai-review";
import { lightweightPerformanceFrom } from "@/lib/validation/performance";
import { markStage } from "@/lib/validation/pipeline";
import { getValidationCandidate, updateValidationCandidate } from "@/lib/validation/store";
import { collectCandidateFailures } from "@/lib/validation/taxonomy";
import type { ValidationCandidate } from "@/lib/validation/types";

export function validationLabDir(...parts: string[]): string {
  const dir = path.join(process.cwd(), "data", "validation-lab", ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyShot(src: string, dest: string): string {
  fs.copyFileSync(src, dest);
  return path.relative(path.join(process.cwd(), "data", "validation-lab"), dest).replace(/\\/g, "/");
}

export async function inspectValidationCandidate(candidateId: string): Promise<ValidationCandidate> {
  const candidate = getValidationCandidate(candidateId);
  if (!candidate) throw new Error("candidate not found");
  if (!candidate.pageCompositionJson) {
    const stages = markStage(candidate.stages, "DESKTOP_RENDER", "SKIPPED", "no composition to render");
    const updated = updateValidationCandidate(candidateId, {
      stages: markStage(stages, "MOBILE_RENDER", "SKIPPED", "no composition to render"),
    });
    return updated!;
  }

  const baseUrl = visualQaBaseUrl();
  const url = `${baseUrl}/visual-frame/validation/${encodeURIComponent(candidate.id)}`;
  let stages = candidate.stages;
  try {
    const inspection = await inspectRenderedPresell({
      slug: `validation-${candidate.id}`,
      artifactKey: `validation-${candidate.id}`,
      baseUrl,
      url,
    });
    const desktop = inspection.captures.find((c) => c.viewport.width === 1440 && c.viewport.captureScreenshots);
    const mobile = inspection.captures.find((c) => c.viewport.width === 390 && c.viewport.captureScreenshots);
    const destDir = validationLabDir(candidate.runId, candidate.id);
    const desktopRel = desktop?.screenshotFiles[0]
      ? copyShot(desktop.screenshotFiles[0], path.join(destDir, "desktop-1440.jpg"))
      : null;
    const mobileRel = mobile?.screenshotFiles[0]
      ? copyShot(mobile.screenshotFiles[0], path.join(destDir, "mobile-390.jpg"))
      : null;

    stages = markStage(
      stages,
      "DESKTOP_RENDER",
      desktop ? "OK" : "FAIL",
      desktop ? "1440 screenshot stored" : "desktop screenshot missing",
    );
    stages = markStage(
      stages,
      "MOBILE_RENDER",
      mobile ? "OK" : "FAIL",
      mobile ? "390 screenshot stored" : "mobile screenshot missing",
    );

    const overflow = inspection.captures
      .filter((c) => c.snapshot.overflowX)
      .map((c) => `${c.viewport.width}x${c.viewport.height}`);
    const findings = inspection.captures.flatMap((c) =>
      analyzeLayoutSnapshot(c.snapshot, candidate.template || "REVIEW"),
    );
    const highCount = findings.filter((f) => f.severity === "HIGH").length;
    const warningCount = findings.filter((f) => f.severity === "WARNING").length;
    const status = composeVisualQaGate({
      findings,
      aiVisualReview: "OK",
    });
    stages = markStage(stages, "VISUAL_QA", status === "PASS" ? "OK" : "BLOCKED", `status=${status} HIGH=${highCount}`);

    const performance = lightweightPerformanceFrom({
      resources: inspection.resources || [],
      snapshots: inspection.captures.map((c) => c.snapshot),
    });
    stages = markStage(
      stages,
      "PERFORMANCE_QA",
      performance.regressionFlags.length ? "FAIL" : "OK",
      `transfer=${performance.transferBytes} image=${performance.imageBytes} js=${performance.jsBytes}`,
    );

    const shots: ScreenshotPayload[] = [];
    if (desktop) shots.push(...desktop.payloads.filter((p) => /desktop|1440/i.test(p.label)));
    if (mobile) shots.push(...mobile.payloads.filter((p) => /mobile|390/i.test(p.label)));
    if (shots.length === 0) {
      shots.push(...inspection.captures.flatMap((c) => c.payloads));
    }
    const aiReview = await runIndividualAiVisualReview({
      screenshots: shots,
      template: candidate.template,
      productName: candidate.productName,
      approach: candidate.approach,
    });

    const next = updateValidationCandidate(candidateId, {
      stages,
      desktopScreenshot: desktopRel,
      mobileScreenshot: mobileRel,
      visualQa: {
        status,
        highCount,
        warningCount,
        actionCodes: Array.from(new Set(findings.map((f) => f.actionCode))),
        overflowViewports: overflow,
      },
      performance,
      aiReview,
    });
    const failures = collectCandidateFailures(next!);
    return updateValidationCandidate(candidateId, { failures })!;
  } catch (err) {
    const message = err instanceof Error ? err.message : "inspect failed";
    stages = markStage(stages, "DESKTOP_RENDER", "FAIL", message, message);
    stages = markStage(stages, "MOBILE_RENDER", "FAIL", message, message);
    stages = markStage(stages, "VISUAL_QA", "FAIL", message, message);
    stages = markStage(stages, "PERFORMANCE_QA", "SKIPPED", message);
    const next = updateValidationCandidate(candidateId, { stages });
    return updateValidationCandidate(candidateId, { failures: collectCandidateFailures(next!) })!;
  }
}
