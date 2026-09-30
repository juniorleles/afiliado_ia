/** Read-only probe: why is "X contains <listed ingredient>" accepted, and where does it stop? */
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";

function facts(): ProductFacts {
  const base = emptyProductFacts("Zephyra", "https://seller.example/offer", "IMPORTED");
  return {
    ...base,
    description: "Zephyra is a daily lozenge described for routine oral care.",
    ingredientsOrComponents: ["Zephyrium Complex", "Calmora Root"],
    manufacturer: "Orvexa Labs",
    confidence: {
      ...base.confidence,
      productName: "DIRECT_SOURCE",
      description: "DIRECT_SOURCE",
      ingredientsOrComponents: "DIRECT_SOURCE",
      manufacturer: "DIRECT_SOURCE",
    },
    importQuality: "SUFFICIENT",
  };
}

const cases = [
  "Zephyrium Complex",
  "Zephyra contains Zephyrium Complex.",
  "Zephyra contains Gammaflor.",
  "Zephyra contains Orvexa Labs.",
  "Zephyrium Complex is described.",
  "Zephyrium Complex is the main ingredient.",
  "Zephyrium Complex supports fresh breath.",
];

for (const copy of cases) {
  const result = validateGrounding(copy, facts());
  const reasons = result.unsupportedClaims.map((item) => `${item.claim} :: ${item.reason}`);
  console.log(`${result.status.padEnd(11)} ${JSON.stringify(copy)}${reasons.length ? "\n   " + reasons.join("\n   ") : ""}`);
}
