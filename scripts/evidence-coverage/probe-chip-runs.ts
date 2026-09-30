/**
 * Mirrors the attribute-chip run scan over a saved source file and prints why runs break.
 *
 * npx tsx scripts/evidence-coverage/probe-chip-runs.ts [--file=<html>]
 */
import { readFileSync } from "node:fs";
import { isProductAttributeChip } from "../../src/lib/import-heuristics.ts";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const file = arg("file") ?? "data/generic-lp-engine/v1/prodentim-evidence-coverage-v1/source/source-raw.html";

const decode = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clean = (html: string) => decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();

const cleaned = readFileSync(file, "utf8")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
  .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
  .replace(/<header[\s\S]*?<\/header>/gi, " ");

const CHIP_TAG = /<(p|span|h4|h5|h6|li|div)[^>]*>([^<]{1,80})<\/\1>/gi;
let cursor = -1;
let run: string[] = [];
for (const match of cleaned.matchAll(CHIP_TAG)) {
  const text = clean(match[2]);
  const start = match.index ?? 0;
  const between = cursor >= 0 ? clean(cleaned.slice(cursor, start)) : "";
  if (!text) continue;
  if (!/gmo|gluten|stimulant|habit|formula|easy to use/i.test(text) && run.length === 0) {
    cursor = start + match[0].length;
    continue;
  }
  console.log(
    `${isProductAttributeChip(text) ? "CHIP" : "SKIP"} between=${JSON.stringify(between.slice(0, 60))} text=${JSON.stringify(text)}`,
  );
  if (isProductAttributeChip(text)) run.push(text);
  else run = [];
  cursor = start + match[0].length;
}
console.log("RUN", JSON.stringify(run));
