/**
 * Local pixel inspection of discovered source assets. No paid vision API:
 * every number here comes from decoding the PNG bytes on this machine.
 *
 * npx tsx scripts/visual-qa/inspect-source-packshot.ts --dir=<replay dir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../src/lib/visual-concept/compose.ts";

const dir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
if (!dir) throw new Error("--dir is required");
const outDir = path.join(dir, "visual-construction-v1");
const inventory = JSON.parse(readFileSync(path.join(outDir, "asset-inventory.json"), "utf8")) as {
  candidates: Array<{ candidateId: string; localPath: string; rejected: boolean; sourceUrl: string; mimeType: string }>;
};

/** Broad skin-tone envelope in RGB. Deliberately permissive: it is a presence probe, not a detector. */
function skinLike(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && g > b;
}

const rows = [];
for (const candidate of inventory.candidates) {
  if (candidate.rejected || candidate.mimeType !== "image/png") continue;
  const image = decodePng(readFileSync(candidate.localPath));
  const total = image.width * image.height;
  let transparent = 0;
  let opaque = 0;
  let skin = 0;
  let darkInk = 0;
  let minX = image.width;
  let maxX = -1;
  let minY = image.height;
  let maxY = -1;
  /** Column occupancy of the opaque subject, used to count separated subject masses. */
  const columnOpaque = new Array<number>(image.width).fill(0);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const a = image.rgba[i + 3];
      if (a < 16) {
        transparent += 1;
        continue;
      }
      opaque += 1;
      columnOpaque[x] += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const r = image.rgba[i];
      const g = image.rgba[i + 1];
      const b = image.rgba[i + 2];
      if (skinLike(r, g, b)) skin += 1;
      if (r < 110 && g < 110 && b < 110) darkInk += 1;
    }
  }
  const bboxArea = maxX < 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
  /** Vertical masses separated by a gap of empty columns. Bottles standing side by side read as one mass when they overlap. */
  const threshold = image.height * 0.05;
  let masses = 0;
  let inMass = false;
  for (const count of columnOpaque) {
    if (count > threshold && !inMass) {
      masses += 1;
      inMass = true;
    } else if (count <= threshold) {
      inMass = false;
    }
  }
  rows.push({
    candidateId: candidate.candidateId,
    sourceUrl: candidate.sourceUrl,
    width: image.width,
    height: image.height,
    transparentRatio: Number((transparent / total).toFixed(4)),
    opaqueRatio: Number((opaque / total).toFixed(4)),
    subjectBboxCoverage: Number((bboxArea / total).toFixed(4)),
    subjectFillOfBbox: bboxArea === 0 ? 0 : Number((opaque / bboxArea).toFixed(4)),
    skinToneRatioOfSubject: opaque === 0 ? 0 : Number((skin / opaque).toFixed(4)),
    darkInkRatioOfSubject: opaque === 0 ? 0 : Number((darkInk / opaque).toFixed(4)),
    separatedColumnMasses: masses,
  });
  console.log(
    `${candidate.candidateId} ${image.width}x${image.height} transparent=${(transparent / total).toFixed(3)} bbox=${(bboxArea / total).toFixed(3)} fill=${(opaque / Math.max(bboxArea, 1)).toFixed(3)} skin=${(skin / Math.max(opaque, 1)).toFixed(4)} ink=${(darkInk / Math.max(opaque, 1)).toFixed(3)} masses=${masses}`,
  );
}

writeFileSync(path.join(outDir, "packshot-metrics.json"), `${JSON.stringify({ metricsVersion: "packshot-metrics-v1", paidVisionCalls: 0, rows }, null, 2)}\n`, "utf8");
