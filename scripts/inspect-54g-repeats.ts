// npx tsx scripts/inspect-54g-repeats.ts
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";

const model = readGenerationModel("lp-mvky9o48-93f564b4");
if (!model) throw new Error("missing bofu model");
const texts = [
  model.copy.headline.text,
  model.copy.subheadline?.text,
  model.copy.introduction.text,
  ...model.copy.sections.flatMap((section) => [section.headline.text, ...section.body.map((item) => item.text), ...section.items.map((item) => item.text.text)]),
  ...model.copy.faq.flatMap((item) => [item.question.text, item.answer.text]),
].filter((item): item is string => Boolean(item)).map((item) => item.replace(/\s+/g, " ").trim());
const counts = new Map<string, number>();
for (const text of texts) {
  if (text.length <= 16) continue;
  counts.set(text, (counts.get(text) ?? 0) + 1);
}
const repeats = [...counts.entries()].filter(([, count]) => count > 1);
const out = { repeats, longCount: [...counts.keys()].length, extraRepeats: repeats.reduce((sum, [, count]) => sum + count - 1, 0) };
const dir = path.join(process.cwd(), "data", "evidence", "execution-54g-product-readiness");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "repetition-keys.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
