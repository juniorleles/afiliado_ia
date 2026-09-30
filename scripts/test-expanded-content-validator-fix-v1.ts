// npx tsx scripts/test-expanded-content-validator-fix-v1.ts
//
// Validator fixes exposed by the expanded-content candidate. Fictional products
// for every rule; the saved candidate is replayed as a zero-call regression
// fixture only.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  emptyProductFacts,
  type ProductFacts,
  type ReturnsInformationFact,
  type ShippingInformationFact,
} from "../src/lib/product-facts.ts";
import { validateGrounding, type FaqAuthorityBinding } from "../src/lib/ai/grounding-validator.ts";
import { checkModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { minimumFaithfulWords, operationalEvidenceBudget, OPERATIONAL_WORDS_PER_FACT } from "../src/lib/ai/evidence-slot-plan.ts";
import { unsupportedOperationalMerges } from "../src/lib/ai/operational-relations.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { propositionsForSlot, validatePropositionBindings } from "../src/lib/ai/authorized-propositions.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const NAME = "Larkspur Field Kettle";

function op<K extends string>(statement: string, kind: K, category: "RETURNS" | "SHIPPING") {
  return {
    statement,
    kind,
    provenance: "DIRECT_SOURCE" as const,
    copyEligibility: "YES" as const,
    policyFindings: [],
    sourceUrl: `https://larkspur.example/help/${category.toLowerCase()}`,
    sourcePageCategory: category,
  };
}

function kettle(): ProductFacts {
  const facts = emptyProductFacts(NAME, "https://larkspur.example/kettle", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Folding Handle", "Stainless Steel Body"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.usageInformation = ["Fill the kettle to the marked line before heating."];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  facts.returnsInformation = [
    op<ReturnsInformationFact["kind"]>(
      "It may take a while for the refund to appear on your card statement, depending on your bank. The processing time is between 4 and 8 days.",
      "REFUND_MECHANISM",
      "RETURNS",
    ),
  ];
  facts.shippingInformation = [
    op<ShippingInformationFact["kind"]>("Domestic: FREE, 3-5 working days", "DESTINATION", "SHIPPING"),
    op<ShippingInformationFact["kind"]>("Canada: $12.50, 8-12 working days", "DESTINATION", "SHIPPING"),
    op<ShippingInformationFact["kind"]>("Norway: $21.00, 10-14 working days", "DESTINATION", "SHIPPING"),
    op<ShippingInformationFact["kind"]>("Orders may be delayed due to customs inspections.", "OTHER", "SHIPPING"),
    op<ShippingInformationFact["kind"]>("Delivery takes 3-5 days depending on your region.", "DELIVERY_ESTIMATE", "SHIPPING"),
  ];
  return facts;
}

const hard = (text: string, facts: ProductFacts, reason: RegExp, options?: Parameters<typeof validateGrounding>[2]) =>
  validateGrounding(text, facts, options).unsupportedClaims.filter((item) => item.severity === "hard" && reason.test(item.reason));

// 1. Refund timing is not dosage; genuine dosage still detected.
{
  const facts = kettle();
  assert(hard("Refunds take 4 to 8 days to process.", facts, /dosage/).length === 0, "1: 'take 4 to 8 days' is elapsed time, not dosage");
  assert(hard("It may take a while for the refund to appear.", facts, /dosage/).length === 0, "1: 'take a while' is not dosage");
  const noUsage = kettle();
  noUsage.usageInformation = [];
  noUsage.confidence.usageInformation = "NOT_FOUND";
  assert(hard("Take 2 capsules every morning with water.", noUsage, /dosage/).length > 0, "1: 'take 2 capsules' still needs usage evidence");
  assert(hard("Take one tablet daily before breakfast for best use.", noUsage, /dosage/).length > 0, "1: 'take one tablet daily' still needs usage evidence");
}

// 2. Unsupported semantic merge of separately stated operational facts.
{
  const facts = kettle();
  const support = facts.returnsInformation?.[0]?.statement ?? "";
  const merged = "Card refunds take 4 to 8 days depending on your bank.";
  assert(unsupportedOperationalMerges(merged, support).length === 1, "2: bank qualifier attached to the processing range is a merge");
  assert(hard(merged, facts, /semantic merge/).length === 1, "2: grounding blocks the merged relation");
  const wording = checkModelWordingConstraint({ generated: merged, support, slotId: "S1", field: "returnsInformation" });
  assert(wording.violations.some((item) => item.violationType === "NEW_RELATIONSHIP"), "2: binding reports NEW_RELATIONSHIP");
  assert(unsupportedOperationalMerges("The processing time is 4 to 8 days.", support).length === 0, "2: faithful range restatement is not a merge");
  assert(
    unsupportedOperationalMerges("Delivery takes 3-5 days depending on your region.", facts.shippingInformation?.[4]?.statement ?? "").length === 0,
    "2: a qualifier stated with the same measure in one sentence is allowed",
  );
}

// 3. Structured destination rows keep destination + fee + window.
{
  const facts = kettle();
  const rows = "Domestic: FREE, 3-5 working days Canada: $12.50, 8-12 working days Norway: $21.00, 10-14 working days";
  assert(hard(rows, facts, /price claim/).length === 0, "3: unpunctuated rows bind to their destination statements");
  assert(hard("Shipping to Canada costs $12.50 and takes 8-12 working days.", facts, /price claim/).length === 0, "3: prose restatement of a row binds");
  assert(hard("Canada: $21.00, 8-12 working days", facts, /price claim/).length > 0, "3: a fee moved to another destination is unsupported");
  assert(hard("Mexico: $12.50, 8-12 working days", facts, /price claim/).length > 0, "3: a destination absent from evidence is unsupported");
  assert(hard("Shipping costs $19.99 per order.", facts, /price claim/).length > 0, "3: an arbitrary price is not groundable");
  const noShipping = kettle();
  noShipping.shippingInformation = [];
  assert(hard("Canada: $12.50, 8-12 working days", noShipping, /price claim/).length > 0, "3: no shipping evidence, no fee binding");
}

// 4. FAQ boundaries: a short unpunctuated answer does not merge with the next question.
{
  const facts = kettle();
  const bindings: FaqAuthorityBinding[] = [
    { question: "Which feature is listed?", field: "features", topic: "features", semanticAuthority: "FEATURE_DESCRIPTION", authorizedTopics: ["features"], supportText: "Folding Handle", closedTopics: [], slotId: "FAQ001" },
    { question: `How do you use ${NAME}?`, field: "usageInformation", topic: "usage", semanticAuthority: "USAGE", authorizedTopics: ["usage"], supportText: facts.usageInformation[0], closedTopics: [], slotId: "FAQ002" },
  ];
  const page = `## FAQ\n\n- Which feature is listed? Folding Handle\n- How do you use ${NAME}? Fill the kettle to the marked line before heating.`;
  const result = validateGrounding(page, facts, { faqAuthorities: bindings });
  assert(!result.unsupportedClaims.some((item) => /Folding Handle\s*-?\s*How/.test(item.claim)), "4: answer label and next question stay separate units");
  assert(!result.unsupportedClaims.some((item) => /PRESUPPOSITION/.test(item.reason)), "4: bound FAQ questions pass");
  const unbound = validateGrounding(`- Which feature is listed? Folding Handle\n- How much should you drink per day?`, facts, { faqAuthorities: bindings });
  assert(unbound.unsupportedClaims.length > 0, "4: an unbound question after a label is still validated on its own");
}

// 5. Causality realized only from a causal relation in evidence.
{
  const support = "Considering current conditions, there might be delays due to customs.";
  const ok = checkModelWordingConstraint({ generated: "Customs may cause delays.", support, slotId: "S1", field: "shippingInformation" });
  assert(!ok.violations.some((item) => item.violationType === "NEW_CAUSALITY"), "5: 'delays due to customs' authorizes 'customs may cause delays'");
  const noCause = checkModelWordingConstraint({ generated: "Customs may cause delays.", support: "There might be delays.", slotId: "S1", field: "shippingInformation" });
  assert(noCause.violations.some((item) => item.violationType === "NEW_CAUSALITY"), "5: no causal relation in evidence stays NEW_CAUSALITY");
  const otherCause = checkModelWordingConstraint({ generated: "Bad weather may cause delays.", support, slotId: "S1", field: "shippingInformation" });
  assert(otherCause.violations.some((item) => item.violationType === "NEW_CAUSALITY"), "5: a different cause is not authorized");
  const separate = checkModelWordingConstraint({
    generated: "Customs may cause delays.",
    support: "Customs forms are included. There might be delays due to holidays.",
    slotId: "S1",
    field: "shippingInformation",
  });
  assert(separate.violations.some((item) => item.violationType === "NEW_CAUSALITY"), "5: cause and effect must share one causal evidence sentence");

  const facts = kettle();
  const plan = createGenerationPlan(facts);
  const slots = createEvidenceSlotPlan(facts, plan).slots;
  const shipping = slots.find((item) => item.type === "SHIPPING");
  const props = shipping ? propositionsForSlot(shipping) : [];
  const customs = props.find((item) => /customs/i.test(item.sourceText));
  const row = props.find((item) => /^Canada/i.test(item.sourceText));
  assert(Boolean(shipping && customs && row), "5: shipping slot owns customs and destination propositions");
  const bind = (id: string, wording: string) =>
    validatePropositionBindings({ fill: { slotId: shipping!.slotId, propositions: [{ propositionIds: [id], wording }] }, slot: shipping!, slots, plan, productName: NAME });
  assert(bind(customs!.propositionId, "Customs inspections may cause delays.").length === 0, "5: binding accepts causality stated in the cited proposition");
  assert(
    bind(row!.propositionId, "Customs inspections may cause delays to Canada.").some((item) => item.reason === "UNAUTHORIZED_RELATIONSHIP"),
    "5: binding rejects causality absent from the cited proposition",
  );
}

// 6. Evidence-aware operational budget.
{
  const sparse = ["We do not cover return shipping costs."];
  assert(operationalEvidenceBudget(sparse) === 7, "6: sparse evidence keeps a compact budget (its own length)");
  const dense = Array.from({ length: 6 }, (_, i) => `Statement ${i} ${"word ".repeat(30).trim()}.`);
  assert(operationalEvidenceBudget(dense) === 6 * OPERATIONAL_WORDS_PER_FACT, "6: dense evidence scales per authorized fact");
  const facts = kettle();
  const slot = createEvidenceSlotPlan(facts).slots.find((item) => item.type === "SHIPPING");
  const sourceWords = (slot?.evidence ?? []).reduce((total, item) => total + item.value.split(/\s+/).length, 0);
  assert(
    Boolean(slot) &&
      (slot?.maxWords ?? 0) <=
        Math.max(operationalEvidenceBudget((slot?.evidence ?? []).map((item) => item.value)), minimumFaithfulWords(slot?.evidence ?? [])),
    "6: slot budget never exceeds the evidence-aware cap or the verbatim floor",
  );
  assert((slot?.maxWords ?? 0) <= sourceWords + Math.ceil(sourceWords * 0.35), "6: slot budget never exceeds its source allowance");
}

// 7. Saved expanded candidate (zero model calls): fixed false positives clear, the real merge stays blocked.
{
  const dir = path.join(process.cwd(), "data/generic-lp-engine/v1/prodentim-expanded-content-v1");
  if (!existsSync(path.join(dir, "generation-raw.json"))) {
    console.log("SKIP: 7: saved candidate not present");
  } else {
    const facts = (JSON.parse(readFileSync(path.join(dir, "fresh-product-facts.json"), "utf8")) as { facts: ProductFacts }).facts;
    const raw = JSON.parse(readFileSync(path.join(dir, "generation-raw.json"), "utf8")) as { ctaLabel: string; fills: SlotFill[] };
    const evaluation = evaluateSlotGeneration(
      { variants: [{ cta: { label: raw.ctaLabel }, slots: raw.fills }] },
      facts,
      facts.productName,
      VALIDATION_SAFE_AFFILIATE,
      createEvidenceSlotPlan(facts),
    );
    const claims = evaluation.grounding.unsupportedClaims;
    assert(!claims.some((item) => /dosage/.test(item.reason)), "7: refund timing no longer read as dosage");
    assert(!claims.some((item) => /price claim/.test(item.reason)), "7: shipping rows bind their fees");
    assert(claims.some((item) => /semantic merge/.test(item.reason) && /bank/i.test(item.claim)), "7: refund/bank merge remains blocked");
    assert(!evaluation.structuralViolations.some((item) => /NEW_CAUSALITY/.test(item.reason)), "7: customs causality no longer flagged");
    assert(!evaluation.structuralViolations.some((item) => /customs/i.test(item.text)), "7: customs sentence passes proposition binding");
    assert(
      evaluation.structuralViolations.some((item) => item.code === "PROPOSITION_BINDING_VIOLATION" && /bank/i.test(item.text)),
      "7: refund/bank merge fails proposition binding",
    );
    assert(evaluation.contentReadiness === "CONTENT_BLOCKED", "7: candidate is not forced to pass");
  }
}

console.log("ALL EXPANDED CONTENT VALIDATOR FIX V1 TESTS PASSED");
