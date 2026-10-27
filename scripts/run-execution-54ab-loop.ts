// npx tsx scripts/run-execution-54ab-loop.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { envLookup, envValuePresent, redactSecrets } from "../src/lib/lp-generator/ai-copy/config.ts";
import { paidAiAuthorization, runWithTemporaryPaidAi } from "../src/lib/ai/paid-gate.ts";
import { openaiVisionProviderStatus, OPENAI_VISION_MODEL } from "../src/lib/presell-quality/openai-provider.ts";
import { loadApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { runQualityImprovementLoop } from "../src/lib/presell-quality/loop.ts";
import { OPENAI_LOOP_BUDGET } from "../src/lib/presell-quality/budget.ts";
import { QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";
import { createMultimodalPresellEvaluator } from "../src/lib/presell-quality/multimodal.ts";
import { createOpenAiVisionClient } from "../src/lib/presell-quality/openai-provider.ts";

const EVIDENCE = path.join("data/evidence/execution-54ab-openai-autonomous-loop");
const REPORTS = path.join(EVIDENCE, "reports");

function copyShot(src: string | null | undefined, dest: string): boolean {
  if (!src || !existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

async function probeOpenAi(apiKey: string): Promise<{ ok: boolean; models: string[]; reason: string; balanceVisible: false }> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      return { ok: false, models: [], reason: redactSecrets(`HTTP_${response.status}`), balanceVisible: false };
    }
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
    const vision = ids.filter((id) => id === "gpt-4o-mini" || id === "gpt-4o" || id.includes("gpt-4o"));
    return {
      ok: vision.length > 0 || ids.length > 0,
      models: vision.length ? vision.slice(0, 8) : ids.slice(0, 8),
      reason: vision.length ? "Vision-capable GPT-4o models listed." : "Models listed; vision support inferred from configured gpt-4o-mini.",
      balanceVisible: false,
    };
  } catch (err) {
    return { ok: false, models: [], reason: redactSecrets(err instanceof Error ? err.message : String(err)), balanceVisible: false };
  }
}

async function main() {
  mkdirSync(REPORTS, { recursive: true });
  mkdirSync(path.join(EVIDENCE, "screenshots"), { recursive: true });

  const baseCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  const keyConfigured = envValuePresent("OPENAI_API_KEY");
  const apiKey = envLookup("OPENAI_API_KEY");
  const paidBefore = paidAiAuthorization();
  const probe = keyConfigured ? await probeOpenAi(apiKey) : { ok: false, models: [], reason: "OPENAI_API_KEY is not configured.", balanceVisible: false as const };
  const model = probe.models.includes(OPENAI_VISION_MODEL) || probe.ok ? OPENAI_VISION_MODEL : OPENAI_VISION_MODEL;

  const snap = snapshotProductResearch(237);
  const generation = loadApprovedReviewGeneration(237);
  const stored = generation?.generationId ? readGenerationModel(generation.generationId) : null;
  const accepted = acceptedProposals(snap.latest).map((item) => item.field);
  const media = selectReviewMedia({
    assets: snap.latest?.discoveredAssets,
    productName: stored?.contract.identity.productName ?? "Sugar Defender",
    campaignId: 237,
  });
  const heroEligible = media.heroStatus === "SELECTED";
  const approvedAssets = media.approved.map((item) => ({
    id: item.assetId,
    eligible: item.editorialEligibility === "ELIGIBLE" && item.galleryKind === "PRODUCT_PACKSHOT",
    kind: item.galleryKind,
  }));

  const diagnostic = {
    branch,
    baseCommit,
    keyConfigured,
    paidBefore,
    probe: { ...probe, apiKey: undefined },
    campaignId: 237,
    generationId: generation?.generationId ?? null,
    previewPath: generation?.previewPath ?? null,
    acceptedFacts: accepted,
    heroStatus: media.heroStatus,
    heroEligible,
    approvedAssetCount: approvedAssets.length,
    budget: OPENAI_LOOP_BUDGET,
  };
  writeFileSync(path.join(REPORTS, "audit.json"), `${JSON.stringify(diagnostic, null, 2)}\n`);

  if (!generation?.generationId || !generation.previewPath || !stored) {
    throw new Error("Campaign 237 has no sandbox generation to evaluate.");
  }
  if (!keyConfigured) {
    writeFileSync(
      path.join(REPORTS, "loop.json"),
      `${JSON.stringify({ status: "NOT_EXECUTED", reason: "OPENAI_API_KEY is not configured.", REAL_OPENAI_EVALUATIONS: 0 }, null, 2)}\n`,
    );
    console.log("54AB REAL_OPENAI_EVALUATIONS=0 reason=OPENAI_API_KEY missing");
    return;
  }

  const factsFingerprint = JSON.stringify({
    facts: accepted,
    contract: stored.contract,
    assets: snap.latest?.discoveredAssets?.map((item) => ({ url: item.assetUrl, status: item.status, kind: item.galleryKind })),
  });

  const result = await runWithTemporaryPaidAi({ scope: "54AB", provider: "openai", maxUsd: OPENAI_LOOP_BUDGET.maxUsd }, async () => {
    const status = openaiVisionProviderStatus();
    if (!status.authorized) throw new Error(status.reason);
    return runQualityImprovementLoop({
      campaignId: 237,
      generationId: generation.generationId!,
      previewPath: generation.previewPath!,
      model: stored,
      approvedFacts: accepted,
      evidenceReferences: [snap.latest?.runId ?? "research-237"],
      approvedAssets,
      editorialConstraints: [
        "Do not invent benefits, testimonials, or clinical claims.",
        "Do not promote ineligible gallery images to the hero.",
        "Do not approve assets, publish, or authorize ads.",
        "Refine presentation using approved facts only.",
      ],
      heroEligible,
      baseUrl: "http://127.0.0.1:3000",
    }, {
      evaluator: createMultimodalPresellEvaluator({
        skipCache: true,
        client: createOpenAiVisionClient(),
      }),
    });
  });

  const factsAfter = JSON.stringify({
    facts: acceptedProposals(snapshotProductResearch(237).latest).map((item) => item.field),
    contract: readGenerationModel(generation.generationId)?.contract,
    assets: snapshotProductResearch(237).latest?.discoveredAssets?.map((item) => ({ url: item.assetUrl, status: item.status, kind: item.galleryKind })),
  });

  const desktop: string[] = [];
  const mobile: string[] = [];
  result.iterations.forEach((item, index) => {
    const folder = path.join(EVIDENCE, "screenshots", `iteration-${item.iteration}`);
    const d = item.capture?.desktop?.path;
    const m = item.capture?.mobile?.path;
    if (copyShot(d, path.join(folder, "desktop-full.png"))) desktop.push(path.join(folder, "desktop-full.png").replace(/\\/g, "/"));
    if (copyShot(m, path.join(folder, "mobile-full.png"))) mobile.push(path.join(folder, "mobile-full.png").replace(/\\/g, "/"));
    const dv = item.capture?.extras.find((shot) => shot.role === "desktop-viewport")?.path;
    const mv = item.capture?.extras.find((shot) => shot.role === "mobile-viewport")?.path;
    copyShot(dv, path.join(folder, "desktop-viewport.png"));
    copyShot(mv, path.join(folder, "mobile-viewport.png"));
    writeFileSync(path.join(REPORTS, `iteration-${item.iteration}.json`), `${JSON.stringify(item, null, 2)}\n`);
    if (index === 0) {
      writeFileSync(path.join(REPORTS, "first-diagnosis.json"), `${JSON.stringify({ score: item.score, findings: item.findings, criticalFailures: item.criticalFailures, status: item.status }, null, 2)}\n`);
    }
  });

  const report = {
    EXECUTION_54AB_STATUS: result.status,
    STOP_REASON: result.stopReason,
    BASE_COMMIT: baseCommit,
    OPENAI_PROVIDER_STATUS: "LIVE",
    OPENAI_MODEL: model,
    OPENAI_API_KEY_CONFIGURED: true,
    PAID_AI_AUTHORIZATION: "temporary-process-54AB",
    BUDGET_LIMIT: OPENAI_LOOP_BUDGET.maxUsd,
    REAL_OPENAI_EVALUATIONS: result.ledger.evaluationCount,
    TOTAL_API_COST: result.ledger.spentUsd,
    INITIAL_SCORE: result.initialScore,
    FINAL_SCORE: result.finalScore,
    QUALITY_TARGET,
    ITERATIONS: result.iterations.length,
    AUTO_FIXES_APPLIED: result.autoFixesApplied,
    AUTO_FIXES_REJECTED: result.autoFixesRejected,
    HERO_IMAGE_POLICY: heroEligible ? "ELIGIBLE_PACKSHOT" : "HERO_IMAGE_MISSING_NO_PROMOTION",
    FACTS_PRESERVED: factsFingerprint === factsAfter,
    ASSET_APPROVALS_PRESERVED: factsFingerprint === factsAfter,
    SUGAR_DEFENDER_FINAL_STATUS: result.status,
    DESKTOP_SCREENSHOTS: desktop,
    MOBILE_SCREENSHOTS: mobile,
    ASSESSMENT_HISTORY: result.iterations.map((item) => ({
      iteration: item.iteration,
      assessmentId: item.assessmentId,
      score: item.score,
      status: item.status,
      estimatedCost: item.estimatedCost,
    })),
    COMMERCIAL_AUTHORIZATION: result.commercialAuthorization,
    PUBLICATION_READINESS: result.publicationReadiness,
    BALANCE_VISIBLE: false,
    MODEL_LIST_PROBE: probe,
    ledger: result.ledger,
  };
  writeFileSync(path.join(REPORTS, "loop.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "costs.json"), `${JSON.stringify(result.ledger, null, 2)}\n`);
  writeFileSync(path.join(REPORTS, "corrections.json"), `${JSON.stringify({ applied: result.autoFixesApplied, rejected: result.autoFixesRejected }, null, 2)}\n`);
  console.log(
    `54AB status=${result.status} stop=${result.stopReason} initial=${result.initialScore} final=${result.finalScore} evals=${result.ledger.evaluationCount} cost=${result.ledger.spentUsd}`,
  );
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exit(1);
});
