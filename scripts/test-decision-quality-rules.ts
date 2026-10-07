import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDecisionRuleContext, freezeDeepDecisionRule } from "../src/lib/decision/decision-rule-context.ts";
import { executeDecisionRule } from "../src/lib/decision/decision-rule-executor.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { DecisionFrameworkError, createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import { createQualityRuleRegistry, registerQualityRules } from "../src/lib/decision/quality-rule-registry.ts";
import { createQualityRuleSet } from "../src/lib/decision/quality-rule-set.ts";
import {
  QUALITY_RULE_IDS,
  createEffectiveLayerIntegrityRule,
  createEvidenceConsistencyRule,
  createLandingPageCompletenessRule,
  createManualOverrideIntegrityRule,
  createOpportunityAnalysisConsistencyRule,
  createQualityRules,
  createRequiredExplanationsPresentRule,
  createSnapshotIntegrityRule,
  createTrafficAnalysisConsistencyRule,
} from "../src/lib/decision/quality-rules.ts";
import { summarizeQuality } from "../src/lib/decision/quality-result.ts";
import {
  createQualityValidator,
  validateQualityContext,
  validateQualityRuleResult,
  validateQualityRules,
  validateQualitySummary,
} from "../src/lib/decision/quality-validator.ts";

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
const pageAnalysis = { id: "page-1", title: "Hero", body: "Body copy." };
const qualityInit = {
  candidate,
  opportunityAnalysis,
  trafficAnalysis,
  pageAnalysis,
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: {
    mode: "m1",
    requiredPageFields: "title,body",
    consistentEvidence: "alpha,beta",
    integritySnapshots: "snap-1",
    requiredExplanations: "opportunity",
    integrityOverrides: "title",
    integrityEffective: "title",
  },
  extensions: {
    "evidence.alpha": true,
    "evidence.beta": true,
    "snapshot.snap-1": true,
    "explanation.opportunity": true,
    "override.title": true,
    "effective.title": true,
  },
};
const ready = () => createDecisionRuleContext(qualityInit);
const empty = () => createDecisionRuleContext();
const setOf = (now: () => number = zero) => createQualityRuleSet({ now });
const runRule = (module: ReturnType<typeof createOpportunityAnalysisConsistencyRule>, context: ReturnType<typeof ready>) =>
  executeDecisionRule(module, context, Object.freeze({}), zero);

async function main() {
  const rules = createQualityRules();
  check("eight quality rules, in the requested order", rules.map((r) => r.id).join() === QUALITY_RULE_IDS.join() && QUALITY_RULE_IDS.join() === "opportunity-analysis-consistency,traffic-analysis-consistency,landing-page-completeness,evidence-consistency,snapshot-integrity,required-explanations-present,manual-override-integrity,effective-layer-integrity");
  check("every quality rule is category QUALITY, enabled, and independent", rules.every((r) => r.category === "QUALITY" && r.enabled === true && r.priority === 100 && r.dependencies.requires.length === 0 && r.dependencies.optional.length === 0 && r.dependencies.conflicts.length === 0 && r.supportsDecision(ready()) === true));
  check("every quality rule satisfies the framework contract", validateQualityRules(rules).length === 0);

  const ctx = ready();
  const opportunityRule = createOpportunityAnalysisConsistencyRule();
  check("Opportunity Analysis Consistency PASSes when identities and lifecycle agree", (await runRule(opportunityRule, ctx)).status === "PASS" && (await runRule(opportunityRule, ctx)).metadata.observation === "opportunity.consistent");
  check("Missing Analysis: Opportunity validate() reports when the analysis is absent", has(opportunityRule.validate(empty()), /Missing analysis/) && has(opportunityRule.validate(empty()), /Opportunity analysis/));
  check("Opportunity Analysis Consistency FAILs when the analysis is absent", (await runRule(opportunityRule, empty())).status === "FAIL");
  check("Opportunity Analysis Consistency FAILs when completedAt is missing on a finished analysis", (await runRule(opportunityRule, createDecisionRuleContext({ ...qualityInit, opportunityAnalysis: { ...opportunityAnalysis, completedAt: null } }))).status === "FAIL");
  check("Opportunity Analysis Consistency FAILs when completedAt is set while in progress", (await runRule(opportunityRule, createDecisionRuleContext({ ...qualityInit, opportunityAnalysis: { ...opportunityAnalysis, status: "PENDING", completedAt: opportunityAnalysis.completedAt } }))).status === "FAIL");
  const mismatchedOpportunity = freezeDeepDecisionRule({ ...ctx, opportunityAnalysis: { ...opportunityAnalysis, candidateId: "other" } });
  check("Opportunity Analysis Consistency FAILs when the candidate id does not match", (await runRule(opportunityRule, mismatchedOpportunity)).status === "FAIL");
  check("Opportunity Analysis Consistency WARNINGs when the candidate is absent", (await runRule(opportunityRule, createDecisionRuleContext({ ...qualityInit, candidate: null }))).status === "WARNING");

  const trafficRule = createTrafficAnalysisConsistencyRule();
  check("Traffic Analysis Consistency PASSes when identities and lifecycle agree", (await runRule(trafficRule, ctx)).status === "PASS");
  check("Missing Analysis: Traffic validate() reports when the analysis is absent", has(trafficRule.validate(empty()), /Missing analysis/) && has(trafficRule.validate(empty()), /Traffic analysis/));
  check("Traffic Analysis Consistency FAILs when the Opportunity id does not match", (await runRule(trafficRule, freezeDeepDecisionRule({ ...ctx, trafficAnalysis: { ...trafficAnalysis, opportunityAnalysisId: "opp-2" } }))).status === "FAIL");
  check("Traffic Analysis Consistency WARNINGs when the candidate or Opportunity analysis is absent", (await runRule(trafficRule, createDecisionRuleContext({ ...qualityInit, candidate: null }))).status === "WARNING");

  const pageRule = createLandingPageCompletenessRule();
  check("Landing Page Completeness PASSes when every declared field is present", (await runRule(pageRule, ctx)).status === "PASS");
  check("Missing Analysis: Landing Page validate() reports when the page analysis is absent", has(pageRule.validate(empty()), /Missing analysis/) && has(pageRule.validate(empty()), /page analysis/));
  check("Landing Page Completeness FAILs when a declared field is missing", (await runRule(pageRule, createDecisionRuleContext({ ...qualityInit, pageAnalysis: { id: "page-1" } }))).status === "FAIL");
  check("Landing Page Completeness is SKIPPED when no fields are declared", (await runRule(pageRule, createDecisionRuleContext({ ...qualityInit, configuration: { mode: "m1" }, pageAnalysis: { id: "page-1" } }))).status === "SKIPPED");
  check("Invalid Metadata: a non-text page field list is rejected", has(pageRule.validate(createDecisionRuleContext({ ...qualityInit, configuration: { ...qualityInit.configuration, requiredPageFields: 1 } })), /Invalid metadata/));

  const evidenceRule = createEvidenceConsistencyRule();
  check("Evidence Consistency PASSes when every declared flag is true", (await runRule(evidenceRule, ctx)).status === "PASS");
  check("Evidence Consistency FAILs when a declared flag is false", (await runRule(evidenceRule, createDecisionRuleContext({ ...qualityInit, extensions: { ...qualityInit.extensions, "evidence.beta": false } }))).status === "FAIL");
  check("Evidence Consistency is SKIPPED when no list is declared", (await runRule(evidenceRule, empty())).status === "SKIPPED");

  const snapshotRule = createSnapshotIntegrityRule();
  check("Snapshot Integrity PASSes when every declared snapshot is intact", (await runRule(snapshotRule, ctx)).status === "PASS");
  check("Snapshot Integrity FAILs when a snapshot flag is missing", (await runRule(snapshotRule, createDecisionRuleContext({ ...qualityInit, extensions: { ...qualityInit.extensions, "snapshot.snap-1": false } }))).status === "FAIL");
  check("Snapshot Integrity is SKIPPED when no list is declared", (await runRule(snapshotRule, empty())).status === "SKIPPED");

  const explanationRule = createRequiredExplanationsPresentRule();
  check("Required Explanations Present PASSes when every declared explanation is present", (await runRule(explanationRule, ctx)).status === "PASS");
  check("Required Explanations Present FAILs when an explanation is missing", (await runRule(explanationRule, createDecisionRuleContext({ ...qualityInit, extensions: { ...qualityInit.extensions, "explanation.opportunity": false } }))).status === "FAIL");
  check("Required Explanations Present is SKIPPED when no list is declared", (await runRule(explanationRule, empty())).status === "SKIPPED");

  const overrideRule = createManualOverrideIntegrityRule();
  check("Manual Override Integrity PASSes when every declared override is intact", (await runRule(overrideRule, ctx)).status === "PASS");
  check("Manual Override Integrity FAILs when an override flag is false", (await runRule(overrideRule, createDecisionRuleContext({ ...qualityInit, extensions: { ...qualityInit.extensions, "override.title": false } }))).status === "FAIL");
  check("Manual Override Integrity is SKIPPED when no list is declared", (await runRule(overrideRule, empty())).status === "SKIPPED");

  const effectiveRule = createEffectiveLayerIntegrityRule();
  check("Effective Layer Integrity PASSes when every declared field is intact", (await runRule(effectiveRule, ctx)).status === "PASS");
  check("Effective Layer Integrity FAILs when an effective flag is false", (await runRule(effectiveRule, createDecisionRuleContext({ ...qualityInit, extensions: { ...qualityInit.extensions, "effective.title": false } }))).status === "FAIL");
  check("Effective Layer Integrity is SKIPPED when no list is declared", (await runRule(effectiveRule, empty())).status === "SKIPPED");

  const registry = createQualityRuleRegistry();
  check("the quality registry registers all eight rules", registry.count() === 8 && QUALITY_RULE_IDS.every((id) => registry.get(id)?.id === id));
  check("Duplicate Rule: registering the set a second time is rejected", throwsFramework(() => registerQualityRules(registry.modules), /already registered/));
  check("validateRules reports a duplicate id without registering", has(validateQualityRules([...rules, createOpportunityAnalysisConsistencyRule()]), /Duplicate rule/));
  const fresh = createDecisionRuleModuleRegistry();
  registerQualityRules(fresh);
  check("registerQualityRules plugs the eight rules into the Decision Rule Framework", fresh.list({ category: "QUALITY" }).length === 8 && fresh.list({ category: "QUALITY" }).every((e) => e.module.category === "QUALITY"));

  const validator = createQualityValidator();
  check("a context that is not an object is rejected", has(validateQualityContext(null), /an object is required/) && has(validator.validateContext([]), /an object is required/));
  check("Invalid Metadata: a nested metadata bag is rejected", has(validator.validateContext({ ...ctx, executionMetadata: { a: { b: 1 } } }), /Invalid metadata/));
  check("a complete ready context is accepted", validator.validateContext(ctx).length === 0);
  check("Invalid Rule Result: a non-object, an unknown status, and nested metadata are rejected", has(validateQualityRuleResult(null), /must be an object/) && has(validateQualityRuleResult({ status: "DONE", confidence: null, metadata: {}, warnings: [], errors: [] }), /Status is not supported/) && has(validateQualityRuleResult({ status: "PASS", confidence: 1, metadata: { a: { b: 1 } }, warnings: [], errors: [] }), /Invalid metadata/));
  check("Invalid Rule Result: a score, recommendation, or action is rejected", has(validateQualityRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], score: 1 }), /Invalid rule result/) && has(validateQualityRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], recommendation: "go" }), /Invalid rule result/) && has(validateQualityRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], actions: [] }), /Invalid rule result/));
  check("a valid PASS output is accepted", validateQualityRuleResult({ status: "PASS", confidence: 1, metadata: { k: 1 }, warnings: [], errors: [] }).length === 0);

  const summary = await setOf().evaluate(ctx);
  check("a ready context PASSes every quality rule", summary.passedRules.join() === "effective-layer-integrity,evidence-consistency,landing-page-completeness,manual-override-integrity,opportunity-analysis-consistency,required-explanations-present,snapshot-integrity,traffic-analysis-consistency");
  check("a ready summary has no failures, warnings, or skips", summary.failedRules.length === 0 && summary.warningRules.length === 0 && summary.skippedRules.length === 0);
  check("qualityObservations lists one observation per passing rule", summary.qualityObservations.join() === "effective.intact,evidence.consistent,explanation.present,landing-page.complete,opportunity.consistent,override.intact,snapshot.intact,traffic.consistent");
  check("a quality summary has exactly the requested fields", Object.keys(summary).join() === "passedRules,failedRules,warningRules,skippedRules,qualityObservations,executionTime");
  check("the summary carries no score, recommendation, or action", !("score" in summary) && !("recommendation" in summary) && !("actions" in summary) && validateQualitySummary(summary).length === 0);
  check("the summary is frozen", Object.isFrozen(summary) && Object.isFrozen(summary.passedRules) && Object.isFrozen(summary.qualityObservations));
  check("executionTime is the sum of the rule times", summary.executionTime === 0);

  const emptySummary = await setOf().evaluate(empty());
  check("an empty context FAILs the three analysis rules and skips the five declared-list rules", emptySummary.failedRules.join() === "landing-page-completeness,opportunity-analysis-consistency,traffic-analysis-consistency" && emptySummary.skippedRules.join() === "effective-layer-integrity,evidence-consistency,manual-override-integrity,required-explanations-present,snapshot-integrity" && emptySummary.passedRules.length === 0);
  check("qualityObservations names the three analysis gaps", emptySummary.qualityObservations.join() === "landing-page.incomplete,opportunity.inconsistent,traffic.inconsistent");

  check("evaluate rejects a null context", await rejectsFramework(() => setOf().evaluate(null as never), /an object is required/));
  check("Invalid Metadata: evaluate rejects a nested metadata bag", await rejectsFramework(() => setOf().evaluate({ ...ctx, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));

  const tick = (() => { let t = 0; return () => (t += 5); })();
  const timed = await createQualityRuleSet({ now: tick }).evaluate(ctx);
  check("executionTime comes from the injected clock", timed.executionTime > 0 && Number.isFinite(timed.executionTime));

  const pipeline = createDecisionRulePipeline({ now: zero });
  registerQualityRules(pipeline);
  const report = await pipeline.run(ctx);
  check("the same ready run through the Decision Rule Framework pipeline matches the set", JSON.stringify(summarizeQuality(report)) === JSON.stringify(summary));

  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]);
  await setOf().evaluate(ctx);
  check("No mutation: evaluating quality does not change the context or the source objects", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]) === sourceBefore);
  const mutating = ready();
  try {
    (mutating.opportunityAnalysis as { status: string }).status = "FAILED";
    (mutating.trafficAnalysis as { status: string }).status = "FAILED";
    (mutating.pageAnalysis as { id: string }).id = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the context stays frozen under assignment", mutating.opportunityAnalysis?.status === "COMPLETED" && mutating.trafficAnalysis?.status === "COMPLETED" && mutating.pageAnalysis?.id === "page-1");

  const alone = await runRule(createOpportunityAnalysisConsistencyRule(), ctx);
  const togetherRun = await executeDecisionRule(createOpportunityAnalysisConsistencyRule(), ctx, Object.freeze({}), zero);
  check("Independent execution: a rule's result is the same alone or beside the rest of the set", alone.status === "PASS" && (await setOf().evaluate(ctx)).passedRules.includes("opportunity-analysis-consistency") && JSON.stringify(alone) === JSON.stringify(togetherRun));
  check("Independent execution: two sets given the same context return the same summary", JSON.stringify(await setOf().evaluate(ctx)) === JSON.stringify(await createQualityRuleSet({ now: zero }).evaluate(ctx)));
  const two = [setOf(), setOf()];
  await Promise.all(two.map((s) => s.evaluate(ctx)));
  check("sets are independent: another set's run changes nothing", two[0].registry.count() === 8 && two[1].registry.count() === 8);

  const dir = join(process.cwd(), "src/lib/decision");
  const qualityFiles = readdirSync(dir).filter((f) => /^quality-[a-z-]+\.ts$/.test(f));
  check("five quality modules exist", qualityFiles.sort().join() === "quality-result.ts,quality-rule-registry.ts,quality-rule-set.ts,quality-rules.ts,quality-validator.ts");
  const lines = qualityFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
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
  check("imports stay inside the decision folder", imports.every((i) => /^\.\/(decision-|quality-)/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Platform, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|platform|db/i.test(i.from)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"];
  check("the architecture modules do not import quality or implement the resolver", architecture.every((f) => !/quality-/.test(readFileSync(join(dir, f), "utf8"))) && !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("the Decision Rule Framework still has exactly seven modules", frameworkFiles.length === 7);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision quality rules", !others.some((f) => /from\s+["'][^"']*decision\/quality-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision quality rules: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
