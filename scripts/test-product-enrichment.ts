// npx tsx scripts/test-product-enrichment.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { validateConversionBrief } from "../src/lib/conversion-strategy/validate.ts";
import { labContractInput, labScenarioKeys } from "../src/lib/design-system/scenarios.ts";
import { completenessDelta } from "../src/lib/product-enrichment/completeness.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import type { EnrichmentResult } from "../src/lib/product-enrichment/types.ts";
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
const EVIDENCE = path.join("data", "evidence", "execution-50e-product-enrichment");
const free = diskFreeGb();
assert(Number.isFinite(free) && free >= 5, `C: has ${free} GB free`);

const protectedFiles = [
  "src/lib/product-assets/authorization.ts",
  "src/app/p/[slug]/page.tsx",
  "src/lib/product-contract/build.ts",
  "src/lib/conversion-strategy/build.ts",
];
const beforeProtect = Object.fromEntries(protectedFiles.map((rel) => [rel, fileHash(path.join(ROOT, rel))]));

const keys = labScenarioKeys();
assert(keys.join(",") === "s1,s2,s3,s4,s5,s6", "six positional scenarios");

mkdirSync(path.join(ROOT, EVIDENCE), { recursive: true });
const results: EnrichmentResult[] = [];

for (const key of keys) {
  const index = Number(key.slice(1)) - 1;
  const result = enrichProduct({
    scenarioKey: key,
    contractInput: labContractInput(index),
    sources: labSources(key),
  });
  results.push(result);
  assert(result.afterContract.publication.approval === "REQUIRED", `${key} publication stays required`);
  assert(validateConversionBrief(result.afterBrief, result.afterContract).ok, `${key} enriched brief validates`);
  assert(result.afterBrief.publication.approval === "REQUIRED", `${key} brief stays human-gated`);
  assert(result.provenance.every((item) => item.sourceUrl), `${key} provenance has a source url`);
  assert(!result.afterBrief.benefitCandidates.some((item) => /clinically proven|erases wrinkles|best sound|never needs charging/i.test(item.text)), `${key} no invented benefits`);
  assert(result.visualCandidates.every((item) => item.authorized === false), `${key} page images stay unauthorized`);
  if (result.afterContract.cta.state !== "AUTHORIZED" || result.afterContract.gates.link !== "PASS") {
    assert(result.afterBrief.ctaStrategy.action === "NONE", `${key} blocked hop stays blocked`);
  }
  const dir = path.join(ROOT, EVIDENCE, key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "before.json"), JSON.stringify(briefView(result, "before"), null, 2));
  writeFileSync(path.join(dir, "after.json"), JSON.stringify(briefView(result, "after"), null, 2));
  writeFileSync(path.join(dir, "conversion-brief-before.json"), JSON.stringify(result.beforeBrief, null, 2));
  writeFileSync(path.join(dir, "conversion-brief-after.json"), JSON.stringify(result.afterBrief, null, 2));
  writeFileSync(path.join(dir, "missing-evidence.json"), JSON.stringify(result.stillMissing, null, 2));
  writeFileSync(path.join(dir, "provenance.json"), JSON.stringify(result.provenance, null, 2));
  writeFileSync(path.join(dir, "conflicts.json"), JSON.stringify(result.conflicts, null, 2));
  writeFileSync(path.join(dir, "sources.json"), JSON.stringify(labSources(key).map((item) => ({ url: item.url, pageCategory: item.pageCategory, retrievedAt: item.retrievedAt, recordFields: (item.records ?? []).map((r) => r.field) })), null, 2));
}

const [s1, s2, s3, s4, s5, s6] = results;
assert(s1.conflicts.some((item) => /capsules per bottle/i.test(item.field)), "s1 records the capsule-count conflict");
assert(s1.conflicts[0].kept.includes("60"), "s1 keeps the first stated capsule count");
assert(s1.completenessAfter.specCount > s1.completenessBefore.specCount || s1.completenessAfter.faqCount > s1.completenessBefore.faqCount, "s1 gains a documented spec or FAQ");
assert(s2.completenessBefore.packageCount === 0, "s2 starts without packages");
assert(s2.completenessAfter.packageCount >= 2, "s2 gains documented packages");
assert(s2.afterBrief.conversionGoal === "SEND_TO_OFFER", "s2 brief can send to the offer after packages");
assert(s2.beforeBrief.conversionGoal !== s2.afterBrief.conversionGoal, "s2 conversion goal actually changes");
assert(s2.withheld.some((item) => /wrinkles/i.test(item.text)), "s2 withholds the invented result");
assert(s3.completenessAfter.usageCount > s3.completenessBefore.usageCount, "s3 gains documented usage");
assert(s4.completenessBefore.featureCount === 0, "s4 starts without features");
assert(s4.completenessAfter.featureCount >= 2, "s4 gains documented features");
assert(s4.afterBrief.sectionPlan.filter((item) => item.include && item.type === "differentiators").length === 1, "s4 brief now plans differentiators");
assert(!s5.completenessAfter.authorizedImage, "s5 still has no authorized image");
assert(s5.completenessAfter.hasGuarantee, "s5 gains a documented guarantee");
assert(s5.completenessAfter.shippingCount > s5.completenessBefore.shippingCount, "s5 gains shipping terms");
assert(s6.completenessAfter.packageCount >= 1, "s6 gains a documented package");
assert(s6.afterBrief.ctaStrategy.action === "NONE", "s6 still has no commercial hop");
assert(s6.afterBrief.conversionGoal === "INFORM", "s6 stays informational without authorization");

const improved = results.filter((item) => completenessDelta(item.completenessBefore, item.completenessAfter).length > 0);
assert(improved.length >= 4, "at least four scenarios gain documented fields");
assert(improved.some((item) => item.scenarioKey === "s2") && improved.some((item) => item.scenarioKey === "s4"), "s2 and s4 demonstrate brief improvement");

const engine = [
  "src/lib/product-enrichment/pipeline.ts",
  "src/lib/product-enrichment/merge.ts",
  "src/lib/product-enrichment/extract.ts",
  "src/lib/product-enrichment/prioritize.ts",
];
for (const file of engine) {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  assert(!/aldermoor|prodentim|neuroprime|pellucid|quillon|harlow|tessel|brindle/i.test(text), `${file} has no product-name branches`);
}

const comparison = {
  scenarios: results.map((item) => ({
    key: item.scenarioKey,
    statusBefore: item.beforeBrief.status,
    statusAfter: item.afterBrief.status,
    goalBefore: item.beforeBrief.conversionGoal,
    goalAfter: item.afterBrief.conversionGoal,
    sectionsBefore: item.beforeBrief.sectionPlan.filter((row) => row.include).map((row) => row.type),
    sectionsAfter: item.afterBrief.sectionPlan.filter((row) => row.include).map((row) => row.type),
    completenessBefore: item.completenessBefore,
    completenessAfter: item.completenessAfter,
    gained: completenessDelta(item.completenessBefore, item.completenessAfter),
    addedFields: item.addedFields,
    conflicts: item.conflicts.length,
    withheld: item.withheld.length,
    stillMissing: item.stillMissing.map((row) => row.path),
  })),
  notes: [
    "Counts are informational completeness, not a commercial quality score.",
    "A later source never authorizes an image or a hop.",
  ],
};
writeFileSync(path.join(ROOT, EVIDENCE, "comparison.json"), JSON.stringify(comparison, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "files-changed.json"), JSON.stringify({
  added: [
    "src/lib/product-enrichment/types.ts",
    "src/lib/product-enrichment/extract.ts",
    "src/lib/product-enrichment/merge.ts",
    "src/lib/product-enrichment/pipeline.ts",
    "src/lib/product-enrichment/lab-sources.ts",
    "src/lib/product-enrichment/completeness.ts",
    "src/lib/product-enrichment/prioritize.ts",
    "src/lib/product-enrichment/index.ts",
    "scripts/test-product-enrichment.ts",
  ],
}, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "disk.json"), JSON.stringify({ freeGb: free }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "index.json"), JSON.stringify({ execution: "50e", scenarios: keys, comparison }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify({ pending: true }, null, 2));
writeFileSync(path.join(ROOT, EVIDENCE, "attempts.json"), JSON.stringify([]));
writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({ pending: true }, null, 2));

async function runGate() {
  assert(reviewVisualOptional().state === "NOT_EVALUATED", "visual review stays NOT_EVALUATED");
  assert(safeEditorAvailability().autonomousAiEditing === false, "fix agent is not a general editor");

  const gate = await runSupervisor({
    executionId: "execution-50e",
    criteria: { ...EXECUTION_50D_CRITERIA, executionId: "execution-50e" },
    evidenceDir: path.join(EVIDENCE, "quality-gate"),
    autoFix: false,
    targets: [
      { kind: "conversion-briefs" },
      { kind: "evidence-files", directory: EVIDENCE.replace(/\\/g, "/"), required: [...REQUIRED_EVIDENCE_FILES] },
    ],
  });
  assert(gate.multimodalReview === "NOT_EVALUATED", "quality gate does not fake visual approval");
  assert(gate.humanApproval === "REQUIRED", "human approval stays required");
  assert(gate.gates.VISUAL_REVIEW_GATE.verdict === "NOT_EVALUATED", "visual gate is NOT_EVALUATED without HTML probes");
  assert(gate.defects.filter((item) => item.kind === "CONVERSION_BRIEF").length === 0, "baseline conversion briefs stay valid");
  assert(gate.defects.filter((item) => item.kind === "MISSING_EVIDENCE_FILE").length === 0, "required evidence files exist");
  assert(gate.status === "PASSED" || gate.status === "HUMAN_REVIEW_REQUIRED", `quality gate closed safely (${gate.status})`);
  assert(gate.attempts.length === 0, "fix agent was not invoked outside the 50D recipes");

  writeFileSync(path.join(ROOT, EVIDENCE, "supervisor-report.json"), JSON.stringify(gate, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "gates.json"), JSON.stringify(gate.gates, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "defects.json"), JSON.stringify(gate.defects, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "attempts.json"), JSON.stringify(gate.attempts, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "revalidation.json"), JSON.stringify({ status: gate.status, visualReview: gate.visualReview, humanApproval: gate.humanApproval }, null, 2));
  writeFileSync(path.join(ROOT, EVIDENCE, "test-results.json"), JSON.stringify({ ok: true, passed }, null, 2));

  for (const rel of protectedFiles) {
    assert(fileHash(path.join(ROOT, rel)) === beforeProtect[rel], `${rel} was not modified`);
  }

  console.log("PRODUCT_ENRICHMENT_OK");
  console.log(`OK_COUNT=${passed}`);
}

runGate().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

function briefView(result: EnrichmentResult, side: "before" | "after") {
  const brief = side === "before" ? result.beforeBrief : result.afterBrief;
  const complete = side === "before" ? result.completenessBefore : result.completenessAfter;
  return {
    status: brief.status,
    goal: brief.conversionGoal,
    intent: brief.trafficIntent,
    sections: brief.sectionPlan.filter((item) => item.include).map((item) => item.type),
    completeness: complete,
    addedFields: side === "after" ? result.addedFields : [],
    conflicts: result.conflicts,
    withheld: result.withheld,
  };
}
