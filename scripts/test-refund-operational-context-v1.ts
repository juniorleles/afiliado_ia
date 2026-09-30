/**
 * REFUND OPERATIONAL CONTEXT V1
 *
 * With no guarantee evidence (guarantee topic CLOSED), refund facts inside
 * authorized returns/shipping evidence are operational facts: they pass
 * verbatim in their slot. Guarantee assertions (money-back, guarantee,
 * risk-free, refund policy/period) stay blocked, in every slot.
 */
import {
  buildGenerationFactManifest,
  emptyProductFacts,
  type ProductFacts,
  type ReturnsInformationFact,
  type ShippingInformationFact,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan, operationalGuaranteeAssertions, validateGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot, type EvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { deterministicFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

const returnsFact = (statement: string, kind: ReturnsInformationFact["kind"] = "RETURN_PROCESS"): ReturnsInformationFact => ({
  statement,
  kind,
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://brindlewood.example/help/returns",
  sourcePageCategory: "RETURNS",
});
const shippingFact = (statement: string): ShippingInformationFact => ({
  statement,
  kind: "PROCESSING",
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://brindlewood.example/help/shipping",
  sourcePageCategory: "SHIPPING",
});

const REFUND_FACTS = {
  window: "You have ninety (90) days from the delivery date to return the lamp.",
  request: "You have ninety (90) days to request a refund.",
  processing: "Refunds are processed within 5 business days after the returned lamp is inspected.",
  condition: "Refunds are not issued for lamps returned without the original packaging, unless the lamp arrived damaged.",
  shippingRefund: "If an order is refused at delivery, the refund is issued once the package reaches our warehouse.",
};

function product(guarantee: string | null, returns: ReturnsInformationFact[], shipping: ShippingInformationFact[]): ProductFacts {
  const facts = emptyProductFacts("Brindlewood Desk Lamp", "https://brindlewood.example/lamp", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.description = "Brindlewood Desk Lamp is an adjustable LED desk lamp.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["Adjustable Arm", "Warm LED Light", "USB Charging Port"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Aluminum Arm", "LED Panel"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["Plug the lamp into a USB power adapter and press the base to turn it on."];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  if (guarantee) {
    facts.guaranteeInformation = guarantee;
    facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  }
  facts.returnsInformation = returns;
  facts.shippingInformation = shipping;
  facts.importQuality = "SUFFICIENT";
  return facts;
}

function planned(facts: ProductFacts) {
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projectEvidenceClaims(facts, plan, manifest));
  return { plan, slotPlan };
}

function fill(slot: EvidenceSlot, facts: ProductFacts, id: string, wording: string): SlotFill {
  const bound = [{ propositionIds: [id], wording }];
  return slot.type === "FAQ"
    ? { slotId: slot.slotId, question: deterministicFaqQuestion(slot, facts.productName) || "", answerPropositions: bound }
    : { slotId: slot.slotId, propositions: bound };
}

function slotFindings(slotPlan: EvidenceSlotPlan, facts: ProductFacts, slot: EvidenceSlot, id: string, wording: string): string[] {
  return validateSlotFills([fill(slot, facts, id, wording)], slotPlan, facts)
    .filter((item) => item.code !== "MISSING_REQUIRED_SLOT")
    .map((item) => `${item.code}:${item.reason}`);
}

/** Every authorized proposition, verbatim in its own slot, through post-model validation and grounding. */
function roundTrip(facts: ProductFacts, slotPlan: EvidenceSlotPlan): string[] {
  const out: string[] = [];
  for (const slot of slotPlan.slots) {
    for (const proposition of propositionsForSlot(slot)) {
      const findings = [
        ...slotFindings(slotPlan, facts, slot, proposition.propositionId, proposition.sourceText),
        ...validateGrounding(proposition.sourceText, facts)
          .unsupportedClaims.filter((item) => item.severity === "hard")
          .map((item) => `GROUNDING:${item.claim}::${item.reason}`),
      ];
      if (findings.length) out.push(`${slot.slotId} ${proposition.propositionId}: ${findings.join(" | ")}`);
    }
  }
  return out;
}

// ─── No guarantee evidence: operational refund facts ─────────────────────────
const noGuarantee = product(
  null,
  [
    returnsFact(REFUND_FACTS.window, "RETURN_WINDOW"),
    returnsFact(REFUND_FACTS.request, "RETURN_WINDOW"),
    returnsFact(REFUND_FACTS.processing),
    returnsFact(REFUND_FACTS.condition, "RETURN_CONDITION"),
  ],
  [shippingFact("Orders ship within 2 business days."), shippingFact(REFUND_FACTS.shippingRefund)],
);
const { plan, slotPlan } = planned(noGuarantee);
assert(plan.generationRoute === "MODEL", `NO_GUARANTEE: MODEL route (${plan.generationRoute})`);
assert(plan.closedTopics.includes("guarantee"), "NO_GUARANTEE: guarantee topic is CLOSED");

const authorized = slotPlan.slots.flatMap((slot) => propositionsForSlot(slot).map((item) => ({ slot, item })));
for (const [label, text] of Object.entries(REFUND_FACTS)) {
  assert(authorized.some(({ item }) => item.sourceText === text), `NO_GUARANTEE: pre-model authorizes ${label} fact`);
}
const failuresNoGuarantee = roundTrip(noGuarantee, slotPlan);
for (const line of failuresNoGuarantee) console.log("   " + line);
assert(failuresNoGuarantee.length === 0, "NO_GUARANTEE: every authorized proposition passes verbatim (return window, refund request, processing, condition)");

const returnsSlot = slotPlan.slots.find((slot) => slot.type === "RETURNS")!;
const processing = propositionsForSlot(returnsSlot).find((item) => item.sourceText === REFUND_FACTS.processing)!;
assert(
  slotFindings(slotPlan, noGuarantee, returnsSlot, processing.propositionId, "Refunds are processed within 5 business days after the returned lamp is inspected.").length === 0,
  "D: 'Refunds are processed within 5 business days' passes when authorized by RETURNS evidence",
);
assert(
  slotFindings(slotPlan, noGuarantee, returnsSlot, processing.propositionId, "Refunds are processed within 3 business days after the returned lamp is inspected.").length > 0,
  "D: an unsupported processing duration is still blocked",
);

// Guarantee assertions stay blocked inside the RETURNS slot.
const request = propositionsForSlot(returnsSlot).find((item) => item.sourceText === REFUND_FACTS.request)!;
for (const [label, wording] of [
  ["B explicit money-back guarantee", "The product comes with a 90-day money-back guarantee."],
  ["C guaranteed results", "Guaranteed results or your money back."],
  ["risk-free", "Your purchase is risk-free for 90 days."],
  ["refund policy", "Our 90-day refund policy lets you request a refund."],
] as const) {
  const findings = slotFindings(slotPlan, noGuarantee, returnsSlot, request.propositionId, wording);
  assert(
    findings.some((item) => /CLOSED_TOPIC|GUARANTEE_PROMOTION/.test(item)),
    `${label}: blocked as guarantee in the RETURNS slot (${findings.join(" | ").slice(0, 120)})`,
  );
}

// The operational context never opens guarantee elsewhere.
assert(
  validateGenerationPlan("You can request a refund at any time.", plan, noGuarantee.productName).violations.some((item) => item.topic === "guarantee"),
  "FIREWALL: refund wording outside an operational slot is still guarantee",
);
assert(
  validateGenerationPlan("The product comes with a 90-day money-back guarantee.", plan, noGuarantee.productName, { operationalSlot: true }).violations.some(
    (item) => item.topic === "guarantee",
  ),
  "FIREWALL: explicit guarantee assertion blocked in operational context",
);
assert(operationalGuaranteeAssertions(REFUND_FACTS.request).length === 0, "A: refund request is not a guarantee assertion");
assert(operationalGuaranteeAssertions(REFUND_FACTS.processing).length === 0, "D: refund processing is not a guarantee assertion");
assert(operationalGuaranteeAssertions("Guaranteed results or your money back.").length > 0, "C: money back is a guarantee assertion");
assert(operationalGuaranteeAssertions("We offer a 60-day refund on every order.").length > 0, "N-day refund is a guarantee assertion");

// Guarantee assertions in returns evidence are not authorized pre-model while guarantee is CLOSED.
{
  const withAssertion = product(
    null,
    [returnsFact(REFUND_FACTS.request, "RETURN_WINDOW"), returnsFact("Every lamp includes a 30-day money-back guarantee.", "RETURN_WINDOW")],
    [shippingFact("Orders ship within 2 business days.")],
  );
  const { slotPlan: assertionPlan } = planned(withAssertion);
  const props = assertionPlan.slots.flatMap((slot) => propositionsForSlot(slot).map((item) => item.sourceText));
  assert(props.includes(REFUND_FACTS.request), "PRE-MODEL: operational refund fact authorized next to a guarantee assertion");
  assert(!props.some((text) => /money-back guarantee/i.test(text)), "PRE-MODEL: money-back guarantee in returns evidence is not authorized while guarantee is CLOSED");
  const trip = roundTrip(withAssertion, assertionPlan);
  for (const line of trip) console.log("   " + line);
  assert(trip.length === 0, "PRE-MODEL/POST-MODEL agree for the mixed returns evidence");
}

// ─── Guarantee evidence present: same facts, plus policy-span wording ────────
{
  const withGuarantee = product(
    "Every lamp is covered by a 90-day money-back guarantee.",
    [
      returnsFact(REFUND_FACTS.request, "RETURN_WINDOW"),
      returnsFact(REFUND_FACTS.processing),
      returnsFact("Our 30-day return policy covers unopened lamps only.", "RETURN_WINDOW"),
    ],
    [shippingFact("Orders ship within 2 business days.")],
  );
  const { plan: openPlan, slotPlan: openSlots } = planned(withGuarantee);
  assert(!openPlan.closedTopics.includes("guarantee"), "GUARANTEE_OPEN: guarantee topic is OPEN");
  const trip = roundTrip(withGuarantee, openSlots);
  for (const line of trip) console.log("   " + line);
  assert(trip.length === 0, "GUARANTEE_OPEN: every authorized proposition passes verbatim");
}

if (failures > 0) {
  console.log(`REFUND OPERATIONAL CONTEXT V1: ${failures} FAILED`);
  process.exit(1);
}
console.log("ALL REFUND OPERATIONAL CONTEXT V1 TESTS PASSED");
