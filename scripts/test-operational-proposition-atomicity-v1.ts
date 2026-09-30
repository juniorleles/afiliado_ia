// npx tsx scripts/test-operational-proposition-atomicity-v1.ts
//
// Operational (returns / shipping) evidence is cited as atomic propositions and
// binding blocks relation transfer between them. Fictional product only.
import {
  emptyProductFacts,
  type ProductFacts,
  type ReturnsInformationFact,
  type ShippingInformationFact,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { createEvidenceSlotPlan, operationalEvidenceBudget, OPERATIONAL_WORDS_PER_FACT } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot, validatePropositionBindings, type AuthorizedProposition } from "../src/lib/ai/authorized-propositions.ts";
import { atomicOperationalSentences } from "../src/lib/ai/operational-relations.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const NAME = "Marrowby Trail Lantern";

function op<K extends string>(statement: string, kind: K, category: "RETURNS" | "SHIPPING") {
  return {
    statement,
    kind,
    provenance: "DIRECT_SOURCE" as const,
    copyEligibility: "YES" as const,
    policyFindings: [],
    sourceUrl: `https://marrowby.example/help/${category.toLowerCase()}`,
    sourcePageCategory: category,
  };
}

const TWO_TIMINGS = "Refunds are processed within 3 business days. Card statements may show the credit after 7 days.";
const SPLIT_CONDITION =
  "We will email you once the refund is issued. It may take a while for the credit to post, depending on your card issuer. The processing time is between 4 and 8 days.";
const SAME_SENTENCE = "Replacement parts ship within 2-4 days depending on your region.";
const ATOMIC_RELATION = "Orders over $50.00 ship free within 3-5 days unless they include oversized items.";
const LEADING_CONDITION = "We start the coverage period from the moment of delivery in case the courier transit time is exceeded.";
const OPTIONAL_DETAIL = "Include a note with your name and order number (optional).";
const RETURN_WINDOW = "Returns are accepted within 30 days of delivery. Refunds go back to the original payment method.";

function lantern(): ProductFacts {
  const facts = emptyProductFacts(NAME, "https://marrowby.example/lantern", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Collapsible Shade"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  facts.returnsInformation = [TWO_TIMINGS, SPLIT_CONDITION, RETURN_WINDOW, LEADING_CONDITION, OPTIONAL_DETAIL].map((text) =>
    op<ReturnsInformationFact["kind"]>(text, "REFUND_MECHANISM", "RETURNS"),
  );
  facts.shippingInformation = [
    op<ShippingInformationFact["kind"]>("Canada: $12.50, 8-12 working days", "DESTINATION", "SHIPPING"),
    op<ShippingInformationFact["kind"]>("Norway: $12.50, 8-12 working days", "DESTINATION", "SHIPPING"),
    op<ShippingInformationFact["kind"]>("Japan: $21.00, 10-14 working days", "DESTINATION", "SHIPPING"),
    op<ShippingInformationFact["kind"]>(SAME_SENTENCE, "DELIVERY_ESTIMATE", "SHIPPING"),
    op<ShippingInformationFact["kind"]>(ATOMIC_RELATION, "OTHER", "SHIPPING"),
  ];
  return facts;
}

const facts = lantern();
const plan = createGenerationPlan(facts);
const slots = createEvidenceSlotPlan(facts, plan).slots;
const returnsSlot = slots.find((slot) => slot.type === "RETURNS");
const shippingSlot = slots.find((slot) => slot.type === "SHIPPING");
if (!returnsSlot || !shippingSlot) throw new Error("operational slots missing");
const returnsProps = propositionsForSlot(returnsSlot);
const shippingProps = propositionsForSlot(shippingSlot);
const find = (props: AuthorizedProposition[], pattern: RegExp) => {
  const hit = props.find((item) => pattern.test(item.sourceText));
  if (!hit) throw new Error(`no proposition for ${pattern}`);
  return hit;
};
const bind = (slot: typeof returnsSlot, ids: string[], wording: string) =>
  validatePropositionBindings({ fill: { slotId: slot.slotId, propositions: [{ propositionIds: ids, wording }] }, slot, slots, plan, productName: NAME });
const transfer = (violations: ReturnType<typeof bind>, type: string) =>
  violations.some((item) => item.reason.startsWith(`RELATION_TRANSFER_${type}`));
/** Relation checks accept the prose; only operational slot isolation (one proposition per wording) blocks it. */
const onlyIsolation = (violations: ReturnType<typeof bind>) =>
  violations.length > 0 && violations.every((item) => item.reason.startsWith("OPERATIONAL_PROPOSITION_COMBINATION"));

// Sentence boundaries.
{
  assert(atomicOperationalSentences("Orders to the U.S. ship in 5 days. Fees start at $4.95 per order.").length === 2, "split: abbreviation and decimal are not boundaries");
  assert(atomicOperationalSentences("We ship fast (e.g. same day). Tracking is emailed.").length === 2, "split: e.g. is not a boundary");
  assert(atomicOperationalSentences("We process it after we get your package...and email you. Tracking follows.").length === 2, "split: ellipsis is not a boundary");
  assert(atomicOperationalSentences("Returns are accepted for 30 days. This excludes opened items.").length === 1, "split: a back-referring sentence stays with its antecedent");
  assert(atomicOperationalSentences("Returns are refunded. It may take 5 days to post.").length === 2, "split: time-taking 'it' stands alone");
}

// 1. Two independent timing sentences: independent identities, parent + order preserved.
{
  const a = find(returnsProps, /processed within 3 business days/);
  const b = find(returnsProps, /after 7 days/);
  assert(a.propositionId !== b.propositionId, "1: each timing sentence has its own proposition id");
  assert(a.evidenceId === b.evidenceId && a.claimId === b.claimId, "1: both keep the parent fact identity");
  assert(a.propositionId.endsWith(":P1") && b.propositionId.endsWith(":P2"), "1: sentence order is preserved in ids");
  assert(/3 business days/.test(a.sourceText) && /7 days/.test(b.sourceText), "1: numbers stay in their own sentence");
  assert(transfer(bind(returnsSlot, [a.propositionId, b.propositionId], "Refunds are processed within 7 days."), "DURATION"), "1: one timing cannot take the other's duration");
  assert(onlyIsolation(bind(returnsSlot, [a.propositionId, b.propositionId], "Refunds are processed within 3 business days, and card statements may show the credit after 7 days.")), "1: combining both keeps each meaning; only slot isolation blocks it");
}

// 2. Duration + separate condition; condition transfer blocked.
{
  const cond = find(returnsProps, /depending on your card issuer/);
  const duration = find(returnsProps, /between 4 and 8 days/);
  assert(cond.propositionId !== duration.propositionId, "2: condition and duration are separate propositions");
  const merged = bind(returnsSlot, [cond.propositionId, duration.propositionId], "Refunds post within 4 to 8 days, depending on your card issuer.");
  assert(transfer(merged, "CONDITION"), "2: condition transfer onto the duration is blocked");
  assert(
    onlyIsolation(bind(returnsSlot, [cond.propositionId, duration.propositionId], "It may take a while for the credit to post, depending on your card issuer. The processing time is between 4 and 8 days.")),
    "2: restating both in one wording keeps relations; only slot isolation blocks it",
  );
  assert(
    bind(returnsSlot, [cond.propositionId], "It may take a while for the credit to post, depending on your card issuer.").length === 0 &&
      bind(returnsSlot, [duration.propositionId], "The processing time is between 4 and 8 days.").length === 0,
    "2: one wording per proposition passes",
  );
  assert(transfer(bind(returnsSlot, [duration.propositionId], "Refunds post within 4 to 8 days, depending on your card issuer."), "CONDITION"), "2: citing the duration alone does not authorize the condition");
}

// 3. Condition stated in the same sentence is preserved.
{
  const same = find(shippingProps, /depending on your region/);
  assert(bind(shippingSlot, [same.propositionId], "Replacement parts ship within 2-4 days depending on your region.").length === 0, "3: same-sentence condition passes");
}

// 4. Destination + fee + window; two destinations with the same fee.
{
  const canada = find(shippingProps, /^Canada/);
  const norway = find(shippingProps, /^Norway/);
  const japan = find(shippingProps, /^Japan/);
  const rows = "Canada: $12.50, 8-12 working days Norway: $12.50, 8-12 working days Japan: $21.00, 10-14 working days";
  assert(onlyIsolation(bind(shippingSlot, [canada.propositionId, norway.propositionId, japan.propositionId], rows)), "4: unpunctuated rows bind row by row; only slot isolation blocks the combination");
  assert(onlyIsolation(bind(shippingSlot, [canada.propositionId, norway.propositionId], "Canada and Norway: $12.50, 8-12 working days")), "4: shared fee and window keep relations; only slot isolation blocks the combination");
  assert(bind(shippingSlot, [canada.propositionId], "Canada: $12.50, 8-12 working days").length === 0, "4: one row per wording passes");
  assert(transfer(bind(shippingSlot, [canada.propositionId, japan.propositionId], "Canada: $21.00, 8-12 working days"), "FEE"), "4: fee transfer between rows is blocked");
  assert(transfer(bind(shippingSlot, [canada.propositionId, japan.propositionId], "Japan: $21.00, 8-12 working days"), "DURATION"), "4: window transfer between rows is blocked");
  assert(transfer(bind(shippingSlot, [canada.propositionId, japan.propositionId], "Canada and Japan: $12.50, 8-12 working days"), "DESTINATION"), "4: destination transfer is blocked");
  const grounding = validateGrounding(rows, facts).unsupportedClaims.filter((item) => item.severity === "hard" && /price claim/.test(item.reason));
  assert(grounding.length === 0, "4: grounding shipping-row binding unchanged");
  assert(validateGrounding("Canada: $21.00, 8-12 working days", facts).unsupportedClaims.some((item) => /price claim/.test(item.reason)), "4: grounding still blocks a moved fee");
}

// 5. Duration transfer onto another proposition's subject.
{
  const window = find(returnsProps, /within 30 days of delivery/);
  const refundTo = find(returnsProps, /original payment method/);
  assert(transfer(bind(returnsSlot, [window.propositionId, refundTo.propositionId], "Refunds go back to the original payment method within 30 days."), "DURATION"), "5: duration transfer is blocked");
  assert(onlyIsolation(bind(returnsSlot, [window.propositionId, refundTo.propositionId], "Returns are accepted within 30 days of delivery, and refunds go back to the original payment method.")), "5: faithful combination keeps relations; only slot isolation blocks it");
}

// 6. A genuine multi-clause atomic relation is preserved.
{
  const atomic = find(shippingProps, /oversized items/);
  assert(atomicOperationalSentences(ATOMIC_RELATION).length === 1, "6: one-sentence relation is not split");
  assert(bind(shippingSlot, [atomic.propositionId], "Orders over $50.00 ship free within 3-5 days unless they include oversized items.").length === 0, "6: fee + window + exception restated together passes");
  const other = find(shippingProps, /^Canada/);
  assert(transfer(bind(shippingSlot, [atomic.propositionId, other.propositionId], "Canada orders ship within 8-12 working days unless they include oversized items."), "EXCEPTION"), "6: exception transfer onto another row is blocked");
}

// 8. Sentence-initial conditions: stated ones pass, invented ones stay blocked.
{
  const leading = find(returnsProps, /courier transit time/);
  assert(
    bind(returnsSlot, [leading.propositionId], "If the courier transit time is exceeded, the coverage period starts from the delivery date.").length === 0,
    "8: a leading condition stated in the proposition passes",
  );
  const optional = find(returnsProps, /order number \(optional\)/);
  assert(transfer(bind(returnsSlot, [optional.propositionId], "Include a note with your name and order number if available."), "CONDITION"), "8: an unstated condition is blocked");
}

// 7. Budget counts atomic facts (fixture demonstrating A).
{
  const threeFacts = "Refunds go to the original card within 3 business days. Store credit is issued instantly. Exchanges ship within 48 hours of receipt.";
  const minimal = "Refunds reach the original card within 3 business days. Store credit is instant. Exchanges ship within 48 hours of receipt.";
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  assert(words(minimal) > OPERATIONAL_WORDS_PER_FACT, "7: a faithful restatement of three facts needs more than one fact's allowance");
  assert(operationalEvidenceBudget([threeFacts]) >= words(minimal), "7: atomic budget fits the faithful restatement");
  assert(operationalEvidenceBudget([threeFacts]) <= words(threeFacts), "7: atomic budget never exceeds the source");
  assert(operationalEvidenceBudget(["We do not cover return shipping costs."]) === 7, "7: sparse single fact stays compact");
  const long = `Please remember that ${"every order placed through our store will be reviewed carefully ".repeat(3)}before it ships.`;
  assert(operationalEvidenceBudget([long]) === OPERATIONAL_WORDS_PER_FACT, "7: one verbose fact still caps at one allowance");
}

console.log("ALL OPERATIONAL PROPOSITION ATOMICITY V1 TESTS PASSED");
