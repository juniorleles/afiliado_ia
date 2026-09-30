/**
 * AUTHORIZED VERBATIM ROUND-TRIP V1
 *
 * Contract: an authorized proposition realized verbatim in its authorized slot
 * passes post-model validation (binding, slot authority, generation plan,
 * grounding). Fictional products exercise usage, returns, shipping, feature,
 * guarantee and ingredients; saved reference facts run the same invariant.
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
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot } from "../src/lib/ai/authorized-propositions.ts";
import { deterministicFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { namedIngredientMentions } from "../src/lib/ai/ingredient-claims.ts";
import { lintCampaign, withoutAddressSpans } from "../src/lib/policy-linter.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

type RoundTripFailure = { slotId: string; propositionId: string; field: string; findings: string[] };

/** Every authorized proposition, realized verbatim in its own slot, through post-model validation. */
export function verbatimRoundTrip(facts: ProductFacts): { checked: number; failures: RoundTripFailure[]; fields: Set<string> } {
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projectEvidenceClaims(facts, plan, manifest));
  const out: RoundTripFailure[] = [];
  const fields = new Set<string>();
  let checked = 0;
  for (const slot of slotPlan.slots) {
    for (const proposition of propositionsForSlot(slot)) {
      checked += 1;
      fields.add(proposition.field);
      const bound = [{ propositionIds: [proposition.propositionId], wording: proposition.sourceText }];
      const fill: SlotFill =
        slot.type === "FAQ"
          ? { slotId: slot.slotId, question: deterministicFaqQuestion(slot, facts.productName) || "", answerPropositions: bound }
          : { slotId: slot.slotId, propositions: bound };
      const structural = validateSlotFills([fill], slotPlan, facts)
        .filter((item) => item.code !== "MISSING_REQUIRED_SLOT")
        .map((item) => `${item.code}:${item.reason}`);
      const grounding = validateGrounding(proposition.sourceText, facts)
        .unsupportedClaims.filter((item) => item.severity === "hard")
        .map((item) => `GROUNDING:${item.claim}::${item.reason}`);
      const findings = [...structural, ...grounding];
      if (findings.length) out.push({ slotId: slot.slotId, propositionId: proposition.propositionId, field: proposition.field, findings });
    }
  }
  return { checked, failures: out, fields };
}

function report(label: string, result: ReturnType<typeof verbatimRoundTrip>) {
  for (const failure of result.failures) {
    console.log(`   ${label} ${failure.slotId} ${failure.propositionId} (${failure.field}): ${failure.findings.join(" | ").slice(0, 300)}`);
  }
}

// Fictional product covering every supported proposition shape.
const NAME = "Quillmere Night Drops";
const returnsFact = (statement: string, kind: ReturnsInformationFact["kind"]): ReturnsInformationFact => ({
  statement,
  kind,
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://quillmere.example/help/returns",
  sourcePageCategory: "RETURNS",
});
const shippingFact = (statement: string, kind: ShippingInformationFact["kind"]): ShippingInformationFact => ({
  statement,
  kind,
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://quillmere.example/help/shipping",
  sourcePageCategory: "SHIPPING",
});

function fictional(): ProductFacts {
  const facts = emptyProductFacts(NAME, "https://quillmere.example/drops", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Calming Evening Routine", "Glass Dropper Bottle", "Unflavored Liquid"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.ingredientsOrComponents = ["Lemon Balm", "Chamomile Flower"];
  facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
  facts.usageInformation = [
    "Take one full dropper each evening. A full dropper contains approximately 20 drops of liquid.",
    "Each bottle contains 30 servings.",
  ];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.guaranteeInformation = "Every order is covered by a 60-day money-back guarantee.";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.returnsInformation = [
    returnsFact("If you are not satisfied, you have 60 days from the date of purchase to return the product for a refund.", "RETURN_WINDOW"),
    returnsFact("A return authorization must be requested and approved within 60 days of your date of purchase.", "RETURN_PROCESS"),
    returnsFact("Return shipping is at your cost.", "RETURN_CONDITION"),
    returnsFact("Do not send the package back to the manufacturer.", "RETURN_PROCESS"),
  ];
  facts.shippingInformation = [
    shippingFact("Orders ship within 2 business days.", "PROCESSING"),
    shippingFact("A refund is processed after the returned package reaches the fulfillment facility.", "PROCESSING"),
  ];
  facts.importQuality = "SUFFICIENT";
  return facts;
}

{
  const result = verbatimRoundTrip(fictional());
  report("FICTIONAL", result);
  for (const field of ["usageInformation", "returnsInformation", "shippingInformation", "features", "guaranteeInformation", "ingredientsOrComponents"]) {
    assert(result.fields.has(field), `ROUNDTRIP fictional exercises ${field}`);
  }
  assert(result.failures.length === 0, `ROUNDTRIP fictional: ${result.checked} verbatim authorized propositions pass post-model validation (${result.failures.length} rejected)`);
}

// The authorization requirement survives equivalence next to a same-window return statement.
{
  const plan = fictional();
  const text = buildGenerationFactManifest(plan).items.filter((item) => item.field === "returnsInformation").map((item) => item.value);
  assert(text.some((item) => /authorization must be requested and approved/.test(item)), "EQUIVALENCE: authorization requirement survives next to the same-window return statement");
  assert(text.some((item) => /60 days from the date of purchase to return/.test(item)), "EQUIVALENCE: the broader return window survives too");
}

// Amounts vs named ingredients: the shared detector keeps composition claims.
{
  assert(namedIngredientMentions("A full dropper contains approximately 20 drops of liquid.").length === 0, "INGREDIENT: a measured amount of liquid names no ingredient");
  assert(namedIngredientMentions("Each bottle contains 30 servings.").length === 0, "INGREDIENT: a serving count names no ingredient");
  assert(namedIngredientMentions("The formula contains approximately 15 mg of Example Ingredient.").length > 0, "INGREDIENT: an amount of a named ingredient is still a named ingredient");
  assert(namedIngredientMentions("Each capsule contains 500 mg of Vitamin C.").length > 0, "INGREDIENT: 500 mg of Vitamin C is still a named ingredient");
  assert(namedIngredientMentions("It contains Example Root and Sample Leaf.").length > 0, "INGREDIENT: contains + name unchanged");
  assert(namedIngredientMentions("It contains an Example Root extract.").length > 0, "INGREDIENT: contains an + name unchanged");
  assert(namedIngredientMentions("It contains over 20 botanicals.").length > 0, "INGREDIENT: unmeasured botanical count unchanged");
  const facts = fictional();
  const unsupported = validateGrounding("The formula contains approximately 15 mg of Example Ingredient.", facts);
  assert(unsupported.unsupportedClaims.some((item) => item.severity === "hard"), "GROUNDING: unsupported ingredient amount still requires ingredient evidence");
  const supported = validateGrounding("The formula contains approximately 15 mg of Lemon Balm.", facts);
  assert(!supported.unsupportedClaims.some((item) => item.claimClass === "NAMED_INGREDIENT"), "GROUNDING: named ingredient amount binds to ingredient evidence");

  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projectEvidenceClaims(facts, plan, manifest));
  const usage = slotPlan.slots.find((slot) => slot.type === "USAGE")!;
  const id = propositionsForSlot(usage)[0].propositionId;
  const injected = validateSlotFills(
    [{ slotId: usage.slotId, propositions: [{ propositionIds: [id], wording: "The formula contains approximately 15 mg of Example Ingredient." }] }],
    slotPlan,
    facts,
  );
  assert(injected.some((item) => item.code === "COMPOSITION_PROMOTION" || item.code === "PROPOSITION_BINDING_VIOLATION"), "SLOT: unauthorized ingredient amount in the usage slot is still blocked");
}

// Saved reference facts: the same invariant, no model call.
for (const [label, file, wrapped] of [
  ["AUDIFORT", "data/generic-lp-engine/v1/audifort-classifier-fix-v1/fresh-product-facts.json", true],
  ["PRODENTIM", "data/generic-lp-engine/v1/prodentim-post-isolation-v1/fresh-product-facts.json", true],
  ["JOINT_GENESIS", "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json", false],
] as const) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const facts = applyGenericFaqRecovery((wrapped ? raw.facts : raw) as ProductFacts);
  const result = verbatimRoundTrip(facts);
  report(label, result);
  assert(result.failures.length === 0, `ROUNDTRIP ${label}: ${result.checked} verbatim authorized propositions pass (${result.failures.length} rejected)`);
}

// Language: addresses are identifiers; real Portuguese prose still fails.
function portugueseStatus(body: string): string {
  const findings = lintCampaign({
    id: 0,
    name: NAME,
    slug: "roundtrip-language",
    headline: NAME,
    body,
    ctaLabel: "Learn More",
    affiliateUrl: VALIDATION_SAFE_AFFILIATE,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  }).findings;
  return findings.find((item) => item.ruleId === "lang.portuguese")?.status ?? "missing";
}
for (const body of [
  "Refuse the package and immediately notify example.com of the date it was refused.",
  "Email support@example.com with your order number.",
  "Read the policy at https://example.com/path before returning.",
  "Visit www.example.com for tracking.",
  "Contact help.example.com.br or shop.example.co.uk for updates.",
]) {
  assert(portugueseStatus(body) === "pass", `LANGUAGE: address is not Portuguese: "${body}"`);
}
for (const body of ["Tome uma dose com água todos os dias.", "Envie o pacote com o recibo.", "Você recebe o pedido em casa.", "Mais informações aqui."]) {
  assert(portugueseStatus(body) === "fail", `LANGUAGE: real Portuguese still fails: "${body}"`);
}
assert(withoutAddressSpans("notify example.com today") === "notify   today", "LANGUAGE: address span is blanked before token analysis");

// Saved Audifort generation: legitimate model errors stay blocked (no model call).
{
  const raw = JSON.parse(readFileSync("data/generic-lp-engine/v1/audifort-classifier-fix-v1/fresh-product-facts.json", "utf8"));
  const facts = applyGenericFaqRecovery(raw.facts as ProductFacts);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projectEvidenceClaims(facts, plan, manifest));
  const saved = JSON.parse(readFileSync("data/generic-lp-engine/v1/audifort-final-generation-v1/generation-raw.json", "utf8")) as {
    fills: Array<{ slotId: string; propositions?: Array<{ wording: string }> }>;
  };
  const savedWording = (needle: string) =>
    saved.fills.flatMap((fill) => fill.propositions ?? []).map((item) => item.wording).find((wording) => wording.includes(needle))!;
  /** Binds saved model wording to the current proposition with the same source meaning, so evidence-ID shifts do not decide the result. */
  const verdict = (slotType: string, sourceNeedle: string, wording: string) => {
    const slot = slotPlan.slots.find((item) => item.type === slotType && propositionsForSlot(item).some((p) => p.sourceText.includes(sourceNeedle)))!;
    const proposition = propositionsForSlot(slot).find((item) => item.sourceText.includes(sourceNeedle))!;
    const bound = validateSlotFills([{ slotId: slot.slotId, propositions: [{ propositionIds: [proposition.propositionId], wording }] }], slotPlan, facts).filter(
      (item) => item.code !== "MISSING_REQUIRED_SLOT",
    );
    const verbatim = validateSlotFills(
      [{ slotId: slot.slotId, propositions: [{ propositionIds: [proposition.propositionId], wording: proposition.sourceText }] }],
      slotPlan,
      facts,
    ).filter((item) => item.code !== "MISSING_REQUIRED_SLOT");
    return { bound: bound.length, verbatim: verbatim.length };
  };
  const energy = verdict("FEATURE", "Boosts Your Energy", savedWording("Helps boost energy"));
  assert(energy.bound > 0 && energy.verbatim === 0, `MODEL ERROR still blocked: 'Helps boost energy' (verbatim source passes) ${JSON.stringify(energy)}`);
  const cancel = verdict("SHIPPING", "contacts within 24 hours", savedWording("You can cancel your order"));
  assert(cancel.bound > 0 && cancel.verbatim === 0, `MODEL ERROR still blocked: cancellation paraphrase (verbatim source passes) ${JSON.stringify(cancel)}`);
  const refund = verdict("SHIPPING", "In the event a customer", savedWording("Audifort does not offer refunds"));
  assert(refund.bound > 0 && refund.verbatim === 0, `MODEL ERROR still blocked: refund-condition paraphrase (verbatim source passes) ${JSON.stringify(refund)}`);
  const usage = validateGrounding("Take one full dropper each day, either under your tongue or dissolved in water or natural juice.", facts);
  assert(usage.unsupportedClaims.some((item) => item.severity === "hard"), "MODEL ERROR still blocked: 'Take one full dropper each day'");
}

if (failures > 0) {
  console.log(`AUTHORIZED VERBATIM ROUND-TRIP V1: ${failures} FAILED`);
  process.exit(1);
}
console.log("ALL AUTHORIZED VERBATIM ROUND-TRIP V1 TESTS PASSED");
