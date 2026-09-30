// npx tsx scripts/test-proposition-bound-output.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import {
  propositionsForSlot,
  validatePropositionBindings,
  type BoundWording,
} from "../src/lib/ai/authorized-propositions.ts";
import { validateModelWordingConstraint } from "../src/lib/ai/model-wording-constraint.ts";
import { evaluateSlotGeneration, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const facts = applyGenericFaqRecovery(
  JSON.parse(
    readFileSync(path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"), "utf8"),
  ) as ProductFacts,
);
const plan = createGenerationPlan(facts);
const manifest = buildGenerationFactManifest(facts);
const projection = projectEvidenceClaims(facts, plan, manifest);
const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
const s003 = slotPlan.slots.find((slot) => slot.slotId === "S003");
if (!s003) throw new Error("S003 missing");
const propositions = propositionsForSlot(s003);
const byRelation = (relation: string) => propositions.filter((item) => item.relation === relation);
const supports = byRelation("supports");
const described = byRelation("described-with");

assert(propositions.length === 4, "S003 decomposes into four propositions");
assert(supports.map((item) => item.object).join("|") === "lubrication|flexibility|comfortable movement", "support objects stay separate");
assert(described[0]?.object === "five targeted ingredients", "with-phrase is its own proposition");
assert(!propositions.some((item) => /work together/i.test(item.sourceText)), "work together is not an authorized proposition");

const p1 = supports[0]!.propositionId;
const p2 = supports[1]!.propositionId;
const p4 = described[0]!.propositionId;
const other = slotPlan.slots.find((slot) => slot.slotId === "S004");
const otherId = other ? propositionsForSlot(other)[0]?.propositionId : "";

function check(rows: BoundWording[], content?: string) {
  return validatePropositionBindings({
    fill: { slotId: "S003", propositions: rows, content },
    slot: s003!,
    slots: slotPlan.slots,
    plan,
    productName: facts.productName,
  });
}

const a = check([{ propositionIds: [p4], wording: "Five targeted ingredients are included." }]);
assert(a.length === 0, "A included PASS");

const b = check([{ propositionIds: [p4], wording: "The five targeted ingredients work together." }]);
assert(b.some((item) => item.reason.startsWith("UNAUTHORIZED_RELATIONSHIP")), "B work together FAIL");

const c = check([{ propositionIds: [p4], wording: "The five targeted ingredients complement each other." }]);
assert(c.some((item) => item.reason.startsWith("UNAUTHORIZED_RELATIONSHIP")), "C complement FAIL");

const d = check([{ propositionIds: [p4], wording: "The five targeted ingredients enhance one another." }]);
assert(d.some((item) => item.reason.startsWith("UNAUTHORIZED_RELATIONSHIP")), "D enhance FAIL");

const e = check([
  { propositionIds: [p1, p2], wording: "Joint Genesis supports lubrication and flexibility." },
]);
assert(e.length === 0, "E safe combine PASS");

const f = check([
  { propositionIds: [p1, p4], wording: "Five ingredients work together to support lubrication." },
]);
assert(f.some((item) => item.reason.startsWith("UNAUTHORIZED_RELATIONSHIP")), "F unsafe combine FAIL");

const g = check([{ propositionIds: ["F000:C000:P9"], wording: "Joint Genesis supports lubrication." }]);
assert(g.some((item) => item.reason === "UNKNOWN_PROPOSITION_ID"), "G unknown id FAIL");

const h = check([{ propositionIds: [otherId], wording: "Joint Genesis supports lubrication." }]);
assert(h.some((item) => item.reason === "CROSS_SLOT_PROPOSITION"), "H cross-slot id FAIL");

const i = check([], "Joint Genesis supports lubrication with a new clinical trial.");
assert(i.some((item) => item.reason === "UNBOUND_FACTUAL_CONTENT"), "I unbound content FAIL");

const lexical = check([{ propositionIds: [p1], wording: "Joint Genesis supports lubrication." }]);
assert(lexical.length === 0, "lexical paraphrase PASS");
const grammar = check([{ propositionIds: [p1], wording: "Lubrication is supported by Joint Genesis." }]);
assert(grammar.length === 0, "grammatical transformation PASS");
const compression = check([{ propositionIds: [p4], wording: "Five targeted ingredients." }]);
assert(compression.length === 0, "compression PASS");
const reorder = check([{ propositionIds: [p2, p1], wording: "Joint Genesis supports flexibility and lubrication." }]);
assert(reorder.length === 0, "reordering PASS");
const pronoun = check([{ propositionIds: [p1], wording: "It supports lubrication." }]);
assert(pronoun.length === 0, "pronoun resolution PASS");
const hedge = check([{ propositionIds: [p1], wording: "Joint Genesis is designed to support lubrication." }]);
assert(hedge.length === 0, "safe hedging PASS");
const sameObject = check([{ propositionIds: [p1], wording: "Joint Genesis supports lubrication." }]);
assert(sameObject.length === 0, "same-object support PASS");
const identity = check([{ propositionIds: [p4], wording: "Joint Genesis is described with five targeted ingredients." }]);
assert(identity.length === 0, "identity as subject PASS");

const tail = check([
  { propositionIds: [p4], wording: "Five targeted ingredients are included and designed to work together." },
]);
assert(tail.some((item) => item.reason.startsWith("UNAUTHORIZED_RELATIONSHIP")), "free factual tail FAIL");

for (const phrase of [
  "work together",
  "works with",
  "complements",
  "enhances",
  "causes",
  "leads to",
  "results in",
  "repairs",
  "heals",
  "cures",
  "treats",
  "recommended by",
  "manufactured by",
]) {
  const hit = check([{ propositionIds: [p4], wording: `Five targeted ingredients ${phrase} something.` }]);
  assert(hit.some((item) => item.reason.startsWith("UNAUTHORIZED_RELATIONSHIP")), `${phrase} stays blocked`);
}

const explicit = propositionsForSlot(slotPlan.slots.find((slot) => slot.slotId === "S005") || s003);
const together = explicit.find((item) => /together/i.test(item.sourceText));
if (together) {
  const allowed = validatePropositionBindings({
    fill: {
      slotId: together.propositionId.includes("S005") ? "S005" : s003.slotId,
      propositions: [{ propositionIds: [together.propositionId], wording: together.sourceText }],
    },
    slot: slotPlan.slots.find((slot) => propositionsForSlot(slot).some((item) => item.propositionId === together.propositionId)) || s003,
    slots: slotPlan.slots,
    plan,
    productName: facts.productName,
  });
  assert(allowed.length === 0, "explicit source relationship remains allowed");
}

const stored = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/web-anatomy-lab/v1/controlled-rich-replay-v2/generation-raw.json"), "utf8"),
) as { fills: SlotFill[]; ctaLabel: string };
const evaluation = evaluateSlotGeneration(
  { variants: [{ cta: { label: stored.ctaLabel }, slots: stored.fills }] },
  facts,
  facts.productName,
  VALIDATION_SAFE_AFFILIATE,
  slotPlan,
);
const storedS003 = stored.fills.find((fill) => fill.slotId === "S003")?.content || "";
assert(
  evaluation.structuralViolations.some((item) => item.code === "PROPOSITION_BINDING_VIOLATION" && item.reason === "UNBOUND_FACTUAL_CONTENT" && item.text === storedS003),
  "stored S003 proposition binding FAIL",
);
assert(
  validateModelWordingConstraint({ generated: storedS003, slot: s003 }).violations.some((item) => item.violationType === "NEW_SYNERGY"),
  "stored S003 NEW_SYNERGY blocked",
);
assert(plan.generationRoute === "MODEL", "recovered facts stay MODEL");
console.log("ANTHROPIC_CALLS=0");
console.log("PROPOSITION_BOUND_STRUCTURED_OUTPUT_V1=PASS");
