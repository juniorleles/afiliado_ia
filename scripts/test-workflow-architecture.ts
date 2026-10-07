import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WORKFLOW_CONTEXT_MEMBERS, WORKFLOW_STATES, WORKFLOW_STATE_TRANSITIONS } from "../src/lib/workflow/workflow-types.ts";
import type { Workflow, WorkflowEvent, WorkflowMetadata, WorkflowSnapshot, WorkflowState, WorkflowTransition } from "../src/lib/workflow/workflow-types.ts";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import type { WorkflowIssue, WorkflowValidator } from "../src/lib/workflow/workflow-validator.ts";
import type { WorkflowRegistry } from "../src/lib/workflow/workflow-registry.ts";
import type { WorkflowStateMachine } from "../src/lib/workflow/workflow-state-machine.ts";
import type { WorkflowEngine, WorkflowEngineDependencies } from "../src/lib/workflow/workflow-engine.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const metadata: WorkflowMetadata = { note: "fixture", n: 1, flag: true, none: null };
const event: WorkflowEvent = { id: "ev-1", name: "await-research", metadata };
const transition: WorkflowTransition = { from: "CREATED", to: "DISCOVERED" };
const workflow: Workflow = {
  id: "wf-1",
  candidateId: "cand-1",
  decisionAnalysisId: "d-1",
  state: "CREATED",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  version: 1,
  executionTime: null,
  metadata,
};
const snapshot: WorkflowSnapshot = {
  state: "CREATED",
  allowedTransitions: ["DISCOVERED", "FAILED"],
  pendingEvents: [event],
  metadata,
  executionTime: 0,
};
const context: WorkflowContext = {
  decisionAnalysis: { id: "d-1" },
  decisionStatus: "COMPLETED",
  decisionMetadata: { status: "COMPLETED" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};

function keyOf(t: WorkflowTransition): string {
  return `${t.from}->${t.to}`;
}

function hasCycle(transitions: WorkflowTransition[]): boolean {
  const edges = new Map<string, string[]>();
  for (const item of transitions) {
    edges.set(item.from, [...(edges.get(item.from) ?? []), item.to]);
  }
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (seen.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) if (walk(next)) return true;
    visiting.delete(node);
    seen.add(node);
    return false;
  };
  return [...edges.keys()].some(walk);
}

function fakeRegistry(): WorkflowRegistry {
  const states = new Set<WorkflowState>();
  const transitions = new Map<string, WorkflowTransition>();
  const stateIssues = (input: unknown): WorkflowIssue[] =>
    typeof input === "string" && (WORKFLOW_STATES as readonly string[]).includes(input) ? [] : [{ field: "state", message: "Invalid Transition: an unknown stage is rejected." }];
  const transitionIssues = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || !("from" in input) || !("to" in input)) {
      return [{ field: "transition", message: "Invalid Transition: a from-to pair is required." }];
    }
    const item = input as WorkflowTransition;
    if (!(WORKFLOW_STATES as readonly string[]).includes(item.from) || !(WORKFLOW_STATES as readonly string[]).includes(item.to)) {
      return [{ field: "transition", message: "Invalid Transition: an unknown stage is rejected." }];
    }
    return [];
  };
  return {
    registerState: (state) => {
      if (states.has(state)) throw new Error("Duplicate State");
      states.add(state);
      return state;
    },
    registerTransition: (item) => {
      const id = keyOf(item);
      if (transitions.has(id)) throw new Error("Duplicate Transition");
      transitions.set(id, item);
      return item;
    },
    getState: (state) => (states.has(state) ? state : null),
    getTransition: (from, to) => transitions.get(`${from}->${to}`) ?? null,
    listStates: () => [...states],
    listTransitions: () => [...transitions.values()],
    validateState: stateIssues,
    validateTransition: transitionIssues,
  };
}

const validator: WorkflowValidator = {
  validateState: (input) => (typeof input === "string" && (WORKFLOW_STATES as readonly string[]).includes(input) ? [] : [{ field: "state", message: "Invalid Transition: an unknown stage is rejected." }]),
  validateTransition: (input) => {
    if (typeof input !== "object" || input === null) return [{ field: "transition", message: "Invalid Transition: a from-to pair is required." }];
    const item = input as { from?: unknown; to?: unknown };
    if (typeof item.from !== "string" || typeof item.to !== "string") return [{ field: "transition", message: "Invalid Transition: a from-to pair is required." }];
    if (!(WORKFLOW_STATES as readonly string[]).includes(item.from) || !(WORKFLOW_STATES as readonly string[]).includes(item.to)) {
      return [{ field: "transition", message: "Invalid Transition: an unknown stage is rejected." }];
    }
    const allowed = WORKFLOW_STATE_TRANSITIONS[item.from as WorkflowState];
    if (!allowed.includes(item.to as WorkflowState)) return [{ field: "transition", message: "Invalid Transition: the move is not an allowed next stage." }];
    return [];
  },
  validateWorkflow: (input) => (input == null ? [{ field: "workflow", message: "Missing workflow: a workflow record is required." }] : []),
  validateSnapshot: (input) => (input == null ? [{ field: "snapshot", message: "Missing snapshot: a workflow snapshot is required." }] : []),
  validateContext: (input) => (input == null ? [{ field: "context", message: "Missing context: a workflow context is required." }] : []),
  validateMetadata: (input) =>
    input !== null && typeof input === "object" && !Array.isArray(input) && Object.values(input as object).every((v) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      ? []
      : [{ field: "metadata", message: "Invalid metadata: a flat record is required." }],
  validateGraph: (transitions) => {
    const issues: WorkflowIssue[] = [];
    const seen = new Set<string>();
    for (const item of transitions) {
      const id = keyOf(item);
      if (seen.has(id)) issues.push({ field: "transitions", message: "Duplicate Transition: the same from-to pair is already registered." });
      seen.add(id);
      issues.push(...validator.validateTransition(item));
    }
    if (hasCycle(transitions)) issues.push({ field: "transitions", message: "Circular Transition: a cycle is not allowed." });
    return issues;
  },
};

async function main() {
  check("eleven workflow states, in the requested order", WORKFLOW_STATES.join() === "CREATED,DISCOVERED,OPPORTUNITY_ANALYZED,TRAFFIC_ANALYZED,LP_GENERATED,UNDER_REVIEW,READY_FOR_PUBLICATION,PUBLISHED,MONITORING,ARCHIVED,FAILED");
  check("six context members, in the requested order", WORKFLOW_CONTEXT_MEMBERS.join() === "decisionAnalysis,decisionStatus,decisionMetadata,executionMetadata,runtimeMetadata,configuration");
  check("every state is distinct", new Set(WORKFLOW_STATES).size === 11);
  const next = (s: WorkflowState) => WORKFLOW_STATE_TRANSITIONS[s];
  check("transitions cover every state and only move forward", WORKFLOW_STATES.every((s) => s in WORKFLOW_STATE_TRANSITIONS) && next("CREATED").join() === "DISCOVERED,FAILED" && next("MONITORING").join() === "ARCHIVED,FAILED");
  check("ARCHIVED and FAILED are final", next("ARCHIVED").length === 0 && next("FAILED").length === 0);
  check("every transition target is a known state", WORKFLOW_STATES.every((s) => next(s).every((t) => WORKFLOW_STATES.includes(t))));
  const defaultGraph: WorkflowTransition[] = WORKFLOW_STATES.flatMap((from) => next(from).map((to) => ({ from, to })));
  check("the default graph has no cycle", !hasCycle(defaultGraph) && validator.validateGraph(defaultGraph).length === 0);

  check("a workflow has exactly the requested fields", Object.keys(workflow).join() === "id,candidateId,decisionAnalysisId,state,createdAt,updatedAt,completedAt,version,executionTime,metadata");
  check("a snapshot has exactly the requested output fields", Object.keys(snapshot).join() === "state,allowedTransitions,pendingEvents,metadata,executionTime");
  check("a transition has exactly from and to", Object.keys(transition).join() === "from,to");
  check("an event has exactly the requested fields", Object.keys(event).join() === "id,name,metadata");
  check("a context has exactly the six members", Object.keys(context).join() === WORKFLOW_CONTEXT_MEMBERS.join());
  check("the snapshot carries no execution plan", !("executionPlan" in snapshot) && !("plan" in workflow) && !("actions" in snapshot));

  const registry = fakeRegistry();
  const stateMachine: WorkflowStateMachine = {
    allowedTransitions: (from) => WORKFLOW_STATE_TRANSITIONS[from],
    canTransition: (from, to) => WORKFLOW_STATE_TRANSITIONS[from].includes(to),
  };
  const dependencies: WorkflowEngineDependencies = { registry, validator, stateMachine };
  const engine: WorkflowEngine = {
    inspect: async (ctx) => ({
      ...snapshot,
      metadata: { ...ctx.configuration },
    }),
    getWorkflow: () => null,
  };

  for (const state of WORKFLOW_STATES) registry.registerState(state);
  registry.registerTransition(transition);
  registry.registerTransition({ from: "CREATED", to: "FAILED" });
  check("the registry registers, gets, and lists states", registry.getState("CREATED") === "CREATED" && registry.getState("DISCOVERED") === "DISCOVERED" && registry.listStates().length === 11);
  check("the registry registers, gets, and lists transitions", registry.getTransition("CREATED", "DISCOVERED")?.to === "DISCOVERED" && registry.getTransition("CREATED", "PUBLISHED") === null && registry.listTransitions().length === 2);
  check("the registry validates without registering", registry.validateState("CREATED").length === 0 && registry.validateState("NOPE").length === 1 && registry.getTransition("LP_GENERATED", "UNDER_REVIEW") === null);
  let duplicateState = false;
  try {
    registry.registerState("CREATED");
  } catch {
    duplicateState = true;
  }
  check("Duplicate State: a second registration is rejected", duplicateState && registry.listStates().length === 11);
  let duplicateTransition = false;
  try {
    registry.registerTransition(transition);
  } catch {
    duplicateTransition = true;
  }
  check("Duplicate Transition: a second from-to pair is rejected", duplicateTransition && registry.listTransitions().length === 2);
  check("Invalid Transition is rejected by the validator contract", validator.validateTransition({ from: "CREATED", to: "PUBLISHED" }).some((i) => /Invalid Transition/.test(`${i.field} ${i.message}`)) && validator.validateTransition({ from: "CREATED", to: "DISCOVERED" }).length === 0);
  check("Circular Transition is rejected by the validator contract", validator.validateGraph([{ from: "CREATED", to: "DISCOVERED" }, { from: "DISCOVERED", to: "CREATED" }]).some((i) => /Circular Transition/.test(`${i.field} ${i.message}`)));
  check("Invalid Metadata is rejected by the validator contract", validator.validateMetadata({ a: { b: 1 } }).some((i) => /Invalid metadata/.test(`${i.field} ${i.message}`)) && validator.validateMetadata(metadata).length === 0);
  check("the state machine names allowed moves and does not invent them", stateMachine.allowedTransitions("CREATED").join() === "DISCOVERED,FAILED" && stateMachine.canTransition("CREATED", "DISCOVERED") === true && stateMachine.canTransition("CREATED", "PUBLISHED") === false && stateMachine.allowedTransitions("FAILED").length === 0);
  const inspected = await engine.inspect(context);
  check("the engine inspects a context and returns a snapshot", inspected.state === "CREATED" && inspected.allowedTransitions.join() === "DISCOVERED,FAILED" && inspected.pendingEvents[0]?.id === "ev-1" && inspected.executionTime === 0 && engine.getWorkflow("nope") === null);
  void dependencies;

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the six architecture modules are present", architecture.every((f) => readdirSync(dir).includes(f)));
  const files = readdirSync(dir).filter((f) => architecture.includes(f));
  check("exactly the six architecture modules exist", files.sort().join() === architecture.slice().sort().join());
  const lines = files.flatMap((f) => readFileSync(join(dir, f), "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const imports = [...code.join("\n").matchAll(/import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  check("imports were found", imports.length >= 6);
  check("every import is type-only and from inside the workflow folder", imports.every((i) => i.typeOnly && /^\.\/workflow-[a-z-]+$/.test(i.from)));
  check("nothing imports Opportunity, Discovery, Decision, the LP Builder, Importer, Grounding, Policy, Publication, Tracking, Analytics, ProductFacts, Traffic, or the database", !imports.some((i) => /opportunity|discovery|decision|lp-builder|import(er)?\b|grounding|policy|publication|tracking|analytics|product-facts|traffic|db/i.test(i.from)));
  check("no product names", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("no ad platform, keyword, campaign, bid, or cost logic in code", !code.some((l) => /google|\bads?\b|keyword|campaign|\bcpc\b|\bcpa\b|\bbid\b|budget|adwords/i.test(l)));
  check("no AI, network, persistence, timers, or file access in code", !code.some((l) => /anthropic|openai|fetch\(|node:http|node:https|better-sqlite3|getDb|setTimeout|setInterval|writeFile|node:fs|child_process|crawl|scrap|localStorage|INSERT /.test(l)));
  check("no environment switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("no scoring, ranking, weights, formulas, or recommendations in code", !code.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  const runtime = code.filter((l) => /^\s*export\s+(async\s+)?(function|class)\b|=>\s*[^;]*;?\s*$/.test(l) && !/^\s*export\s+(type|interface)\b/.test(l));
  check("architecture only: no function or class is exported, and the only runtime values are constants", runtime.length === 0 && code.filter((l) => /^\s*export\s+const\b/.test(l)).length === 3);
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports the workflow engine", !others.some((f) => /\/workflow\/|workflow-(engine|types|registry|validator|context|state-machine)/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow architecture: all checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
