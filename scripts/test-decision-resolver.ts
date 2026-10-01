import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDecisionRuleContext } from "../src/lib/decision/decision-rule-context.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import type { DecisionRuleModule, DecisionRuleOutput } from "../src/lib/decision/decision-rule-contract.ts";
import { RESOLVED_DECISION_ANALYSIS_KEYS } from "../src/lib/decision/decision-resolver-analysis.ts";
import { createDecisionResolver } from "../src/lib/decision/decision-resolver-host.ts";
import {
  DECISION_DIMENSIONS,
  DECISION_PIPELINE_STAGES,
  createDecisionPipeline,
  resolveDecisionConflicts,
} from "../src/lib/decision/decision-resolver-pipeline.ts";
import { createDecisionExecutionRecorder } from "../src/lib/decision/decision-resolver-recorder.ts";
import { createDecisionResolverValidator } from "../src/lib/decision/decision-resolver-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

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
const empty = () => createDecisionRuleContext();

let calls: string[] = [];
function fakeRule(id: string, over: { requires?: string[]; conflicts?: string[]; category?: DecisionRuleModule["category"]; output?: DecisionRuleOutput } = {}): DecisionRuleModule {
  return {
    id,
    name: `Rule ${id}`,
    version: "1.0.0",
    category: over.category ?? "READINESS",
    enabled: true,
    priority: 100,
    dependencies: { requires: over.requires ?? [], optional: [], conflicts: over.conflicts ?? [] },
    supportsDecision: () => true,
    validate: () => [],
    evaluate: () => {
      calls.push(id);
      return over.output ?? { status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [] };
    },
  };
}

function resolver(extra: Record<string, unknown> = {}) {
  return createDecisionResolver({ ...clocks(), ...extra } as never);
}

async function main() {
  const validator = createDecisionResolverValidator();
  check("eight pipeline stages, in the requested order", DECISION_PIPELINE_STAGES.join() === "RESOLVE_CANDIDATE,LOAD_OPPORTUNITY_ANALYSIS,LOAD_TRAFFIC_ANALYSIS,LOAD_LANDING_PAGE_ANALYSIS,EXECUTE_DECISION_DIMENSIONS,VALIDATE_RESULTS,RESOLVE_CONFLICTS,BUILD_ANALYSIS");
  check("four decision dimensions, in the requested order", DECISION_DIMENSIONS.join() === "READINESS,QUALITY,PRIORITY,ACTION");
  check("a resolved analysis has exactly the requested fields", RESOLVED_DECISION_ANALYSIS_KEYS.join() === "analysisId,candidateId,status,decisionStatus,executedDimensions,executedRules,failedRules,warnings,errors,metadata,executionTime,startedAt,completedAt,opportunityAnalysisId,trafficAnalysisId,pageAnalysisId,ruleResults,recordedExecutions,executionMetadata,pipelineMetadata,blockingRules,conflictingRules,missingEvidence,skippedRules");

  check("Missing Candidate is rejected", has(validator.validateInput(empty()), /Missing candidate/) && has(resolver().validate(empty()), /Missing candidate/) && has(resolver().validate(null), /Missing candidate/));
  check("Missing Analysis is rejected", has(validator.validateOpportunityAnalysis({ candidate }), /Missing analysis/) && has(validator.validateTrafficAnalysis({ candidate }), /Missing analysis/) && has(validator.validatePageAnalysis({ candidate }), /Missing analysis/));
  check("Missing Rule Registry is rejected", has(validator.validateRuleRegistry(null), /Missing Rule Registry/) && has(createDecisionResolver({ dimensions: [], ...clocks() }).validate(complete()), /Missing Rule Registry/));
  check("Invalid Metadata is rejected", has(validator.validateInput({ ...complete(), executionMetadata: { a: { b: 1 } } }), /Invalid metadata/) && has(resolver().validate({ ...completeInit, executionMetadata: { nested: { x: 1 } } }), /Invalid metadata/));
  check("Invalid Rule Result is rejected", has(validator.validateRuleResult(null), /Invalid rule result/) && has(validator.validateRuleResult({ status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [], executionPlan: {} }), /Invalid rule result/) && has(validator.validateRuleResult({ status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [], score: 1 }), /Invalid rule result/));
  check("a valid PASS rule result is accepted", validator.validateRuleResult({ status: "PASS", confidence: null, metadata: { k: 1 }, warnings: [], errors: [], ruleId: "alpha", executionTime: 1 }).length === 0);

  const modules = createDecisionRuleModuleRegistry();
  modules.register(fakeRule("alpha", { requires: ["beta"] }));
  modules.register(fakeRule("beta", { requires: ["alpha"] }));
  check("Circular Dependencies are rejected", has(validator.validateDependencies(modules.list()), /Circular Dependencies/) && has(createDecisionResolver({ dimensions: [{ category: "READINESS", pipeline: createDecisionRulePipeline({ registry: modules, now: zero }) }], ...clocks() }).validate(complete()), /Circular/));

  const refused = await resolver().resolve(empty());
  check("a missing candidate refuses the analysis", refused.status === "FAILED" && refused.decisionStatus === "REFUSED" && refused.candidateId === null && refused.executedDimensions.length === 0);
  check("a refused analysis still has the requested fields", Object.keys(refused).join() === RESOLVED_DECISION_ANALYSIS_KEYS.join());

  const missingRegistry = await createDecisionResolver({ dimensions: [], ...clocks() }).resolve(complete());
  check("a missing registry refuses the analysis", missingRegistry.decisionStatus === "REFUSED" && has(createDecisionResolver({ dimensions: [], ...clocks() }).validate(complete()), /Missing Rule Registry/));

  const circularRun = await createDecisionResolver({
    dimensions: [{ category: "READINESS", pipeline: createDecisionRulePipeline({ registry: modules, now: zero }) }],
    ...clocks(),
  }).resolve(complete());
  check("circular dependencies refuse the run before any rule executes", circularRun.decisionStatus === "REFUSED" && circularRun.executedRules.length === 0 && circularRun.errors.some((line) => /Circular/.test(line)));

  const conflictRegistry = createDecisionRuleModuleRegistry();
  conflictRegistry.register(fakeRule("left", { conflicts: ["right"] }));
  conflictRegistry.register(fakeRule("right", { conflicts: ["left"] }));
  const conflictRun = await createDecisionResolver({
    dimensions: [{ category: "READINESS", pipeline: createDecisionRulePipeline({ registry: conflictRegistry, now: zero }) }],
    ...clocks(),
  }).resolve(complete());
  check("conflicting enabled rules resolve as CONFLICT and do not run", conflictRun.decisionStatus === "CONFLICT" && conflictRun.executedRules.length === 0 && conflictRun.conflictingRules.includes("left") && conflictRun.conflictingRules.includes("right"));

  const ctx = complete();
  const run = await resolver().run(ctx);
  const analysis = run.analysis;
  check("a complete context completes the analysis", analysis.status === "COMPLETED" && analysis.decisionStatus === "CLEARED" && analysis.candidateId === "cand-1");
  check("all four dimensions run", analysis.executedDimensions.join() === "READINESS,QUALITY,PRIORITY,ACTION");
  check("every enabled rule ran exactly once", analysis.recordedExecutions.length === 34 && new Set(analysis.recordedExecutions.map((entry) => entry.ruleId)).size === 34);
  check("failed rules are empty when the context is complete", analysis.failedRules.length === 0 && analysis.blockingRules.length === 0);
  check("the snapshot carries the loaded analysis ids", analysis.opportunityAnalysisId === "opp-1" && analysis.trafficAnalysisId === "traf-1" && analysis.pageAnalysisId === "page-1");
  check("the analysis carries no plan", !("executionPlan" in analysis) && !("plan" in analysis) && !("actions" in analysis));
  check("the analysis is frozen", Object.isFrozen(analysis) && Object.isFrozen(analysis.executedRules) && Object.isFrozen(analysis.metadata) && Object.isFrozen(analysis.ruleResults));
  check("validateAnalysis accepts the snapshot", validator.validateAnalysis(analysis).length === 0);
  check("the eight stages ran", run.stages.map((stage) => stage.stage).join() === DECISION_PIPELINE_STAGES.join() && run.stages.every((stage) => stage.status === "PASSED"));
  check("executionTime comes from the injected clock", analysis.executionTime > 0);
  const resolved = await resolver().resolve(ctx);
  check("run() and resolve() both return a frozen analysis", Object.isFrozen(analysis) && Object.isFrozen(resolved) && resolved.decisionStatus === "CLEARED");

  const blocked = await resolver().resolve(createDecisionRuleContext({ ...completeInit, candidate: { ...candidate, status: "FAILED" } }));
  check("blocking FAIL rules resolve as BLOCKED", blocked.decisionStatus === "BLOCKED" && blocked.status === "COMPLETED" && blocked.blockingRules.includes("discovery-available") && blocked.failedRules.includes("discovery-available"));

  const warningRegistry = createDecisionRuleModuleRegistry();
  warningRegistry.register(fakeRule("warn-rule", { output: { status: "WARNING", confidence: null, metadata: {}, warnings: ["A warning was recorded."], errors: [] } }));
  const warningRun = await createDecisionResolver({
    dimensions: [{ category: "READINESS", pipeline: createDecisionRulePipeline({ registry: warningRegistry, now: zero }) }],
    ...clocks(),
  }).resolve(complete());
  check("WARNING results resolve as WARNING", warningRun.decisionStatus === "WARNING" && warningRun.warnings.includes("A warning was recorded.") && warningRun.executedRules.join() === "warn-rule");

  const skipRegistry = createDecisionRuleModuleRegistry();
  skipRegistry.register(fakeRule("gap-rule", { output: { status: "SKIPPED", confidence: null, metadata: {}, warnings: ["Missing evidence for a declared claim."], errors: [] } }));
  const incomplete = await createDecisionResolver({
    dimensions: [{ category: "READINESS", pipeline: createDecisionRulePipeline({ registry: skipRegistry, now: zero }) }],
    ...clocks(),
  }).resolve(complete());
  check("skipped missing evidence resolves as INCOMPLETE", incomplete.decisionStatus === "INCOMPLETE" && incomplete.missingEvidence.join() === "gap-rule" && incomplete.skippedRules.join() === "gap-rule" && incomplete.executedRules.length === 0);

  const conflictDecision = resolveDecisionConflicts({
    refusals: [],
    runError: null,
    results: [],
    conflictingRules: ["left", "right"],
    circular: false,
  });
  check("conflict resolution is deterministic and does not vote", conflictDecision.outcome === "CONFLICT" && resolveDecisionConflicts({ refusals: ["x"], runError: null, results: [], conflictingRules: ["left"], circular: false }).outcome === "REFUSED");

  calls = [];
  const spyRegistry = createDecisionRuleModuleRegistry();
  spyRegistry.register(fakeRule("once-rule"));
  await createDecisionResolver({
    dimensions: [{ category: "QUALITY", pipeline: createDecisionRulePipeline({ registry: spyRegistry, now: zero }) }],
    ...clocks(),
  }).resolve(complete());
  check("Rules execute exactly once", calls.join() === "once-rule");

  const recorder = createDecisionExecutionRecorder();
  recorder.record({ ruleId: "once-rule", status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [], executionTime: 1 }, "READINESS");
  recorder.record({ ruleId: "once-rule", status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [], executionTime: 1 }, "READINESS");
  check("the recorder reports a rule that was heard twice", recorder.repeats().join() === "once-rule" && recorder.drain().length === 2 && recorder.drain().length === 0);

  const contextBefore = JSON.stringify(ctx);
  const sourceBefore = JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]);
  await resolver().resolve(ctx);
  check("No mutation: resolving does not change the context or the source objects", JSON.stringify(ctx) === contextBefore && JSON.stringify([candidate, opportunityAnalysis, trafficAnalysis, pageAnalysis]) === sourceBefore);
  const mutating = complete();
  try {
    (mutating.candidate as { status: string }).status = "FAILED";
    (mutating.pageAnalysis as { id: string }).id = "hacked";
    (analysis as { status: string }).status = "PENDING";
  } catch {
    /* frozen */
  }
  check("Snapshot immutable: the context and the analysis stay frozen under assignment", mutating.candidate?.status === "COMPLETED" && mutating.pageAnalysis?.id === "page-1" && analysis.status === "COMPLETED");

  const first = await createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-fixed" }).resolve(ctx);
  const second = await createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-fixed" }).resolve(ctx);
  check("Independent execution: two resolvers given the same context return the same snapshot", JSON.stringify(first) === JSON.stringify(second));

  const pipeline = createDecisionPipeline({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-fixed" });
  check("the pipeline exposes the four dimensions", pipeline.dimensions.map((d) => d.category).join() === DECISION_DIMENSIONS.join());

  const dir = join(process.cwd(), "src/lib/decision");
  const resolverFiles = readdirSync(dir).filter((f) => /^decision-resolver-[a-z]+\.ts$/.test(f));
  check("five resolver modules exist", resolverFiles.sort().join() === "decision-resolver-analysis.ts,decision-resolver-host.ts,decision-resolver-pipeline.ts,decision-resolver-recorder.ts,decision-resolver-validator.ts");
  const lines = resolverFiles.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or campaign logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no execution planner and no parallel execution", !bare.some((l) => /executionPlan|buildExecutionPlan|Execution Planner|Promise\.all|Promise\.race/.test(l)) && !code.some((l) => /\bplan\s*\(/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports stay inside the decision folder", imports.every((i) => /^\.\/(decision-|readiness-|quality-|priority-|action-)/.test(i.from)));
  check("nothing imports the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Platform, or the database", !imports.some((i) => /lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|platform|db/i.test(i.from)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"];
  check("the architecture Decision Resolver contract remains unimplemented", !/export\s+(async\s+)?function|export\s+class|createDecisionResolver/.test(readFileSync(join(dir, "decision-resolver.ts"), "utf8")));
  check("the architecture modules do not import the resolver implementation", architecture.every((f) => !/decision-resolver-/.test(readFileSync(join(dir, f), "utf8"))));
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("the Decision Rule Framework still has exactly seven modules", frameworkFiles.length === 7);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision resolver", !others.some((f) => /decision-resolver-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision resolver: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
