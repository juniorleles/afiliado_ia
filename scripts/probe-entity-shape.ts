/** Read-only probe: which projected FAQ evidence is a bare entity label? */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { deterministicFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

function load(file: string): ProductFacts {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as ProductFacts | { facts: ProductFacts };
  return "facts" in raw ? raw.facts : raw;
}

const sources = [
  ["JOINT_GENESIS", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"],
  ["PRODENTIM", "data/generic-lp-engine/v1/prodentim-replay-03/product-facts.json"],
] as const;

for (const [label, file] of sources) {
  const facts = load(file);
  console.log(`\n=== ${label}`);
  const plan = createEvidenceSlotPlan(facts);
  for (const slot of plan.slots.filter((item) => item.type === "FAQ")) {
    console.log(
      `${slot.slotId} topic=${slot.topic} authority=${slot.semanticAuthority} maxWords=${slot.maxWords} question=${JSON.stringify(deterministicFaqQuestion(slot, facts.productName))}`,
    );
    for (const proposition of propositionsForSlot(slot)) {
      console.log(`  ${proposition.propositionId} :: ${JSON.stringify(proposition.sourceText)}`);
    }
  }
  console.log(`ingredients: ${JSON.stringify(facts.ingredientsOrComponents)}`);
}
