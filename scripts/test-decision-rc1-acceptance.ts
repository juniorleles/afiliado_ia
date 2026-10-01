/**
 * Decision Intelligence Engine — RC1 acceptance audit.
 * Validation only. Does not add engine behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createDecisionRuleContext } from "../src/lib/decision/decision-rule-context.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { createDecisionRuleModuleRegistry, DecisionFrameworkError } from "../src/lib/decision/decision-rule-registry.ts";
import { resolveDecisionRuleOrder } from "../src/lib/decision/decision-rule-resolver.ts";
import { validateDecisionRuleDependencies } from "../src/lib/decision/decision-rule-validator.ts";
import type { DecisionRuleModule, DecisionRuleOutput } from "../src/lib/decision/decision-rule-contract.ts";
import { registerReadinessRules } from "../src/lib/decision/readiness-rule-registry.ts";
import { registerQualityRules } from "../src/lib/decision/quality-rule-registry.ts";
import { registerPriorityRules } from "../src/lib/decision/priority-rule-registry.ts";
import { createActionRuleRegistry, registerActionRules } from "../src/lib/decision/action-rule-registry.ts";
import { createContinueResearchRule } from "../src/lib/decision/action-rules.ts";
import { createReadinessRuleSet } from "../src/lib/decision/readiness-rule-set.ts";
import { createDecisionResolver } from "../src/lib/decision/decision-resolver-host.ts";
import { DECISION_DIMENSIONS, DECISION_PIPELINE_STAGES, createDecisionPipeline } from "../src/lib/decision/decision-resolver-pipeline.ts";
import { createDecisionResolverValidator } from "../src/lib/decision/decision-resolver-validator.ts";
import { createDecisionExplanationEngine } from "../src/lib/decision/decision-explanation-engine.ts";
import { createDecisionExplanationValidator } from "../src/lib/decision/decision-explanation-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const zero = () => 0;

function clocks() {
  let t = 0;
  let s = 0;
  let n = 0;
  return {
    now: () => (t += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `analysis-${(n += 1)}`,
  };
}

function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}
async function timedAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const candidate = { id: "cand-1", source: "feed", url: "https://example.test/gizmo", title: "Fictional item", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z" };
const opportunityAnalysis = { id: "opp-1", candidateId: "cand-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const trafficAnalysis = { id: "traf-1", candidateId: "cand-1", opportunityAnalysisId: "opp-1", status: "COMPLETED" as const, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", version: 1 };
const pageAnalysis = { id: "page-1", title: "Hero", body: "Body copy." };
const completeInit = {
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
    "validation.schema": true,
    "explanation.opportunity": true,
    "override.title": true,
    "effective.title": true,
  },
};
const complete = () => createDecisionRuleContext(completeInit);

function fakeRule(id: string, over: { requires?: string[]; category?: DecisionRuleModule["category"]; evaluate?: () => DecisionRuleOutput } = {}): DecisionRuleModule {
  return {
    id,
    name: `Rule ${id}`,
    version: "1.0.0",
    category: over.category ?? "READINESS",
    enabled: true,
    priority: 100,
    dependencies: { requires: over.requires ?? [], optional: [], conflicts: [] },
    supportsDecision: () => true,
    validate: () => [],
    evaluate: over.evaluate ?? (() => ({ status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [] })),
  };
}

async function main() {
  const validator = createDecisionResolverValidator();
  const registry = createDecisionRuleModuleRegistry();
  registerReadinessRules(registry);
  check("Decision Registry holds the eight readiness rules", registry.list({ category: "READINESS" }).length === 8 && registry.count() === 8);
  let duplicateRule = false;
  try {
    registerReadinessRules(registry);
  } catch (error) {
    duplicateRule = error instanceof DecisionFrameworkError && /already registered/.test(error.message + error.issues.map((i) => i.message).join(" "));
  }
  check("Duplicate Rule: registering the same rule id a second time is rejected", duplicateRule && registry.count() === 8);
  registerQualityRules(registry);
  registerPriorityRules(registry);
  registerActionRules(registry);
  check("Decision Registry holds all thirty-four rules across four dimensions", registry.count() === 34 && registry.list({ category: "QUALITY" }).length === 8 && registry.list({ category: "PRIORITY" }).length === 8 && registry.list({ category: "ACTION" }).length === 10);

  const pipeline = createDecisionPipeline({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-rc1" });
  check("Decision Pipeline exposes four unique dimensions", pipeline.dimensions.map((d) => d.category).join() === DECISION_DIMENSIONS.join() && new Set(pipeline.dimensions.map((d) => d.category)).size === 4);
  check("Decision Pipeline has the eight stages", DECISION_PIPELINE_STAGES.join() === "RESOLVE_CANDIDATE,LOAD_OPPORTUNITY_ANALYSIS,LOAD_TRAFFIC_ANALYSIS,LOAD_LANDING_PAGE_ANALYSIS,EXECUTE_DECISION_DIMENSIONS,VALIDATE_RESULTS,RESOLVE_CONFLICTS,BUILD_ANALYSIS");
  check("Duplicate Dimension: each default dimension is registered once", new Set(DECISION_DIMENSIONS).size === DECISION_DIMENSIONS.length && pipeline.dimensions.every((d, i) => pipeline.dimensions.findIndex((o) => o.category === d.category) === i));
  const duplicatedDimensions = await createDecisionResolver({
    dimensions: [
      { category: "READINESS", pipeline: createReadinessRuleSet({ now: zero }).pipeline },
      { category: "READINESS", pipeline: createReadinessRuleSet({ now: zero }).pipeline },
    ],
    now: zero,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "analysis-dup-dim",
  }).resolve(complete());
  check("Duplicate Dimension: injecting the same category twice is refused as a repeated rule", duplicatedDimensions.decisionStatus === "REFUSED" && duplicatedDimensions.errors.some((line) => /ran more than once/.test(line)));

  const actionRegistry = createActionRuleRegistry();
  let duplicateAction = false;
  try {
    actionRegistry.modules.register({ ...createContinueResearchRule(), id: "other-research" });
  } catch (error) {
    duplicateAction = error instanceof DecisionFrameworkError && /Duplicate action/.test(error.message + error.issues.map((i) => i.message).join(" "));
  }
  check("Duplicate Action: a second rule for the same eligible action is rejected", duplicateAction && actionRegistry.count() === 10);

  const empty = () => createDecisionRuleContext();
  check("Missing Candidate is rejected", has(validator.validateInput(empty()), /Missing candidate/) && has(createDecisionResolver({ now: zero }).validate(empty()), /Missing candidate/) && has(createDecisionResolver({ now: zero }).validate(null), /Missing candidate/));
  check("Missing Opportunity Analysis is rejected", has(validator.validateOpportunityAnalysis({ candidate }), /Missing analysis/) && has(validator.validateOpportunityAnalysis({ candidate }), /Opportunity analysis/));
  check("Missing Traffic Analysis is rejected", has(validator.validateTrafficAnalysis({ candidate }), /Missing analysis/) && has(validator.validateTrafficAnalysis({ candidate }), /Traffic analysis/));
  check("Missing LP Analysis is rejected", has(validator.validatePageAnalysis({ candidate }), /Missing analysis/) && has(validator.validatePageAnalysis({ candidate }), /page analysis/));
  check("Missing Rule Registry is rejected", has(validator.validateRuleRegistry(null), /Missing Rule Registry/) && has(createDecisionResolver({ dimensions: [], ...clocks() }).validate(complete()), /Missing Rule Registry/));
  check("Invalid Metadata is rejected", has(validator.validateInput({ ...complete(), executionMetadata: { a: { b: 1 } } }), /Invalid metadata/) && has(createDecisionResolver({ now: zero }).validate({ ...completeInit, executionMetadata: { nested: { x: 1 } } }), /Invalid metadata/));
  check("Invalid Rule Result is rejected", has(validator.validateRuleResult(null), /Invalid rule result/) && has(validator.validateRuleResult({ status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [], executionPlan: {} }), /Invalid rule result/) && has(validator.validateRuleResult({ status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [], score: 1 }), /Invalid rule result/));

  const cycle = createDecisionRuleModuleRegistry();
  cycle.register(fakeRule("alpha", { requires: ["beta"] }));
  cycle.register(fakeRule("beta", { requires: ["alpha"] }));
  check("Circular Dependencies are rejected", has(validator.validateDependencies(cycle.list()), /Circular/) && has(validateDecisionRuleDependencies(cycle.list()), /Circular/) && resolveDecisionRuleOrder(cycle.list()).order.length === 0 && resolveDecisionRuleOrder(cycle.list()).issues.length > 0);

  const ctx = complete();
  const analysis = await createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-fixed" }).resolve(ctx);
  const analysisBefore = JSON.stringify(analysis);
  check("Decision Resolver returns a frozen snapshot", analysis.status === "COMPLETED" && analysis.decisionStatus === "CLEARED" && Object.isFrozen(analysis) && Object.isFrozen(analysis.ruleResults));
  check("Decision Snapshot carries recorded executions and rule results", Array.isArray(analysis.recordedExecutions) && Array.isArray(analysis.ruleResults) && analysis.recordedExecutions.length === 34 && new Set(analysis.recordedExecutions.map((e) => e.ruleId)).size === 34);
  check("Decision Dimensions all ran", analysis.executedDimensions.join() === "READINESS,QUALITY,PRIORITY,ACTION");
  check("Decision Metadata is flat", Object.values(analysis.metadata).every((v) => v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number"));
  check("Decision Validation accepts the snapshot", validator.validateAnalysis(analysis).length === 0);

  const explained = createDecisionExplanationEngine({ now: zero }).explain(analysis);
  check("Decision Explanation explains the snapshot", explained.status === "EXPLAINED" && explained.explanation !== null);
  check("Decision Trace matches recorded executions", explained.explanation!.decisionTrace.length === analysis.recordedExecutions.length && explained.explanation!.decisionTrace[0]?.ruleId === analysis.recordedExecutions[0]?.ruleId);
  check("Decision Explanation Validation accepts the explanation", createDecisionExplanationValidator().validateExplanation(explained.explanation).length === 0);

  let evaluates = 0;
  const spyRegistry = createDecisionRuleModuleRegistry();
  spyRegistry.register(
    fakeRule("spy-rule", {
      evaluate: () => {
        evaluates += 1;
        return { status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [] };
      },
    }),
  );
  const spyAnalysis = await createDecisionResolver({
    dimensions: [{ category: "READINESS", pipeline: createDecisionRulePipeline({ registry: spyRegistry, now: zero }) }],
    now: zero,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    idFactory: () => "analysis-spy",
  }).resolve(ctx);
  const afterResolver = evaluates;
  createDecisionExplanationEngine({ now: zero }).explain(spyAnalysis);
  createDecisionExplanationEngine({ now: zero }).explain(spyAnalysis);
  check("Duplicate Execution: explaining does not run rules again", evaluates === afterResolver && afterResolver === 1);
  check("Rules execute exactly once on the resolver run", spyAnalysis.recordedExecutions.filter((e) => e.ruleId === "spy-rule").length === 1);

  const contextBefore = JSON.stringify(ctx);
  await createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-mut" }).resolve(ctx);
  try {
    (analysis as { status: string }).status = "PENDING";
  } catch {
    /* frozen */
  }
  check("No mutation: resolving does not change the context or the snapshot", JSON.stringify(ctx) === contextBefore && JSON.stringify(analysis) === analysisBefore && analysis.status === "COMPLETED");
  check("Snapshot immutable under assignment", analysis.status === "COMPLETED");

  const registerTimed = timed(() => {
    const fresh = createDecisionRuleModuleRegistry();
    registerReadinessRules(fresh);
    registerQualityRules(fresh);
    registerPriorityRules(fresh);
    registerActionRules(fresh);
    return fresh.count();
  });
  const resolveTimed = timed(() => {
    const fresh = createDecisionRuleModuleRegistry();
    registerReadinessRules(fresh);
    registerQualityRules(fresh);
    registerPriorityRules(fresh);
    registerActionRules(fresh);
    return resolveDecisionRuleOrder(fresh.list());
  });
  const resolverTimed = await timedAsync(() =>
    createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-perf" }).resolve(ctx),
  );
  const explainedTimed = timed(() => createDecisionExplanationEngine({ now: zero }).explain(resolverTimed.value));
  const snapshotTimed = timed(() => JSON.parse(JSON.stringify(resolverTimed.value)));
  const snapshotValidateTimed = timed(() => validator.validateAnalysis(resolverTimed.value));
  const perfRows: Array<[string, number, boolean]> = [
    ["Rule Registration", registerTimed.ms, registerTimed.value === 34],
    ["Rule Resolution", resolveTimed.ms, resolveTimed.value.order.length === 34 && resolveTimed.value.issues.length === 0],
    ["Decision Resolver", resolverTimed.ms, resolverTimed.value.status === "COMPLETED"],
    ["Decision Explanation", explainedTimed.ms, explainedTimed.value.status === "EXPLAINED"],
    ["Snapshot Creation", snapshotTimed.ms, snapshotTimed.value.analysisId === "analysis-perf"],
    ["Snapshot Validation", snapshotValidateTimed.ms, snapshotValidateTimed.value.length === 0],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check(`${name} completes in under 2000ms`, ok && ms < 2000);
  }

  const dir = join(process.cwd(), "src/lib/decision");
  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  const joined = files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("No Product Names in the Decision engine", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("No Campaign IDs in the Decision engine", !bare.some((l) => /campaignId|campaigns\b|lp_page_versions/.test(l)));
  check("No Google Ads logic (API, bids, keywords, adwords)", !bare.some((l) => /googleads|adwords|\bcpc\b|\bcpa\b|\bbid\b|keyword planner|ads api/i.test(l)));
  check("No business-specific rules (score, rank, weight, formula, recommend)", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("No Hidden Switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("No ProductFacts import or mutation", !joined.includes("product-facts") && !bare.some((l) => /ProductFacts|productFacts/.test(l)));
  const valueImports = [...joined.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  check("No Discovery, Opportunity, or Traffic value imports (type-only references only)", !valueImports.some((from) => /discovery|opportunity|traffic/.test(from)));
  check("No Discovery, Opportunity, or Traffic mutation", !bare.some((l) => /\.(candidate|opportunityAnalysis|trafficAnalysis|pageAnalysis)\s*=(?!=)/.test(l)));
  check("No LP Builder, Platform, HTTP, database, or file writes in the Decision engine", !code.some((l) => /fetch\(|node:http|better-sqlite3|getDb|writeFile|appendFile|node:fs/.test(l)) && !valueImports.some((from) => /lp-builder|platform/.test(from)));
  const architecture = ["decision-analysis.ts", "decision-engine.ts", "decision-registry.ts", "decision-resolver.ts", "decision-types.ts", "decision-validator.ts"];
  check("Backward compatibility: architecture remains six contract modules", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Backward compatibility: Decision Rule Framework remains seven modules", readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f)).length === 7);
  check("Backward compatibility: architecture Decision Resolver stays a contract", !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));

  const dbDir = join(process.cwd(), "data");
  const dbFiles = readdirSync(dbDir).filter((n) => n.startsWith("presell-os.db"));
  for (const name of dbFiles) {
    const info = statSync(join(dbDir, name));
    console.log(`DB: ${name} ${info.size} ${info.mtime.toISOString()}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} RC1 check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision Intelligence Engine RC1 acceptance: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
