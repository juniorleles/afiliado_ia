/** Read-only probe for the coverage fixtures. */
import { extractProductFacts } from "../../src/lib/import-product.ts";
import { classifySourceUnits } from "../../src/lib/evidence-coverage.ts";

const facts = extractProductFacts(
  `<html><head></head><body><h1>Lumora Field Kit</h1><h2>Ingredients</h2><ul><li>Beeswax</li><li>Linseed oil</li><li>Pine resin</li></ul></body></html>`,
);
console.log("INGREDIENTS", JSON.stringify(facts.ingredientsOrComponents), facts.confidence.ingredientsOrComponents);
console.log("NAME", JSON.stringify(facts.productName), facts.confidence.productName);
for (const unit of classifySourceUnits(
  [
    { id: "A", text: "Beeswax", location: "primary#li", type: "LIST_ITEM", fetchedByImporter: true },
    { id: "B", text: "Pine resin hardens the finish", location: "primary#li", type: "LIST_ITEM", fetchedByImporter: true },
    { id: "C", text: "Lumora Field Kit is a canvas roll designed for field repairs.", location: "primary#p", type: "PARAGRAPH", fetchedByImporter: true },
  ],
  facts,
)) {
  console.log(`${unit.id} status=${unit.status} topic=${unit.topic} map=${unit.mapping ?? "-"} cand=${unit.productFactCandidate} :: ${unit.text}`);
}
