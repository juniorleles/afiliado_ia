// npx tsx scripts/test-optionality-preservation-v1.ts
//
// An item the cited operational proposition marks optional or conditional must
// stay optional in the realization. Fictional product only.
import { emptyProductFacts, type ProductFacts, type ReturnsInformationFact } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot, validatePropositionBindings, type AuthorizedProposition } from "../src/lib/ai/authorized-propositions.ts";
import { droppedOptionality } from "../src/lib/ai/operational-relations.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const NAME = "Quillfen Desk Kettle";

const OPTIONAL_PAREN = "Insert a card with your full name, email, and ticket code (optional) so your parcel can be matched quickly.";
const IF_AVAILABLE = "Attach the original receipt if available.";
const WHEN_AVAILABLE = "Tracking links are emailed when available.";
const WHERE_APPLICABLE = "Return the protective sleeve where applicable.";
const OPTIONAL_PREFIX = "Customers can add an optional gift message to the return form.";
const PLAIN = "Write your order number on the outer box.";

function kettle(): ProductFacts {
  const facts = emptyProductFacts(NAME, "https://quillfen.example/kettle", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Brushed Steel Spout"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  facts.returnsInformation = [OPTIONAL_PAREN, IF_AVAILABLE, WHEN_AVAILABLE, WHERE_APPLICABLE, OPTIONAL_PREFIX, PLAIN].map((statement) => ({
    statement,
    kind: "REFUND_MECHANISM" as ReturnsInformationFact["kind"],
    provenance: "DIRECT_SOURCE" as const,
    copyEligibility: "YES" as const,
    policyFindings: [],
    sourceUrl: "https://quillfen.example/help/returns",
    sourcePageCategory: "RETURNS" as const,
  }));
  return facts;
}

const facts = kettle();
const plan = createGenerationPlan(facts);
const slots = createEvidenceSlotPlan(facts, plan).slots;
const slot = slots.find((item) => item.type === "RETURNS");
if (!slot) throw new Error("returns slot missing");
const props = propositionsForSlot(slot);
const find = (pattern: RegExp): AuthorizedProposition => {
  const hit = props.find((item) => pattern.test(item.sourceText));
  if (!hit) throw new Error(`no proposition for ${pattern}`);
  return hit;
};
const bind = (proposition: AuthorizedProposition, wording: string) =>
  validatePropositionBindings({ fill: { slotId: slot.slotId, propositions: [{ propositionIds: [proposition.propositionId], wording }] }, slot, slots, plan, productName: NAME });
const dropped = (violations: ReturnType<typeof bind>) => violations.some((item) => item.reason.startsWith("OPTIONALITY_DROPPED"));

const paren = find(/ticket code \(optional\)/);
const ifAvailable = find(/receipt if available/);
const whenAvailable = find(/emailed when available/);
const whereApplicable = find(/sleeve where applicable/);
const prefix = find(/optional gift message/);
const plain = find(/order number on the outer box/);

// Positive: optionality removed from a restated item is blocked.
assert(dropped(bind(paren, "Send the parcel back with a card including your full name, email, and ticket code.")), "P1: '(optional)' removed from a listed item");
assert(dropped(bind(ifAvailable, "Attach the original receipt.")), "P2: 'if available' removed");
assert(dropped(bind(whenAvailable, "Tracking links are emailed.")), "P3: 'when available' removed");
assert(dropped(bind(whereApplicable, "Return the protective sleeve.")), "P4: 'where applicable' removed");
assert(dropped(bind(prefix, "Add a gift message to the return form.")), "P5: leading 'optional' removed");
assert(
  droppedOptionality("Include your full name, email, and ticket code.", [OPTIONAL_PAREN]).some((item) => /ticket code/.test(item.item)),
  "P6: the finding names the item that became a requirement",
);

// Negative: optionality kept, item omitted, or source had none.
assert(bind(paren, "Insert a card with your full name, email, and ticket code (optional) so your parcel can be matched quickly.").length === 0, "N1: faithful restatement passes");
assert(!dropped(bind(paren, "Insert a card with your full name and email. The ticket code is optional.")), "N2: optionality restated in its own clause passes");
assert(!dropped(bind(paren, "Insert a card with your full name and email; you may also add the ticket code.")), "N3: permissive modal keeps optionality");
assert(!dropped(bind(paren, "Insert a card with your full name and email.")), "N4: omitting the optional item is allowed");
assert(!dropped(bind(prefix, "Customers can add an optional gift message to the return form.")), "N5: leading 'optional' kept passes");
assert(bind(plain, "Write your order number on the outer box.").length === 0, "N6: required source instruction needs no optional language");
assert(droppedOptionality("Write your order number on the outer box.", [PLAIN]).length === 0, "N7: no optionality in source, nothing required");
assert(
  droppedOptionality("Your parcel can be matched quickly.", [OPTIONAL_PAREN]).length === 0,
  "N8: other parts of the optional sentence are not treated as optional items",
);

console.log("ALL OPTIONALITY PRESERVATION V1 TESTS PASSED");
