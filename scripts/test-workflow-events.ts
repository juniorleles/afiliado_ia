import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createWorkflowEvent, WORKFLOW_EVENT_KEYS, WORKFLOW_EVENT_TYPES } from "../src/lib/workflow/workflow-event.ts";
import { createWorkflowEventBus } from "../src/lib/workflow/workflow-event-bus.ts";
import { createWorkflowEventDispatcher } from "../src/lib/workflow/workflow-event-dispatcher.ts";
import { createWorkflowEventRecorder } from "../src/lib/workflow/workflow-event-recorder.ts";
import { createWorkflowEventRegistry } from "../src/lib/workflow/workflow-event-registry.ts";
import { createWorkflowEventValidator } from "../src/lib/workflow/workflow-event-validator.ts";
import { WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) => issues.some((i) => text.test(`${i.field} ${i.message}`));

function clocks() {
  let n = 0;
  let s = 0;
  let i = 0;
  return {
    now: () => (n += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `event-${(i += 1)}`,
  };
}

function main() {
  check(
    "eleven event kinds, in the requested order",
    WORKFLOW_EVENT_TYPES.join() ===
      "WorkflowCreated,StateChanged,CandidateQueued,CandidateDequeued,ReviewRequested,ReviewCompleted,PublicationReady,PublicationCompleted,MonitoringStarted,WorkflowArchived,WorkflowFailed",
  );
  check("an event payload has exactly the requested fields", WORKFLOW_EVENT_KEYS.join() === "id,type,workflowId,candidateId,previousState,currentState,timestamp,metadata");

  const registry = createWorkflowEventRegistry();
  check("the registry seeds every event kind", registry.list().join() === WORKFLOW_EVENT_TYPES.join());
  let duplicateType = false;
  try {
    registry.register("WorkflowCreated");
  } catch (error) {
    duplicateType = error instanceof WorkflowFrameworkError && /Duplicate Event/.test(error.issues.map((i) => i.message).join(" "));
  }
  check("Duplicate Event kind is rejected", duplicateType);
  check("Unknown Event is rejected", has(registry.validate("Nope"), /Unknown Event/));

  const validator = createWorkflowEventValidator({ registry });
  const built = createWorkflowEvent({
    id: "event-1",
    type: "WorkflowCreated",
    workflowId: "wf-1",
    candidateId: "cand-1",
    currentState: "CREATED",
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: { note: "start" },
  });
  check("a built event is frozen and has a null previous stage", Object.isFrozen(built) && built.previousState === null && built.currentState === "CREATED" && validator.validatePayload(built).length === 0);
  check("Invalid Payload is rejected", has(validator.validatePayload(null), /Invalid Payload/) && has(validator.validatePayload({ ...built, workflowId: "" }), /Invalid Payload/));
  check("Invalid State is rejected", has(validator.validatePayload({ ...built, currentState: "NOPE" }), /Invalid State/));
  check("Invalid Metadata is rejected", has(validator.validatePayload({ ...built, metadata: { a: { b: 1 } } }), /Invalid metadata/));
  check("Unknown Event is rejected on a payload", has(validator.validatePayload({ ...built, type: "Nope" }), /Unknown Event/));

  const recorder = createWorkflowEventRecorder({ validator });
  const recorded = recorder.record(built);
  check("record keeps a copy", recorded.status === "RECORDED" && recorded.event?.id === "event-1");
  const duplicateId = recorder.record(createWorkflowEvent({ ...built, type: "StateChanged", currentState: "DISCOVERED", previousState: "CREATED" }));
  check("Duplicate Event ID is rejected", duplicateId.status === "REJECTED" && has(duplicateId.issues, /Duplicate Event ID/) && recorder.list().length === 1);
  recorder.record(createWorkflowEvent({ ...built, id: "event-2", type: "StateChanged", previousState: "CREATED", currentState: "DISCOVERED", transition: { from: "CREATED", to: "DISCOVERED" } }));
  check("filter and replay are the same ordered log", recorder.replay({ type: "StateChanged" }).map((e) => e.id).join() === "event-2" && recorder.list({ workflowId: "wf-1" }).length === 2);

  const heard: string[] = [];
  const dispatcher = createWorkflowEventDispatcher(clocks());
  const stopAll = dispatcher.subscribe("*", (event) => heard.push(`all:${event.type}`));
  dispatcher.subscribe("CandidateQueued", (event) => heard.push(`queued:${event.workflowId}`));
  const published = dispatcher.publish({
    type: "CandidateQueued",
    workflowId: "wf-1",
    candidateId: "cand-1",
    currentState: "CREATED",
    executionMetadata: { run: "r1" },
    runtimeMetadata: { host: "h1" },
    decisionAnalysis: { id: "d-1" },
    metadata: { queue: "RESEARCH" },
  });
  check("publish notifies subscribers in subscription order", published.status === "PUBLISHED" && published.notified === 2 && heard.join() === "all:CandidateQueued,queued:wf-1");
  check("publish copies execution metadata and freezes the event", published.event?.metadata["execution.run"] === "r1" && published.event?.metadata.decisionAnalysisId === "d-1" && Object.isFrozen(published.event));
  stopAll();
  heard.length = 0;
  dispatcher.publish({ type: "CandidateDequeued", workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" });
  check("unsubscribe stops the wildcard listener", heard.join() === "");

  const changed = dispatcher.publish({
    type: "StateChanged",
    workflowId: "wf-1",
    candidateId: "cand-1",
    currentState: "CREATED",
    transition: { from: "CREATED", to: "DISCOVERED" },
  });
  check("a transition fills previous and current stages", changed.event?.previousState === "CREATED" && changed.event?.currentState === "DISCOVERED");
  const rejectedUnknown = dispatcher.publish({ type: "Nope" as never, workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" });
  check("Unknown Event is rejected on publish", rejectedUnknown.status === "REJECTED" && has(rejectedUnknown.issues, /Unknown Event/));
  const sameId = dispatcher.publish({ id: "event-fixed", type: "WorkflowCreated", workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" });
  const again = dispatcher.publish({ id: "event-fixed", type: "WorkflowFailed", workflowId: "wf-1", candidateId: "cand-1", currentState: "FAILED" });
  check("Duplicate Event ID is rejected on publish", sameId.status === "PUBLISHED" && again.status === "REJECTED" && has(again.issues, /Duplicate Event ID/));

  const first = dispatcher.publish({ type: "ReviewRequested", workflowId: "wf-1", candidateId: "cand-1", currentState: "LP_GENERATED" });
  const second = dispatcher.publish({ type: "ReviewCompleted", workflowId: "wf-1", candidateId: "cand-1", currentState: "UNDER_REVIEW" });
  check("Deterministic event dispatch: replay order matches publish order", dispatcher.replay().map((e) => e.type).join() === dispatcher.recorder.list().map((e) => e.type).join() && first.event !== null && second.event !== null);
  check("replay filter by candidate", dispatcher.replay({ candidateId: "cand-1" }).every((e) => e.candidateId === "cand-1"));

  const live: { queue: string | { nested: number } } = { queue: "RESEARCH" };
  const source = { type: "CandidateQueued" as const, workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" as const, metadata: live };
  dispatcher.publish(source as never);
  live.queue = { nested: 1 };
  check("No mutation: publish does not keep the caller's metadata object", dispatcher.replay({ type: "CandidateQueued" }).every((e) => e.metadata.queue === "RESEARCH"));

  const other = createWorkflowEventDispatcher({ timestamp: () => "2026-01-02T00:00:00.000Z", idFactory: () => "event-other" });
  other.publish({ type: "WorkflowCreated", workflowId: "wf-9", candidateId: "cand-9", currentState: "CREATED" });
  check("Independent execution: a second dispatcher does not see the first", other.replay().length === 1 && !("get" in dispatcher) && other.replay()[0]?.id === "event-other" && dispatcher.replay({ workflowId: "wf-9" }).length === 0);

  const bus = createWorkflowEventBus();
  const seen: string[] = [];
  bus.subscribe("WorkflowFailed", (event) => seen.push(event.type));
  bus.dispatch(createWorkflowEvent({ id: "e", type: "WorkflowArchived", workflowId: "wf-1", candidateId: "cand-1", currentState: "ARCHIVED", timestamp: "2026-01-01T00:00:00.000Z" }));
  check("the bus only notifies matching listeners", seen.length === 0);
  bus.dispatch(createWorkflowEvent({ id: "f", type: "WorkflowFailed", workflowId: "wf-1", candidateId: "cand-1", currentState: "FAILED", timestamp: "2026-01-01T00:00:00.000Z" }));
  check("the bus notifies a matching listener", seen.join() === "WorkflowFailed");

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the architecture contracts remain six modules", architecture.every((f) => readdirSync(dir).includes(f)));
  const implementation = ["workflow-event.ts", "workflow-event-bus.ts", "workflow-event-dispatcher.ts", "workflow-event-recorder.ts", "workflow-event-registry.ts", "workflow-event-validator.ts"];
  check("the six event modules are present", implementation.every((f) => readdirSync(dir).includes(f)));
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
  check("no scheduler, worker, or execution plan", !bare.some((l) => /executionPlan|buildExecutionPlan|Scheduler|Worker|Promise\.all|Promise\.race/.test(l)));
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
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports the workflow events", !others.some((f) => /workflow-event/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow events: all checks passed.");
}

main();
