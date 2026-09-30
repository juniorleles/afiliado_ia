import { readFileSync } from "node:fs";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";

function probe(label: string, facts: ProductFacts) {
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  console.log("==== " + label + " slots=" + slotPlan.slots.length);
  let multi = 0;
  for (const slot of slotPlan.slots) {
    for (const item of slot.evidence) {
      const ids = slot.allowedClaimIds.filter((id) => id.startsWith(item.id + ":"));
      if (ids.length <= 1) continue;
      multi += 1;
      console.log(`${slot.slotId} ${item.id} claims=${ids.join(",")}`);
      console.log(`    evidence :: ${item.value}`);
      for (const id of ids) {
        const claim = projection.authorized.find((row) => row.claimId === id);
        console.log(`    ${id} [${claim?.claimClass}] :: ${claim?.generationText}`);
      }
      console.log(
        "    current :: " +
          propositionsForSlot(slot)
            .filter((row) => row.evidenceId === item.id)
            .map((row) => `${row.propositionId} :: ${row.sourceText}`)
            .join(" | "),
      );
    }
  }
  console.log(`MULTI_CLAIM_EVIDENCE_ITEMS=${multi}`);
}

probe(
  "JOINT_GENESIS",
  applyGenericFaqRecovery(
    JSON.parse(readFileSync("data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json", "utf8")) as ProductFacts,
  ),
);
probe(
  "PRODENTIM",
  (JSON.parse(readFileSync("data/generic-lp-engine/v1/prodentim-replay-02/product-facts.json", "utf8")) as { facts: ProductFacts }).facts,
);
