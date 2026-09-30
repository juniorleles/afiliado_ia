/** Read-only probe: operational fact counts from raw facts to the model prompt. No model call. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, copyEligibleOperationalItems, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { authorizedPropositionGroups } from "../src/lib/ai/authorized-propositions.ts";
import { buildPrompt } from "../src/lib/ai/generate-variants.ts";

const file = process.argv.find((item) => item.startsWith("--facts="))?.slice("--facts=".length);
if (!file) throw new Error("usage: --facts=<fresh-product-facts.json>");
const facts = (JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as { facts: ProductFacts }).facts;
const recovered = applyGenericFaqRecovery(facts);
const plan = createGenerationPlan(recovered);
const manifest = buildGenerationFactManifest(recovered);
const projection = projectEvidenceClaims(recovered, plan, manifest);
const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
const groups = authorizedPropositionGroups(slotPlan.slots);
const prompt = buildPrompt({ productName: recovered.productName, sourceUrl: recovered.sourceUrl, facts: recovered, targetApproach: "REVIEW" });
const promptLines = prompt.user.split("\n").filter((line) => line.startsWith("PROPOSITION "));

const dupes = (values: string[]) => values.length - new Set(values).size;
console.log(`ROUTE=${plan.generationRoute}`);
for (const [label, field, raw] of [
  ["RETURNS", "returnsInformation", recovered.returnsInformation ?? []],
  ["SHIPPING", "shippingInformation", recovered.shippingInformation ?? []],
] as const) {
  const statements = raw.map((item) => item.statement);
  const authorized = copyEligibleOperationalItems(recovered).filter((item) => item.field === field);
  const manifestItems = manifest.items.filter((item) => item.field === field && item.copyEligible);
  const claims = projection.authorized.filter((claim) => claim.field === field);
  const slotEvidence = slotPlan.slots.flatMap((slot) => slot.evidence.filter((item) => item.field === field).map((item) => ({ slot: slot.slotId, ...item })));
  const propositions = groups.flatMap((group) => group.propositions.filter((item) => item.field === field).map((item) => ({ slot: group.slotId, ...item })));
  const inPrompt = promptLines.filter((line) => line.includes(` field=${field} `));
  const promptTexts = inPrompt.map((line) => line.split(" :: ").slice(1).join(" :: "));
  console.log(
    `${label} RAW=${statements.length} UNIQUE_SOURCE=${new Set(statements).size} AUTHORIZED=${authorized.length} AUTHORIZED_DUP_TEXT=${dupes(authorized.map((i) => i.statement))}` +
      ` MANIFEST=${manifestItems.length} PROJECTED_CLAIMS=${claims.length} SLOT_EVIDENCE=${slotEvidence.length} SLOT_EVIDENCE_DUP_IDS=${dupes(slotEvidence.map((i) => i.id))} SLOT_EVIDENCE_DUP_TEXT=${dupes(slotEvidence.map((i) => i.value))}` +
      ` PROPOSITIONS=${propositions.length} PROPOSITION_DUP_IDS=${dupes(propositions.map((i) => i.propositionId))} PROPOSITION_DUP_TEXT=${dupes(propositions.map((i) => i.sourceText))}` +
      ` PROMPT_PROPOSITIONS=${inPrompt.length} PROMPT_DUP_TEXT=${dupes(promptTexts)}`,
  );
  console.log(`  SLOTS=${[...new Set(slotEvidence.map((i) => i.slot))].join(",")} EVIDENCE_IDS=${slotEvidence.map((i) => i.id).join(",")}`);
  const omitted = authorized.filter((item) => !slotEvidence.some((e) => e.value === item.statement));
  for (const item of omitted) console.log(`  AUTHORIZED_NOT_IN_SLOTS: ${item.statement.slice(0, 110)}`);
}
const manifestDupes = manifest.items.filter((item, index) => manifest.items.findIndex((other) => other.field === item.field && other.value === item.value) !== index);
console.log(`MANIFEST_DUP_ITEMS=${manifestDupes.length} PROMPT_PROPOSITIONS_TOTAL=${promptLines.length} PROMPT_PROPOSITION_DUP_TEXT_TOTAL=${dupes(promptLines.map((l) => l.split(" :: ").slice(1).join(" :: ")))}`);
