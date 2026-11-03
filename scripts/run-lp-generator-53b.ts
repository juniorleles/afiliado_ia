// npx tsx scripts/run-lp-generator-53b.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import {
  COPY_MAX_OUTPUT_TOKENS,
  COPY_TIMEOUT_MS,
  OPENAI_RESPONSES_URL,
  OPENAI_TEXT_MODEL,
  estimateOpenAiCostUsd,
  resolveCopyProvider,
} from "../src/lib/lp-generator/ai-copy/config.ts";
import { diagnoseAiProvider } from "../src/lib/lp-generator/ai-copy/provider.ts";
import { runGeneration } from "../src/lib/lp-generator/run.ts";
import { DEFAULT_GENERATION_ROOT, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { productKeyFromName } from "../src/lib/real-product-assets/extract.ts";
import { readCatalog } from "../src/lib/real-product-assets/store.ts";

const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-53b-openai-copy");

function envKeyNamed(name: string): boolean {
  if (process.env[name]?.trim()) return true;
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return false;
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .some((line) => line.startsWith(`${name}=`) && line.slice(name.length + 1).trim().length > 0);
}

function envNamedValue(name: string): string {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
}

async function main() {
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }
  mkdirSync(EVIDENCE, { recursive: true });

  const env = {
    OPENAI_API_KEY: envKeyNamed("OPENAI_API_KEY") ? "present" : "absent",
    ANTHROPIC_API_KEY: envKeyNamed("ANTHROPIC_API_KEY") ? "present" : "absent",
    AI_PROVIDER: envNamedValue("AI_PROVIDER") || "(unset, default openai when OpenAI key is present)",
    AI_MODEL: envNamedValue("AI_MODEL") || `(unset, default ${OPENAI_TEXT_MODEL})`,
    AIA_ALLOW_PAID_AI: envNamedValue("AIA_ALLOW_PAID_AI") === "1" ? "1" : "0",
  };
  const diagnosis = diagnoseAiProvider();
  const selection = resolveCopyProvider();
  const diagnosisJson = JSON.stringify({ env, diagnosis, selection }, null, 2);
  if (/sk-[A-Za-z0-9_\-]+/.test(diagnosisJson)) {
    throw new Error("provider diagnosis contained a secret-shaped value");
  }
  writeFileSync(path.join(EVIDENCE, "provider-diagnosis.json"), `${diagnosisJson}\n`);
  writeFileSync(
    path.join(EVIDENCE, "cost-estimate.json"),
    `${JSON.stringify(
      {
        model: OPENAI_TEXT_MODEL,
        endpoint: OPENAI_RESPONSES_URL,
        maxOutputTokens: COPY_MAX_OUTPUT_TOKENS,
        timeoutMs: COPY_TIMEOUT_MS,
        maxAttempts: 1,
        samplePromptTokens: 2500,
        sampleOutputTokens: 800,
        estimatedCostPerGeneration: estimateOpenAiCostUsd(2500, 800),
        ratesUsdPerMillion: { input: 0.25, output: 2 },
        source: "https://developers.openai.com/api/docs/models/gpt-5-mini",
        realCallMade: false,
      },
      null,
      2,
    )}\n`,
  );

  const productKey = productKeyFromName("FemiCore");
  const catalogBefore = readCatalog(productKey);
  const approvedBefore = (catalogBefore?.images ?? [])
    .filter((item) => item.status === "USER_APPROVED")
    .map((item) => ({ id: item.id, role: item.visualRole, status: item.status }));
  writeFileSync(
    path.join(EVIDENCE, "approved-assets-before.json"),
    `${JSON.stringify({ productKey, approvedCount: approvedBefore.length, approved: approvedBefore }, null, 2)}\n`,
  );

  const started = Date.now();
  const record = await runGeneration(
    {
      productName: "FemiCore",
      category: "dietary supplement",
      salesUrl: "https://getfemicore.com/text.php?hop=zzzzz&hopId=4ee34404-eb94-4fcc-9911-a6acd2e2a8d2",
      affiliateUrl: "https://getfemicore.com/help/affiliates.php",
      hopLink: "https://getfemicore.com/text.php?hop=zzzzz&hopId=4ee34404-eb94-4fcc-9911-a6acd2e2a8d2",
      language: "en",
      market: "US",
      goal: "INFORM",
    },
    { storeRoot: DEFAULT_GENERATION_ROOT, force: true, allowPaidAi: false },
  );
  const model = readGenerationModel(record.id, DEFAULT_GENERATION_ROOT);
  const catalogAfter = readCatalog(productKey);
  const approvedAfter = (catalogAfter?.images ?? [])
    .filter((item) => item.status === "USER_APPROVED")
    .map((item) => ({ id: item.id, role: item.visualRole, status: item.status }));
  const after = {
    generationId: record.id,
    status: record.status,
    durationMs: Date.now() - started,
    headline: model?.copy.headline.text ?? record.copy?.headline ?? null,
    subheadline: model?.copy.subheadline?.text ?? null,
    producer: record.copy?.producer ?? null,
    aiUsed: record.copy?.aiUsed ?? false,
    ai: record.ai ?? null,
    research: record.research ?? null,
    gateLabels: record.gateLabels ?? null,
    hopCtas: model?.copy.cta.action ?? null,
    realImagesUsed: record.assets.approvedUsed.length,
    approvedImagesBefore: approvedBefore.length,
    approvedImagesAfter: approvedAfter.length,
    approvedIdsUnchanged: JSON.stringify(approvedBefore.map((item) => item.id)) === JSON.stringify(approvedAfter.map((item) => item.id)),
    limitations: record.limitations,
    errors: record.errors,
    previewPath: record.previewPath,
  };
  writeFileSync(path.join(EVIDENCE, "femicore-generation.json"), `${JSON.stringify(after, null, 2)}\n`);
  writeFileSync(
    path.join(EVIDENCE, "approved-assets-after.json"),
    `${JSON.stringify({ productKey, approvedCount: approvedAfter.length, approved: approvedAfter }, null, 2)}\n`,
  );

  const report = {
    EXECUTION_53B_STATUS: "IMPLEMENTED_BLOCKED_PAID_CALLS",
    OPENAI_KEY_DETECTED: env.OPENAI_API_KEY === "present",
    OPENAI_PROVIDER_IMPLEMENTED: diagnosis.provider === "openai",
    MODEL_SELECTED: diagnosis.model,
    ANTHROPIC_FALLBACK_STATUS: env.ANTHROPIC_API_KEY === "present" ? "AVAILABLE_AS_ALTERNATIVE" : "NOT_CONFIGURED",
    CONTENT_QUALITY_GATE_RESULTS: record.gateLabels ?? null,
    REAL_AI_EXECUTION_STATUS: record.ai?.status ?? diagnosis.status,
    ESTIMATED_COST_PER_GENERATION: estimateOpenAiCostUsd(2500, 800),
    DISK_FREE_GB: free,
    PAID_CALLS_MADE: false,
  };
  writeFileSync(path.join(EVIDENCE, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...report, generationId: record.id, headline: after.headline, realImagesUsed: after.realImagesUsed }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
