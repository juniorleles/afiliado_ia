// npx tsx scripts/run-lp-generator-53a.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { diagnoseAiProvider } from "../src/lib/lp-generator/ai-copy/provider.ts";
import { runGeneration } from "../src/lib/lp-generator/run.ts";
import { DEFAULT_GENERATION_ROOT, readGenerationModel } from "../src/lib/lp-generator/store.ts";

const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-53a-ai-commercial-intelligence");

function envKeyNamed(name: string): boolean {
  if (process.env[name]?.trim()) return true;
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return false;
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .some((line) => line.startsWith(`${name}=`) && line.slice(name.length + 1).trim().length > 0);
}

async function main() {
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }
  mkdirSync(EVIDENCE, { recursive: true });
  const env = {
    ANTHROPIC_API_KEY: envKeyNamed("ANTHROPIC_API_KEY") ? "present" : "absent",
    OPENAI_API_KEY: envKeyNamed("OPENAI_API_KEY") ? "present" : "absent",
    AIA_ALLOW_PAID_AI: process.env.AIA_ALLOW_PAID_AI === "1" ? "1" : "0",
  };
  const diagnosis = diagnoseAiProvider({
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY === "present" ? "1" : "",
    OPENAI_API_KEY: env.OPENAI_API_KEY === "present" ? "1" : "",
    AIA_ALLOW_PAID_AI: env.AIA_ALLOW_PAID_AI,
  });
  writeFileSync(path.join(EVIDENCE, "provider-diagnosis.json"), `${JSON.stringify({ env, diagnosis }, null, 2)}\n`);

  const previousPath = path.join(process.cwd(), "data", "evidence", "execution-53-universal-lp-generator", "femicore-generation.json");
  const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, "utf8")) : null;

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
    { storeRoot: DEFAULT_GENERATION_ROOT, force: true },
  );
  const model = readGenerationModel(record.id, DEFAULT_GENERATION_ROOT);
  const after = {
    generationId: record.id,
    status: record.status,
    durationMs: Date.now() - started,
    headline: model?.copy.headline.text ?? record.copy?.headline ?? null,
    subheadline: model?.copy.subheadline?.text ?? null,
    introduction: model?.copy.introduction.text ?? null,
    producer: record.copy?.producer ?? null,
    ai: record.ai ?? null,
    research: record.research ?? null,
    gateLabels: record.gateLabels ?? null,
    realImagesUsed: record.assets.approvedUsed.length,
    sections: model?.blueprint.sections.filter((item) => item.renderEligibility === "ELIGIBLE").map((item) => item.sectionType) ?? [],
    features: model?.contract.features?.map((item) => item.text) ?? [],
    components: model?.contract.components?.map((item) => item.name) ?? [],
    specs: model?.contract.specifications ?? [],
    limitations: record.limitations,
    errors: record.errors,
    previewPath: record.previewPath,
  };
  writeFileSync(path.join(EVIDENCE, "femicore-generation.json"), `${JSON.stringify(after, null, 2)}\n`);
  writeFileSync(
    path.join(EVIDENCE, "copy-before-after.json"),
    `${JSON.stringify(
      {
        before: previous
          ? { headline: previous.headline, hopSlot: previous.hopSlot, sections: previous.sections, realImagesUsed: previous.realImagesUsed }
          : null,
        after: { headline: after.headline, subheadline: after.subheadline, introduction: after.introduction, sections: after.sections, realImagesUsed: after.realImagesUsed },
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ ok: true, diagnosis: diagnosis.status, ...after }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
