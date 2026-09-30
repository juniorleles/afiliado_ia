// npx tsx scripts/test-model-wording-constraint.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, type EvidenceSlot } from "../src/lib/ai/evidence-slot-plan.ts";
import { validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import {
  checkModelWordingConstraint,
  validateModelWordingConstraint,
  countModelWordingConstraintViolations,
  type ModelWordingForbidden,
} from "../src/lib/ai/model-wording-constraint.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function replayStoredClosingSlot(slots: EvidenceSlot[]): EvidenceSlot[] {
  if (slots.some((slot) => slot.slotId === "S008")) return slots;
  const features = slots.filter((slot) => slot.type === "FEATURE");
  if (features.length === 0) return slots;
  return [
    ...slots,
    {
      slotId: "S008",
      type: "FINAL_THOUGHTS",
      topic: "features",
      allowedEvidenceIds: features.flatMap((slot) => slot.allowedEvidenceIds),
      allowedClaimIds: features.flatMap((slot) => slot.allowedClaimIds),
      evidence: features.flatMap((slot) => slot.evidence),
      maxWords: features.reduce((total, slot) => total + slot.maxWords, 0),
      required: false,
      semanticAuthority: "FEATURE_DESCRIPTION",
      preserveSemanticRelationships: true,
    },
  ];
}

function typesOf(generated: string, support: string): ModelWordingForbidden[] {
  return checkModelWordingConstraint({
    generated,
    support,
    slotId: "T001",
    field: "test",
  }).violations.map((item) => item.violationType);
}

function hasType(generated: string, support: string, type: ModelWordingForbidden): boolean {
  return typesOf(generated, support).includes(type);
}

assert(
  typesOf("Five targeted ingredients.", "The product contains five targeted ingredients.").length === 0,
  "A: SAFE COMPRESSION PASS",
);

assert(
  typesOf(
    "A 60-day return policy is published by the seller.",
    "The seller publishes a 60-day return policy.",
  ).length === 0,
  "B: SAFE GRAMMAR PASS",
);

assert(
  hasType("Ingredient A and Ingredient B work together.", "Contains Ingredient A and Ingredient B.", "NEW_SYNERGY"),
  "C: SYNERGY INVENTION FAIL TYPE=NEW_SYNERGY",
);

assert(
  hasType("Synovial fluid cushions the joints.", "Supports synovial fluid.", "NEW_MECHANISM"),
  "D: MECHANISM INVENTION FAIL TYPE=NEW_MECHANISM",
);

assert(
  hasType("Ideal for people seeking long-term support.", "Designed for steady daily use.", "NEW_AUDIENCE"),
  "E: AUDIENCE INVENTION FAIL TYPE=NEW_AUDIENCE",
);

assert(
  hasType("A simple daily routine.", "Take one capsule daily.", "NEW_EVALUATION"),
  "F: EDITORIAL INVENTION FAIL TYPE=NEW_EVALUATION",
);

assert(
  hasType("No multiple doses are required.", "Take one capsule daily.", "NEW_USAGE_REQUIREMENT"),
  "G: USAGE EXCLUSIVITY FAIL TYPE=NEW_USAGE_REQUIREMENT",
);

assert(
  typesOf("The seller has a 60-day return policy.", "The seller publishes a 60-day return policy.").length === 0,
  "H: RETURN POLICY SAFE PASS",
);

assert(
  hasType(
    "Buyers can request a refund within 60 days.",
    "The seller publishes a 60-day return policy.",
    "NEW_POLICY_RIGHT",
  ),
  "I: RETURN POLICY STRENGTHENING FAIL TYPE=NEW_POLICY_RIGHT",
);

assert(
  hasType(
    "Buyers have 60 days to evaluate the product.",
    "The seller publishes a 60-day return policy.",
    "NEW_POLICY_RIGHT",
  ),
  "J: RETURN POLICY EVALUATION WINDOW FAIL TYPE=NEW_POLICY_RIGHT",
);

const kTypes = typesOf(
  "An appealing option for people with mobility goals.",
  "Designed around practical mobility goals.",
);
assert(
  kTypes.includes("NEW_AUDIENCE") || kTypes.includes("NEW_EVALUATION"),
  "K: BUYER APPEAL FAIL TYPE=NEW_AUDIENCE or NEW_EVALUATION",
);

assert(
  hasType("A supports B.", "Contains A. Supports B.", "NEW_RELATIONSHIP"),
  "L: CAUSAL RELATION FAIL TYPE=NEW_RELATIONSHIP",
);

assert(
  typesOf("Designed to support X.", "Supports X.").length === 0,
  "M: SAFE HEDGE PASS (designed-to-support of Supports X)",
);

assert(
  typesOf("A simple once-daily routine.", "Provides a simple once-daily routine.").length === 0,
  "N: SOURCE-SUPPORTED EDITORIAL WORD PASS (not a global blacklist)",
);

const f14Support = "The seller publishes a 180-day return policy measured from the order date.";
const f14Generated =
  "The seller offers a 180-day return policy measured from the order date, providing customers with an extended window to evaluate the product and request a refund if needed.";
const f14 = checkModelWordingConstraint({
  generated: f14Generated,
  support: f14Support,
  slotId: "S007",
  field: "guaranteeInformation",
});
assert(f14.violations.length > 0, "F14: MODEL_WORDING_CONSTRAINT_VIOLATION present");
assert(
  f14.violations.some((item) => item.violationType === "NEW_POLICY_RIGHT"),
  "F14: POLICY_RIGHT_EXPANSION=BLOCKED TYPE=NEW_POLICY_RIGHT",
);
assert(f14.untraceablePropositions.length > 0, "F14: UNTRACEABLE_PROPOSITIONS>0");
console.log("F14_CAUGHT=YES");
console.log("F14_TYPE=" + f14.violations.map((item) => item.violationType).join(","));
console.log(
  "F14_DIAGNOSTIC=" +
    f14.violations
      .map((item) => `${item.slotId}/${item.violationType}/${item.generatedProposition.slice(0, 80)}`)
      .join(" | "),
);

const storedFacts = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
    "utf8",
  ),
) as ProductFacts;
const recovered = applyGenericFaqRecovery(storedFacts);
const plan = createGenerationPlan(recovered);
const manifest = buildGenerationFactManifest(recovered);
const projection = projectEvidenceClaims(recovered, plan, manifest);
const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
const storedRaw = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/web-anatomy-lab/v1/slot-projection-isolation/generation-raw.json"),
    "utf8",
  ),
) as { fills: SlotFill[] };

const expansionChecks: Array<{ id: string; slotId: string; probe: (generated: string, types: string[]) => boolean }> = [
  { id: "F01", slotId: "S002", probe: (_g, types) => types.includes("NEW_MECHANISM") },
  { id: "F03", slotId: "S003", probe: (g, types) => /work together/i.test(g) && types.includes("NEW_SYNERGY") },
  { id: "F04", slotId: "S003", probe: (g, types) => /plays a key role|cushioning/i.test(g) && types.length > 0 },
  { id: "F05", slotId: "S003", probe: (g, types) => /aims to/i.test(g) && types.includes("NEW_PURPOSE") },
  { id: "F06", slotId: "S003", probe: (g, types) => /those seeking|strategy/i.test(g) && (types.includes("NEW_AUDIENCE") || types.includes("NEW_EVALUATION") || types.includes("NEW_TIMELINE")) },
  { id: "F07", slotId: "S004", probe: (_g, types) => types.includes("NEW_EVALUATION") },
  { id: "F09", slotId: "S004", probe: (g, types) => /users looking|pathway|appealing/i.test(g) && (types.includes("NEW_AUDIENCE") || types.includes("NEW_EVALUATION")) },
  { id: "F11", slotId: "S005", probe: (_g, types) => types.includes("NEW_EVALUATION") || types.includes("NEW_COMPARISON") },
  { id: "F12", slotId: "S006", probe: (_g, types) => types.includes("NEW_EVALUATION") },
  { id: "F13", slotId: "S006", probe: (_g, types) => types.includes("NEW_USAGE_REQUIREMENT") || types.includes("NEW_RECOMMENDATION") },
  { id: "F14", slotId: "S007", probe: (_g, types) => types.includes("NEW_POLICY_RIGHT") },
  { id: "F15", slotId: "S008", probe: (_g, types) => types.includes("NEW_AUDIENCE") || types.includes("NEW_TIMELINE") || types.includes("NEW_EVALUATION") },
  { id: "F16", slotId: "FAQ002", probe: (_g, types) => types.includes("NEW_EVALUATION") },
];

const byFill = new Map(storedRaw.fills.map((fill) => [fill.slotId, fill]));
const slotResult = new Map<string, ReturnType<typeof validateModelWordingConstraint>>();
for (const slot of replayStoredClosingSlot(slotPlan.slots)) {
  const fill = byFill.get(slot.slotId);
  if (!fill) continue;
  const generated =
    slot.type === "FAQ" ? `${fill.question || ""} ${fill.answer || ""}`.trim() : (fill.content || "").trim();
  slotResult.set(slot.slotId, validateModelWordingConstraint({ generated, slot }));
}

const caught: string[] = [];
const missed: string[] = [];
for (const check of expansionChecks) {
  const result = slotResult.get(check.slotId);
  const fill = byFill.get(check.slotId);
  const generated =
    fill && (fill.question || fill.answer)
      ? `${fill.question || ""} ${fill.answer || ""}`.trim()
      : fill?.content || "";
  const types = result?.violations.map((item) => item.violationType) || [];
  if (result && result.violations.length > 0 && check.probe(generated, types)) caught.push(check.id);
  else missed.push(check.id);
}

const expectedSlots = new Set([...expansionChecks.map((item) => item.slotId), "FAQ001"]);
const extra: string[] = [];
for (const [slotId, result] of slotResult) {
  if (result.violations.length > 0 && !expectedSlots.has(slotId)) {
    extra.push(`${slotId}:${result.violations.map((item) => item.violationType).join(",")}`);
  }
}

const f14Slot = slotPlan.slots.find((slot) => slot.slotId === "S007");
const f14Fill = byFill.get("S007");
assert(Boolean(f14Slot && f14Fill), "stored C1 has S007");
const f14Stored = validateModelWordingConstraint({
  generated: f14Fill!.content || "",
  slot: f14Slot!,
});
assert(
  f14Stored.violations.some((item) => item.violationType === "NEW_POLICY_RIGHT"),
  "stored C1 F14_CAUGHT=YES",
);

assert(!missed.includes("F14"), "F14 not in MISSED_EXPANSIONS");

const faq003 = slotPlan.slots.find((slot) => slot.slotId === "FAQ003");
const faq004 = slotPlan.slots.find((slot) => slot.slotId === "FAQ004");
if (faq003 && byFill.get("FAQ003")) {
  const result = validateModelWordingConstraint({
    generated: `${byFill.get("FAQ003")!.question || ""} ${byFill.get("FAQ003")!.answer || ""}`.trim(),
    slot: faq003,
  });
  assert(
    !result.violations.some((item) => item.violationType === "NEW_USAGE_REQUIREMENT" && /how do i take/i.test(item.generatedProposition)),
    "FAQ003 usage question is not a wording-constraint usage exclusivity hit",
  );
}
if (faq004 && byFill.get("FAQ004")) {
  const result = validateModelWordingConstraint({
    generated: `${byFill.get("FAQ004")!.question || ""} ${byFill.get("FAQ004")!.answer || ""}`.trim(),
    slot: faq004,
  });
  assert(result.violations.length === 0, "FAQ004 conservative return-policy Q/A is not a wording-constraint hit");
}

const helpFp = typesOf(
  "Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients designed to help maintain healthy synovial fluid and joint function.",
  "See how Joint Genesis supports lubrication, flexibility and comfortable movement with five targeted ingredients",
);
assert(!helpFp.includes("NEW_CAUSALITY"), "F02 help/support is not newly classified as NEW_CAUSALITY");

const mobilityFp = typesOf(
  "practical mobility goals",
  "practical goals such as bending, walking, exercising and handling daily tasks",
);
assert(mobilityFp.length === 0, "F08 practical mobility/goals is not a wording-constraint hit");

const directionsFp = typesOf(
  "supports joint health from several complementary directions",
  "The ingredients also give the formula broader support through antioxidants, botanical inflammatory-response compounds and enhanced nutrient absorption. Together, those features create a multi-angle daily formula.",
);
assert(directionsFp.length === 0, "F10 complementary directions is not a wording-constraint hit");

const structural = validateSlotFills(storedRaw.fills, slotPlan, recovered);
assert(plan.generationRoute === "MODEL", "stored C1 remains MODEL");
assert(countModelWordingConstraintViolations(structural) > 0, "stored fills produce MODEL_WORDING_CONSTRAINT_VIOLATION via validateSlotFills");
assert(
  !structural.some((item) => item.code === "USAGE_PROMOTION" && /\bdirections\b/i.test(item.text)),
  "F10 complementary directions is not USAGE_PROMOTION",
);

console.log("C1_STORED_TRUE_EXPANSIONS=" + expansionChecks.length);
console.log("C1_STORED_EXPANSIONS_CAUGHT=" + caught.length);
console.log("C1_STORED_EXPANSIONS_MISSED=" + missed.length);
console.log("C1_STORED_FALSE_POSITIVES=" + extra.length);
console.log("MISSED_EXPANSIONS=" + (missed.join("; ") || "none"));
console.log("CAUGHT=" + caught.join(" | "));
console.log("EXTRA=" + (extra.join("; ") || "none"));
assert(caught.length >= 11, "TRUE_EXPANSION_DETECTION catches the majority of stored expansions");
assert(!missed.includes("F14"), "mandatory F14 slot is caught");

const thinFacts = emptyProductFacts("Thin Product", "https://example.test/thin", "IMPORTED");
thinFacts.description = "A daily moisturizer for dry skin.";
thinFacts.confidence.description = "DIRECT_SOURCE";
thinFacts.features = ["Absorbs quickly without a greasy finish."];
thinFacts.confidence.features = "DIRECT_SOURCE";
thinFacts.confidence.ingredientsOrComponents = "NOT_FOUND";
thinFacts.confidence.usageInformation = "NOT_FOUND";
thinFacts.confidence.cautions = "NOT_FOUND";
thinFacts.confidence.pricingInformation = "NOT_FOUND";
thinFacts.confidence.guaranteeInformation = "NOT_FOUND";
thinFacts.confidence.manufacturer = "NOT_FOUND";
thinFacts.importQuality = "PARTIAL";
const thinPlan = createGenerationPlan(thinFacts);
const thinManifest = buildGenerationFactManifest(thinFacts);
const thinProjection = projectEvidenceClaims(thinFacts, thinPlan, thinManifest);
const thinSlots = createEvidenceSlotPlan(thinFacts, thinPlan, thinManifest, thinProjection);
assert(thinPlan.generationRoute === "DETERMINISTIC_THIN", "THIN sample stays DETERMINISTIC_THIN");
const thinFills: SlotFill[] = thinSlots.slots.map((slot) => ({
  slotId: slot.slotId,
  content: slot.type === "FAQ" ? undefined : slot.evidence.map((item) => item.value).join(" "),
  question: slot.type === "FAQ" ? "What does Thin Product focus on?" : undefined,
  answer: slot.type === "FAQ" ? slot.evidence.map((item) => item.value).join(" ") : undefined,
}));
const thinViolations = validateSlotFills(thinFills, thinSlots, thinFacts);
assert(
  countModelWordingConstraintViolations(thinViolations) === 0,
  "MODEL_WORDING_CONSTRAINT_V1 does not run on THIN",
);

console.log("GENERIC_TESTS=PASS");
console.log("F14_CAUGHT=YES");
console.log("TRUE_EXPANSION_DETECTION=PASS");
console.log("THIN_UNCHANGED=YES");
console.log("Todos os testes de model wording constraint passaram.");
