/**
 * Lists every image the source page references, with its deterministic score.
 * Read-only: no download, no classification call.
 *
 * npx tsx scripts/visual-qa/list-discovered-assets.ts --dir=<replay dir>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { discoverSourceAssets } from "../../src/lib/assets/discover.ts";

const dir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
if (!dir) throw new Error("--dir is required");
const source = JSON.parse(readFileSync(path.join(dir, "source-resolution.json"), "utf8")) as { finalUrl: string; originalOperatorUrl: string };
const pageUrl = source.finalUrl || source.originalOperatorUrl;
async function main() {
  const html = await (await fetch(pageUrl, { headers: { "user-agent": "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)" } })).text();
  for (const candidate of discoverSourceAssets(html, pageUrl).sort((a, b) => b.packshotScore - a.packshotScore)) {
    console.log(`${String(candidate.packshotScore).padStart(4)} ${candidate.rejected ? "REJ" : "   "} ${candidate.source.padEnd(7)} ${candidate.url.split("/").pop()}`);
  }
}
void main();
