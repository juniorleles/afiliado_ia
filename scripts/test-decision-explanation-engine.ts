import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createDecisionRuleContext } from "../src/lib/decision/decision-rule-context.ts";
import { createDecisionRulePipeline } from "../src/lib/decision/decision-rule-pipeline.ts";
import { createDecisionRuleModuleRegistry } from "../src/lib/decision/decision-rule-registry.ts";
import type { DecisionRuleModule, DecisionRuleOutput } from "../src/lib/decision/decision-rule-contract.ts";
import { createDecisionResolver } from "../src/lib/decision/decision-resolver-host.ts";
import {
  DECISION_COLLECTING_SECTION_KINDS,
  DECISION_DIMENSION_SECTION_KINDS,
  DECISION_EXPLANATION_ITEM_KINDS,
  DECISION_EXPLANATION_SECTION_KINDS,
  DECISION_EXPLANATION_SECTION_STATES,
  DECISION_EXPLANATION_SECTION_TITLES,
  createDecisionExplanationSection,
  createDecisionSectionBuilder,
} from "../src/lib/decision/decision-explanation-section.ts";
import { DECISION_EXPLANATION_KEYS, DECISION_EXPLANATION_SCOPE_NOTE } from "../src/lib/decision/decision-explanation-result.ts";
import { createDecisionExplanationValidator } from "../src/lib/decision/decision-explanation-validator.ts";
import { createDecisionExplanationBuilder } from "../src/lib/decision/decision-explanation-builder.ts";
import { DECISION_EXPLANATION_SCHEMA_VERSION, createDecisionExplanationFormatter } from "../src/lib/decision/decision-explanation-formatter.ts";
import { createDecisionExplanationEngine } from "../src/lib/decision/decision-explanation-engine.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const zero = () => 0;
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));
const stable = (value: unknown) => JSON.stringify(value, (k, v) => (k === "executionTime" ? 0 : v));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

function fakeRule(id: string, over: { category?: DecisionRuleModule["category"]; output?: DecisionRuleOutput; evaluate?: () => DecisionRuleOutput } = {}): DecisionRuleModule {
  return {
    id,
    name: `Rule ${id}`,
    version: "1.0.0",
    category: over.category ?? "READINESS",
    enabled: true,
    priority: 100,
    dependencies: { requires: [], optional: [], conflicts: [] },
    supportsDecision: () => true,
    validate: () => [],
    evaluate: over.evaluate ?? (() => over.output ?? { status: "PASS", confidence: null, metadata: {}, warnings: [], errors: [] }),
  };
}

function engineOf(now: () => number = zero) {
  return createDecisionExplanationEngine({ now });
}

async function main() {
  check("ten sections, in the requested order", DECISION_EXPLANATION_SECTION_KINDS.join() === "DECISION_STATE,DECISION_TRACE,READINESS_SUMMARY,QUALITY_SUMMARY,PRIORITY_SUMMARY,ELIGIBLE_ACTIONS,BLOCKING_RULES,WARNINGS,MISSING_INFORMATION,EXECUTION_SUMMARY");
  check("dimension and collecting kinds cover every section", [...DECISION_DIMENSION_SECTION_KINDS, ...DECISION_COLLECTING_SECTION_KINDS].sort().join() === [...DECISION_EXPLANATION_SECTION_KINDS].sort().join());
  check("section titles match the requested names", DECISION_EXPLANATION_SECTION_TITLES.DECISION_STATE === "Decision State" && DECISION_EXPLANATION_SECTION_TITLES.ELIGIBLE_ACTIONS === "Eligible Actions" && DECISION_EXPLANATION_SECTION_TITLES.EXECUTION_SUMMARY === "Execution Summary");
  check("item kinds and section states are the documented sets", DECISION_EXPLANATION_ITEM_KINDS.join() === "FINDING,WARNING,ERROR,MISSING" && DECISION_EXPLANATION_SECTION_STATES.join() === "REPORTED,NONE,NOT_RUN");
  check("an explanation has exactly the requested fields", DECISION_EXPLANATION_KEYS.join() === "analysisId,candidateId,summary,sectionBreakdown,decisionTrace,blockingReasons,eligibleActions,warnings,missingInformation,metadata,executionTime");

  const analysis = await createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-fixed" }).resolve(complete());
  const engine = engineOf();
  const outcome = engine.explain(analysis);
  check("a complete analysis is explained", outcome.status === "EXPLAINED" && outcome.explanation !== null && outcome.issues.length === 0);
  const ex = outcome.explanation!;
  check("the explanation has exactly the documented fields", Object.keys(ex).join() === DECISION_EXPLANATION_KEYS.join());
  check("ten sections in the documented order", ex.sectionBreakdown.map((s) => s.kind).join() === DECISION_EXPLANATION_SECTION_KINDS.join());
  check("the summary restates status and eligible actions", /Decision CLEARED/.test(ex.summary) && /analysis COMPLETED/.test(ex.summary) && ex.eligibleActions.includes("ready-for-publication"));
  check("the decision trace has one entry per recorded rule", ex.decisionTrace.length === analysis.recordedExecutions.length && ex.decisionTrace.every((entry, i) => entry.ruleId === analysis.recordedExecutions[i]?.ruleId));
  check("blocking reasons are empty when the analysis is cleared", ex.blockingReasons.length === 0 && ex.sectionBreakdown.find((s) => s.kind === "BLOCKING_RULES")?.state === "NONE");
  check("validateExplanation accepts the built explanation", engine.validator.validateExplanation(ex).length === 0);
  check("the explanation is frozen", Object.isFrozen(ex) && Object.isFrozen(ex.sectionBreakdown) && Object.isFrozen(ex.decisionTrace) && Object.isFrozen(ex.metadata));
  check("executionTime comes from the injected clock", ex.executionTime === 0);

  const validator = createDecisionExplanationValidator();
  check("Missing Analysis is rejected", has(validator.validateInput(null), /Missing analysis/) && has(engine.validate(undefined), /Missing analysis/) && engine.explain(null).status === "REJECTED");
  check("Missing Snapshot is rejected", has(validator.validateInput({ ...analysis, ruleResults: undefined }), /Missing snapshot/) && has(validator.validateInput({ ...analysis, recordedExecutions: "nope" }), /Missing snapshot/));
  check("Invalid Metadata is rejected", has(validator.validateInput({ ...copy(analysis), metadata: { nested: { x: 1 } } }), /Invalid metadata/));
  check("Invalid Sections: a missing kind is rejected", has(validator.validateSection({ title: "x" }), /Invalid sections/));
  check("Invalid Sections: the wrong number of sections is rejected", has(validator.validateExplanation({ ...ex, sectionBreakdown: ex.sectionBreakdown.slice(0, 3) }), /Invalid sections/));
  const extraField = { ...ex, score: 1 };
  check("an extra numeric field on the explanation is rejected", has(validator.validateExplanation(extraField), /Unexpected field/));

  const before = JSON.stringify(analysis);
  engine.explain(analysis);
  engine.render(analysis);
  engine.validate(analysis);
  createDecisionExplanationBuilder().build(analysis);
  check("No mutation: explaining does not change the analysis", JSON.stringify(analysis) === before);
  try {
    (ex as { summary: string }).summary = "hacked";
    (analysis as { status: string }).status = "PENDING";
  } catch {
    /* frozen */
  }
  check("Snapshot immutable: the analysis and the explanation stay frozen under assignment", analysis.status === "COMPLETED" && ex.summary !== "hacked");

  const detached = copy(analysis);
  check("Snapshot reused: a plain JSON copy of the analysis, with no resolver behind it, explains identically", stable(engine.explain(detached).explanation) === stable(ex));

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
  }).resolve(complete());
  const afterResolver = evaluates;
  const spyEngine = engineOf();
  spyEngine.explain(spyAnalysis);
  spyEngine.explain(spyAnalysis);
  spyEngine.render(spyAnalysis);
  check("No duplicated execution: explaining does not run rules again", evaluates === afterResolver && afterResolver === 1);
  check("the spied snapshot is enough to explain the rule that ran", spyEngine.explain(spyAnalysis).explanation?.decisionTrace.map((e) => e.ruleId).join() === "spy-rule");

  const refused = await createDecisionResolver({ now: zero, timestamp: () => "2026-01-01T00:00:00.000Z", idFactory: () => "analysis-refused" }).resolve(createDecisionRuleContext());
  const refusedEx = engine.explain(refused);
  check("a refused analysis can still be explained from its snapshot", refusedEx.status === "EXPLAINED" && refusedEx.explanation?.summary.includes("REFUSED") === true && refusedEx.explanation.decisionTrace.length === 0);

  const formatter = createDecisionExplanationFormatter();
  const rendered = engine.render(analysis);
  check("compact report includes every section title", DECISION_EXPLANATION_SECTION_KINDS.every((k) => rendered.compact!.includes(DECISION_EXPLANATION_SECTION_TITLES[k])) && rendered.compact!.endsWith(DECISION_EXPLANATION_SCOPE_NOTE));
  check("detailed report includes the decision trace", rendered.detailed!.includes("Decision trace") && rendered.detailed!.includes("ready-for-publication") && rendered.detailed!.endsWith(DECISION_EXPLANATION_SCOPE_NOTE));
  check("JSON is machine-readable", JSON.parse(rendered.json!).format === "decision-explanation" && JSON.parse(rendered.json!).schemaVersion === DECISION_EXPLANATION_SCHEMA_VERSION);
  check("UI view model lists the ten sections and eligible actions", rendered.view!.sections.map((s) => s.id).join() === DECISION_EXPLANATION_SECTION_KINDS.join() && rendered.view!.eligibleActions.includes("ready-for-publication") && rendered.view!.note === DECISION_EXPLANATION_SCOPE_NOTE);
  check("short summary matches the explanation summary", rendered.short === ex.summary && formatter.formatShortSummary(ex) === ex.summary);
  check("rejected input renders empty views", engine.render(null).compact === null && engine.render(null).json === null && engine.render(null).view === null);

  const section = createDecisionExplanationSection({ kind: "WARNINGS", state: "NONE", summary: "No warnings were reported.", items: [] });
  check("a section builder produces a frozen titled section", section.title === "Warnings" && Object.isFrozen(section) && createDecisionSectionBuilder().build);

  const thrower = createDecisionExplanationEngine({ builder: { build: () => { throw new Error("builder exploded"); } }, now: zero }).explain(analysis);
  check("a builder that throws is rejected, not thrown", thrower.status === "REJECTED" && /could not be built/.test(thrower.issues[0]?.message ?? ""));

  const first = engineOf().explain(analysis).explanation;
  const second = engineOf().explain(analysis).explanation;
  check("Independent execution: two engines given the same snapshot return the same explanation", stable(first) === stable(second));

  const dir = join(process.cwd(), "src/lib/decision");
  const names = readdirSync(dir).filter((f) => /^decision-explanation-[a-z]+\.ts$/.test(f));
  check("six explanation modules exist", names.sort().join() === "decision-explanation-builder.ts,decision-explanation-engine.ts,decision-explanation-formatter.ts,decision-explanation-result.ts,decision-explanation-section.ts,decision-explanation-validator.ts");
  const lines = names.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, CPC, or campaign logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no execution planner and no parallel execution", !bare.some((l) => /executionPlan|buildExecutionPlan|Execution Planner|Promise\.all|Promise\.race/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  const allowed = /^\.\/(decision-explanation-[a-z]+|decision-resolver-analysis|decision-resolver-validator|decision-rule-contract|decision-rule-context|decision-types|decision-validator)$/;
  check("the engine imports only the analysis snapshot, its validator, and its own modules", imports.every((i) => allowed.test(i.from)));
  check("the engine imports no pipeline, registry, executor, or resolver entry, so it cannot execute a rule", !imports.some((i) => /rule-(pipeline|registry|executor|resolver)|resolver-(pipeline|host|recorder)|readiness-|quality-|priority-|action-/.test(i.from)));
  check("the engine calls no run, evaluate, or resolve member", !code.some((l) => /\.(run|evaluate|resolve|register|enable|disable)\(/.test(l)));
  check("the engine reads the clock in exactly one place", code.filter((l) => /performance\.now/.test(l)).length === 1 && code.some((l) => /options\.now\s*\?\?/.test(l)));
  check("freezing is used on what the engine builds", code.some((l) => /freezeDeepDecisionRule\(/.test(l)));
  const architecture = ["decision-types.ts", "decision-analysis.ts", "decision-registry.ts", "decision-validator.ts", "decision-engine.ts", "decision-resolver.ts"];
  check("the architecture modules do not import the explanation engine", architecture.every((f) => !/decision-explanation-/.test(readFileSync(join(dir, f), "utf8"))));
  const frameworkFiles = readdirSync(dir).filter((f) => /^decision-rule-[a-z]+\.ts$/.test(f));
  check("the Decision Rule Framework still has exactly seven modules", frameworkFiles.length === 7);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, or Platform module imports the decision explanation engine", !others.some((f) => /decision-explanation-/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nDecision explanation engine: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
