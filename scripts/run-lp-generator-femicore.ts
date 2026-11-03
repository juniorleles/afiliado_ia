// npx tsx scripts/run-lp-generator-femicore.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { diskFreeGb, DISK_STOP_GB } from "../src/lib/quality-gate/disk.ts";
import { runGeneration } from "../src/lib/lp-generator/run.ts";
import { DEFAULT_GENERATION_ROOT, readGenerationModel } from "../src/lib/lp-generator/store.ts";

const EVIDENCE = path.join(process.cwd(), "data", "evidence", "execution-53-universal-lp-generator");

async function main() {
  const free = diskFreeGb();
  if (Number.isFinite(free) && free < DISK_STOP_GB) {
    throw new Error(`C: has ${free} GB free; stop below ${DISK_STOP_GB} GB`);
  }
  mkdirSync(EVIDENCE, { recursive: true });
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
    { storeRoot: DEFAULT_GENERATION_ROOT },
  );
  const model = readGenerationModel(record.id, DEFAULT_GENERATION_ROOT);
  const payload = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    diskFreeGb: free,
    generationId: record.id,
    status: record.status,
    previewPath: record.previewPath,
    reusedFrom: record.reusedFrom,
    hopStored: record.input.hopLink ?? null,
    copyProducer: record.copy?.producer ?? null,
    aiUsed: false,
    aiConfigured: false,
    realImagesUsed: record.assets.approvedUsed.length,
    approvedAvailable: record.assets.approvedAvailable,
    pendingImages: record.assets.pendingCount,
    sections: model?.blueprint.sections.filter((item) => item.renderEligibility === "ELIGIBLE").map((item) => item.sectionType) ?? [],
    strategy: record.strategy ?? null,
    gateLabels: record.gateLabels ?? null,
    gates: record.gates ?? null,
    limitations: record.limitations,
    errors: record.errors,
    sources: record.sources,
    headline: model?.copy.headline.text ?? null,
    hopSlot: model?.hopSlot ?? null,
  };
  writeFileSync(path.join(EVIDENCE, "femicore-generation.json"), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(path.join(EVIDENCE, "generation-record.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
