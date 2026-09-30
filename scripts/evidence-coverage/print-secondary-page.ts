/**
 * Prints the captured block dump of one secondary page. Read-only audit helper.
 *
 * npx tsx scripts/evidence-coverage/print-secondary-page.ts --match=refunds [--field=paragraphs]
 */
import { readFileSync } from "node:fs";

const arg = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const file =
  arg("file") ?? "data/generic-lp-engine/v1/prodentim-evidence-coverage-v1/source/secondary-sources.json";
const match = arg("match") ?? "";
const dump = JSON.parse(readFileSync(file, "utf8")) as { pages: Array<Record<string, unknown>> };

for (const page of dump.pages) {
  const url = String(page.url);
  if (match && !url.includes(match)) continue;
  console.log(`=== ${url} ===`);
  for (const key of ["headings", "paragraphs", "tableCells"] as const) {
    const values = (page[key] as string[] | undefined) ?? [];
    values.forEach((value, index) => console.log(`${key[0].toUpperCase()}${index}`, JSON.stringify(value)));
  }
}
