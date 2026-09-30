/**
 * OPERATIONAL DURATION NORMALIZATION + SLOT BUDGET FEASIBILITY V1
 *
 * A. "sixty (60) days" states the same duration as "60 days"; it never
 *    supports a different duration.
 * B. No RETURNS/SHIPPING slot asks the model for every authorized proposition
 *    inside a budget smaller than their verbatim realization; an infeasible
 *    plan is detected before any model call.
 */
import { readFileSync } from "node:fs";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import {
  buildGenerationFactManifest,
  emptyProductFacts,
  type ProductFacts,
  type ReturnsInformationFact,
  type ShippingInformationFact,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import {
  assertSlotBudgetFeasibility,
  createEvidenceSlotPlan,
  minimumFaithfulWords,
  slotBudgetInfeasibilities,
  type EvidenceSlot,
  type EvidenceSlotPlan,
} from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { operationalMeasures, unsupportedPropositionTransfers, withNormalizedNumerals } from "../src/lib/ai/operational-relations.ts";
import { validateSlotFills } from "../src/lib/ai/slot-generation.ts";
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

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const returnsFact = (statement: string, kind: ReturnsInformationFact["kind"] = "RETURN_PROCESS"): ReturnsInformationFact => ({
  statement,
  kind,
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://tessaloom.example/help/returns",
  sourcePageCategory: "RETURNS",
});
const shippingFact = (statement: string, kind: ShippingInformationFact["kind"] = "PROCESSING"): ShippingInformationFact => ({
  statement,
  kind,
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://tessaloom.example/help/shipping",
  sourcePageCategory: "SHIPPING",
});

function product(name: string, returns: ReturnsInformationFact[], shipping: ShippingInformationFact[]): ProductFacts {
  const facts = emptyProductFacts(name, "https://tessaloom.example/product", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Woven Cotton Cover", "Machine Washable", "Twin Size"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.description = `${name} is a woven cotton throw blanket.`;
  facts.confidence.description = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Organic Cotton", "Linen Blend"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = ["Machine wash cold and tumble dry on low heat."];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.guaranteeInformation = "Every order is covered by a 90-day money-back guarantee.";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.returnsInformation = returns;
  facts.shippingInformation = shipping;
  facts.importQuality = "SUFFICIENT";
  return facts;
}

function slotPlanFor(facts: ProductFacts, route?: "MODEL"): EvidenceSlotPlan {
  const plan = createGenerationPlan(facts);
  if (route) assert(plan.generationRoute === route, `${facts.productName}: generation route is ${route} (${plan.generationRoute})`);
  const manifest = buildGenerationFactManifest(facts);
  return createEvidenceSlotPlan(facts, plan, manifest, projectEvidenceClaims(facts, plan, manifest));
}

const operationalSlots = (plan: EvidenceSlotPlan) => plan.slots.filter((slot) => slot.type === "RETURNS" || slot.type === "SHIPPING");

function fillViolations(plan: EvidenceSlotPlan, facts: ProductFacts, slot: EvidenceSlot, wordings: Array<[string, string]>): string[] {
  return validateSlotFills(
    [{ slotId: slot.slotId, propositions: wordings.map(([id, wording]) => ({ propositionIds: [id], wording })) }],
    plan,
    facts,
  )
    .filter((item) => item.code !== "MISSING_REQUIRED_SLOT")
    .map((item) => `${item.code}:${item.reason}`);
}

function verbatimViolations(plan: EvidenceSlotPlan, facts: ProductFacts, slot: EvidenceSlot): string[] {
  return fillViolations(plan, facts, slot, propositionsForSlot(slot).map((item) => [item.propositionId, item.sourceText]));
}

// ─── A. Duration normalization ───────────────────────────────────────────────
{
  assert(operationalMeasures("within sixty (60) days").includes("60 days"), "A: 'sixty (60) days' measures as 60 days");
  assert(operationalMeasures("within thirty (30) days").includes("30 days"), "A: 'thirty (30) days' measures as 30 days");
  assert(operationalMeasures("within ninety (90) days").includes("90 days"), "A: 'ninety (90) days' measures as 90 days");
  assert(operationalMeasures("within one hundred twenty (120) days").includes("120 days"), "A: compound written number with numeral");
  assert(operationalMeasures("allow five (5) business days").includes("5 days"), "A: business-day unit with written numeral");
  assert(operationalMeasures("within (45) days").includes("45 days"), "A: bare parenthesized numeral");
  assert(operationalMeasures("within thirty (60) days").length === 0, "A: conflicting written number and numeral support no measure");
  assert(withNormalizedNumerals("Contact us (24/7) about order (2).") === "Contact us (24/7) about order (2).", "A: parentheses without a unit are untouched");

  const source = "Returns must reach our facility within sixty (60) days of the purchase date.";
  assert(unsupportedPropositionTransfers("Returns must reach our facility within 60 days of the purchase date.", [source]).length === 0, "A: '60 days' restates 'sixty (60) days'");
  assert(unsupportedPropositionTransfers(source, [source]).length === 0, "A: verbatim written form still passes");
  assert(
    unsupportedPropositionTransfers("Returns must reach our facility within 45 days of the purchase date.", [source]).some((item) => item.type === "DURATION"),
    "A: 'sixty (60) days' does not support 45 days",
  );
  assert(
    unsupportedPropositionTransfers("Returns must reach our facility within 30 days of the purchase date.", ["Returns must reach our facility within thirty (30) days."]).length === 0,
    "A: '30 days' restates 'thirty (30) days'",
  );
  assert(
    unsupportedPropositionTransfers("Returns must reach our facility within 45 days.", ["Returns must reach our facility within thirty (30) days."]).some((item) => item.type === "DURATION"),
    "A: 'thirty (30) days' does not support 45 days",
  );
  assert(
    unsupportedPropositionTransfers("Refunds post within 60 days if you call us first.", ["Refunds post within sixty (60) days."]).length > 0,
    "A: a condition absent from the proposition is still a relation transfer",
  );

  // Through the slot contract (binding + grounding).
  const facts = product(
    "Tessaloom Throw",
    [returnsFact("Returns must reach our facility within sixty (60) days of the purchase date.", "RETURN_WINDOW")],
    [shippingFact("Orders ship within two (2) business days.")],
  );
  const plan = slotPlanFor(facts, "MODEL");
  const returns = plan.slots.find((slot) => slot.type === "RETURNS")!;
  const prop = propositionsForSlot(returns)[0]!;
  const restated = "Returns must reach our facility within 60 days of the purchase date.";
  assert(fillViolations(plan, facts, returns, [[prop.propositionId, restated]]).length === 0, "A: slot binding accepts '60 days' for 'sixty (60) days'");
  assert(
    validateGrounding(restated, facts).unsupportedClaims.filter((item) => item.severity === "hard").length === 0,
    "A: grounding accepts '60 days' for 'sixty (60) days'",
  );
  assert(
    fillViolations(plan, facts, returns, [[prop.propositionId, "Returns must reach our facility within 45 days of the purchase date."]]).some((item) =>
      item.includes("RELATION_TRANSFER_DURATION"),
    ),
    "A: slot binding rejects '45 days' for 'sixty (60) days'",
  );

  // Equivalence: the written and numeric forms are one fact; different windows are not.
  const dup = product(
    "Tessaloom Throw",
    [
      returnsFact("You may return the throw within sixty (60) days of purchase.", "RETURN_WINDOW"),
      returnsFact("You may return the throw within 60 days of purchase.", "RETURN_WINDOW"),
      returnsFact("You may return the throw within thirty (30) days of purchase.", "RETURN_WINDOW"),
    ],
    [],
  );
  const kept = buildGenerationFactManifest(dup).items.filter((item) => item.field === "returnsInformation").map((item) => item.value);
  assert(kept.length === 2, `A: written/numeric duplicate collapses, different window survives (${kept.length} kept)`);
}

// ─── B. Budget feasibility ───────────────────────────────────────────────────
const small = product("Tessaloom Throw", [returnsFact("We do not cover return shipping costs.", "RETURN_CONDITION")], [shippingFact("Orders ship within 2 business days.")]);

const large = product(
  "Tessaloom Throw",
  [
    returnsFact("If you are not completely satisfied with your throw for any reason, you have ninety (90) days from your original purchase date to request a refund.", "RETURN_WINDOW"),
    returnsFact("A return authorization number must be requested from our customer care team and approved before any package is sent back to our returns facility."),
    returnsFact("Returned throws must be unwashed, unused and in their original packaging, except for items that arrived damaged or defective in transit to your address."),
    returnsFact("A restocking fee of $9.95 is deducted from every refund issued for opened packages, unless the return is the result of an error made by our warehouse staff.", "RETURN_CONDITION"),
    returnsFact("Refunds may take up to ten (10) business days to appear on your statement after the returned package has been received and inspected by our returns team."),
    returnsFact("Do not send your return to the weaving mill, because packages delivered to the mill cannot be tracked, processed or refunded by our customer care team."),
  ],
  [
    shippingFact("Please allow one to two business days of processing time before your order leaves our warehouse, and allow additional time during national holiday periods."),
    shippingFact("If the shipping address you provide is incomplete or invalid, your order may be delayed by an additional three to five business days while we contact you."),
    shippingFact("Orders that have already been processed or shipped cannot be cancelled, but they may be refused at delivery and returned under the standard return policy."),
    shippingFact("International orders may be subject to customs duties and import taxes that are charged by the destination country and are not included in our shipping fee."),
    shippingFact("Optional express delivery is available for an additional $14.95 fee where available, and it is dispatched on the next business day after payment is confirmed."),
  ],
);

for (const [label, facts] of [
  ["small", small],
  ["large", large],
] as const) {
  const plan = slotPlanFor(facts, "MODEL");
  const slots = operationalSlots(plan);
  assert(slots.length > 0, `B ${label}: operational slots planned`);
  for (const slot of slots) {
    const minimum = minimumFaithfulWords(slot.evidence);
    const verbatim = propositionsForSlot(slot).reduce((total, item) => total + words(item.sourceText), 0);
    assert(minimum === verbatim, `B ${label} ${slot.type}: minimum faithful realization = verbatim propositions (${minimum})`);
    assert(minimum <= slot.maxWords, `B ${label} ${slot.type}: minimum ${minimum} <= effective budget ${slot.maxWords}`);
    const sourceWords = slot.evidence.reduce((total, item) => total + words(item.value), 0);
    assert(slot.maxWords <= sourceWords, `B ${label} ${slot.type}: budget never exceeds the source (${slot.maxWords} <= ${sourceWords}), so no filler room`);
    assert(slot.required === false, `B ${label} ${slot.type}: operational slot stays optional`);
    const violations = verbatimViolations(plan, facts, slot);
    assert(violations.length === 0, `B ${label} ${slot.type}: every proposition verbatim passes with no WORD_BUDGET (${violations.join(" | ").slice(0, 200)})`);
  }
  assert(slotBudgetInfeasibilities(plan).length === 0, `B ${label}: plan is budget-feasible pre-model`);
}

{
  const plan = slotPlanFor(large, "MODEL");
  const returns = plan.slots.find((slot) => slot.type === "RETURNS")!;
  const shipping = plan.slots.find((slot) => slot.type === "SHIPPING")!;
  const sources = [...propositionsForSlot(returns), ...propositionsForSlot(shipping)].map((item) => item.sourceText).join("\n");
  for (const [relation, needle] of [
    ["duration", "ninety (90) days"],
    ["authorization requirement", "must be requested from our customer care team and approved"],
    ["exception", "except for items that arrived damaged"],
    ["fee", "restocking fee of $9.95"],
    ["condition", "If the shipping address you provide is incomplete or invalid"],
    ["optionality", "Optional express delivery is available"],
  ] as const) {
    assert(sources.includes(needle), `B large: ${relation} proposition kept in the plan, not dropped for budget`);
  }
  // Legitimate omission: the operational slots are optional, and a subset of propositions is still valid.
  const subset = propositionsForSlot(returns).slice(0, 2).map((item) => [item.propositionId, item.sourceText] as [string, string]);
  assert(fillViolations(plan, large, returns, subset).length === 0, "B large: a subset of RETURNS propositions stays valid (omission behavior unchanged)");
  const withoutOperational = validateSlotFills([], plan, large).filter((item) => item.text === returns.slotId || item.text === shipping.slotId);
  assert(withoutOperational.length === 0, "B large: omitting an optional operational slot is not a violation");

  // Pre-model detection of an infeasible plan.
  const tampered: EvidenceSlotPlan = { ...plan, slots: plan.slots.map((slot) => (slot.slotId === shipping.slotId ? { ...slot, maxWords: 40 } : slot)) };
  const found = slotBudgetInfeasibilities(tampered);
  assert(found.length === 1 && found[0]!.slotId === shipping.slotId, "B: infeasible slot budget is detected pre-model");
  let threw = "";
  try {
    assertSlotBudgetFeasibility(tampered);
  } catch (error) {
    threw = (error as Error).message;
  }
  assert(threw.startsWith("SLOT_BUDGET_INFEASIBLE"), "B: the pre-model gate refuses an infeasible plan");
}

// ─── Saved reference facts ───────────────────────────────────────────────────
function saved(path: string): ProductFacts {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const facts = (raw.facts ?? raw) as ProductFacts;
  return applyGenericFaqRecovery(facts);
}

const references: Array<[string, string]> = [
  ["AUDIFORT", "data/generic-lp-engine/v1/audifort-classifier-fix-v1/fresh-product-facts.json"],
  ["PRODENTIM", "data/generic-lp-engine/v1/prodentim-post-isolation-v1/fresh-product-facts.json"],
  ["JOINT_GENESIS", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"],
];
for (const [label, path] of references) {
  const facts = saved(path);
  const plan = slotPlanFor(facts);
  assert(slotBudgetInfeasibilities(plan).length === 0, `${label}: every slot is budget-feasible pre-model`);
  for (const slot of operationalSlots(plan)) {
    const minimum = minimumFaithfulWords(slot.evidence);
    console.log(`   ${label} ${slot.slotId} ${slot.type} requiredWords=${minimum} effectiveBudget=${slot.maxWords} propositions=${propositionsForSlot(slot).length}`);
    const violations = verbatimViolations(plan, facts, slot);
    assert(violations.length === 0, `${label} ${slot.type}: full verbatim realization passes (${violations.join(" | ").slice(0, 200)})`);
  }
}

{
  const facts = saved(references[0]![1]);
  const plan = slotPlanFor(facts);
  const shipping = plan.slots.find((slot) => slot.type === "SHIPPING" && propositionsForSlot(slot).some((item) => /sixty \(60\) days/.test(item.sourceText)))!;
  const sixty = propositionsForSlot(shipping).find((item) => /sixty \(60\) days/.test(item.sourceText))!;
  const faithful = "In order for your full refund to be processed, the product must arrive at our fulfillment facility within 60 days of the original purchase date.";
  assert(fillViolations(plan, facts, shipping, [[sixty.propositionId, faithful]]).length === 0, "AUDIFORT: 'sixty (60) days' supports faithful '60 days'");
  assert(
    fillViolations(plan, facts, shipping, [[sixty.propositionId, faithful.replace("60 days", "45 days")]]).some((item) => item.includes("RELATION_TRANSFER_DURATION")),
    "AUDIFORT: 'sixty (60) days' does not support '45 days'",
  );
  const returns = plan.slots.find((slot) => slot.type === "RETURNS")!;
  assert(
    propositionsForSlot(returns).some((item) => item.sourceText === "A return authorization must be requested and approved within 90 days of your date of purchase."),
    "AUDIFORT: RMA 90-day authorization requirement preserved in RETURNS",
  );
}

if (failures > 0) {
  console.log(`OPERATIONAL BUDGET FEASIBILITY V1: ${failures} FAILED`);
  process.exit(1);
}
console.log("ALL OPERATIONAL BUDGET FEASIBILITY V1 TESTS PASSED");
