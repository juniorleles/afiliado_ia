import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDecisionRuleContext, freezeDeepDecisionRule } from "../src/lib/decision/decision-rule-context.ts";
import { executeDecisionRule } from "../src/lib/decision/decision-rule-executor.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { DecisionFrameworkError, createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import { createReadinessRuleRegistry, registerReadinessRules } from "../src/lib/decision/readiness-rule-registry.ts";
import { createReadinessRuleSet } from "../src/lib/decision/readiness-rule-set.ts";
import {
  READINESS_RULE_IDS,
  createDiscoveryAvailableRule,
  createLandingPageAvailableRule,
  createOpportunityCompletedRule,
  createReadinessRules,
  createRequiredEvidencePresentRule,
  createRequiredMetadataPresentRule,
  createRequiredSnapshotsPresentRule,
  createRequiredValidationPassedRule,
  createTrafficCompletedRule,
} from "../src/lib/decision/readiness-rules.ts";
import { summarizeReadiness } from "../src/lib/decision/readiness-result.ts";
import {
  createReadinessValidator,
  validateReadinessContext,
  validateReadinessRuleResult,
  validateReadinessRules,
  validateReadinessSummary,
} from "../src/lib/decision/readiness-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const throwsFramework = (fn: () => unknown, text?: RegExp): boolean => {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof DecisionFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};
const rejectsFramework = async (fn: () => Promise<unknown>, text?: RegExp): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof DecisionFrameworkError && (text === undefined || text.test(`${error.message} ${error.issues.map((i) => i.message).join(" ")}`));
  }
};

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "NEW" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const opportunityAnalysis = { id: "opp-1", candidateId: "cand-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const trafficAnalysis = { id: "traf-1", candidateId: "cand-1", opportunityAnalysisId: "opp-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const pageAnalysis = { id: "page-1" };
const readyInit = {
  candidate,
  opportunityAnalysis,
  trafficAnalysis,
  pageAnalysis,
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: {
    mode: "m1",
    requiredEvidence: "alpha,beta",
    requiredSnapshots: "snap-1",
    requiredMetadata: "run,host,mode",
    requiredValidation: "schema",
  },
  extensions: {
    "evidence.alpha": true,
    "evidence.beta": true,
    "snapshot.snap-1": true,
    "validation.schema": true,
  },
};
const ready = () => createDecisionRuleContext(readyInit);
const empty = () => createDecisionRuleContext();
const setOf = (now: () => number = zero) => createReadinessRuleSet({ now });
const runRule = (module: ReturnType<typeof createDiscoveryAvailableRule>, context: ReturnType<typeof ready>) =>
  executeDecisionRule(module, context, Object.freeze({}), zero);

async function main() {
  const rules = createReadinessRules();
  check("eight readiness rules, in the requested order", rules.map((r) => r.id).join() === READINESS_RULE_IDS.join() && READINESS_RULE_IDS.join() === "discovery-available,opportunity-completed,traffic-completed,landing-page-available,required-evidence-present,required-snapshots-present,required-metadata-present,required-validation-passed");
  check("every readiness rule is category READINESS, enabled, and independent", rules.every((r) => r.category === "READINESS" && r.enabled === true && r.priority === 100 && r.dependencies.requires.length === 0 && r.dependencies.optional.length === 0 && r.dependencies.conflicts.length === 0 && r.supportsDecision(ready()) === true));
  check("every readiness rule satisfies the framework contract", validateReadinessRules(rules).length === 0);

  const ctx = ready();
  const discovery = await runRule(createDiscoveryAvailableRule(), ctx);
  check("Discovery Available PASSes when a usable candidate is present", discovery.status === "PASS" && discovery.confidence === 1 && discovery.metadata.requirement === "discovery");
  check("Discovery Available FAILs when the candidate is missing", (await runRule(createDiscoveryAvailableRule(), empty())).status === "FAIL" && (await runRule(createDiscoveryAvailableRule(), empty())).metadata.missing === "discovery");
  check("Discovery Available FAILs when the candidate is FAILED or IGNORED", (await runRule(createDiscoveryAvailableRule(), createDecisionRuleContext({ ...readyInit, candidate: { ...candidate, status: "FAILED" } }))).status === "FAIL" && (await runRule(createDiscoveryAvailableRule(), createDecisionRuleContext({ ...readyInit, candidate: { ...candidate, status: "IGNORED" } }))).status === "FAIL");

  const opportunityRule = createOpportunityCompletedRule();
  check("Opportunity Completed PASSes when the analysis is COMPLETED", (await runRule(opportunityRule, ctx)).status === "PASS");
  check("Missing Analysis: Opportunity validate() reports when the analysis is absent", has(opportunityRule.validate(empty()), /Missing analysis/) && has(opportunityRule.validate(empty()), /Opportunity analysis/));
  check("Opportunity Completed FAILs when the analysis is not COMPLETED", (await runRule(opportunityRule, createDecisionRuleContext({ ...readyInit, opportunityAnalysis: { ...opportunityAnalysis, status: "PENDING", completedAt: null } }))).status === "FAIL");
  const opportunityMissing = await runRule(opportunityRule, empty());
  check("Opportunity Completed FAILs with Missing Analysis when absent", opportunityMissing.status === "FAIL" && /Missing analysis/.test(opportunityMissing.errors[0] ?? ""));

  const trafficRule = createTrafficCompletedRule();
  check("Traffic Completed PASSes when the analysis is COMPLETED", (await runRule(trafficRule, ctx)).status === "PASS");
  check("Missing Analysis: Traffic validate() reports when the analysis is absent", has(trafficRule.validate(empty()), /Missing analysis/) && has(trafficRule.validate(empty()), /Traffic analysis/));
  check("Traffic Completed FAILs when the analysis is FAILED", (await runRule(trafficRule, createDecisionRuleContext({ ...readyInit, trafficAnalysis: { ...trafficAnalysis, status: "FAILED" } }))).status === "FAIL");

  const pageRule = createLandingPageAvailableRule();
  check("Landing Page Available PASSes when a page analysis id is present", (await runRule(pageRule, ctx)).status === "PASS");
  check("Missing Analysis: Landing Page validate() reports when the page analysis is absent", has(pageRule.validate(empty()), /Missing analysis/) && has(pageRule.validate(empty()), /page analysis/));
  check("Landing Page Available FAILs when the page status is FAILED", (await runRule(pageRule, createDecisionRuleContext({ ...readyInit, pageAnalysis: { id: "page-1", status: "FAILED" } as never }))).status === "FAIL");

  const evidenceRule = createRequiredEvidencePresentRule();
  check("Required Evidence Present PASSes when every declared id is true in extensions", (await runRule(evidenceRule, ctx)).status === "PASS" && (await runRule(evidenceRule, ctx)).metadata.checked === "alpha,beta");
  check("Required Evidence Present FAILs when a declared id is missing", (await runRule(evidenceRule, createDecisionRuleContext({ ...readyInit, extensions: { "evidence.alpha": true } }))).status === "FAIL");
  check("Required Evidence Present is SKIPPED when no list is declared", (await runRule(evidenceRule, empty())).status === "SKIPPED" && /No evidence requirements/.test((await runRule(evidenceRule, empty())).warnings[0] ?? ""));
  check("Invalid Metadata: a non-text evidence list is rejected", has(evidenceRule.validate(createDecisionRuleContext({ ...readyInit, configuration: { ...readyInit.configuration, requiredEvidence: 1 } })), /Invalid metadata/));

  const snapshotRule = createRequiredSnapshotsPresentRule();
  check("Required Snapshots Present PASSes when every declared snapshot is present", (await runRule(snapshotRule, ctx)).status === "PASS");
  check("Required Snapshots Present FAILs when a snapshot is missing", (await runRule(snapshotRule, createDecisionRuleContext({ ...readyInit, extensions: { "evidence.alpha": true, "evidence.beta": true, "validation.schema": true } }))).status === "FAIL");
  check("Required Snapshots Present is SKIPPED when no list is declared", (await runRule(snapshotRule, empty())).status === "SKIPPED");

  const metadataRule = createRequiredMetadataPresentRule();
  check("Required Metadata Present PASSes when every declared key is in a metadata bag", (await runRule(metadataRule, ctx)).status === "PASS");
  check("Required Metadata Present FAILs when a key is missing", (await runRule(metadataRule, createDecisionRuleContext({ ...readyInit, configuration: { requiredEvidence: "alpha,beta", requiredSnapshots: "snap-1", requiredMetadata: "run,absent", requiredValidation: "schema" } }))).status === "FAIL");
  check("Required Metadata Present is SKIPPED when no list is declared", (await runRule(metadataRule, empty())).status === "SKIPPED");

  const validationRule = createRequiredValidationPassedRule();
  check("Required Validation Passed PASSes when every declared id is true", (await runRule(validationRule, ctx)).status === "PASS");
  check("Required Validation Passed FAILs when a flag is false", (await runRule(validationRule, createDecisionRuleContext({ ...readyInit, extensions: { ...readyInit.extensions, "validation.schema": false } }))).status === "FAIL");
  check("Required Validation Passed is SKIPPED when no list is declared", (await runRule(validationRule, empty())).status === "SKIPPED");

  const registry = createReadinessRuleRegistry();
  check("the readiness registry registers all eight rules", registry.count() === 8 && READINESS_RULE_IDS.every((id) => registry.get(id)?.id === id));
  check("Duplicate Rule: registering the set a second time is rejected", throwsFramework(() => registerReadinessRules(registry.modules), /already registered/));
  check("validateRules reports a duplicate id without registering", has(validateReadinessRules([...rules, createDiscoveryAvailableRule()]), /Duplicate rule/));
  const fresh = createDecisionRuleModuleRegistry();
  registerReadinessRules(fresh);
  check("registerReadinessRules plugs the eight rules into the Decision Rule Framework", fresh.list({ category: "READINESS" }).length === 8 && fresh.list({ category: "READINESS" }).every((e) => e.module.category === "READINESS"));

  const validator = createReadinessValidator();
  check("Missing Context is rejected", has(validator.validateContext(null), /Missing context/) && has(validateReadinessContext(undefined), /Missing context/) && has(validateReadinessContext([]), /Missing context/));
  check("Invalid Metadata: a nested metadata bag is rejected", has(validator.validateContext({ ...ctx, executionMetadata: { a: { b: 1 } } }), /Invalid metadata/));
  check("a complete ready context is accepted", validator.validateContext(ctx).length === 0);
  check("Invalid Rule Result: a non-object, an unknown status, and nested metadata are rejected", has(validateReadinessRuleResult(null), /must be an object/) && has(validateReadinessRuleResult({ status: "DONE", confidence: null, metadata: {}, warnings: [], errors: [] }), /Status is not supported/) && has(validateReadinessRuleResult({ status: "PASS", confidence: 1, metadata: { a: { b: 1 } }, warnings: [], errors: [] }), /Invalid metadata/));
  check("Invalid Rule Result: a score, recommendation, or action is rejected", has(validateReadinessRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], score: 1 }), /Invalid rule result/) && has(validateReadinessRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], recommendation: "go" }), /Invalid rule result/) && has(validateReadinessRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], actions: [] }), /Invalid rule result/));
  check("a valid PASS output is accepted", validateReadinessRuleResult({ status: "PASS", confidence: 1, metadata: { k: 1 }, warnings: [], errors: [] }).length === 0);

  const summary = await setOf().evaluate(ctx);
  check("a ready context PASSes every readiness rule", summary.passedRules.join() === "discovery-available,landing-page-available,opportunity-completed,required-evidence-present,required-metadata-present,required-snapshots-present,required-validation-passed,traffic-completed");
  check("a ready summary has no failures, warnings, skips, or missing requirements", summary.failedRules.length === 0 && summary.warningRules.length === 0 && summary.skippedRules.length === 0 && summary.missingRequirements.length === 0);
  check("a readiness summary has exactly the requested fields", Object.keys(summary).join() === "passedRules,failedRules,warningRules,skippedRules,missingRequirements,executionTime");
  check("the summary carries no score, recommendation, or action", !("score" in summary) && !("recommendation" in summary) && !("actions" in summary) && validateReadinessSummary(summary).length === 0);
  check("the summary is frozen", Object.isFrozen(summary) && Object.isFrozen(summary.passedRules));
  check("executionTime is the sum of the rule times", summary.executionTime === 0);

  const emptySummary = await setOf().evaluate(empty());
  check("an empty context FAILs the four structural rules and skips the four declared-list rules", emptySummary.failedRules.join() === "discovery-available,landing-page-available,opportunity-completed,traffic-completed" && emptySummary.skippedRules.join() === "required-evidence-present,required-metadata-present,required-snapshots-present,required-validation-passed" && emptySummary.passedRules.length === 0);
  check("missingRequirements names the four structural gaps", emptySummary.missingRequirements.join() === "discovery,landing-page,opportunity,traffic");

  check("Missing Context: evaluate rejects a null context", await rejectsFramework(() => setOf().evaluate(null as never), /Missing context/));
  check("Invalid Metadata: evaluate rejects a nested metadata bag", await rejectsFramework(() => setOf().evaluate({ ...ctx, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));

  const tick = (() => { let t = 0; return () => (t += 5); })();
  const timed = await createReadinessRuleSet({ now: tick }).evaluate(ctx);
  check("executionTime comes from the injected clock", timed.executionTime > 0 && Number.isFinite(timed.executionTime));

  const pipeline = createDecisionRulePipeline({ now: zero });
  registerReadinessRules(pipeline);
  const report = await pipeline.run(ctx);
  const fromReport = summarizeReadiness(report);
  check("the same ready run through the Decision Rule Framework pipeline matches the set", JSON.stringify(fromReport) === JSON.stringify(summary));

  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]);
  await setOf().evaluate(ctx);
  check("No mutation: evaluating readiness does not change the context or the source objects", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]) === sourceBefore);
  const mutating = ready();
  try {
    (mutating.candidate as { title: string }).title = "hacked";
    (mutating.opportunityAnalysis as { status: string }).status = "FAILED";
  } catch {
    /* frozen */
  }
  check("No mutation: the context stays frozen under assignment", mutating.candidate?.title === "Fictional item" && mutating.opportunityAnalysis?.status === "COMPLETED");

  const alone = await runRule(createDiscoveryAvailableRule(), ctx);
  const together = (await setOf().evaluate(ctx)).passedRules.includes("discovery-available");
  const togetherRun = await executeDecisionRule(createDiscoveryAvailableRule(), ctx, Object.freeze({}), zero);
  check("Independent execution: a rule's result is the same alone or beside the rest of the set", alone.status === "PASS" && together === true && JSON.stringify(alone) === JSON.stringify(togetherRun));
  const setA = await setOf().evaluate(ctx);
  const setB = await createReadinessRuleSet({ now: zero }).evaluate(ctx);
  check("Independent execution: two sets given the same context return the same summary", JSON.stringify(setA) === JSON.stringify(setB));
  const two = [setOf(), setOf()];
  await Promise.all(two.map((s) => s.evaluate(ctx)));
  check("sets are independent: another set's run changes nothing", two[0].registry.count() === 8 && two[1].registry.count() === 8);

  const freezeCheck = freezeDeepDecisionRule({ a: { b: 1 } });
  check("freeze helper still freezes nested objects", Object.isFrozen(freezeCheck) && Object.isFrozen(freezeCheck.a));

  const dir = join(process.cwd(), "src/lib/decision");
  const readinessFiles = readdirSync(dir).filter((f) => /^readiness-[a-z-]+\.ts$/.test(f));
  check("five readiness modules exist", readinessFiles.sort().join() === "readiness-result.ts,readiness-rule-registry.ts,readiness-rule-set.ts,readiness-rules.ts,readiness-validator.ts");
  const lines = readinessFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or campaign logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no Decision Resolver implementation", !code.some((l) => /createDecisionResolver|DecisionResolver\s*\{/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports stay inside the decision folder", imports.every((i) => /^\.\/(decision-|readiness-)/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|db/i.test(i.from)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"];
  check("the architecture modules do not import readiness or implement the resolver", architecture.every((f) => !/readiness-/.test(readFileSync(join(dir, f), "utf8"))) && !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("the Decision Rule Framework still has exactly seven modules", frameworkFiles.length === 7);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision readiness rules", !others.some((f) => /from\s+["'][^"']*decision\/readiness-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision readiness rules: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
