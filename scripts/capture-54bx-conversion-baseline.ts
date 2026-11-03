/**
 * One-shot visitor captures for 54BX conversion-opt before/after.
 * Usage: npx tsx scripts/capture-54bx-conversion-baseline.ts [before|after]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureVisitorVisuals, visitorCapturePreviewPath } from "../src/lib/presell-quality/visitor-capture.ts";

const PHASE = (process.argv[2] === "after" ? "after" : "before") as "before" | "after";
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const OUT = path.join(
  process.cwd(),
  "data",
  "evidence",
  PHASE === "before" ? "execution-54bx-conversion-opt-baseline" : "execution-54bx-conversion-opt-after",
);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = await captureVisitorVisuals({
    campaignId: 237,
    generationId: GENERATION_ID,
    outDir: OUT,
    candidate: "54BX",
    naming: "visitor",
    manifestName: `visitor-capture-${PHASE}.json`,
  });
  writeFileSync(
    path.join(OUT, `capture-summary-${PHASE}.json`),
    `${JSON.stringify(
      {
        phase: PHASE,
        previewPath: visitorCapturePreviewPath(GENERATION_ID, "54BX"),
        shots: manifest.shots?.length ?? null,
        inspect: manifest.inspect,
        defects: manifest.defects,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ phase: PHASE, out: OUT, defects: manifest.defects }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
