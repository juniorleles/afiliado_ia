// npx tsx scripts/test-slot-projection-isolation.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import {
  collectSlotProjectionViolations,
  visibleSemanticTopics,
} from "../src/lib/ai/slot-projection-isolation.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function projected(slotPlan: ReturnType<typeof createEvidenceSlotPlan>, type: string, topic?: string): string {
  return slotPlan.slots
    .filter((slot) => slot.type === type && (!topic || slot.topic === topic))
    .map((slot) => slot.evidence.map((item) => item.value).join(" "))
    .join("\n");
}

function baseFacts(): ProductFacts {
  const facts = emptyProductFacts("Example Product", "https://example.test/example", "IMPORTED");
  facts.description = "Designed for daily convenience.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = ["Supports convenient routines."];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  return facts;
}

function planFor(facts: ProductFacts) {
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  return { plan, manifest, projection, slotPlan };
}

const aFacts = baseFacts();
aFacts.guaranteeInformation = "Returns accepted within 60 days.";
aFacts.confidence.guaranteeInformation = "DIRECT_SOURCE";
const a = planFor(aFacts);
assert(!/60 days|return/i.test(projected(a.slotPlan, "SUMMARY")), "A: DESCRIPTION/SUMMARY does not see guarantee");
assert(!/60 days|return/i.test(projected(a.slotPlan, "OVERVIEW")), "A: OVERVIEW does not see guarantee");
assert(/60 days|return/i.test(projected(a.slotPlan, "GUARANTEE")), "A: GUARANTEE slot retains policy");

const bFacts = baseFacts();
bFacts.features = ["Supports convenient routines and take one capsule each morning."];
bFacts.usageInformation = ["Take one capsule each morning."];
bFacts.confidence.usageInformation = "DIRECT_SOURCE";
const b = planFor(bFacts);
assert(!/take one capsule/i.test(projected(b.slotPlan, "FEATURE")), "B: FEATURE slot does not receive the usage instruction");
assert(/take one capsule/i.test(projected(b.slotPlan, "USAGE")), "B: USAGE slot may receive the instruction");
assert(
  bFacts.features[0] === "Supports convenient routines and take one capsule each morning.",
  "I-partial: raw feature evidence preserved after B",
);

const cFacts = baseFacts();
cFacts.description = "Designed for X and backed by a 90-day return policy.";
cFacts.guaranteeInformation = "90-day return policy.";
cFacts.confidence.guaranteeInformation = "DIRECT_SOURCE";
const c = planFor(cFacts);
assert(!/90-day return policy/i.test(projected(c.slotPlan, "SUMMARY")), "C: DESCRIPTION projection excludes guarantee fragment");
assert(!/90-day return policy/i.test(projected(c.slotPlan, "OVERVIEW")), "C: OVERVIEW excludes guarantee fragment");
assert(/90-day return policy/i.test(projected(c.slotPlan, "GUARANTEE")), "C: GUARANTEE slot retains the policy");
assert(
  cFacts.description === "Designed for X and backed by a 90-day return policy.",
  "I: raw description evidence unchanged",
);

const dFacts = baseFacts();
dFacts.usageInformation = ["Take one capsule daily."];
dFacts.confidence.usageInformation = "DIRECT_SOURCE";
dFacts.guaranteeInformation = "Returns accepted within 60 days.";
dFacts.confidence.guaranteeInformation = "DIRECT_SOURCE";
const d = planFor(dFacts);
const overviewText = projected(d.slotPlan, "OVERVIEW");
assert(Boolean(overviewText), "D: OVERVIEW exists");
assert(!visibleSemanticTopics(overviewText).includes("usage"), "D: OVERVIEW cannot see usage");
assert(!visibleSemanticTopics(overviewText).includes("guarantee"), "D: OVERVIEW cannot see guarantee");

const closingText = projected(d.slotPlan, "FINAL_THOUGHTS");
assert(!visibleSemanticTopics(closingText).includes("usage"), "E: FINAL_THOUGHTS has no usage authority");
assert(!visibleSemanticTopics(closingText).includes("guarantee"), "E: FINAL_THOUGHTS has no guarantee authority");

const fFacts = baseFacts();
fFacts.usageInformation = ["Take one capsule daily."];
fFacts.confidence.usageInformation = "DIRECT_SOURCE";
fFacts.guaranteeInformation = "Returns accepted within 60 days.";
fFacts.confidence.guaranteeInformation = "DIRECT_SOURCE";
fFacts.manufacturer = "The product is manufactured by Company Beta.";
fFacts.confidence.manufacturer = "DIRECT_SOURCE";
fFacts.ingredientsOrComponents = ["IngredientA"];
fFacts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
fFacts.pricingInformation = "$19";
fFacts.confidence.pricingInformation = "DIRECT_SOURCE";
const f = planFor(fFacts);
const identityFaq = projected(f.slotPlan, "FAQ", "description") + " " + projected(f.slotPlan, "HEADLINE");
assert(!/take one capsule/i.test(identityFaq), "F: identity/description FAQ has no usage");
assert(!/60 days|return policy/i.test(identityFaq), "F: identity/description FAQ has no guarantee");
assert(!/company beta/i.test(identityFaq), "F: identity/description FAQ has no manufacturer");
assert(!/ingredienta/i.test(identityFaq), "F: identity/description FAQ has no ingredient");
assert(!/\$19/i.test(identityFaq), "F: identity/description FAQ has no price");

const gFaq = projected(f.slotPlan, "FAQ", "guarantee");
assert(/60 days|return/i.test(gFaq), "G: guarantee FAQ can see guarantee");
assert(!/take one capsule/i.test(gFaq), "G: guarantee FAQ does not automatically see usage");
assert(!/daily convenience/i.test(gFaq), "G: guarantee FAQ does not automatically see description");

const hFaq = projected(f.slotPlan, "FAQ", "usage");
assert(/take one capsule/i.test(hFaq), "H: usage FAQ can see usage");
assert(!/60 days|return/i.test(hFaq), "H: usage FAQ does not see guarantee");

assert(
  fFacts.features[0] === "Supports convenient routines." &&
    fFacts.description === "Designed for daily convenience.",
  "I: raw ProductFacts unchanged after isolation",
);

const closed = projected(d.slotPlan, "SUMMARY") + projected(d.slotPlan, "FEATURE") + projected(d.slotPlan, "OVERVIEW");
assert(!/ingredienta|company beta|\$19|synovial fluid is|cartilage/i.test(closed), "J: closed-or-absent topics stay out of description/feature projection");
assert(d.plan.closedTopics.includes("ingredients"), "J: ingredients remain closed when absent");
assert(d.plan.closedTopics.includes("manufacturer"), "J: manufacturer remains closed when absent");
assert(d.plan.closedTopics.includes("pricing"), "J: pricing remains closed when absent");
assert(d.plan.closedTopics.includes("cautions"), "J: cautions remain closed when absent");
assert(d.plan.closedTopics.includes("background_science"), "J: background science remains closed");

const c1Stored = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
    "utf8",
  ),
) as ProductFacts;
const c1Facts = applyGenericFaqRecovery(c1Stored);
const rawFeatures = JSON.stringify(c1Facts.features);
const c1 = planFor(c1Facts);
const c1Violations = collectSlotProjectionViolations(c1.slotPlan.slots);
assert(c1Violations.length === 0, "C1 pre-model: PRE_MODEL_SLOT_VIOLATIONS=0");
assert(!visibleSemanticTopics(projected(c1.slotPlan, "SUMMARY")).includes("guarantee"), "DESCRIPTION_SEES_GUARANTEE=NO");
assert(!visibleSemanticTopics(projected(c1.slotPlan, "OVERVIEW")).includes("guarantee"), "OVERVIEW_SEES_GUARANTEE=NO");
assert(!visibleSemanticTopics(projected(c1.slotPlan, "FEATURE")).includes("usage"), "FEATURE_SEES_USAGE=NO");
const c1DescFaq = projected(c1.slotPlan, "FAQ", "description");
assert(!visibleSemanticTopics(c1DescFaq).includes("guarantee"), "IDENTITY_FAQ_SEES_GUARANTEE=NO");
assert(visibleSemanticTopics(projected(c1.slotPlan, "USAGE")).includes("usage"), "USAGE_SEES_USAGE=YES");
assert(visibleSemanticTopics(projected(c1.slotPlan, "GUARANTEE")).includes("guarantee"), "GUARANTEE_SEES_GUARANTEE=YES");
assert(JSON.stringify(c1Facts.features) === rawFeatures, "C1 raw features preserved");

console.log("PRE_MODEL_SLOT_VIOLATIONS", c1Violations.length);
for (const slot of c1.slotPlan.slots) {
  console.log(
    `${slot.slotId} FIELD=${slot.topic} AUTH=${slot.topic} VISIBLE=${visibleSemanticTopics(slot.evidence.map((item) => item.value).join(" ")).join(",") || "none"} SRC=${slot.evidence.map((item) => item.value).join(" / ").slice(0, 140)}`,
  );
}
