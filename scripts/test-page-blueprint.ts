// npx tsx scripts/test-page-blueprint.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { labContractInput, labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import { applyCopyIntelligence } from "../src/lib/page-blueprint/adapter.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { evaluateEditorialQuality } from "../src/lib/page-blueprint/quality.ts";
import { readableBlueprint } from "../src/lib/page-blueprint/readable.ts";
import { validateBlueprint, validateSalesCopy } from "../src/lib/page-blueprint/validate.ts";
import type { PageBlueprint, SalesCopy } from "../src/lib/page-blueprint/types.ts";
import { EXECUTION_50D_CRITERIA, REQUIRED_EVIDENCE_FILES } from "../src/lib/quality-gate/criteria.ts";
import { diskFreeGb } from "../src/lib/quality-gate/disk.ts";
import { fileHash, safeEditorAvailability } from "../src/lib/quality-gate/fix.ts";
import { runSupervisor } from "../src/lib/quality-gate/supervisor.ts";
import { reviewVisualOptional } from "../src/lib/quality-gate/visual.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const ROOT = process.cwd();
const EVIDENCE = path.join("data", "evidence", "execution-50f-sales-copy-blueprint");
const free = diskFreeGb();
assert(Number.isFinite(free) && free >= 5, `C: has ${free} GB free`);

const protectedFiles = [
  "src/lib/product-assets/authorization.ts",
  "src/app/p/[slug]/page.tsx",
  "src/lib/product-contract/build.ts",
  "src/lib/conversion-strategy/build.ts",
];
const beforeProtect = Object.fromEntries(protectedFiles.map((rel) => [rel, fileHash(path.join(ROOT, rel))]));

mkdirSync(path.join(ROOT, EVIDENCE), { recursive: true });
const keys = labScenarioKeys();
assert(keys.join(",") === "s1,s2,s3,s4,s5,s6", "six positional scenarios");

const rows = keys.map((key) => {
  const index = Number(key.slice(1)) - 1;
  const enriched = enrichProduct({
    scenarioKey: key,
    contractInput: labContractInput(index),
    sources: labSources(key),
  });
  const built = buildPageBlueprint({ contract: enriched.afterContract, brief: enriched.afterBrief });
  const copyCheck = validateSalesCopy(built.copy, enriched.afterContract, enriched.afterBrief);
  const blueCheck = validateBlueprint(built.blueprint, enriched.afterContract, enriched.afterBrief);
  const quality = evaluateEditorialQuality({
    copy: built.copy,
    blueprint: built.blueprint,
    contract: enriched.afterContract,
    brief: enriched.afterBrief,
  });
  assert(copyCheck.ok, `${key} copy grounds (${copyCheck.violations.map((v) => v.message).join("; ")})`);
  assert(blueCheck.ok, `${key} blueprint grounds (${blueCheck.violations.map((v) => v.message).join("; ")})`);
  assert(quality.blocking.length === 0, `${key} has no blocking editorial issues`);
  assert(built.copy.producer === "DETERMINISTIC_OFFLINE", `${key} producer is deterministic`);
  assert(built.blueprint.publication.approval === "REQUIRED", `${key} publication stays required`);
  assert(!/clinically proven|testimonial|limited time|erases wrinkles/i.test(JSON.stringify(built.copy)), `${key} has no invented claims`);
  if (enriched.afterBrief.ctaStrategy.action === "NONE") {
    assert(built.copy.cta.action === "NONE" && !built.copy.cta.href, `${key} blocked CTA has no hop`);
  } else {
    assert(built.copy.cta.action === "AUTHORIZED_HOP" && built.copy.cta.href === enriched.afterContract.cta.href, `${key} authorized CTA matches`);
  }
  const dir = path.join(ROOT, EVIDENCE, key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "sales-copy.json"), JSON.stringify(built.copy, null, 2));
  writeFileSync(path.join(dir, "page-blueprint.json"), JSON.stringify(built.blueprint, null, 2));
  writeFileSync(path.join(dir, "editorial-quality.json"), JSON.stringify(quality, null, 2));
  writeFileSync(path.join(dir, "grounding-report.json"), JSON.stringify({ copy: copyCheck, blueprint: blueCheck }, null, 2));
  return { key, enriched, ...built, quality, sections: built.blueprint.sections.map((item) => item.sectionType) };
});

const [s1, s2, s3, s4, s5, s6] = rows;
assert(s1.sections[0] === "hero" && s1.sections[s1.sections.length - 1] === "legal", "s1 opens with hero and closes with legal");
assert(s1.sections.includes("offers") && s3.sections.includes("offers"), "complete products with packages plan offers");
assert(s4.sections.length < s1.sections.length, "thin accessory stays more compact than the complete supplement");
assert(s4.sections.includes("differentiators"), "enriched accessory includes differentiators");
assert(!s4.sections.includes("offers"), "accessory without packages omits offers");
assert(s2.copy.cta.action === "AUTHORIZED_HOP" && s2.copy.offerMicrocopy.length >= 2, "s2 copy presents documented packages");
assert(s2.blueprint.conversionGoal === "SEND_TO_OFFER", "s2 blueprint follows the offer goal");
assert(s6.copy.cta.action === "NONE", "s6 has no commercial CTA");
assert(s5.blueprint.images.hero === undefined, "s5 blueprint has no authorized image");
assert(s1.blueprint.narrative.shape !== s4.blueprint.narrative.shape || s1.sections.join() !== s4.sections.join(), "narratives differ when the data differ");
assert(s1.copy.headline.text !== s3.copy.headline.text, "headlines follow the product facts, not a shared template body");

const rejected = applyCopyIntelligence(s1.copy, s1.enriched.afterContract, s1.enriched.afterBrief, () => ({
  introduction: "Clinically proven to restore enamel in 7 days",
}));
assert(rejected.introduction.text === s1.copy.introduction.text, "invalid adapter patch is discarded");

const engine = [
  "src/lib/page-blueprint/copy.ts",
  "src/lib/page-blueprint/blueprint.ts",
  "src/lib/page-blueprint/validate.ts",
  "src/lib/page-blueprint/quality.ts",
];
for (const file of engine) {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  assert(!/aldermoor|prodentim|neuroprime|pellucid|quillon|harlow|tessel|brindle/i.test(text), `${file} has no product-name branches`);
}

writeFileSync(path.join(ROOT, EVIDENCE, "s1-supplement.md"), readableBlueprint(s1.copy, s1.blueprint));
writeFileSync(path.join(ROOT, EVIDENCE, "s3-electronic.md"), readableBlueprint(s3.copy, s3.blueprint));

const comparison = {
  scenarios: rows.map((row) => ({
    key: row.key,
    goal: row.blueprint.conversionGoal,
    status: row.blueprint.strategyStatus,
    density: row.blueprint.narrative.density,
    shape: row.blueprint.narrative.shape,
    sections: row.sections,
    cta: row.copy.cta.action,
    packages: row.copy.offerMicrocopy.length,
    editorialBlocking: row.quality.blocking.length,
    editorialMajor: row.quality.major.length,
    producer: row.copy.producer,
  })),
};
writeFileSync(path.join(ROOT, EVIDENCE, "comparison.json"), JSON.stringify(comparison, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "files-changed.json"), JSON.stringify({
  added: [
    "src/lib/page-blueprint/types.ts",
    "src/lib/page-blueprint/copy.ts",
    "src/lib/page-blueprint/blueprint.ts",
    "src/lib/page-blueprint/validate.ts",
    "src/lib/page-blueprint/quality.ts",
    "src/lib/page-blueprint/adapter.ts",
    "src/lib/page-blueprint/readable.ts",
    "src/lib/page-blueprint/index.ts",
    "scripts/test-page-blueprint.ts",
  ],
  qualityGate: ["src/lib/quality-gate/types.ts", "src/lib/quality-gate/gates.ts"],
}, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "disk.json"), JSON.stringify({ freeGb: free }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "index.json"), JSON.stringify({ execution: "50f", scenarios: keys }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "attempts.json"), JSON.stringify([]));
writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({ pending: true }, null, 2));

assert(reviewVisualOptional().state === "NOT_EVALUATED", "visual review stays NOT_EVALUATED");
assert(safeEditorAvailability().autonomousAiEditing === false, "fix agent is not a general editor");

async function runGate() {
  const gate = await runSupervisor({
    executionId: "execution-50f",
    criteria: { ...EXECUTION_50D_CRITERIA, executionId: "execution-50f" },
    evidenceDir: path.join(EVIDENCE, "quality-gate"),
    autoFix: false,
    targets: [
      { kind: "conversion-briefs" },
      { kind: "evidence-files", directory: EVIDENCE.replace(/\\/g, "/"), required: [...REQUIRED_EVIDENCE_FILES] },
    ],
  });
  const editorialBlocking = rows.flatMap((row) => row.quality.blocking);
  gate.gates.EDITORIAL_QUALITY_GATE = {
    id: "EDITORIAL_QUALITY_GATE",
    verdict: editorialBlocking.length ? "FAIL" : "PASS",
    reasons: editorialBlocking.map((item) => item.message),
  };
  assert(gate.gates.TECHNICAL_GATE.verdict === "PASS", "TECHNICAL_GATE pass");
  assert(gate.gates.CONTENT_GROUNDING_GATE.verdict === "PASS", "CONTENT_GROUNDING_GATE pass");
  assert(gate.gates.COMMERCIAL_AUTHORIZATION_GATE.verdict === "PASS", "COMMERCIAL_AUTHORIZATION_GATE pass");
  assert(gate.gates.EDITORIAL_QUALITY_GATE.verdict === "PASS", "EDITORIAL_QUALITY_GATE pass");
  assert(gate.gates.VISUAL_REVIEW_GATE.verdict === "NOT_EVALUATED", "VISUAL_REVIEW_GATE not evaluated");
  assert(gate.gates.HUMAN_APPROVAL_GATE.verdict === "REQUIRED", "HUMAN_APPROVAL_GATE required");
  assert(gate.attempts.length === 0, "fix agent was not used");
  writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify(gate, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify(gate.gates, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify(gate.defects, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "attempts.json"), JSON.stringify(gate.attempts, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({ status: gate.status, visualReview: gate.visualReview, humanApproval: gate.humanApproval }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "test-results.json"), JSON.stringify({ ok: true, passed }, null, 2));
  for (const rel of protectedFiles) {
    assert(fileHash(path.join(ROOT, rel)) === beforeProtect[rel], `${rel} was not modified`);
  }
  console.log("PAGE_BLUEPRINT_OK");
  console.log(`OK_COUNT=${passed}`);
}

runGate().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
