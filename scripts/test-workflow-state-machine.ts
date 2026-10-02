import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WORKFLOW_STATES, WORKFLOW_STATE_TRANSITIONS } from "../src/lib/workflow/workflow-types.ts";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import { createWorkflowStateMachine } from "../src/lib/workflow/workflow-state-machine-host.ts";
import { createWorkflowStateSnapshot, freezeDeepWorkflow, WORKFLOW_STATE_SNAPSHOT_KEYS } from "../src/lib/workflow/workflow-state-snapshot.ts";
import { createWorkflowTransitionRegistry, defaultWorkflowTransitions, WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";
import { resolveWorkflowNextState } from "../src/lib/workflow/workflow-transition-resolver.ts";
import { createWorkflowTransitionValidator, isWorkflowTerminalState } from "../src/lib/workflow/workflow-transition-validator.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

const context: WorkflowContext = {
  decisionAnalysis: { id: "d-1" },
  decisionStatus: "COMPLETED",
  decisionMetadata: { status: "COMPLETED" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};

function clocks() {
  return {
    now: () => 1,
    timestamp: () => "2026-01-01T00:00:00.000Z",
  };
}

async function main() {
  check("eleven workflow states, in the requested order", WORKFLOW_STATES.join() === "CREATED,DISCOVERED,OPPORTUNITY_ANALYZED,TRAFFIC_ANALYZED,LP_GENERATED,UNDER_REVIEW,READY_FOR_PUBLICATION,PUBLISHED,MONITORING,ARCHIVED,FAILED");
  check("ARCHIVED and FAILED are terminal", isWorkflowTerminalState("ARCHIVED") && isWorkflowTerminalState("FAILED") && !isWorkflowTerminalState("CREATED"));
  check("a state snapshot has exactly the requested fields", WORKFLOW_STATE_SNAPSHOT_KEYS.join() === "currentState,previousState,transition,timestamp,metadata");

  const validator = createWorkflowTransitionValidator();
  const registry = createWorkflowTransitionRegistry();
  check("the default registry holds every stage and every allowed move", registry.listStates().join() === WORKFLOW_STATES.join() && registry.listTransitions().length === defaultWorkflowTransitions().length);
  check("Unknown State is rejected", has(validator.validateState("NOPE"), /Unknown State/) && has(validator.validateState(null), /Unknown State/));
  check("Unknown Transition is rejected", has(validator.validateTransition({ from: "CREATED", to: "PUBLISHED" }), /Unknown Transition/) && validator.validateTransition({ from: "CREATED", to: "DISCOVERED" }).length === 0);
  check("Invalid Transition: a self-move is rejected", has(validator.validateTransition({ from: "CREATED", to: "CREATED" }), /Invalid Transition/));
  check("Invalid Metadata is rejected", has(validator.validateMetadata({ a: { b: 1 } }), /Invalid metadata/) && validator.validateMetadata({ note: "ok", n: 1, flag: true, none: null }).length === 0);
  check("Circular Transition is rejected", has(validator.validateGraph([{ from: "CREATED", to: "DISCOVERED" }, { from: "DISCOVERED", to: "CREATED" }]), /Circular Transition/));
  check("Rollback Validation rejects a backward move", has(validator.validateRollback("DISCOVERED", "CREATED"), /Rollback Validation/) && validator.validateRollback("CREATED", "DISCOVERED").length === 0);
  check("Rollback Validation rejects leaving a terminal stage", has(validator.validateRollback("ARCHIVED", "MONITORING"), /Rollback Validation/) && has(validator.validateRollback("FAILED", "CREATED"), /Rollback Validation/));

  const empty = createWorkflowTransitionRegistry({ seed: false });
  empty.registerState("CREATED");
  let duplicateState = false;
  try {
    empty.registerState("CREATED");
  } catch (error) {
    duplicateState = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate State/);
  }
  check("Duplicate State: a second registration is rejected", duplicateState && empty.listStates().length === 1);

  empty.registerState("DISCOVERED");
  empty.registerState("FAILED");
  empty.registerTransition({ from: "CREATED", to: "DISCOVERED" });
  let duplicateTransition = false;
  try {
    empty.registerTransition({ from: "CREATED", to: "DISCOVERED" });
  } catch (error) {
    duplicateTransition = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate Transition/);
  }
  check("Duplicate Transition: a second from-to pair is rejected", duplicateTransition && empty.listTransitions().length === 1);

  const next = resolveWorkflowNextState("CREATED", registry);
  check("Resolve Next State is the unique forward stage", next.state === "DISCOVERED" && next.issues.length === 0);
  check("Resolve Next State is null on a terminal stage", resolveWorkflowNextState("ARCHIVED", registry).state === null && resolveWorkflowNextState("FAILED", registry).state === null);
  check("Resolve Next State does not choose among several forwards", resolveWorkflowNextState("CREATED", { allowed: () => ["DISCOVERED", "PUBLISHED"] } as never).issues.some((i) => /does not choose/.test(i.message)));
  check("Unknown State is rejected by the resolver", has(resolveWorkflowNextState("NOPE").issues, /Unknown State/));

  const machine = createWorkflowStateMachine(clocks());
  check("the machine names allowed moves from the registry", machine.allowedTransitions("CREATED").join() === "DISCOVERED,FAILED" && machine.canTransition("CREATED", "DISCOVERED") === true && machine.canTransition("CREATED", "PUBLISHED") === false);
  const applied = machine.apply({ from: "CREATED", to: "DISCOVERED", context, metadata: { step: "advance" } });
  check("a valid move is applied", applied.status === "APPLIED" && applied.snapshot !== null);
  check("the snapshot stores current, previous, transition, timestamp, and metadata", applied.snapshot?.currentState === "DISCOVERED" && applied.snapshot?.previousState === "CREATED" && applied.snapshot?.transition?.from === "CREATED" && applied.snapshot?.transition?.to === "DISCOVERED" && applied.snapshot?.timestamp === "2026-01-01T00:00:00.000Z" && applied.snapshot?.metadata.step === "advance" && applied.snapshot?.metadata.decisionAnalysisId === "d-1" && applied.snapshot?.metadata["execution.run"] === "r1");
  check("the snapshot is frozen", Object.isFrozen(applied.snapshot) && Object.isFrozen(applied.snapshot?.metadata) && Object.isFrozen(applied.snapshot?.transition));

  const failed = machine.apply({ from: "CREATED", to: "FAILED", context });
  check("FAILED is an allowed terminal move", failed.status === "APPLIED" && failed.snapshot?.currentState === "FAILED");

  const invalid = machine.apply({ from: "CREATED", to: "PUBLISHED", context });
  check("Invalid / unknown moves are rejected and produce no snapshot", invalid.status === "REJECTED" && invalid.snapshot === null && has(invalid.issues, /Unknown Transition/));
  const rollback = machine.apply({ from: "DISCOVERED", to: "CREATED", context });
  check("a rollback is rejected", rollback.status === "REJECTED" && has(rollback.issues, /Rollback Validation/));
  const unknownState = machine.apply({ from: "NOPE" as never, to: "CREATED", context });
  check("an unknown stage is rejected", unknownState.status === "REJECTED" && has(unknownState.issues, /Unknown State/));
  const badMetadata = machine.apply({ from: "CREATED", to: "DISCOVERED", metadata: { a: { b: 1 } } as never });
  check("Invalid Metadata is rejected on apply", badMetadata.status === "REJECTED" && has(badMetadata.issues, /Invalid metadata/));

  const first = machine.apply({ from: "CREATED", to: "DISCOVERED", context, metadata: { step: "advance" } });
  const second = machine.apply({ from: "CREATED", to: "DISCOVERED", context, metadata: { step: "advance" } });
  check("Deterministic transitions: the same inputs produce the same snapshot", JSON.stringify(first) === JSON.stringify(second));

  const contextBefore = JSON.stringify(context);
  machine.apply({ from: "CREATED", to: "DISCOVERED", context });
  check("No mutation: apply does not change the context", JSON.stringify(context) === contextBefore);
  const held = applied.snapshot!;
  try {
    (held as { currentState: string }).currentState = "FAILED";
    (held.metadata as { step: string }).step = "hacked";
  } catch {
    /* frozen */
  }
  check("Snapshot immutable under assignment", held.currentState === "DISCOVERED" && held.metadata.step === "advance");

  const opened = machine.snapshotOf("CREATED", context);
  check("an opening snapshot has no previous stage and no transition", opened.currentState === "CREATED" && opened.previousState === null && opened.transition === null && opened.metadata.decisionAnalysisId === "d-1");
  check("validateSnapshot accepts an applied snapshot", validator.validateSnapshot(applied.snapshot).length === 0 && has(validator.validateSnapshot(null), /Missing snapshot/));

  const made = createWorkflowStateSnapshot({ currentState: "CREATED", timestamp: "2026-01-01T00:00:00.000Z", metadata: { k: 1 } });
  check("createWorkflowStateSnapshot freezes a copy", Object.isFrozen(made) && made.previousState === null && freezeDeepWorkflow(made) === made);

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the architecture Decision-style contracts remain six modules", architecture.every((f) => readdirSync(dir).includes(f)));
  check("the architecture state machine stays a contract", !/export\s+(async\s+)?function|export\s+class|createWorkflowStateMachine/.test(readFileSync(join(dir, "workflow-state-machine.ts"), "utf8")));
  const implementation = ["workflow-state-machine-host.ts", "workflow-state-snapshot.ts", "workflow-transition-registry.ts", "workflow-transition-resolver.ts", "workflow-transition-validator.ts"];
  check("the five state-machine modules are present", implementation.every((f) => readdirSync(dir).includes(f)));
  const files = readdirSync(dir).filter((f) => implementation.includes(f));
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, campaign, bid, or cost logic, comments included", !lines.some((l) => /google|\bads?\b|keyword|\bcpc\b|\bcpa\b|search volume|campaign|adwords|\bbid\b|budget/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("no AI, network, database, file access, or timers in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|appendFile|node:fs|child_process|crawl|scrap|localStorage|INSERT |\.save\(/.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no queue, scheduler, retry, or execution plan", !bare.some((l) => /executionPlan|buildExecutionPlan|Queue|Scheduler|Retry|Promise\.all|Promise\.race/.test(l)));
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports stay inside the workflow folder", imports.every((i) => /^\.\/workflow-/.test(i.from)));
  check("nothing imports Decision, Opportunity, Discovery, Traffic, the LP Builder, Platform, or the database", !imports.some((i) => /decision|opportunity|discovery|traffic|lp-builder|platform|product-facts|db/i.test(i.from)));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports the workflow state machine", !others.some((f) => /workflow-state-machine-host|workflow-transition-|workflow-state-snapshot/.test(readFileSync(f, "utf8"))));
  void WORKFLOW_STATE_TRANSITIONS;

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow state machine: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
