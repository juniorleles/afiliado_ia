import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import { createWorkflowEvent } from "../src/lib/workflow/workflow-event.ts";
import { createWorkflowQueue } from "../src/lib/workflow/workflow-queue.ts";
import { createWorkflowScheduler } from "../src/lib/workflow/workflow-scheduler.ts";
import { createWorkflowFailureRegistry, WORKFLOW_FAILURE_TYPES } from "../src/lib/workflow/workflow-failure-registry.ts";
import { createWorkflowFailureValidator } from "../src/lib/workflow/workflow-failure-validator.ts";
import { createWorkflowRecoveryManager } from "../src/lib/workflow/workflow-recovery-manager.ts";
import {
  createWorkflowRecoveryPolicy,
  WORKFLOW_RECOVERY_ACTIONS,
} from "../src/lib/workflow/workflow-recovery-policy.ts";
import {
  createWorkflowRetryManager,
  WORKFLOW_FAILURE_SNAPSHOT_KEYS,
} from "../src/lib/workflow/workflow-retry-manager.ts";
import {
  createWorkflowRetryPolicy,
  resolveWorkflowNextRetryAt,
  resolveWorkflowRetryDelayMs,
  WORKFLOW_RETRY_BACKOFFS,
} from "../src/lib/workflow/workflow-retry-policy.ts";
import { WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) =>
  issues.some((i) => text.test(`${i.field} ${i.message}`));

const T0 = "2026-01-01T00:00:00.000Z";
const SECOND = 1000;

const context: WorkflowContext = {
  decisionAnalysis: { id: "d-1" },
  decisionStatus: "COMPLETED",
  decisionMetadata: { status: "COMPLETED" },
  executionMetadata: { run: "r1" },
  runtimeMetadata: { host: "h1" },
  configuration: { mode: "m1" },
};

function clocks(start = Date.parse(T0)) {
  let t = start;
  let i = 0;
  return {
    now: () => t,
    timestamp: () => new Date(t).toISOString(),
    idFactory: () => `failure-${(i += 1)}`,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function main() {
  check(
    "five failure kinds, in the requested order",
    WORKFLOW_FAILURE_TYPES.join() ===
      "RetryableFailure,PermanentFailure,ValidationFailure,BlockedWorkflow,ManualInterventionRequired",
  );
  check(
    "a failure snapshot has exactly the requested fields",
    WORKFLOW_FAILURE_SNAPSHOT_KEYS.join() ===
      "id,workflowId,currentState,failureType,retryCount,lastError,createdAt,updatedAt,metadata",
  );
  check("three backoff strategies", WORKFLOW_RETRY_BACKOFFS.join() === "Fixed,Linear,Exponential");
  check(
    "five recovery actions, in the requested order",
    WORKFLOW_RECOVERY_ACTIONS.join() === "Resume,RestartState,MoveToManualReview,ArchiveWorkflow,MarkAsFailed",
  );

  const registry = createWorkflowFailureRegistry();
  check("the registry seeds every failure kind", registry.list().join() === WORKFLOW_FAILURE_TYPES.join());
  let duplicateType = false;
  try {
    registry.register("RetryableFailure");
  } catch (error) {
    duplicateType = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate Failure/);
  }
  check("Duplicate Failure kind is rejected", duplicateType);

  const validator = createWorkflowFailureValidator({ registry });
  const time = clocks();
  const retries = createWorkflowRetryManager({ ...time, retryPolicy: createWorkflowRetryPolicy({ maxAttempts: 3, delayMs: SECOND, backoff: "Fixed" }) });
  const recovery = createWorkflowRecoveryManager({ retries });

  const recorded = retries.record({
    workflowId: "wf-1",
    currentState: "CREATED",
    failureType: "RetryableFailure",
    lastError: "transient",
    context,
    metadata: { note: "wait" },
  });
  check(
    "record stores a retryable failure at count zero",
    recorded.status === "RECORDED" &&
      recorded.item?.failureType === "RetryableFailure" &&
      recorded.item.retryCount === 0 &&
      recorded.item.lastError === "transient" &&
      recorded.item.currentState === "CREATED",
  );
  check(
    "record copies decision, execution, runtime, and configuration metadata",
    recorded.item?.metadata.decisionAnalysisId === "d-1" &&
      recorded.item?.metadata["execution.run"] === "r1" &&
      recorded.item?.metadata["runtime.host"] === "h1" &&
      recorded.item?.metadata["configuration.mode"] === "m1" &&
      recorded.item?.metadata.note === "wait",
  );
  check("the snapshot is frozen", Object.isFrozen(recorded.item) && Object.isFrozen(recorded.item?.metadata));
  check("Next Retry Time is now plus the delay", retries.nextRetryTime(recorded.item!.id) === "2026-01-01T00:00:01.000Z");

  const duplicate = retries.record({
    workflowId: "wf-1",
    currentState: "CREATED",
    failureType: "RetryableFailure",
    lastError: "again",
  });
  check("Duplicate Failure is rejected", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Failure/) && retries.list().length === 1);
  check("Negative Retry Count is rejected", has(retries.record({ workflowId: "wf-2", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x", retryCount: -1 }).issues, /Negative Retry Count/));
  check("Invalid Metadata is rejected", has(retries.record({ workflowId: "wf-2", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x", metadata: { a: { b: 1 } } as never }).issues, /Invalid Metadata/));
  check("an unknown failure type is rejected", has(retries.record({ workflowId: "wf-2", currentState: "CREATED", failureType: "Nope" as never, lastError: "x" }).issues, /Invalid Metadata/));
  check("Invalid Retry Policy is rejected on record", has(retries.record({ workflowId: "wf-2", currentState: "CREATED", failureType: "RetryableFailure", lastError: "x", retryPolicy: createWorkflowRetryPolicy({ maxAttempts: 0 }) }).issues, /Invalid Retry Policy/));
  check("rejected records add nothing", retries.list().length === 1);

  const first = retries.retry(recorded.item!.id);
  check("Retry increments the count and keeps the delay", first.status === "RETRIED" && first.item?.retryCount === 1 && first.item.metadata.lastDelayMs === SECOND);
  time.advance(SECOND);
  const second = retries.retry(recorded.item!.id);
  const third = retries.retry(recorded.item!.id);
  check("three attempts fill maxAttempts", second.status === "RETRIED" && third.status === "RETRIED" && third.item?.retryCount === 3 && retries.nextRetryTime(recorded.item!.id) === null);
  check("Retry past max attempts is rejected", retries.retry(recorded.item!.id).status === "REJECTED" && has(retries.retry(recorded.item!.id).issues, /Invalid Retry Policy/));

  const permanent = retries.record({ workflowId: "wf-perm", currentState: "DISCOVERED", failureType: "PermanentFailure", lastError: "closed" });
  check("Permanent Failure cannot be retried", permanent.status === "RECORDED" && retries.retry(permanent.item!.id).status === "REJECTED" && has(retries.retry(permanent.item!.id).issues, /Invalid Retry Policy/) && retries.nextRetryTime(permanent.item!.id) === null);

  const blocked = retries.record({ workflowId: "wf-block", currentState: "CREATED", failureType: "BlockedWorkflow", lastError: "held" });
  const resumed = recovery.resume(blocked.item!.id);
  check("Resume records recovery and does not change the stage", resumed.status === "RESUMED" && resumed.item?.metadata.recoveryAction === "Resume" && resumed.item.currentState === "CREATED");

  const validation = retries.record({ workflowId: "wf-val", currentState: "CREATED", failureType: "ValidationFailure", lastError: "shape" });
  const restarted = recovery.restartState(validation.item!.id, "CREATED");
  check("Restart State stores the named stage without applying a move", restarted.status === "RESTARTED" && restarted.item?.metadata.restartState === "CREATED" && restarted.item.currentState === "CREATED");
  check("Invalid Recovery Policy: restart needs a stage", has(validator.validateRecoveryPolicy({ action: "RestartState" }), /Invalid Recovery Policy/));

  const manual = retries.record({ workflowId: "wf-man", currentState: "LP_GENERATED", failureType: "ManualInterventionRequired", lastError: "review" });
  const reviewed = recovery.moveToManualReview(manual.item!.id);
  check("Move To Manual Review does not enqueue or publish", reviewed.status === "MOVED_TO_REVIEW" && reviewed.item?.metadata.recoveryAction === "MoveToManualReview");

  const archived = recovery.archiveWorkflow(permanent.item!.id);
  check("Archive Workflow closes the failure", archived.status === "ARCHIVED" && archived.item?.metadata.recoveryAction === "ArchiveWorkflow");
  check("a closed failure can be recorded again", retries.record({ workflowId: "wf-perm", currentState: "DISCOVERED", failureType: "PermanentFailure", lastError: "again" }).status === "RECORDED");

  const doomed = retries.record({ workflowId: "wf-fail", currentState: "CREATED", failureType: "PermanentFailure", lastError: "stop" });
  const marked = recovery.markAsFailed(doomed.item!.id);
  check("Mark As Failed closes the failure", marked.status === "MARKED_FAILED" && marked.item?.metadata.recoveryAction === "MarkAsFailed");
  check("recovery of a closed failure is rejected", recovery.resume(doomed.item!.id).status === "REJECTED" && has(recovery.resume(doomed.item!.id).issues, /Invalid Recovery Policy/));
  check("unknown ids are rejected", retries.retry("missing").status === "REJECTED" && recovery.archiveWorkflow("missing").status === "REJECTED");

  const linear = createWorkflowRetryPolicy({ maxAttempts: 4, delayMs: SECOND, backoff: "Linear" });
  const expo = createWorkflowRetryPolicy({ maxAttempts: 4, delayMs: SECOND, backoff: "Exponential" });
  const fixed = createWorkflowRetryPolicy({ maxAttempts: 4, delayMs: SECOND, backoff: "Fixed" });
  check("Fixed delay stays constant", resolveWorkflowRetryDelayMs(fixed, 1) === SECOND && resolveWorkflowRetryDelayMs(fixed, 3) === SECOND);
  check("Linear delay grows by attempt", resolveWorkflowRetryDelayMs(linear, 1) === SECOND && resolveWorkflowRetryDelayMs(linear, 3) === 3 * SECOND);
  check("Exponential delay doubles by attempt", resolveWorkflowRetryDelayMs(expo, 1) === SECOND && resolveWorkflowRetryDelayMs(expo, 3) === 4 * SECOND);
  check("Deterministic recovery: the same policy and count yield the same next instant", resolveWorkflowNextRetryAt(fixed, 0, Date.parse(T0)) === "2026-01-01T00:00:01.000Z" && resolveWorkflowNextRetryAt(fixed, 0, Date.parse(T0)) === resolveWorkflowNextRetryAt(fixed, 0, Date.parse(T0)));
  check("Invalid Retry Policy: unknown backoff", has(validator.validateRetryPolicy({ maxAttempts: 3, delayMs: 1, backoff: "Nope" }), /Invalid Retry Policy/));
  check("Invalid Recovery Policy: unknown action", has(validator.validateRecoveryPolicy({ action: "Nope" }), /Invalid Recovery Policy/));
  check("validator accepts a stored snapshot", validator.validateSnapshot(recorded.item).length === 0);

  const contextBefore = JSON.stringify(context);
  retries.record({ workflowId: "wf-ctx", currentState: "CREATED", failureType: "RetryableFailure", lastError: "ctx", context });
  check("No mutation: record does not change the context", JSON.stringify(context) === contextBefore);
  const copy = retries.get(recorded.item!.id)!;
  try {
    (copy as { workflowId: string }).workflowId = "hacked";
  } catch {
    /* frozen */
  }
  check("returned snapshots stay frozen under assignment", retries.get(recorded.item!.id)?.workflowId === "wf-1");

  const other = createWorkflowRetryManager({ timestamp: () => "2026-01-02T00:00:00.000Z", now: () => Date.parse("2026-01-02T00:00:00.000Z"), idFactory: () => "failure-other" });
  other.record({ workflowId: "wf-1", currentState: "CREATED", failureType: "RetryableFailure", lastError: "other" });
  check("Independent execution: a second manager does not see the first", other.list().length === 1 && other.get(recorded.item!.id) === null && retries.get("failure-other") === null);

  const queue = createWorkflowQueue({ timestamp: () => T0, idFactory: () => "queue-item-1" });
  const waiting = queue.enqueue({ workflowId: "wf-q", candidateId: "cand-q", currentState: "CREATED" });
  const queued = createWorkflowRetryManager({ ...clocks(), idFactory: () => "failure-q" }).record({
    workflowId: "wf-q",
    currentState: "CREATED",
    failureType: "RetryableFailure",
    lastError: "queue",
    queueItem: { id: waiting.item!.id },
  });
  check("retry consumes a queue item by id and does not dequeue it", queued.status === "RECORDED" && queued.item?.metadata.queueItemId === "queue-item-1" && queue.list().length === 1);

  const notice = createWorkflowEvent({
    id: "event-1",
    type: "WorkflowFailed",
    workflowId: "wf-e",
    candidateId: "cand-e",
    currentState: "FAILED",
    timestamp: T0,
  });
  const noticed = createWorkflowRetryManager({ ...clocks(), idFactory: () => "failure-e" }).record({
    workflowId: "wf-e",
    currentState: "CREATED",
    failureType: "RetryableFailure",
    lastError: "event",
    event: { id: notice.id, type: notice.type },
  });
  check("retry consumes an event by id and does not publish", noticed.status === "RECORDED" && noticed.item?.metadata.eventId === "event-1");

  const scheduler = createWorkflowScheduler({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "schedule-1" });
  const planned = scheduler.plan({ workflowId: "wf-s", currentState: "CREATED", kind: "Immediate" });
  const scheduled = createWorkflowRetryManager({ ...clocks(), idFactory: () => "failure-s" }).record({
    workflowId: "wf-s",
    currentState: "CREATED",
    failureType: "RetryableFailure",
    lastError: "schedule",
    scheduleItem: { id: planned.item!.id },
  });
  check("retry consumes a schedule by id and does not plan a window", scheduled.status === "RECORDED" && scheduled.item?.metadata.scheduleItemId === "schedule-1" && scheduler.list().length === 1);

  const policyCopy = createWorkflowRetryPolicy({ maxAttempts: 2, delayMs: 5, backoff: "Linear" });
  const frozenPolicy = Object.isFrozen(policyCopy) && Object.isFrozen(createWorkflowRecoveryPolicy({ action: "Resume" }));
  check("policies freeze on create", frozenPolicy);

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the architecture contracts remain six modules", architecture.every((f) => readdirSync(dir).includes(f)));
  const implementation = [
    "workflow-retry-manager.ts",
    "workflow-recovery-manager.ts",
    "workflow-retry-policy.ts",
    "workflow-recovery-policy.ts",
    "workflow-failure-registry.ts",
    "workflow-failure-validator.ts",
  ];
  check("the six retry and recovery modules are present", implementation.every((f) => readdirSync(dir).includes(f)));
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
  check("no worker, processor, or execution plan", !bare.some((l) => /executionPlan|buildExecutionPlan|Worker|Processor|Promise\.all|Promise\.race/.test(l)));
  check("recovery never enqueues, publishes, plans, or applies a move", !code.some((l) => /\.enqueue\(|\.dequeue\(|\.publish\(|\.plan\(|\.apply\(/.test(l)));
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
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports workflow retry", !others.some((f) => /workflow-(retry|recovery|failure)/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow retry and recovery: all checks passed.");
}

main();
