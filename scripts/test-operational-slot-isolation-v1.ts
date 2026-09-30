// npx tsx scripts/test-operational-slot-isolation-v1.ts
//
// RETURNS / SHIPPING wordings cite exactly one proposition; other slots keep
// same-slot combination. Fictional product only.
import { emptyProductFacts, type ProductFacts, type ReturnsInformationFact, type ShippingInformationFact } from "../src/lib/product-facts.ts";
import { createGenerationPlan, formatGenerationPlanForPrompt } from "../src/lib/ai/generation-plan.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import {
  formatAuthorizedPropositionsForPrompt,
  isOperationalSlot,
  OPERATIONAL_ISOLATION_PROMPT,
  propositionsForSlot,
  validatePropositionBindings,
  type AuthorizedProposition,
} from "../src/lib/ai/authorized-propositions.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const NAME = "Pellbrook Field Radio";

function op<K extends string>(statement: string, kind: K, category: "RETURNS" | "SHIPPING") {
  return {
    statement,
    kind,
    provenance: "DIRECT_SOURCE" as const,
    copyEligibility: "YES" as const,
    policyFindings: [],
    sourceUrl: `https://pellbrook.example/help/${category.toLowerCase()}`,
    sourcePageCategory: category,
  };
}

const RETURNS = "Returns are accepted within 30 days of delivery. Credits may take longer to post, depending on your card issuer. Processing takes 3 to 6 days.";
const SHIPPING = "Domestic orders ship within 2 business days. International orders may be delayed by customs. Tracking links are emailed when available.";

function radio(): ProductFacts {
  const facts = emptyProductFacts(NAME, "https://pellbrook.example/radio", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Supports clear reception, long battery life, and quick charging with three antenna modes"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  facts.returnsInformation = [op<ReturnsInformationFact["kind"]>(RETURNS, "REFUND_MECHANISM", "RETURNS")];
  facts.shippingInformation = [op<ShippingInformationFact["kind"]>(SHIPPING, "DELIVERY_ESTIMATE", "SHIPPING")];
  return facts;
}

const facts = radio();
const plan = createGenerationPlan(facts);
const slots = createEvidenceSlotPlan(facts, plan).slots;
const slotOf = (type: string) => {
  const slot = slots.find((item) => item.type === type);
  if (!slot) throw new Error(`${type} slot missing`);
  return slot;
};
const returnsSlot = slotOf("RETURNS");
const shippingSlot = slotOf("SHIPPING");
const find = (slot: EvidenceSlot, pattern: RegExp): AuthorizedProposition => {
  const hit = propositionsForSlot(slot).find((item) => pattern.test(item.sourceText));
  if (!hit) throw new Error(`no proposition for ${pattern}`);
  return hit;
};
const bind = (slot: EvidenceSlot, rows: Array<{ ids: string[]; wording: string }>) =>
  validatePropositionBindings({
    fill: { slotId: slot.slotId, propositions: rows.map((row) => ({ propositionIds: row.ids, wording: row.wording })) },
    slot,
    slots,
    plan,
    productName: NAME,
  });
const combined = (violations: ReturnType<typeof bind>) => violations.some((item) => item.reason.startsWith("OPERATIONAL_PROPOSITION_COMBINATION"));

const r1 = find(returnsSlot, /within 30 days of delivery/);
const r2 = find(returnsSlot, /depending on your card issuer/);
const r3 = find(returnsSlot, /3 to 6 days/);
const s1 = find(shippingSlot, /2 business days/);
const s2 = find(shippingSlot, /delayed by customs/);
const s3 = find(shippingSlot, /when available/);

assert(isOperationalSlot(returnsSlot) && isOperationalSlot(shippingSlot), "0: returns and shipping slots are operational");
assert(new Set([r1, r2, r3].map((item) => item.propositionId)).size === 3, "0: returns evidence is three atomic propositions");

// PASS: one proposition per wording.
assert(
  bind(returnsSlot, [
    { ids: [r1.propositionId], wording: "Returns are accepted within 30 days of delivery." },
    { ids: [r2.propositionId], wording: "Credits may take longer to post, depending on your card issuer." },
    { ids: [r3.propositionId], wording: "Processing takes 3 to 6 days." },
  ]).length === 0,
  "P: returns P1, P2, P3 each realized in its own wording",
);
assert(
  bind(shippingSlot, [
    { ids: [s1.propositionId], wording: "Domestic orders ship within 2 business days." },
    { ids: [s2.propositionId], wording: "International orders may be delayed by customs." },
    { ids: [s3.propositionId], wording: "Tracking links are emailed when available." },
  ]).length === 0,
  "P: shipping P1, P2, P3 each realized in its own wording",
);

// BLOCK: two propositions in one operational wording, even when the prose is faithful.
const returnsMerge = bind(returnsSlot, [
  { ids: [r1.propositionId, r2.propositionId], wording: "Returns are accepted within 30 days of delivery, and credits may take longer to post, depending on your card issuer." },
]);
assert(combined(returnsMerge), "B: returns P1 + P2 in one wording is OPERATIONAL_PROPOSITION_COMBINATION");
const shippingMerge = bind(shippingSlot, [
  { ids: [s2.propositionId, s3.propositionId], wording: "International orders may be delayed by customs, and tracking links are emailed when available." },
]);
assert(combined(shippingMerge), "B: shipping P2 + P3 in one wording is OPERATIONAL_PROPOSITION_COMBINATION");
const relationMerge = bind(returnsSlot, [{ ids: [r2.propositionId, r3.propositionId], wording: "Credits post in 3 to 6 days, depending on your card issuer." }]);
assert(combined(relationMerge), "B: a relation-changing merge is blocked structurally");
assert(relationMerge.some((item) => item.reason.startsWith("RELATION_TRANSFER_")), "B: existing relation-transfer finding is still reported");

// Non-operational slots keep same-slot combination.
const multi = slots.find((slot) => !isOperationalSlot(slot) && propositionsForSlot(slot).filter((item) => item.relation === "supports").length >= 2);
if (!multi) throw new Error("no non-operational multi-proposition slot");
const [a, b] = propositionsForSlot(multi).filter((item) => item.relation === "supports");
const nonOp = bind(multi, [{ ids: [a!.propositionId, b!.propositionId], wording: `Supports ${a!.object} and ${b!.object}.` }]);
assert(!isOperationalSlot(multi), "N: feature slot is not operational");
assert(nonOp.length === 0, "N: two same-slot feature propositions may still be combined");

// Prompt contract.
const propositionPrompt = formatAuthorizedPropositionsForPrompt(slots);
assert(propositionPrompt.includes(OPERATIONAL_ISOLATION_PROMPT), "C: operational isolation rule is in the proposition prompt");
assert(/one wording per proposition/i.test(formatGenerationPlanForPrompt(plan)), "C: plan prompt states one wording per proposition");
const nonOpPrompt = formatAuthorizedPropositionsForPrompt(slots.filter((slot) => !isOperationalSlot(slot)));
assert(!nonOpPrompt.includes(OPERATIONAL_ISOLATION_PROMPT), "C: no operational rule when no operational slot exists");

console.log("ALL OPERATIONAL SLOT ISOLATION V1 TESTS PASSED");
