/** Read-only probe: how single statements classify in the coverage layer. */
import { readFileSync } from "node:fs";
import { extractProductFacts } from "../../src/lib/import-product.ts";
import { classifySourceUnits, type SourceUnitInput } from "../../src/lib/evidence-coverage.ts";

const html = readFileSync("data/generic-lp-engine/v1/prodentim-evidence-coverage-v1/source/source-raw.html", "utf8");
const facts = extractProductFacts(html, "https://example.com/", { operatorProductName: "ProDentim" });
console.log("FEATURES", JSON.stringify(facts.features), facts.confidence.features);

const samples: Array<[string, SourceUnitInput["type"]]> = [
  ["Natural Formula", "CHIP"],
  ["Non-GMO", "CHIP"],
  ["Easy To Use", "CHIP"],
  ["3.5 billions of probiotics , along with 3 unique ingredients that are clinically proven to support the health of your teeth and gums", "PARAGRAPH"],
  ["Malic acid in strawberries helps maintain tooth whiteness", "LIST_ITEM"],
  ["Supports the health of your gums", "LIST_ITEM"],
  ["Please keep in mind that we do not support the return shipping costs.", "PARAGRAPH"],
  ["According to most of our customers, domestic packages arrive within 5-7 working days after being ordered.", "PARAGRAPH"],
  ["“My gums have never looked better. It feels so good to not have to worry about my teeth. I simply love it!”", "PARAGRAPH"],
  ["9. Role of L. reuteri in Human Health and Diseases", "PARAGRAPH"],
  ["285 Northeast Ave, Tallmadge, OH 44278, United States", "PARAGRAPH"],
  ["That’s why we created", "PARAGRAPH"],
  ["We recommend you let one soft tablet melt into your mouth every morning for a powerful, deep toxin cleanse", "PARAGRAPH"],
];

const units = classifySourceUnits(
  samples.map(([text, type], index) => ({ id: `P${index}`, text, location: "probe", type })),
  facts,
);
for (const unit of units) {
  console.log(
    `${unit.id} cand=${unit.productFactCandidate ? "Y" : "N"} status=${unit.status} topic=${unit.topic} map=${unit.mapping ?? "-"} flags=[${unit.safetyFindings.join(",")}] :: ${unit.text.slice(0, 70)}`,
  );
}
