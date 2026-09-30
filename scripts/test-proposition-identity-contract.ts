/**
 * Canonical proposition identity contract. Fictional products only.
 * A proposition is the citable unit of one evidence item; claim ids are scope,
 * not citations; unknown and cross-slot ids stay blocking.
 */
import { readFileSync } from "node:fs";
import {
  authorizedPropositionGroups,
  formatAuthorizedPropositionsForPrompt,
  propositionsForSlot,
  validatePropositionBindings,
} from "../src/lib/ai/authorized-propositions.ts";
import { createEvidenceSlotPlan, formatEvidenceSlotPlanForPrompt, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { buildGenerationFactManifest, emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";

let failed = 0;
function assert(condition: unknown, message: string) {
  if (!condition) {
    failed += 1;
    console.error("FAIL: " + message);
  } else {
    console.log("OK: " + message);
  }
}

type Fixture = { productName: string; usage?: string[]; ingredients?: string[]; guarantee?: string; features?: string[] };

function facts(fixture: Fixture): ProductFacts {
  const base = emptyProductFacts(fixture.productName, "https://seller.example/offer", "IMPORTED");
  return {
    ...base,
    usageInformation: fixture.usage ?? [],
    ingredientsOrComponents: fixture.ingredients ?? [],
    features: fixture.features ?? [],
    guaranteeInformation: fixture.guarantee,
    confidence: {
      ...base.confidence,
      productName: "DIRECT_SOURCE",
      usageInformation: fixture.usage?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      ingredientsOrComponents: fixture.ingredients?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      features: fixture.features?.length ? "DIRECT_SOURCE" : "NOT_FOUND",
      guaranteeInformation: fixture.guarantee ? "DIRECT_SOURCE" : "NOT_FOUND",
    },
    importQuality: "SUFFICIENT",
  };
}

function planOf(fixture: Fixture) {
  const productFacts = facts(fixture);
  const plan = createGenerationPlan(productFacts);
  const manifest = buildGenerationFactManifest(productFacts);
  const projection = projectEvidenceClaims(productFacts, plan, manifest);
  return { productFacts, plan, projection, slotPlan: createEvidenceSlotPlan(productFacts, plan, manifest, projection) };
}

// CASE A — one evidence item, one authorized claim => one proposition.
const caseA = planOf({ productName: "AlphaNova", ingredients: ["Peppermint"] });
const ingredientSlot = caseA.slotPlan.slots.find((slot) => slot.type === "INGREDIENTS") as EvidenceSlot;
const caseAProps = propositionsForSlot(ingredientSlot);
assert(caseAProps.length === 1, "a single-claim evidence item yields exactly one proposition");
assert(caseAProps[0]?.propositionId.endsWith(":P1"), "its id is the canonical first proposition of its claim");

// CASE B — one evidence item, several authorized claims.
const caseB = planOf({ productName: "AlphaNova", usage: ["Chew a lozenge every evening."], guarantee: "The seller publishes a 90-day return policy measured from the order date." });
const guaranteeSlot = caseB.slotPlan.slots.find((slot) => slot.type === "GUARANTEE") as EvidenceSlot;
const guaranteeEvidenceId = guaranteeSlot.evidence[0]?.id as string;
const guaranteeClaimIds = guaranteeSlot.allowedClaimIds.filter((id) => id.startsWith(`${guaranteeEvidenceId}:`));
const guaranteeProps = propositionsForSlot(guaranteeSlot);
assert(guaranteeClaimIds.length > 1, "the fixture really produces several authorized claims for one evidence item");
assert(
  guaranteeProps.every((item) => item.propositionId.startsWith(`${guaranteeClaimIds.slice().sort()[0]}:`)),
  "propositions anchor to the lowest authorized claim id of the item",
);
const guaranteeText = guaranteeProps.map((item) => item.sourceText).join(" ");
assert(
  guaranteeClaimIds.every((id) => {
    const claim = caseB.projection.authorized.find((row) => row.claimId === id);
    const words = (claim?.generationText ?? "").split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
    return words.every((word) => guaranteeText.toLowerCase().includes(word.toLowerCase()));
  }),
  "every authorized claim of the item is covered by the proposition text (no content is lost)",
);
assert(
  !guaranteeProps.some((item) => guaranteeClaimIds.slice(1).some((id) => item.propositionId.startsWith(`${id}:`))),
  "a non-anchor claim id produces no citable proposition",
);

// CASE C — only one claim id authorized for the slot.
const restricted: EvidenceSlot = { ...guaranteeSlot, allowedClaimIds: [guaranteeClaimIds[0] as string] };
assert(
  propositionsForSlot(restricted).every((item) => item.propositionId.startsWith(`${guaranteeClaimIds[0]}:`)),
  "only the authorized claim id is exposed",
);

// CASE D — claim without copy-eligible evidence yields no proposition.
const ineligible = facts({ productName: "AlphaNova", ingredients: ["Peppermint"] });
ineligible.confidence.ingredientsOrComponents = "HEURISTIC_EXTRACTION";
const caseD = createEvidenceSlotPlan(ineligible);
assert(
  caseD.slots.every((slot) => slot.evidence.every((item) => item.field !== "ingredientsOrComponents")),
  "evidence that is not copy-eligible never reaches a slot",
);
assert(
  caseD.slots.flatMap((slot) => propositionsForSlot(slot)).every((item) => item.field !== "ingredientsOrComponents"),
  "no proposition is created for non-copy-eligible evidence",
);

// CASE E — unknown proposition id blocks.
const bindingArgs = (slot: EvidenceSlot, propositionIds: string[], wording: string) => ({
  fill: { slotId: slot.slotId, propositions: [{ propositionIds, wording }] },
  slot,
  slots: caseB.slotPlan.slots,
  plan: caseB.plan,
  productName: caseB.productFacts.productName,
});
const phantom = `${guaranteeClaimIds[1] ?? `${guaranteeEvidenceId}:C999`}:P1`;
const unknown = validatePropositionBindings(bindingArgs(guaranteeSlot, [phantom], "The seller publishes a 90-day return policy."));
assert(
  unknown.some((item) => item.reason === "UNKNOWN_PROPOSITION_ID"),
  "an id built from a non-anchor claim id is UNKNOWN and blocks",
);

// CASE F — a valid proposition id from another slot blocks.
const usageSlot = caseB.slotPlan.slots.find((slot) => slot.type === "USAGE") as EvidenceSlot;
const usageProposition = propositionsForSlot(usageSlot)[0]?.propositionId as string;
const crossSlot = validatePropositionBindings(bindingArgs(guaranteeSlot, [usageProposition], "Chew a lozenge every evening."));
assert(
  crossSlot.some((item) => item.reason === "CROSS_SLOT_PROPOSITION"),
  "a proposition owned by another slot blocks",
);

// CASE G — serialization round trip keeps ids identical.
const before = authorizedPropositionGroups(caseB.slotPlan.slots).map((group) => group.propositions.map((item) => item.propositionId));
const reloaded = JSON.parse(JSON.stringify(caseB.slotPlan)) as typeof caseB.slotPlan;
const after = authorizedPropositionGroups(reloaded.slots).map((group) => group.propositions.map((item) => item.propositionId));
assert(JSON.stringify(before) === JSON.stringify(after), "proposition ids survive serialization unchanged");

// CASE H — claim ordering is not the identity.
const reordered: EvidenceSlot = { ...guaranteeSlot, allowedClaimIds: [...guaranteeSlot.allowedClaimIds].reverse() };
assert(
  JSON.stringify(propositionsForSlot(reordered).map((item) => item.propositionId)) ===
    JSON.stringify(guaranteeProps.map((item) => item.propositionId)),
  "reversing allowedClaimIds does not change proposition ids",
);

// The prompt may not advertise an identifier the model cannot cite.
const slotPrompt = formatEvidenceSlotPlanForPrompt(caseB.slotPlan);
const propositionPrompt = formatAuthorizedPropositionsForPrompt(caseB.slotPlan.slots);
const citableIds = new Set(caseB.slotPlan.slots.flatMap((slot) => propositionsForSlot(slot).map((item) => item.propositionId)));
assert(/citable=/.test(slotPrompt), "each slot line states its citable proposition ids");
assert(
  caseB.slotPlan.slots.every((slot) => {
    const line = slotPrompt.split("\n").find((row) => row.startsWith(`SLOT ${slot.slotId} `)) ?? "";
    const listed = (line.match(/citable=([^\s]+)/)?.[1] ?? "").split(",").filter((id) => id !== "none");
    return listed.every((id) => citableIds.has(id));
  }),
  "every advertised citable id exists in the authorized set",
);
assert(/not citable/i.test(slotPrompt) && /no citable proposition/i.test(propositionPrompt), "the prompt states that claim ids are not citable");

const source = readFileSync("src/lib/ai/authorized-propositions.ts", "utf8");
assert(!/(?:prodentim|joint[\s-]?genesis|alphanova)/i.test(source), "the proposition layer names no product");

if (failed) {
  console.error("PROPOSITION_IDENTITY_CONTRACT=FAIL " + failed);
  process.exit(1);
}
console.log("PROPOSITION_IDENTITY_CONTRACT=PASS");
