// npx tsx scripts/test-conversion-strategy.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { applyEditorialIntelligence, offlineEditorialAdapter } from "../src/lib/conversion-strategy/editorial.ts";
import { validateConversionBrief } from "../src/lib/conversion-strategy/validate.ts";
import type { ConversionBrief } from "../src/lib/conversion-strategy/types.ts";
import { buildLabContract, labScenarioKeys } from "../src/lib/design-system/scenarios.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const EVIDENCE = path.join("data", "evidence", "execution-50c-conversion-strategy");
const keys = labScenarioKeys();
assert(keys.length === 6, "six scenarios");

const briefs = keys.map((key) => {
  const contract = buildLabContract(key)!;
  const brief = applyEditorialIntelligence(buildConversionBrief(contract), contract, offlineEditorialAdapter());
  const check = validateConversionBrief(brief, contract);
  assert(check.ok, `${key} brief validates (${check.violations.map((v) => v.message).join("; ")})`);
  return { key, contract, brief };
});

const again = buildConversionBrief(briefs[0].contract);
assert(JSON.stringify(again) === JSON.stringify(briefs[0].brief), "output is deterministic");
assert(JSON.parse(JSON.stringify(briefs[0].brief)).briefVersion === 1, "output is serializable");

for (const { key, contract, brief } of briefs) {
  assert(brief.publication.approval === "REQUIRED", `${key} publication stays required`);
  assert(brief.productIdentity.productName === contract.identity.productName, `${key} identity matches`);
  assert(brief.packagePresentation.length === (contract.offer?.packages.length ?? 0), `${key} no invented packages`);
  assert(brief.benefitCandidates.length === (contract.benefits?.length ?? 0), `${key} no invented benefits`);
  assert(!brief.sectionPlan.some((item) => /review|testimonial|rating/i.test(item.type)), `${key} no review section`);
  if (contract.cta.state !== "AUTHORIZED" || contract.gates.link !== "PASS") {
    assert(brief.ctaStrategy.action === "NONE" && !brief.ctaStrategy.href, `${key} blocked CTA has no hop`);
  } else {
    assert(brief.ctaStrategy.action === "AUTHORIZED_HOP" && brief.ctaStrategy.href === contract.cta.href, `${key} authorized CTA matches`);
  }
  if (!contract.images?.hero) {
    assert(brief.visualPriorities.some((item) => /authorized/i.test(item.need)), `${key} records the missing image`);
    assert(!brief.sectionPlan.find((item) => item.type === "demonstration")?.include, `${key} omits demonstration without an image`);
  }
  if (!contract.offer?.packages.length) {
    assert(brief.offerStrategy.mode !== "PACKAGES", `${key} does not invent an offer`);
    assert(!brief.sectionPlan.find((item) => item.type === "offers")?.include, `${key} omits offers without packages`);
  }
  assert(brief.sectionPlan.filter((item) => item.include).every((item) => item.available.length > 0 || item.type === "hero" || item.type === "legal"), `${key} included sections have data`);
  const included = brief.sectionPlan.filter((item) => item.include).map((item) => item.type);
  assert(included[0] === "hero", `${key} opens with hero`);
  assert(included[included.length - 1] === "legal", `${key} closes with legal`);
  if (brief.offerStrategy.mode === "PACKAGES" && contract.images?.hero) {
    const types = included.filter((type) => type === "offers" || type === "differentiators");
    assert(types[0] === "offers", `${key} with image+offer leads the commercial block with offers`);
  }
  for (const claim of brief.objections) {
    assert(claim.class === "HYPOTHESIS" && claim.restriction === "INTERNAL_ONLY", `${key} objections stay hypotheses`);
  }
  assert(brief.audienceHypothesis.class === "HYPOTHESIS", `${key} audience is a hypothesis`);
  assert(brief.missingEvidence.every((item) => item.restriction === "INTERNAL_ONLY"), `${key} missing evidence is internal`);
}

assert(briefs[0].brief.status === "READY", "complete supplement can be READY");
assert(briefs[2].brief.status === "READY", "electronic with specs can be READY");
assert(briefs[1].brief.status === "PARTIAL", "partial cosmetic is PARTIAL");
assert(briefs[3].brief.status === "PARTIAL" || briefs[3].brief.status === "INSUFFICIENT_DATA", "short accessory is not READY");
assert(briefs[4].brief.status === "PARTIAL", "no authorized image is PARTIAL");
assert(briefs[5].brief.status === "PARTIAL" || briefs[5].brief.status === "INSUFFICIENT_DATA", "incomplete offer is not READY");
assert(briefs[0].brief.conversionGoal === "SEND_TO_OFFER", "s1 goal is the offer");
assert(briefs[5].brief.conversionGoal === "INFORM", "s6 goal is inform");
assert(briefs[0].brief.trafficIntent !== briefs[3].brief.trafficIntent, "intent differs when data differs");
assert(briefs[0].brief.creativeBrief.narrativeShape !== briefs[3].brief.creativeBrief.narrativeShape, "narrative shape follows data, not a product name");

const srcFiles = [
  "src/lib/conversion-strategy/build.ts",
  "src/lib/conversion-strategy/types.ts",
  "src/lib/conversion-strategy/validate.ts",
  "src/lib/conversion-strategy/editorial.ts",
];
for (const file of srcFiles) {
  const src = readFileSync(file, "utf8");
  assert(!/neuroprime|joint.?genesis|cholibrium|prodentim/i.test(src), `${file} has no product-specific names`);
  assert(!/if\s*\(\s*(slug|productName|campaignId)/.test(src), `${file} has no name/slug/id branch`);
}

const rejected = applyEditorialIntelligence(briefs[0].brief, briefs[0].contract, () => ({
  audienceHypothesisText: "Clinically proven to boost energy and cure fatigue.",
}));
assert(rejected.audienceHypothesis.text === briefs[0].brief.audienceHypothesis.text, "invalid editorial patch is discarded");

mkdirSync(EVIDENCE, { recursive: true });
const comparison = briefs.map(({ key, brief }) => ({
  key,
  status: brief.status,
  goal: brief.conversionGoal,
  intent: brief.trafficIntent,
  narrative: brief.creativeBrief.narrativeShape,
  packages: brief.packagePresentation.length,
  includedSections: brief.sectionPlan.filter((item) => item.include).map((item) => item.type),
  missing: brief.missingEvidence.filter((item) => item.state !== "PRESENT").map((item) => item.path),
}));
writeFileSync(path.join(EVIDENCE, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n");

for (const { key, brief } of briefs) {
  const dir = path.join(EVIDENCE, key);
  mkdirSync(dir, { recursive: true });
  writeBriefFiles(dir, brief);
}

assert(passed >= 40, `enough checks (${passed})`);
console.log("CONVERSION_STRATEGY_OK");

function writeBriefFiles(dir: string, brief: ConversionBrief) {
  writeFileSync(path.join(dir, "conversion-brief.json"), JSON.stringify(brief, null, 2) + "\n");
  writeFileSync(path.join(dir, "section-plan.json"), JSON.stringify(brief.sectionPlan, null, 2) + "\n");
  writeFileSync(path.join(dir, "missing-evidence.json"), JSON.stringify(brief.missingEvidence, null, 2) + "\n");
}
