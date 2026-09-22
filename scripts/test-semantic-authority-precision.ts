// npx tsx scripts/test-semantic-authority-precision.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, buildGenerationFactManifest, type ProductFacts } from "../src/lib/product-facts.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { createGenerationPlan, hasUsageAuthorityLanguage, USAGE_INSTRUCTION_SOURCE } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { validateSlotFills, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import {
  unauthorizedCausalPredicates,
  validateModelSlotAuthority,
} from "../src/lib/ai/model-slot-authority.ts";
import { semanticClosureViolations } from "../src/lib/ai/semantic-closure.ts";
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

function causalHits(generated: string, support: string): string[] {
  return unauthorizedCausalPredicates(generated, support);
}

function closureTexts(generated: string, support: string): string[] {
  return semanticClosureViolations(generated, support, "FEATURE", true).map((hit) => hit.text);
}

function wordingTypes(generated: string, support: string): ModelWordingForbidden[] {
  return checkModelWordingConstraint({
    generated,
    support,
    slotId: "T001",
    field: "test",
  }).violations.map((item) => item.violationType);
}

const aHits = causalHits("Designed to help support joint mobility.", "Supports joint mobility.");
assert(aHits.length === 0, "A: help support same object PASS");

const bHits = causalHits("Ingredient A helps joint mobility.", "Contains Ingredient A.");
assert(bHits.length > 0, "B: ingredient help is NEW_RELATIONSHIP FAIL");

const cHits = causalHits("Helps repair cartilage.", "Supports mobility.");
assert(cHits.includes("help"), "C: help repair cartilage FAIL");

const dHits = causalHits("Helps cause Y.", "Supports X.");
assert(dHits.includes("help"), "D: help cause Y FAIL");

const maintainOnly = causalHits("Designed to help maintain joint mobility.", "Supports joint mobility.");
assert(maintainOnly.includes("help"), "help maintain is not a global support equivalence");

const eHits = closureTexts("Supports practical mobility goals.", "Supports mobility for practical goals.");
assert(!eHits.some((text) => /practical mobility/i.test(text)), "E: practical mobility goals PASS");
assert(wordingTypes("Supports practical mobility goals.", "Supports mobility for practical goals.").length === 0, "E: wording unchanged PASS");

const fHits = closureTexts("Supports practical weight-loss goals.", "Supports practical goals.");
assert(fHits.some((text) => /practical/i.test(text)), "F: practical weight-loss goals FAIL");

const gHits = closureTexts("Supports pain-free mobility.", "Supports mobility.");
assert(gHits.some((text) => /pain-free/i.test(text)), "G: pain-free mobility FAIL");

const hClosure = closureTexts("Ideal for people with mobility goals.", "Supports mobility goals.");
const hWording = wordingTypes("Ideal for people with mobility goals.", "Supports mobility goals.");
assert(hClosure.length > 0, "H: ideal audience FAIL in semantic closure");
assert(hWording.includes("NEW_AUDIENCE") || hWording.includes("NEW_EVALUATION"), "H: TYPE=NEW_AUDIENCE / NEW_EVALUATION");

const bareMobility = closureTexts("Supports practical mobility goals.", "Supports practical goals.");
assert(bareMobility.some((text) => /practical mobility/i.test(text)), "mobility is not a global insertion");

assert(!hasUsageAuthorityLanguage("several complementary directions"), "I: complementary directions USAGE_PROMOTION=NO");
assert(hasUsageAuthorityLanguage("usage directions"), "J: usage directions USAGE_SEMANTICS=YES");
assert(hasUsageAuthorityLanguage("take as directed"), "K: take as directed USAGE_SEMANTICS=YES");
assert(hasUsageAuthorityLanguage("directions for taking one capsule daily"), "L: directions for taking USAGE_SEMANTICS=YES");
assert(!hasUsageAuthorityLanguage("the analysis considers several directions"), "M: analysis directions USAGE_PROMOTION=NO");
assert(hasUsageAuthorityLanguage("follow the directions on the label"), "N: label directions USAGE_SEMANTICS=YES");
assert(hasUsageAuthorityLanguage("Follow the directions."), "follow the directions remains usage");
assert(hasUsageAuthorityLanguage("Daily directions"), "daily directions remains usage");
assert(!hasUsageAuthorityLanguage("approaches the issue from several directions"), "several directions is not usage");
assert(USAGE_INSTRUCTION_SOURCE.includes("\\bdirections\\b"), "directions stem remains in usage detection");

assert(causalHits("The capsule helps cause relief.", "Supports joint mobility.").includes("help"), "help is not globally safe");

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
const byFill = new Map(storedRaw.fills.map((fill) => [fill.slotId, fill]));

function slotCopy(slotId: string): string {
  const fill = byFill.get(slotId);
  if (!fill) return "";
  if (fill.question || fill.answer) return `${fill.question || ""} ${fill.answer || ""}`.trim();
  return fill.content || "";
}

function slotHits(slotId: string) {
  const slot = slotPlan.slots.find((item) => item.slotId === slotId);
  if (!slot) throw new Error("missing " + slotId);
  return validateModelSlotAuthority({
    copy: slotCopy(slotId),
    slot,
    plan,
    productName: recovered.productName,
  });
}

const s002 = slotHits("S002");
const s003 = slotHits("S003");
const s004 = slotHits("S004");
const s005 = slotHits("S005");
const s008 = slotHits("S008");

assert(
  !s002.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION" && item.text === "help"),
  "stored F02 help stem resolved",
);
assert(
  s002.some((item) => item.code === "SEMANTIC_CLOSURE" && /joint function/i.test(item.text)),
  "stored F02 synovial/joint-function expansion still blocked",
);
assert(
  s003.some((item) => item.code === "UNSUPPORTED_RELATIONAL_EXPANSION" && item.text === "help"),
  "stored help-users sentence remains a relational expansion",
);
assert(
  !s004.some((item) => item.text === "practical mobility") && !s008.some((item) => item.text === "practical mobility"),
  "stored F08 practical mobility resolved",
);
assert(!s005.some((item) => item.code === "USAGE_PROMOTION"), "stored F10 directions USAGE_PROMOTION resolved");

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

const missed: string[] = [];
for (const check of expansionChecks) {
  const slot = slotPlan.slots.find((item) => item.slotId === check.slotId);
  const generated = slotCopy(check.slotId);
  const types = slot
    ? validateModelWordingConstraint({ generated, slot }).violations.map((item) => item.violationType)
    : [];
  if (!check.probe(generated, types)) missed.push(check.id);
}
assert(missed.length === 0, "stored true expansions remain caught: " + (missed.join(",") || "none"));

const structural = validateSlotFills(storedRaw.fills, slotPlan, recovered);
assert(countModelWordingConstraintViolations(structural) > 0, "wording constraint still fail-closed on stored fills");
assert(
  !structural.some((item) => item.code === "USAGE_PROMOTION" && /\bdirections\b/i.test(item.text) && /complementary/i.test(item.text)),
  "stored complementary directions is not USAGE_PROMOTION",
);

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
assert(thinPlan.generationRoute === "DETERMINISTIC_THIN", "DETERMINISTIC_THIN unchanged");

console.log("ANTHROPIC_CALLS=0");
console.log("F02=RESOLVED");
console.log("F08=RESOLVED");
console.log("F10=RESOLVED");
console.log("TRUE_EXPANSIONS=" + expansionChecks.length);
console.log("CAUGHT=" + (expansionChecks.length - missed.length));
console.log("MISSED=" + missed.length);
console.log("SEMANTIC_AUTHORITY_PRECISION_V1=PASS");
