/**
 * Workflow Engine — RC1 acceptance audit.
 * Validation only. Does not add engine behaviour.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import { createHumanApprovalManager } from "../src/lib/workflow/workflow-approval-manager.ts";
import { createWorkflowApprovalRegistry, WORKFLOW_APPROVAL_STATES } from "../src/lib/workflow/workflow-approval-registry.ts";
import { resolveWorkflowApprovalDecision, WORKFLOW_APPROVAL_ACTIONS } from "../src/lib/workflow/workflow-approval-resolver.ts";
import { createWorkflowApprovalSnapshot, WORKFLOW_APPROVAL_SNAPSHOT_KEYS } from "../src/lib/workflow/workflow-approval-snapshot.ts";
import { createWorkflowEvent, WORKFLOW_EVENT_TYPES } from "../src/lib/workflow/workflow-event.ts";
import { createWorkflowEventBus } from "../src/lib/workflow/workflow-event-bus.ts";
import { createWorkflowEventDispatcher } from "../src/lib/workflow/workflow-event-dispatcher.ts";
import { createWorkflowEventRegistry } from "../src/lib/workflow/workflow-event-registry.ts";
import { createWorkflowFailureRegistry, WORKFLOW_FAILURE_TYPES } from "../src/lib/workflow/workflow-failure-registry.ts";
import { createWorkflowQueue } from "../src/lib/workflow/workflow-queue.ts";
import { computeWorkflowQueueStatistics } from "../src/lib/workflow/workflow-queue-statistics.ts";
import { createWorkflowRecoveryManager } from "../src/lib/workflow/workflow-recovery-manager.ts";
import { WORKFLOW_RECOVERY_ACTIONS } from "../src/lib/workflow/workflow-recovery-policy.ts";
import { createWorkflowRetryManager } from "../src/lib/workflow/workflow-retry-manager.ts";
import { createWorkflowRetryPolicy, validateWorkflowRetryPolicy } from "../src/lib/workflow/workflow-retry-policy.ts";
import { createWorkflowScheduler } from "../src/lib/workflow/workflow-scheduler.ts";
import { createWorkflowScheduleRegistry, WORKFLOW_SCHEDULE_KINDS } from "../src/lib/workflow/workflow-schedule-registry.ts";
import { createWorkflowStateMachine } from "../src/lib/workflow/workflow-state-machine-host.ts";
import { createWorkflowStateSnapshot, WORKFLOW_STATE_SNAPSHOT_KEYS } from "../src/lib/workflow/workflow-state-snapshot.ts";
import { createWorkflowTransitionRegistry, defaultWorkflowTransitions, WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";
import { createWorkflowTransitionValidator } from "../src/lib/workflow/workflow-transition-validator.ts";
import { WORKFLOW_CONTEXT_MEMBERS, WORKFLOW_STATES, WORKFLOW_STATE_TRANSITIONS } from "../src/lib/workflow/workflow-types.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) =>
  issues.some((i) => text.test(`${i.field} ${i.message}`));

const T0 = "2026-01-01T00:00:00.000Z";
const context: WorkflowContext = {
  decisionAnalysis: { id: "d-1" },
  decisionStatus: "COMPLETED",
  decisionMetadata: { status: "COMPLETED" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function frozenClock(prefix: string) {
  return {
    now: () => Date.parse(T0),
    timestamp: () => T0,
    idFactory: ids(prefix),
  };
}

function timed<T>(fn: () => T): { ms: number; value: T } {
  const started = performance.now();
  const value = fn();
  return { ms: performance.now() - started, value };
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function main() {
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  const dir = join(process.cwd(), "src/lib/workflow");
  check("Workflow Architecture: six contract modules remain", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Workflow Architecture: eleven stages in the requested order", WORKFLOW_STATES.join() === "CREATED,DISCOVERED,OPPORTUNITY_ANALYZED,TRAFFIC_ANALYZED,LP_GENERATED,UNDER_REVIEW,READY_FOR_PUBLICATION,PUBLISHED,MONITORING,ARCHIVED,FAILED");
  check("Workflow Architecture: context members are unchanged", WORKFLOW_CONTEXT_MEMBERS.join() === "decisionAnalysis,decisionStatus,decisionMetadata,executionMetadata,runtimeMetadata,configuration");
  check("Workflow Architecture: ARCHIVED and FAILED are terminal", WORKFLOW_STATE_TRANSITIONS.ARCHIVED.length === 0 && WORKFLOW_STATE_TRANSITIONS.FAILED.length === 0);

  const transitions = createWorkflowTransitionValidator();
  const registry = createWorkflowTransitionRegistry();
  check("Workflow Registry: every stage and allowed move is registered", registry.listStates().join() === WORKFLOW_STATES.join() && registry.listTransitions().length === defaultWorkflowTransitions().length);
  check("Workflow Validation: Unknown State is rejected", has(transitions.validateState("NOPE"), /Unknown State/) && has(transitions.validateState(null), /Unknown State/));
  check("Workflow Validation: Invalid Metadata is rejected", has(transitions.validateMetadata({ a: { b: 1 } }), /Invalid metadata/));

  const machine = createWorkflowStateMachine({ timestamp: () => T0, now: () => 1 });
  check("Workflow State Machine: allowed moves match the graph", machine.canTransition("CREATED", "DISCOVERED") && !machine.canTransition("CREATED", "PUBLISHED") && machine.allowedTransitions("FAILED").length === 0);
  const applied = machine.apply({ from: "CREATED", to: "DISCOVERED", context, metadata: { step: "advance" } });
  check("Workflow State Machine: a forward move applies a frozen snapshot", applied.status === "APPLIED" && applied.snapshot?.currentState === "DISCOVERED" && applied.snapshot.previousState === "CREATED" && Object.isFrozen(applied.snapshot));
  check("Workflow Snapshots: a state snapshot has the requested fields", WORKFLOW_STATE_SNAPSHOT_KEYS.join() === "currentState,previousState,transition,timestamp,metadata");
  const stateSnap = createWorkflowStateSnapshot({ currentState: "CREATED", timestamp: T0, metadata: { k: "v" } });
  check("Workflow Snapshots: createWorkflowStateSnapshot freezes copies", Object.isFrozen(stateSnap) && Object.isFrozen(stateSnap.metadata) && stateSnap.previousState === null);

  const emptyRegistry = createWorkflowTransitionRegistry({ seed: false });
  emptyRegistry.registerState("CREATED");
  let duplicateState = false;
  try {
    emptyRegistry.registerState("CREATED");
  } catch (error) {
    duplicateState = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate State/);
  }
  check("Negative: Duplicate State is rejected", duplicateState);
  emptyRegistry.registerState("DISCOVERED");
  emptyRegistry.registerState("FAILED");
  emptyRegistry.registerTransition({ from: "CREATED", to: "DISCOVERED" });
  let duplicateTransition = false;
  try {
    emptyRegistry.registerTransition({ from: "CREATED", to: "DISCOVERED" });
  } catch (error) {
    duplicateTransition = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate Transition/);
  }
  check("Negative: Duplicate Transition is rejected", duplicateTransition);
  check("Negative: Circular Transition is rejected", has(transitions.validateGraph([{ from: "CREATED", to: "DISCOVERED" }, { from: "DISCOVERED", to: "CREATED" }]), /Circular Transition/));
  check("Negative: Missing State is rejected", has(machine.validate("NOPE", "DISCOVERED"), /Unknown State/) && machine.apply({ from: "CREATED", to: "PUBLISHED" }).status === "REJECTED");

  const queue = createWorkflowQueue({
    ...frozenClock("queue"),
    lookup: { get: (id) => (id === "missing" ? null : { id }) },
  });
  const enqueued = queue.enqueue({ workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED", context });
  check("Workflow Queue: enqueue places CREATED on RESEARCH", enqueued.status === "ENQUEUED" && enqueued.item?.queueId === "RESEARCH");
  const stats = queue.statistics();
  check("Workflow Queue Statistics: waiting items are counted", stats.total === 1 && stats.byQueue.RESEARCH === 1 && computeWorkflowQueueStatistics(queue.list()).total === 1);
  const taken = queue.dequeue("RESEARCH");
  check("Workflow Queue: dequeue holds the item and peek is empty", taken.status === "DEQUEUED" && queue.peek("RESEARCH") === null && queue.get(taken.item!.id)?.workflowId === "wf-1");
  check("Workflow Queue: retry restores a held item", queue.retry(taken.item!.id).status === "RETRIED" && queue.peek("RESEARCH")?.workflowId === "wf-1");
  check("Negative: Duplicate Queue Item is rejected", queue.enqueue({ workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" }).status === "REJECTED");
  check("Negative: Duplicate Workflow is rejected on the queue", has(queue.enqueue({ workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" }).issues, /Duplicate Queue Item/));
  check("Negative: Missing Workflow is rejected", has(queue.enqueue({ workflowId: "missing", candidateId: "cand-2", currentState: "CREATED" }).issues, /Unknown Workflow/));
  check("Negative: Missing Queue is rejected", has(queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "CREATED", queueId: "NOPE" as never }).issues, /Invalid Queue/));

  const events = createWorkflowEventDispatcher({ timestamp: () => T0, now: () => 1, idFactory: ids("event") });
  check("Workflow Event Registry: eleven kinds are seeded", createWorkflowEventRegistry().list().join() === WORKFLOW_EVENT_TYPES.join());
  const bus = createWorkflowEventBus();
  const seen: string[] = [];
  bus.subscribe("WorkflowCreated", (event) => seen.push(event.type));
  bus.dispatch(createWorkflowEvent({ id: "e0", type: "WorkflowFailed", workflowId: "wf-1", candidateId: "cand-1", currentState: "FAILED", timestamp: T0 }));
  bus.dispatch(createWorkflowEvent({ id: "e1", type: "WorkflowCreated", workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED", timestamp: T0 }));
  check("Workflow Event Bus: only matching listeners are notified", seen.join() === "WorkflowCreated");
  let notified = 0;
  events.subscribe("*", () => {
    notified += 1;
  });
  const published = events.publish({ type: "WorkflowCreated", workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" });
  check("Workflow Events: publish records a frozen notice", published.status === "PUBLISHED" && published.event?.id === "event-1" && Object.isFrozen(published.event) && events.replay().length === 1);
  const duplicateId = events.publish({ type: "StateChanged", workflowId: "wf-1", candidateId: "cand-1", currentState: "DISCOVERED", id: "event-1" });
  check("Negative: Duplicate Event ID is rejected", duplicateId.status === "REJECTED" && has(duplicateId.issues, /Duplicate Event/) && notified === 1);
  let duplicateEventKind = false;
  const eventRegistry = createWorkflowEventRegistry();
  try {
    eventRegistry.register("WorkflowCreated");
  } catch (error) {
    duplicateEventKind = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate Event/);
  }
  check("Negative: Duplicate Event kind is rejected", duplicateEventKind);
  check("Negative: Missing Event is rejected", has(events.publish({ type: "Nope" as never, workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" }).issues, /Unknown Event/));
  check("Negative: Duplicate Execution: a duplicate publish does not notify again", notified === 1 && events.replay().length === 1);

  const scheduler = createWorkflowScheduler(frozenClock("schedule"));
  check("Workflow Scheduler: six kinds are seeded", createWorkflowScheduleRegistry().list().join() === WORKFLOW_SCHEDULE_KINDS.join());
  const planned = scheduler.plan({ workflowId: "wf-1", currentState: "CREATED", kind: "Immediate", context });
  check("Workflow Scheduler: Immediate is eligible now", planned.status === "PLANNED" && scheduler.eligibleNow()[0]?.workflowId === "wf-1" && scheduler.nextRun(planned.item!.id) === null);
  check("Negative: Duplicate Schedule is rejected", has(scheduler.plan({ workflowId: "wf-1", currentState: "CREATED", kind: "Immediate" }).issues, /Duplicate Schedule/));

  const retries = createWorkflowRetryManager({
    ...frozenClock("failure"),
    retryPolicy: createWorkflowRetryPolicy({ maxAttempts: 3, delayMs: 1000, backoff: "Fixed" }),
  });
  check("Workflow Retry Manager: five failure kinds are seeded", createWorkflowFailureRegistry().list().join() === WORKFLOW_FAILURE_TYPES.join());
  const recorded = retries.record({ workflowId: "wf-1", currentState: "CREATED", failureType: "RetryableFailure", lastError: "transient", context });
  check("Workflow Retry Manager: a retryable failure is recorded", recorded.status === "RECORDED" && recorded.item?.retryCount === 0 && retries.nextRetryTime(recorded.item!.id) === "2026-01-01T00:00:01.000Z");
  check("Workflow Retry Manager: retry increments the count", retries.retry(recorded.item!.id).status === "RETRIED" && retries.get(recorded.item!.id)?.retryCount === 1);
  const recovery = createWorkflowRecoveryManager({ retries });
  check("Workflow Recovery Manager: five recovery actions are named", WORKFLOW_RECOVERY_ACTIONS.join() === "Resume,RestartState,MoveToManualReview,ArchiveWorkflow,MarkAsFailed");
  const blocked = retries.record({ workflowId: "wf-block", currentState: "CREATED", failureType: "BlockedWorkflow", lastError: "held" });
  const resumed = recovery.resume(blocked.item!.id);
  check("Workflow Recovery Manager: Resume records recovery without changing the stage", resumed.status === "RESUMED" && resumed.item?.currentState === "CREATED");
  check("Negative: Invalid Retry Policy is rejected", has(validateWorkflowRetryPolicy({ maxAttempts: 0, delayMs: 1, backoff: "Fixed" }), /Invalid Retry Policy/) && has(retries.record({ workflowId: "wf-bad", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x", retryPolicy: createWorkflowRetryPolicy({ maxAttempts: 0 }) }).issues, /Invalid Retry Policy/));
  check("Negative: Invalid Recovery Policy is rejected", has(retries.validator.validateRecoveryPolicy({ action: "RestartState" }), /Invalid Recovery Policy/) && has(retries.validator.validateRecoveryPolicy({ action: "Nope" }), /Invalid Recovery Policy/));

  const approvals = createHumanApprovalManager({
    ...frozenClock("approval"),
    lookup: { get: (id) => (id === "missing" ? null : { id }) },
  });
  check("Workflow Human Approval: six states and six actions", createWorkflowApprovalRegistry().list().join() === WORKFLOW_APPROVAL_STATES.join() && WORKFLOW_APPROVAL_ACTIONS.join() === "RequestApproval,Approve,Reject,ReturnForChanges,CancelRequest,ExpireRequest");
  const requested = approvals.request({ workflowId: "wf-1", currentState: "UNDER_REVIEW", requestedBy: "reviewer-a", context });
  check("Workflow Human Approval: a request opens PendingApproval", requested.status === "REQUESTED" && requested.item?.decision === "PendingApproval" && Object.isFrozen(requested.item));
  const approved = approvals.approve(requested.item!.id, { approvedBy: "reviewer-b" });
  check("Workflow Human Approval: Approve records the actor and does not apply a workflow move", approved.status === "APPROVED" && approved.item?.decision === "Approved" && approved.item.currentState === "UNDER_REVIEW");
  check("Workflow Snapshots: an approval snapshot has the requested fields", WORKFLOW_APPROVAL_SNAPSHOT_KEYS.join() === "id,workflowId,currentState,requestedBy,approvedBy,decision,timestamp,metadata");
  const approvalSnap = createWorkflowApprovalSnapshot({
    id: "approval-x",
    workflowId: "wf-x",
    currentState: "UNDER_REVIEW",
    requestedBy: "a",
    decision: "PendingApproval",
    timestamp: T0,
  });
  check("Workflow Snapshots: approval snapshots are frozen", Object.isFrozen(approvalSnap) && approvalSnap.approvedBy === null);
  check("Negative: Duplicate Approval is rejected", approvals.request({ workflowId: "wf-open", currentState: "UNDER_REVIEW", requestedBy: "a" }).status === "REQUESTED" && has(approvals.request({ workflowId: "wf-open", currentState: "UNDER_REVIEW", requestedBy: "a" }).issues, /Duplicate Approval/));
  check("Negative: Missing Workflow is rejected by approval", has(approvals.request({ workflowId: "missing", currentState: "UNDER_REVIEW", requestedBy: "a" }).issues, /Unknown Workflow/));
  check("resolver maps approval actions", resolveWorkflowApprovalDecision("PendingApproval", "Approve") === "Approved" && resolveWorkflowApprovalDecision("Approved", "Approve") === null);

  const contextBefore = JSON.stringify(context);
  machine.apply({ from: "CREATED", to: "DISCOVERED", context });
  queue.enqueue({ workflowId: "wf-ctx", candidateId: "cand-ctx", currentState: "CREATED", context });
  events.publish({ type: "ReviewRequested", workflowId: "wf-ctx", candidateId: "cand-ctx", currentState: "LP_GENERATED" });
  scheduler.plan({ workflowId: "wf-ctx", currentState: "CREATED", kind: "Immediate", context });
  retries.record({ workflowId: "wf-ctx", currentState: "CREATED", failureType: "RetryableFailure", lastError: "ctx", context });
  approvals.request({ workflowId: "wf-ctx", currentState: "UNDER_REVIEW", requestedBy: "a", context });
  check("No mutation: operations do not change the context", JSON.stringify(context) === contextBefore);
  const snapBefore = JSON.stringify(applied.snapshot);
  try {
    (applied.snapshot as { currentState: string }).currentState = "FAILED";
  } catch {
    /* frozen */
  }
  check("No mutation: applied snapshots stay frozen under assignment", JSON.stringify(applied.snapshot) === snapBefore && applied.snapshot?.currentState === "DISCOVERED");

  const a = createWorkflowStateMachine({ timestamp: () => T0, now: () => 1 });
  const b = createWorkflowStateMachine({ timestamp: () => T0, now: () => 1 });
  check("Deterministic transitions: the same move yields the same snapshot", JSON.stringify(a.apply({ from: "CREATED", to: "DISCOVERED" }).snapshot) === JSON.stringify(b.apply({ from: "CREATED", to: "DISCOVERED" }).snapshot));
  const q1 = createWorkflowQueue({ timestamp: () => T0, idFactory: () => "queue-det" });
  const q2 = createWorkflowQueue({ timestamp: () => T0, idFactory: () => "queue-det" });
  q1.enqueue({ workflowId: "wf-d", candidateId: "c", currentState: "CREATED" });
  q2.enqueue({ workflowId: "wf-d", candidateId: "c", currentState: "CREATED" });
  check("Deterministic queue: the same enqueue yields the same item id", q1.peek()?.id === q2.peek()?.id && q1.peek()?.queueId === q2.peek()?.queueId);
  const s1 = createWorkflowScheduler({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "schedule-det" });
  const s2 = createWorkflowScheduler({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "schedule-det" });
  check("Deterministic scheduler: the same plan yields the same window", s1.plan({ workflowId: "wf-d", currentState: "CREATED", kind: "Immediate" }).item?.executionWindow.startAt === s2.plan({ workflowId: "wf-d", currentState: "CREATED", kind: "Immediate" }).item?.executionWindow.startAt);
  const r1 = createWorkflowRetryManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "failure-det" });
  const r2 = createWorkflowRetryManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "failure-det" });
  check("Deterministic recovery: the same record yields the same next retry", r1.record({ workflowId: "wf-d", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x" }).item?.metadata.nextRetryAt === r2.record({ workflowId: "wf-d", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x" }).item?.metadata.nextRetryAt);
  const h1 = createHumanApprovalManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "approval-det" });
  const h2 = createHumanApprovalManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "approval-det" });
  check("Deterministic approval: the same request yields the same snapshot", h1.request({ workflowId: "wf-d", currentState: "UNDER_REVIEW", requestedBy: "a" }).item?.decision === h2.request({ workflowId: "wf-d", currentState: "UNDER_REVIEW", requestedBy: "a" }).item?.decision && h1.list()[0]?.id === h2.list()[0]?.id);
  const independent = createWorkflowQueue({ idFactory: () => "queue-other" });
  independent.enqueue({ workflowId: "wf-1", candidateId: "c", currentState: "CREATED" });
  check("Independent execution: a second queue does not see the first", independent.get(enqueued.item!.id) === null && queue.get("queue-other") === null);

  const nested = { a: { b: 1 } } as never;
  check("Negative: Invalid Metadata is rejected across queue, events, schedule, retry, and approval", has(queue.enqueue({ workflowId: "wf-meta", candidateId: "c", currentState: "CREATED", metadata: nested }).issues, /Invalid metadata/) && has(events.publish({ type: "WorkflowCreated", workflowId: "wf-meta", candidateId: "c", currentState: "CREATED", metadata: nested }).issues, /Invalid Metadata|Invalid metadata/) && has(scheduler.plan({ workflowId: "wf-meta", currentState: "CREATED", kind: "Immediate", metadata: nested }).issues, /Invalid Metadata/) && has(retries.record({ workflowId: "wf-meta", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x", metadata: nested }).issues, /Invalid Metadata/) && has(approvals.request({ workflowId: "wf-meta", currentState: "UNDER_REVIEW", requestedBy: "a", metadata: nested }).issues, /Invalid Metadata/));

  const transitionTimed = timed(() => createWorkflowStateMachine({ timestamp: () => T0, now: () => 1 }).apply({ from: "CREATED", to: "DISCOVERED" }));
  const queueTimed = timed(() => {
    const q = createWorkflowQueue({ timestamp: () => T0, idFactory: () => "queue-perf" });
    q.enqueue({ workflowId: "wf-p", candidateId: "c", currentState: "CREATED" });
    q.dequeue("RESEARCH");
    return q.statistics().held;
  });
  const eventTimed = timed(() => createWorkflowEventDispatcher({ timestamp: () => T0, now: () => 1, idFactory: () => "event-perf" }).publish({ type: "WorkflowCreated", workflowId: "wf-p", candidateId: "c", currentState: "CREATED" }));
  const scheduleTimed = timed(() => createWorkflowScheduler({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "schedule-perf" }).plan({ workflowId: "wf-p", currentState: "CREATED", kind: "Immediate" }));
  const retryTimed = timed(() => {
    const manager = createWorkflowRetryManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "failure-perf" });
    const item = manager.record({ workflowId: "wf-p", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x" });
    return manager.retry(item.item!.id);
  });
  const recoveryTimed = timed(() => {
    const manager = createWorkflowRetryManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "failure-rec" });
    const item = manager.record({ workflowId: "wf-p", currentState: "CREATED", failureType: "BlockedWorkflow", lastError: "x" });
    return createWorkflowRecoveryManager({ retries: manager }).resume(item.item!.id);
  });
  const approvalTimed = timed(() => {
    const manager = createHumanApprovalManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "approval-perf" });
    const item = manager.request({ workflowId: "wf-p", currentState: "UNDER_REVIEW", requestedBy: "a" });
    return manager.approve(item.item!.id, { approvedBy: "b" });
  });
  const snapshotTimed = timed(() => createWorkflowStateSnapshot({ currentState: "CREATED", timestamp: T0, metadata: { k: "v" } }));
  const perfRows: Array<[string, number, boolean]> = [
    ["State Transition", transitionTimed.ms, transitionTimed.value.status === "APPLIED"],
    ["Queue Operations", queueTimed.ms, queueTimed.value === 1],
    ["Event Dispatch", eventTimed.ms, eventTimed.value.status === "PUBLISHED"],
    ["Scheduler Planning", scheduleTimed.ms, scheduleTimed.value.status === "PLANNED"],
    ["Retry Evaluation", retryTimed.ms, retryTimed.value.status === "RETRIED"],
    ["Recovery Resolution", recoveryTimed.ms, recoveryTimed.value.status === "RESUMED"],
    ["Approval Resolution", approvalTimed.ms, approvalTimed.value.status === "APPROVED"],
    ["Snapshot Creation", snapshotTimed.ms, snapshotTimed.value.currentState === "CREATED"],
  ];
  for (const [name, ms, ok] of perfRows) {
    console.log(`PERF: ${name}=${ms.toFixed(3)}ms`);
    check(`${name} completes in under 2000ms`, ok && ms < 2000);
  }

  const files = walk(dir).filter((f) => f.endsWith(".ts"));
  const joined = files.map((f) => `${f}\n${readFileSync(f, "utf8")}`).join("\n");
  const lines = files.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/));
  const isCode = (l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l);
  const code = lines.filter(isCode);
  const stripStrings = (l: string) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const bare = code.map(stripStrings);
  check("No Product Names in the Workflow engine", !lines.some((l) => /VisiFlora|Joint Genesis|Prime Biome|Neuro Serge|Prodentim|Audifort|Advanced Amino|PeakBiome|Yu Sleep/i.test(l)));
  check("No Campaign IDs in the Workflow engine", !bare.some((l) => /campaignId|campaigns\b|lp_page_versions/.test(l)));
  check("No Google Ads logic (API, bids, keywords, adwords)", !bare.some((l) => /googleads|adwords|\bcpc\b|\bcpa\b|\bbid\b|keyword planner|ads api/i.test(l)));
  check("No business-specific rules (score, rank, weight, formula, recommend)", !bare.some((l) => /\bscor(e|es|ing)\b|\brank|weight|formula|recommend/i.test(l)));
  check("No Hidden Switches", !code.some((l) => /process\.env|NODE_ENV|feature.?flag|bypass/i.test(l)));
  check("No ProductFacts import or mutation", !joined.includes("product-facts") && !bare.some((l) => /ProductFacts|productFacts/.test(l)));
  const valueImports = [...joined.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  check("No Discovery, Opportunity, Traffic, or Decision value imports", !valueImports.some((from) => /discovery|opportunity|traffic|decision/.test(from)));
  check("No Discovery, Opportunity, Traffic, or Decision mutation", !bare.some((l) => /\.(candidate|opportunityAnalysis|trafficAnalysis|decisionAnalysis)\s*=(?!=)/.test(l)));
  check("No LP Builder, Platform, HTTP, database, or file writes in the Workflow engine", !code.some((l) => /fetch\(|node:http|better-sqlite3|getDb|writeFile|appendFile|node:fs/.test(l)) && !valueImports.some((from) => /lp-builder|platform/.test(from)));
  check("Backward compatibility: architecture remains six contract modules", architecture.every((f) => readdirSync(dir).includes(f)));
  check("Backward compatibility: architecture State Machine stays a contract", !/export\s+(async\s+)?function|export\s+class|createWorkflowStateMachine/.test(readFileSync(join(dir, "workflow-state-machine.ts"), "utf8")));
  check("Backward compatibility: architecture Engine stays a contract", !/export\s+(async\s+)?function|export\s+class|createWorkflowEngine/.test(readFileSync(join(dir, "workflow-engine.ts"), "utf8")));
  check("Backward compatibility: architecture Registry stays a contract", !/export\s+(async\s+)?function|export\s+class|createWorkflowRegistry/.test(readFileSync(join(dir, "workflow-registry.ts"), "utf8")));
  const others = ["src/lib/opportunity", "src/lib/discovery", "src/lib/traffic", "src/lib/lp-builder", "src/lib/platform", "src/lib/decision"].flatMap((d) => {
    try {
      return readdirSync(join(process.cwd(), d)).filter((f) => f.endsWith(".ts")).map((f) => join(process.cwd(), d, f));
    } catch {
      return [];
    }
  });
  check("No Discovery, Opportunity, Traffic, LP Builder, Platform, or Decision module imports the workflow engine", !others.some((f) => /from ["'][^"']*workflow/.test(readFileSync(f, "utf8"))));

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
  console.log("\nWorkflow Engine RC1 acceptance: all checks passed.");
}

main();
