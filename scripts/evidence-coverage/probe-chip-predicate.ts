/**
 * Read-only probe of the attribute-chip classifier against candidate labels.
 *
 * npx tsx scripts/evidence-coverage/probe-chip-predicate.ts
 */
import { isProductAttributeChip, isFeatureStatement } from "../../src/lib/import-heuristics.ts";

const samples = [
  "Natural Formula",
  "Easy To Use",
  "Non-GMO",
  "No Stimulants",
  "Non-Habit Forming",
  "Gluten Free",
  "Verified Purchase",
  "Most popular",
  "BEST VALUE!",
  "2 BOTTLES",
  "TOTAL: $ $",
  "· Day Supply ·",
  "Basic",
  "*FREE Shipping",
  "Home",
  "Ingredients",
  "FAQ",
  "Lactobacillus Paracasei",
  "Supports the health of your gums",
];

for (const sample of samples) {
  console.log(
    `${isProductAttributeChip(sample) ? "CHIP " : "-    "}${isFeatureStatement(sample) ? "FEATURE " : "-       "} ${JSON.stringify(sample)}`,
  );
}
