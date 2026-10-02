import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import { createWorkflowEvent } from "../src/lib/workflow/workflow-event.ts";
import { createWorkflowQueue } from "../src/lib/workflow/workflow-queue.ts";
import { createWorkflowScheduler, WORKFLOW_SCHEDULE_ITEM_KEYS } from "../src/lib/workflow/workflow-scheduler.ts";
import {
  createWorkflowScheduleRegistry,
  WORKFLOW_SCHEDULE_KINDS,
} from "../src/lib/workflow/workflow-schedule-registry.ts";
import {
  isWorkflowScheduleEligible,
  orderWorkflowScheduleItems,
  resolveWorkflowNextRun,
} from "../src/lib/workflow/workflow-schedule-resolver.ts";
import { computeWorkflowScheduleStatistics } from "../src/lib/workflow/workflow-schedule-statistics.ts";
import { createWorkflowScheduleValidator } from "../src/lib/workflow/workflow-schedule-validator.ts";
import { WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}
const has = (issues: Array<{ field: string; message: string }>, text: RegExp) =>
  issues.some((i) => text.test(`${i.field} ${i.message}`));

const T0 = "2026-01-01T00:00:00.000Z";
const HOUR = 3_600_000;

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
    idFactory: () => `schedule-${(i += 1)}`,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function main() {
  check(
    "six schedule kinds, in the requested order",
    WORKFLOW_SCHEDULE_KINDS.join() === "Immediate,Scheduled,Delayed,Recurring,Retry,Manual",
  );
  check(
    "a schedule item has exactly the requested fields",
    WORKFLOW_SCHEDULE_ITEM_KEYS.join() ===
      "id,workflowId,queueId,currentState,executionWindow,retryCount,createdAt,updatedAt,metadata",
  );

  const registry = createWorkflowScheduleRegistry();
  check("the registry seeds every kind", registry.list().join() === WORKFLOW_SCHEDULE_KINDS.join());
  let duplicateKind = false;
  try {
    registry.register("Immediate");
  } catch (error) {
    duplicateKind = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate Schedule/);
  }
  check("Duplicate Schedule kind is rejected", duplicateKind);
  check("Invalid Window: an unknown kind is rejected", has(registry.validate("Nope"), /Invalid Window/));

  const validator = createWorkflowScheduleValidator({ registry });
  const time = clocks();
  const scheduler = createWorkflowScheduler({ ...time, lookup: { get: (id) => (id === "missing" ? null : { id }) } });

  const immediate = scheduler.plan({
    workflowId: "wf-1",
    currentState: "CREATED",
    kind: "Immediate",
    context,
    metadata: { note: "now" },
  });
  check(
    "Immediate plans a CREATED workflow on the research queue",
    immediate.status === "PLANNED" &&
      immediate.item?.queueId === "RESEARCH" &&
      immediate.item.executionWindow.kind === "Immediate" &&
      immediate.item.executionWindow.startAt === T0 &&
      immediate.item.retryCount === 0,
  );
  check(
    "plan copies decision, execution, runtime, and configuration metadata",
    immediate.item?.metadata.decisionAnalysisId === "d-1" &&
      immediate.item?.metadata["execution.run"] === "r1" &&
      immediate.item?.metadata["runtime.host"] === "h1" &&
      immediate.item?.metadata["configuration.mode"] === "m1" &&
      immediate.item?.metadata.note === "now",
  );
  check("the item is frozen", Object.isFrozen(immediate.item) && Object.isFrozen(immediate.item?.executionWindow) && Object.isFrozen(immediate.item?.metadata));
  check("Immediate is eligible now and has no later run", scheduler.eligibleNow().map((i) => i.workflowId).join() === "wf-1" && scheduler.nextRun(immediate.item!.id) === null);

  const duplicate = scheduler.plan({ workflowId: "wf-1", currentState: "CREATED", kind: "Immediate" });
  check("Duplicate Schedule is rejected", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Schedule/) && scheduler.list().length === 1);
  check("Invalid State: a missing workflow is rejected", has(scheduler.plan({ workflowId: "missing", currentState: "CREATED", kind: "Immediate" }).issues, /Invalid State/));
  check("Invalid State: an unknown stage is rejected", has(scheduler.plan({ workflowId: "wf-2", currentState: "NOPE" as never, kind: "Immediate" }).issues, /Invalid State/));
  check("Invalid Queue is rejected", has(scheduler.plan({ workflowId: "wf-2", currentState: "CREATED", kind: "Immediate", queueId: "ARCHIVE" }).issues, /Invalid Queue/));
  check("a terminal stage is rejected", has(scheduler.plan({ workflowId: "wf-2", currentState: "ARCHIVED", kind: "Immediate" }).issues, /Invalid Queue/));
  check("Invalid Metadata is rejected", has(scheduler.plan({ workflowId: "wf-2", currentState: "CREATED", kind: "Immediate", metadata: { a: { b: 1 } } as never }).issues, /Invalid Metadata/));
  check("Invalid Window: Immediate does not take delayMs", has(scheduler.plan({ workflowId: "wf-2", currentState: "CREATED", kind: "Immediate", delayMs: 10 }).issues, /Invalid Window/));
  check("Invalid Window: Scheduled requires startAt", has(scheduler.plan({ workflowId: "wf-2", currentState: "CREATED", kind: "Scheduled" }).issues, /Invalid Window/));
  check("rejected plans add nothing", scheduler.list().length === 1);

  const later = "2026-01-01T01:00:00.000Z";
  const scheduled = scheduler.plan({
    workflowId: "wf-2",
    currentState: "CREATED",
    kind: "Scheduled",
    startAt: later,
  });
  check("Scheduled is not eligible before startAt", scheduled.status === "PLANNED" && scheduler.eligibleNow().map((i) => i.workflowId).join() === "wf-1");
  check("Next Run of a future window is startAt", scheduler.nextRun(scheduled.item!.id) === later && scheduler.nextRun() === later);

  const delayed = scheduler.plan({ workflowId: "wf-3", currentState: "DISCOVERED", kind: "Delayed", delayMs: HOUR });
  check("Delayed opens after delayMs", delayed.status === "PLANNED" && delayed.item?.queueId === "OPPORTUNITY" && delayed.item?.executionWindow.startAt === later && delayed.item.executionWindow.delayMs === HOUR);

  const recurring = scheduler.plan({ workflowId: "wf-4", currentState: "CREATED", kind: "Recurring", intervalMs: HOUR });
  check("Recurring is eligible now and names the next interval", recurring.status === "PLANNED" && scheduler.nextRun(recurring.item!.id) === later && scheduler.eligibleNow().some((i) => i.workflowId === "wf-4"));

  const retry = scheduler.plan({ workflowId: "wf-5", currentState: "CREATED", kind: "Retry", delayMs: HOUR, retryCount: 2 });
  check("Retry stores retryCount and a delayed window", retry.status === "PLANNED" && retry.item?.retryCount === 2 && retry.item.executionWindow.startAt === later);

  const manual = scheduler.plan({ workflowId: "wf-6", currentState: "CREATED", kind: "Manual" });
  check("Manual is never eligible and has no next run", manual.status === "PLANNED" && scheduler.eligibleNow().every((i) => i.workflowId !== "wf-6") && scheduler.nextRun(manual.item!.id) === null);

  const paused = scheduler.pause(recurring.item!.id);
  check("Pause closes the window", paused.status === "PAUSED" && paused.item?.executionWindow.paused === true && scheduler.nextRun(recurring.item!.id) === null && scheduler.eligibleNow().every((i) => i.workflowId !== "wf-4"));
  const resumed = scheduler.resume(recurring.item!.id);
  check("Resume reopens the window", resumed.status === "RESUMED" && resumed.item?.executionWindow.paused === false && scheduler.nextRun(recurring.item!.id) === later);

  time.advance(HOUR);
  check("after the delay, Scheduled and Delayed become eligible", scheduler.eligibleNow().map((i) => i.workflowId).join().includes("wf-2") && scheduler.eligibleNow().map((i) => i.workflowId).join().includes("wf-3"));
  check("Recurring next run advances by the interval", scheduler.nextRun(recurring.item!.id) === "2026-01-01T02:00:00.000Z");

  const moved = scheduler.reschedule(scheduled.item!.id, { startAt: "2026-01-01T03:00:00.000Z" });
  check("Reschedule moves the window", moved.status === "RESCHEDULED" && moved.item?.executionWindow.startAt === "2026-01-01T03:00:00.000Z" && scheduler.eligibleNow().every((i) => i.workflowId !== "wf-2"));

  const cancelled = scheduler.cancel(delayed.item!.id);
  check("Cancel removes the window", cancelled.status === "CANCELLED" && scheduler.get(delayed.item!.id) === null);
  check("the same workflow can be planned after cancel", scheduler.plan({ workflowId: "wf-3", currentState: "DISCOVERED", kind: "Immediate" }).status === "PLANNED");
  check("unknown ids are rejected", scheduler.cancel("missing").status === "REJECTED" && scheduler.pause("missing").status === "REJECTED" && scheduler.resume("missing").status === "REJECTED");

  const stats = scheduler.statistics();
  check("statistics count items by kind", stats.total === scheduler.list().length && stats.byKind.Immediate === 2 && stats.byKind.Scheduled === 1 && stats.byKind.Recurring === 1 && stats.byKind.Retry === 1 && stats.byKind.Manual === 1);
  check("pure statistics match the scheduler", computeWorkflowScheduleStatistics(scheduler.list(), time.now()).total === stats.total);

  const ordered = orderWorkflowScheduleItems([
    { id: "b", executionWindow: { kind: "Immediate", startAt: "2026-01-01T00:00:01.000Z", endAt: null, delayMs: null, intervalMs: null, paused: false } },
    { id: "a", executionWindow: { kind: "Immediate", startAt: "2026-01-01T00:00:01.000Z", endAt: null, delayMs: null, intervalMs: null, paused: false } },
    { id: "c", executionWindow: { kind: "Immediate", startAt: "2026-01-01T00:00:00.000Z", endAt: null, delayMs: null, intervalMs: null, paused: false } },
  ]);
  check("resolver order is startAt, then id", ordered.map((i) => i.id).join() === "c,a,b");

  const window = { kind: "Scheduled" as const, startAt: later, endAt: null, delayMs: null, intervalMs: null, paused: false };
  check("resolver next run and eligible are deterministic", resolveWorkflowNextRun(window, Date.parse(T0)) === later && isWorkflowScheduleEligible(window, Date.parse(T0)) === false && isWorkflowScheduleEligible(window, Date.parse(later)) === true);

  const endBeforeStart = validator.validateWindow({ kind: "Scheduled", startAt: later, endAt: T0 });
  check("Invalid Window: endAt must be after startAt", has(endBeforeStart, /Invalid Window/));
  check("validator accepts a stored item", validator.validateItem(immediate.item).length === 0);

  const contextBefore = JSON.stringify(context);
  scheduler.plan({ workflowId: "wf-ctx", currentState: "CREATED", kind: "Immediate", context });
  check("No mutation: plan does not change the context", JSON.stringify(context) === contextBefore);
  const copy = scheduler.get(immediate.item!.id)!;
  try {
    (copy as { workflowId: string }).workflowId = "hacked";
  } catch {
    /* frozen */
  }
  check("returned items stay frozen under assignment", scheduler.get(immediate.item!.id)?.workflowId === "wf-1");

  const other = createWorkflowScheduler({ timestamp: () => "2026-01-02T00:00:00.000Z", now: () => Date.parse("2026-01-02T00:00:00.000Z"), idFactory: () => "schedule-other" });
  other.plan({ workflowId: "wf-1", currentState: "CREATED", kind: "Immediate" });
  check("Independent execution: a second scheduler does not see the first", other.list().length === 1 && other.get(immediate.item!.id) === null && scheduler.get("schedule-other") === null);

  const queue = createWorkflowQueue({ timestamp: () => T0, idFactory: () => "queue-item-1" });
  const waiting = queue.enqueue({ workflowId: "wf-q", candidateId: "cand-q", currentState: "CREATED" });
  const queuedPlan = createWorkflowScheduler({ ...clocks(), idFactory: () => "schedule-q" }).plan({
    workflowId: "wf-q",
    currentState: "CREATED",
    kind: "Immediate",
    queueItem: { id: waiting.item!.id, queueId: waiting.item!.queueId },
  });
  check("the scheduler consumes a queue item by id and does not dequeue it", queuedPlan.status === "PLANNED" && queuedPlan.item?.metadata.queueItemId === "queue-item-1" && queue.list().length === 1 && queue.get("queue-item-1")?.workflowId === "wf-q");

  const notice = createWorkflowEvent({
    id: "event-1",
    type: "WorkflowCreated",
    workflowId: "wf-e",
    candidateId: "cand-e",
    currentState: "CREATED",
    timestamp: T0,
  });
  const noticed = createWorkflowScheduler({ ...clocks(), idFactory: () => "schedule-e" }).plan({
    workflowId: "wf-e",
    currentState: "CREATED",
    kind: "Immediate",
    event: { id: notice.id, type: notice.type },
  });
  check("the scheduler consumes an event by id and does not publish", noticed.status === "PLANNED" && noticed.item?.metadata.eventId === "event-1" && noticed.item.metadata.eventType === "WorkflowCreated");

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the architecture contracts remain six modules", architecture.every((f) => readdirSync(dir).includes(f)));
  const implementation = [
    "workflow-scheduler.ts",
    "workflow-schedule-registry.ts",
    "workflow-schedule-validator.ts",
    "workflow-schedule-resolver.ts",
    "workflow-schedule-statistics.ts",
  ];
  check("the five schedule modules are present", implementation.every((f) => readdirSync(dir).includes(f)));
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
  check("the scheduler never enqueues, publishes, or applies a move", !code.some((l) => /\.enqueue\(|\.dequeue\(|\.publish\(|\.apply\(/.test(l)));
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
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports the workflow scheduler", !others.some((f) => /workflow-schedul/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow scheduler: all checks passed.");
}

main();
