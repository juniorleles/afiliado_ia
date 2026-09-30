/**
 * Prints the raw HTML window around a needle, for structural inspection during the audit.
 *
 * npx tsx scripts/evidence-coverage/peek-source-html.ts --file=<html> --needle=<text> [--before=1200] [--after=1200] [--nth=1]
 */
import { readFileSync } from "node:fs";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const file = arg("file") ?? "data/generic-lp-engine/v1/prodentim-evidence-coverage-v1/source/source-raw.html";
const needle = arg("needle");
const before = Number(arg("before") ?? 1200);
const after = Number(arg("after") ?? 1200);
const nth = Number(arg("nth") ?? 1);
if (!needle) throw new Error("--needle is required");

const html = readFileSync(file, "utf8");
let index = -1;
for (let i = 0; i < nth; i += 1) index = html.indexOf(needle, index + 1);
if (index < 0) {
  console.log("NOT_FOUND");
  process.exit(0);
}
console.log(html.slice(Math.max(0, index - before), index + after).replace(/\s+/g, " "));
