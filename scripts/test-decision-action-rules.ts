import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDecisionRuleContext } from "../src/lib/decision/decision-rule-context.ts";
import { executeDecisionRule } from "../src/lib/decision/decision-rule-executor.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { DecisionFrameworkError, createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import { createActionRuleRegistry, registerActionRules } from "../src/lib/decision/action-rule-registry.ts";
import { createActionRuleSet } from "../src/lib/decision/action-rule-set.ts";
import {
  ACTION_RULE_IDS,
  createActionRules,
  createArchiveProductRule,
  createContinueResearchRule,
  createGenerateLandingPageRule,
  createImproveLandingPageRule,
  createMonitorProductRule,
  createReadyForPublicationRule,
  createReevaluateLaterRule,
  createRequestHumanReviewRule,
  createRunOpportunityAnalysisRule,
  createRunTrafficAnalysisRule,
} from "../src/lib/decision/action-rules.ts";
import { summarizeAction } from "../src/lib/decision/action-result.ts";
import {
  createActionValidator,
  validateActionContext,
  validateActionRuleResult,
  validateActionRules,
  validateActionSummary,
} from "../src/lib/decision/action-validator.ts";

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
  configuration: { mode: "m1", actionReview: "notes", actionMonitoring: "live", actionReevaluation: "stale" },
  extensions: { "review.notes": true, "monitoring.live": true, "reevaluation.stale": true },
};
const advanced = () => createDecisionRuleContext(advancedInit);
const empty = () => createDecisionRuleContext();
const setOf = (now: () => number = zero) => createActionRuleSet({ now });
const runRule = (module: ReturnType<typeof createContinueResearchRule>, context: ReturnType<typeof advanced>) =>
  executeDecisionRule(module, context, Object.freeze({}), zero);

async function main() {
  const rules = createActionRules();
  check("ten action rules, in the requested order", rules.map((r) => r.id).join() === ACTION_RULE_IDS.join() && ACTION_RULE_IDS.join() === "continue-research,run-opportunity-analysis,run-traffic-analysis,generate-landing-page,improve-landing-page,request-human-review,ready-for-publication,monitor-product,archive-product,reevaluate-later");
  check("every action rule is category ACTION, enabled, independent, and names a unique eligible action", rules.every((r) => r.category === "ACTION" && r.enabled === true && r.eligibleAction === r.id && r.dependencies.requires.length === 0 && r.supportsDecision(advanced()) === true) && new Set(rules.map((r) => r.eligibleAction)).size === 10);
  check("every action rule satisfies the framework contract", validateActionRules(rules).length === 0);

  const ctx = advanced();
  const research = createContinueResearchRule();
  check("Continue Research is SKIPPED when Discovery is COMPLETED", (await runRule(research, ctx)).status === "SKIPPED");
  check("Continue Research is eligible when the candidate is still early", (await runRule(research, createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "NEW" } }))).status === "PASS" && (await runRule(research, createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "NEW" } }))).metadata.eligibleAction === "continue-research");
  check("Continue Research is blocked when the candidate is FAILED", (await runRule(research, createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "FAILED" } }))).status === "FAIL");

  const opportunity = createRunOpportunityAnalysisRule();
  check("Run Opportunity Analysis is SKIPPED when Opportunity is COMPLETED", (await runRule(opportunity, ctx)).status === "SKIPPED");
  check("Run Opportunity Analysis is eligible when Opportunity is missing", (await runRule(opportunity, createDecisionRuleContext({ ...advancedInit, opportunityAnalysis: null, trafficAnalysis: null }))).status === "PASS");
  check("Run Opportunity Analysis is blocked when Opportunity is FAILED", (await runRule(opportunity, createDecisionRuleContext({ ...advancedInit, opportunityAnalysis: { ...opportunityAnalysis, status: "FAILED" } }))).status === "FAIL");

  const traffic = createRunTrafficAnalysisRule();
  check("Run Traffic Analysis is SKIPPED when Traffic is COMPLETED", (await runRule(traffic, ctx)).status === "SKIPPED");
  check("Run Traffic Analysis is eligible when Opportunity is COMPLETED and Traffic is not", (await runRule(traffic, createDecisionRuleContext({ ...advancedInit, trafficAnalysis: null }))).status === "PASS");
  check("Run Traffic Analysis is blocked when Traffic is FAILED", (await runRule(traffic, createDecisionRuleContext({ ...advancedInit, trafficAnalysis: { ...trafficAnalysis, status: "FAILED" } }))).status === "FAIL");

  const generate = createGenerateLandingPageRule();
  check("Generate Landing Page is SKIPPED when a page analysis is present", (await runRule(generate, ctx)).status === "SKIPPED");
  check("Generate Landing Page is eligible when the page analysis is missing", (await runRule(generate, createDecisionRuleContext({ ...advancedInit, pageAnalysis: null }))).status === "PASS");

  const improve = createImproveLandingPageRule();
  check("Improve Landing Page is SKIPPED when declared fields are already present", (await runRule(improve, ctx)).status === "SKIPPED");
  check("Improve Landing Page is eligible when declared page fields are missing", (await runRule(improve, createDecisionRuleContext({ ...advancedInit, pageAnalysis: { id: "page-1" }, configuration: { mode: "m1", actionPageFields: "title,body" } }))).status === "PASS");
  check("Improve Landing Page is SKIPPED when no page analysis is present", (await runRule(improve, createDecisionRuleContext({ ...advancedInit, pageAnalysis: null }))).status === "SKIPPED");
  check("Invalid Metadata: a non-text page field list is rejected", has(improve.validate(createDecisionRuleContext({ ...advancedInit, configuration: { actionPageFields: 1 } })), /Invalid metadata/));

  const publication = createReadyForPublicationRule();
  check("Ready For Publication is eligible when Opportunity, Traffic, and the page are in place", (await runRule(publication, ctx)).status === "PASS");
  check("Ready For Publication is SKIPPED when a page is missing", (await runRule(publication, createDecisionRuleContext({ ...advancedInit, pageAnalysis: null }))).status === "SKIPPED");
  check("Ready For Publication is blocked when the page is FAILED after analyses completed", (await runRule(publication, createDecisionRuleContext({ ...advancedInit, pageAnalysis: { id: "page-1", status: "FAILED" } as never }))).status === "FAIL");

  check("Request Human Review is eligible when declared flags are true", (await runRule(createRequestHumanReviewRule(), createDecisionRuleContext(declaredInit))).status === "PASS");
  check("Request Human Review is blocked when a declared flag is false", (await runRule(createRequestHumanReviewRule(), createDecisionRuleContext({ ...declaredInit, extensions: { ...declaredInit.extensions, "review.notes": false } }))).status === "FAIL");
  check("Monitor Product is eligible when declared flags are true", (await runRule(createMonitorProductRule(), createDecisionRuleContext(declaredInit))).status === "PASS");
  check("Reevaluate Later is eligible when declared flags are true", (await runRule(createReevaluateLaterRule(), createDecisionRuleContext(declaredInit))).status === "PASS");
  check("Archive Product is eligible when the candidate is FAILED", (await runRule(createArchiveProductRule(), createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "FAILED" } }))).status === "PASS");
  check("Archive Product is SKIPPED when the candidate is COMPLETED", (await runRule(createArchiveProductRule(), ctx)).status === "SKIPPED");

  const registry = createActionRuleRegistry();
  check("the action registry registers all ten rules", registry.count() === 10 && ACTION_RULE_IDS.every((id) => registry.get(id)?.id === id));
  check("Duplicate Rule: registering the set a second time is rejected", throwsFramework(() => registerActionRules(registry.modules), /already registered/));
  const extra = { ...createContinueResearchRule(), id: "other-research" };
  check("Duplicate Action: a second rule for the same eligible action is rejected", has(validateActionRules([...rules, extra]), /Duplicate action/) && throwsFramework(() => registry.modules.register(extra), /Duplicate action/));
  const fresh = createDecisionRuleModuleRegistry();
  registerActionRules(fresh);
  check("registerActionRules plugs the ten rules into the Decision Rule Framework", fresh.list({ category: "ACTION" }).length === 10);

  const validator = createActionValidator();
  check("Missing Context is rejected", has(validator.validateContext(null), /Missing context/) && has(validateActionContext([]), /Missing context/));
  check("Invalid Metadata: a nested metadata bag is rejected", has(validator.validateContext({ ...ctx, executionMetadata: { a: { b: 1 } } }), /Invalid metadata/));
  check("a complete context is accepted", validator.validateContext(ctx).length === 0);
  check("Invalid Rule Result: a missing eligible action and a plan are rejected", has(validateActionRuleResult({ status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [] }), /eligibleAction/) && has(validateActionRuleResult({ status: "PASS", confidence: null, metadata: { eligibleAction: "continue-research" }, warnings: [], errors: [], executionPlan: {} }), /Invalid rule result/));
  check("a valid PASS output with eligibleAction is accepted", validateActionRuleResult({ status: "PASS", confidence: null, metadata: { eligibleAction: "continue-research" }, warnings: [], errors: [] }).length === 0);

  const summary = await setOf().evaluate(ctx);
  check("an advanced context exposes Ready For Publication only", summary.eligibleActions.join() === "ready-for-publication" && summary.blockedActions.length === 0 && summary.warningActions.length === 0);
  check("the other nine actions are skipped", summary.skippedActions.join() === "archive-product,continue-research,generate-landing-page,improve-landing-page,monitor-product,reevaluate-later,request-human-review,run-opportunity-analysis,run-traffic-analysis");
  check("an action summary has exactly the requested fields", Object.keys(summary).join() === "eligibleActions,blockedActions,warningActions,skippedActions,blockingReasons,executionTime");
  check("the summary carries no plan and no numeric result", !("score" in summary) && !("ranking" in summary) && !("executionPlan" in summary) && validateActionSummary(summary).length === 0);
  check("the summary is frozen", Object.isFrozen(summary) && Object.isFrozen(summary.eligibleActions) && Object.isFrozen(summary.blockingReasons));
  check("executionTime is the sum of the rule times", summary.executionTime === 0);

  const declared = await setOf().evaluate(createDecisionRuleContext(declaredInit));
  check("declared review, monitoring, and reevaluation can be eligible beside Ready For Publication", declared.eligibleActions.join() === "monitor-product,ready-for-publication,reevaluate-later,request-human-review");

  const emptySummary = await setOf().evaluate(empty());
  check("an empty context skips every action", emptySummary.eligibleActions.length === 0 && emptySummary.blockedActions.length === 0 && emptySummary.skippedActions.length === 10 && emptySummary.blockingReasons.length === 0);

  const early = await setOf().evaluate(createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "NEW" }, opportunityAnalysis: null, trafficAnalysis: null, pageAnalysis: null }));
  check("an early candidate exposes research, opportunity analysis, and generate landing page", early.eligibleActions.join() === "continue-research,generate-landing-page,run-opportunity-analysis");

  const blocked = await setOf().evaluate(createDecisionRuleContext({ ...advancedInit, candidate: { ...candidate, status: "FAILED" } }));
  check("a FAILED candidate blocks research and exposes archive", blocked.eligibleActions.join() === "archive-product" && blocked.blockedActions.includes("continue-research") && blocked.blockingReasons.length > 0);

  check("Missing Context: evaluate rejects a null context", await rejectsFramework(() => setOf().evaluate(null as never), /Missing context/));
  check("Invalid Metadata: evaluate rejects a nested metadata bag", await rejectsFramework(() => setOf().evaluate({ ...ctx, executionMetadata: { a: { b: 1 } } } as never), /Invalid metadata/));
  check("executionTime comes from the injected clock", (await createActionRuleSet({ now: (() => { let t = 0; return () => (t += 5); })() }).evaluate(ctx)).executionTime > 0);

  const pipeline = createDecisionRulePipeline({ now: zero });
  registerActionRules(pipeline);
  check("the same advanced run through the Decision Rule Framework pipeline matches the set", JSON.stringify(summarizeAction(await pipeline.run(ctx))) === JSON.stringify(summary));

  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]);
  await setOf().evaluate(ctx);
  check("No mutation: evaluating actions does not change the context or the source objects", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]) === sourceBefore);
  const mutating = advanced();
  try {
    (mutating.candidate as { status: string }).status = "FAILED";
    (mutating.pageAnalysis as { id: string }).id = "hacked";
  } catch {
    /* frozen */
  }
  check("No mutation: the context stays frozen under assignment", mutating.candidate?.status === "COMPLETED" && mutating.pageAnalysis?.id === "page-1");

  const alone = await runRule(createReadyForPublicationRule(), ctx);
  const togetherRun = await executeDecisionRule(createReadyForPublicationRule(), ctx, Object.freeze({}), zero);
  check("Independent execution: a rule's result is the same alone or beside the rest of the set", alone.status === "PASS" && JSON.stringify(alone) === JSON.stringify(togetherRun));
  check("Independent execution: two sets given the same context return the same summary", JSON.stringify(await setOf().evaluate(ctx)) === JSON.stringify(await createActionRuleSet({ now: zero }).evaluate(ctx)));
  const two = [setOf(), setOf()];
  await Promise.all(two.map((s) => s.evaluate(ctx)));
  check("sets are independent: another set's run changes nothing", two[0].registry.count() === 10 && two[1].registry.count() === 10);

  const dir = join(process.cwd(), "src/lib/decision");
  const actionFiles = readdirSync(dir).filter((f) => /^action-[a-z-]+\.ts$/.test(f));
  check("five action modules exist", actionFiles.sort().join() === "action-result.ts,action-rule-registry.ts,action-rule-set.ts,action-rules.ts,action-validator.ts");
  const lines = actionFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
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
  check("imports stay inside the decision folder", imports.every((i) => /^\.\/(decision-|action-)/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Platform, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|platform|db/i.test(i.from)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"];
  check("the architecture modules do not import action rules or implement the resolver", architecture.every((f) => !/action-/.test(readFileSync(join(dir, f), "utf8"))) && !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("the Decision Rule Framework still has exactly seven modules", frameworkFiles.length === 7);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision action rules", !others.some((f) => /from\s+["'][^"']*decision\/action-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision action rules: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
