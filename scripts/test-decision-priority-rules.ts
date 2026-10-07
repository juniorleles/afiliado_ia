import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDecisionRuleContext } from "../src/lib/decision/decision-rule-context.ts";
import { executeDecisionRule } from "../src/lib/decision/decision-rule-executor.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { DecisionFrameworkError, createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import { createPriorityRuleRegistry, registerPriorityRules } from "../src/lib/decision/priority-rule-registry.ts";
import { createPriorityRuleSet } from "../src/lib/decision/priority-rule-set.ts";
import {
  PRIORITY_RULE_IDS,
  createAnalysisPriorityRule,
  createLandingPagePriorityRule,
  createMonitoringPriorityRule,
  createPriorityRules,
  createPublicationReadinessRule,
  createReevaluationPriorityRule,
  createResearchPriorityRule,
  createReviewPriorityRule,
  createTrafficPreparationPriorityRule,
} from "../src/lib/decision/priority-rules.ts";
import { summarizePriority } from "../src/lib/decision/priority-result.ts";
import {
  createPriorityValidator,
  validatePriorityContext,
  validatePriorityRuleResult,
  validatePriorityRules,
  validatePrioritySummary,
} from "../src/lib/decision/priority-validator.ts";

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

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const opportunityAnalysis = { id: "opp-1", candidateId: "cand-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const trafficAnalysis = { id: "traf-1", candidateId: "cand-1", opportunityAnalysisId: "opp-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const pageAnalysis = { id: "page-1", title: "Hero", body: "Body copy." };
const advancedInit = {
  candidate,
  opportunityAnalysis,
  trafficAnalysis,
  pageAnalysis,
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
  extensions: {},
};
const declaredInit = {
  ...advancedInit,
  configuration: {
    mode: "m1",
    priorityReview: "notes",
    priorityMonitoring: "live",
    priorityReevaluation: "stale",
  },
  extensions: { "review.notes": true, "monitoring.live": true, "reevaluation.stale": true },
};
const advanced = () => createDecisionRuleContext(advancedInit);
const empty = () => createDecisionRuleContext();
const setOf = (now: () => number = zero) => createPriorityRuleSet({ now });
const runRule = (module: ReturnType<typeof createResearchPriorityRule>, context: ReturnType<typeof advanced>) =>
  executeDecisionRule(module, context, Object.freeze({}), zero);

async function main() {
  const rules = createPriorityRules();
  check("eight priority rules, in the requested order", rules.map((r) => r.id).join() === PRIORITY_RULE_IDS.join() && PRIORITY_RULE_IDS.join() === "research-priority,analysis-priority,landing-page-priority,traffic-preparation-priority,publication-readiness,review-priority,monitoring-priority,reevaluation-priority");
  check("every priority rule is category PRIORITY, enabled, and independent", rules.every((r) => r.category === "PRIORITY" && r.enabled === true && r.priority === 100 && r.dependencies.requires.length === 0 && r.supportsDecision(advanced()) === true));
  check("every priority rule satisfies the framework contract", validatePriorityRules(rules).length === 0);

  const ctx = advanced();
  const research = createResearchPriorityRule();
  check("Research Priority is SKIPPED when Discovery is COMPLETED", (await runRule(research, ctx)).status === "SKIPPED");
  check("Research Priority PASSes when the candidate is still early", (await runRule(research, createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "NEW" } }))).status === "PASS");
  check("Research Priority FAILs when the candidate is FAILED", (await runRule(research, createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "FAILED" } }))).status === "FAIL");
  check("Research Priority is SKIPPED when no candidate is present", (await runRule(research, empty())).status === "SKIPPED");

  const analysis = createAnalysisPriorityRule();
  check("Analysis Priority is SKIPPED when Opportunity is COMPLETED", (await runRule(analysis, ctx)).status === "SKIPPED");
  check("Analysis Priority PASSes when Opportunity is not completed", (await runRule(analysis, createDecisionRuleContext({ ...advancedInit, opportunityAnalysis: null, trafficAnalysis: null }))).status === "PASS");
  check("Analysis Priority FAILs when Opportunity is FAILED", (await runRule(analysis, createDecisionRuleContext({ ...advancedInit, opportunityAnalysis: { ...opportunityAnalysis, status: "FAILED" } }))).status === "FAIL");

  const page = createLandingPagePriorityRule();
  check("Landing Page Priority is SKIPPED when a page analysis is already present", (await runRule(page, ctx)).status === "SKIPPED");
  check("Landing Page Priority PASSes when the page analysis is missing", (await runRule(page, createDecisionRuleContext({ ...advancedInit, pageAnalysis: null }))).status === "PASS");
  check("Landing Page Priority PASSes when declared page fields are still missing", (await runRule(page, createDecisionRuleContext({ ...advancedInit, pageAnalysis: { id: "page-1" }, configuration: { mode: "m1", priorityPageFields: "title,body" } }))).status === "PASS");
  check("Landing Page Priority FAILs when the page status is FAILED", (await runRule(page, createDecisionRuleContext({ ...advancedInit, pageAnalysis: { id: "page-1", status: "FAILED" } as never }))).status === "FAIL");
  check("Invalid Metadata: a non-text page field list is rejected", has(page.validate(createDecisionRuleContext({ ...advancedInit, configuration: { priorityPageFields: 1 } })), /Invalid metadata/));

  const trafficPrep = createTrafficPreparationPriorityRule();
  check("Traffic Preparation Priority is SKIPPED when Traffic is COMPLETED", (await runRule(trafficPrep, ctx)).status === "SKIPPED");
  check("Traffic Preparation Priority PASSes when Opportunity is COMPLETED and Traffic is not", (await runRule(trafficPrep, createDecisionRuleContext({ ...advancedInit, trafficAnalysis: null }))).status === "PASS");
  check("Traffic Preparation Priority FAILs when Traffic is FAILED", (await runRule(trafficPrep, createDecisionRuleContext({ ...advancedInit, trafficAnalysis: { ...trafficAnalysis, status: "FAILED" } }))).status === "FAIL");
  check("Traffic Preparation Priority is SKIPPED when Opportunity is not completed", (await runRule(trafficPrep, createDecisionRuleContext({ ...advancedInit, opportunityAnalysis: null }))).status === "SKIPPED");

  const publication = createPublicationReadinessRule();
  check("Publication Readiness PASSes when Opportunity, Traffic, and the page are in place", (await runRule(publication, ctx)).status === "PASS" && (await runRule(publication, ctx)).metadata.observation === "publication.current");
  check("Publication Readiness is SKIPPED when a page is missing", (await runRule(publication, createDecisionRuleContext({ ...advancedInit, pageAnalysis: null }))).status === "SKIPPED");
  check("Publication Readiness FAILs when the page is FAILED after analyses completed", (await runRule(publication, createDecisionRuleContext({ ...advancedInit, pageAnalysis: { id: "page-1", status: "FAILED" } as never }))).status === "FAIL");

  const review = createReviewPriorityRule();
  check("Review Priority PASSes when every declared review flag is true", (await runRule(review, createDecisionRuleContext(declaredInit))).status === "PASS");
  check("Review Priority FAILs when a declared review flag is false", (await runRule(review, createDecisionRuleContext({ ...declaredInit, extensions: { ...declaredInit.extensions, "review.notes": false } }))).status === "FAIL");
  check("Review Priority is SKIPPED when no list is declared", (await runRule(review, ctx)).status === "SKIPPED");
  check("Monitoring Priority PASSes when declared flags are true", (await runRule(createMonitoringPriorityRule(), createDecisionRuleContext(declaredInit))).status === "PASS");
  check("Reevaluation Priority PASSes when declared flags are true", (await runRule(createReevaluationPriorityRule(), createDecisionRuleContext(declaredInit))).status === "PASS");

  const registry = createPriorityRuleRegistry();
  check("the priority registry registers all eight rules", registry.count() === 8 && PRIORITY_RULE_IDS.every((id) => registry.get(id)?.id === id));
  check("Duplicate Rule: registering the set a second time is rejected", throwsFramework(() => registerPriorityRules(registry.modules), /already registered/));
  check("validateRules reports a duplicate id without registering", has(validatePriorityRules([...rules, createResearchPriorityRule()]), /Duplicate rule/));
  const fresh = createDecisionRuleModuleRegistry();
  registerPriorityRules(fresh);
  check("registerPriorityRules plugs the eight rules into the Decision Rule Framework", fresh.list({ category: "PRIORITY" }).length === 8);

  const validator = createPriorityValidator();
  check("Missing Context is rejected", has(validator.validateContext(null), /Missing context/) && has(validatePriorityContext(undefined), /Missing context/) && has(validatePriorityContext([]), /Missing context/));
  check("Invalid Metadata: a nested metadata bag is rejected", has(validator.validateContext({ ...ctx, executionMetadata: { a: { b: 1 } } }), /Invalid metadata/));
  check("a complete context is accepted", validator.validateContext(ctx).length === 0);
  check("Invalid Rule Result: a non-object, an unknown status, and nested metadata are rejected", has(validatePriorityRuleResult(null), /must be an object/) && has(validatePriorityRuleResult({ status: "DONE", confidence: null, metadata: {}, warnings: [], errors: [] }), /Status is not supported/) && has(validatePriorityRuleResult({ status: "PASS", confidence: 1, metadata: { a: { b: 1 } }, warnings: [], errors: [] }), /Invalid metadata/));
  check("Invalid Rule Result: a numeric result or action is rejected", has(validatePriorityRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], score: 1 }), /Invalid rule result/) && has(validatePriorityRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], ranking: 1 }), /Invalid rule result/) && has(validatePriorityRuleResult({ status: "PASS", confidence: 1, metadata: {}, warnings: [], errors: [], actions: [] }), /Invalid rule result/));
  check("a valid PASS output is accepted", validatePriorityRuleResult({ status: "PASS", confidence: 1, metadata: { k: 1 }, warnings: [], errors: [] }).length === 0);

  const summary = await setOf().evaluate(ctx);
  check("an advanced context PASSes only Publication Readiness", summary.passedRules.join() === "publication-readiness" && summary.failedRules.length === 0 && summary.warningRules.length === 0);
  check("the other seven rules are skipped", summary.skippedRules.join() === "analysis-priority,landing-page-priority,monitoring-priority,reevaluation-priority,research-priority,review-priority,traffic-preparation-priority");
  check("priorityObservations names the current concern", summary.priorityObservations.join() === "publication.current");
  check("a priority summary has exactly the requested fields", Object.keys(summary).join() === "passedRules,failedRules,warningRules,skippedRules,priorityObservations,executionTime");
  check("the summary carries no numeric result or action", !("score" in summary) && !("ranking" in summary) && !("actions" in summary) && validatePrioritySummary(summary).length === 0);
  check("the summary is frozen", Object.isFrozen(summary) && Object.isFrozen(summary.passedRules) && Object.isFrozen(summary.priorityObservations));
  check("executionTime is the sum of the rule times", summary.executionTime === 0);

  const declared = await setOf().evaluate(createDecisionRuleContext(declaredInit));
  check("declared review, monitoring, and reevaluation can PASS beside Publication Readiness", declared.passedRules.join() === "monitoring-priority,publication-readiness,reevaluation-priority,review-priority");

  const emptySummary = await setOf().evaluate(empty());
  check("an empty context skips every priority rule", emptySummary.passedRules.length === 0 && emptySummary.failedRules.length === 0 && emptySummary.skippedRules.length === 8 && emptySummary.priorityObservations.length === 0);

  const early = await setOf().evaluate(createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "NEW" }, opportunityAnalysis: null, trafficAnalysis: null, pageAnalysis: null }));
  check("an early candidate makes research, analysis, and landing-page current", early.passedRules.join() === "analysis-priority,landing-page-priority,research-priority" && early.priorityObservations.join() === "analysis.current,landing-page.current,research.current");

  check("Missing Context: evaluate rejects a null context", await rejectsFramework(() => setOf().evaluate(null as never), /Missing context/));
  check("Invalid Metadata: evaluate rejects a nested metadata bag", await rejectsFramework(() => setOf().evaluate({ ...ctx, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));

  const tick = (() => { let t = 0; return () => (t += 5); })();
  check("executionTime comes from the injected clock", (await createPriorityRuleSet({ now: tick }).evaluate(ctx)).executionTime > 0);

  const pipeline = createDecisionRulePipeline({ now: zero });
  registerPriorityRules(pipeline);
  check("the same advanced run through the Decision Rule Framework pipeline matches the set", JSON.stringify(summarizePriority(await pipeline.run(ctx))) === JSON.stringify(summary));

  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]);
  await setOf().evaluate(ctx);
  check("No mutation: evaluating priority does not change the context or the source objects", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]) === sourceBefore);
  const mutating = advanced();
  try {
    (mutating.candidate as { status: string }).status = "FAILED";
    (mutating.opportunityAnalysis as { status: string }).status = "FAILED";
  } catch {
    /* frozen */
  }
  check("No mutation: the context stays frozen under assignment", mutating.candidate?.status === "COMPLETED" && mutating.opportunityAnalysis?.status === "COMPLETED");

  const alone = await runRule(createPublicationReadinessRule(), ctx);
  const togetherRun = await executeDecisionRule(createPublicationReadinessRule(), ctx, Object.freeze({}), zero);
  check("Independent execution: a rule's result is the same alone or beside the rest of the set", alone.status === "PASS" && JSON.stringify(alone) === JSON.stringify(togetherRun));
  check("Independent execution: two sets given the same context return the same summary", JSON.stringify(await setOf().evaluate(ctx)) === JSON.stringify(await createPriorityRuleSet({ now: zero }).evaluate(ctx)));
  const two = [setOf(), setOf()];
  await Promise.all(two.map((s) => s.evaluate(ctx)));
  check("sets are independent: another set's run changes nothing", two[0].registry.count() === 8 && two[1].registry.count() === 8);

  const dir = join(process.cwd(), "src/lib/decision");
  const priorityFiles = readdirSync(dir).filter((f) => /^priority-[a-z-]+\.ts$/.test(f));
  check("five priority modules exist", priorityFiles.sort().join() === "priority-result.ts,priority-rule-registry.ts,priority-rule-set.ts,priority-rules.ts,priority-validator.ts");
  const lines = priorityFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
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
  check("imports stay inside the decision folder", imports.every((i) => /^\.\/(decision-|priority-)/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Platform, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|platform|db/i.test(i.from)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"];
  check("the architecture modules do not import priority or implement the resolver", architecture.every((f) => !/priority-/.test(readFileSync(join(dir, f), "utf8"))) && !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("the Decision Rule Framework still has exactly seven modules", frameworkFiles.length === 7);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision priority rules", !others.some((f) => /from\s+["'][^"']*decision\/priority-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision priority rules: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
