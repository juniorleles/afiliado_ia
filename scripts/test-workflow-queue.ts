import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import { createWorkflowQueue, WORKFLOW_QUEUE_ITEM_KEYS } from "../src/lib/workflow/workflow-queue.ts";
import {
  createWorkflowQueueRegistry,
  WORKFLOW_QUEUE_DEFINITIONS,
  WORKFLOW_QUEUE_IDS,
} from "../src/lib/workflow/workflow-queue-registry.ts";
import { orderWorkflowQueueItems, resolveWorkflowQueueId, resolveWorkflowQueueTarget } from "../src/lib/workflow/workflow-queue-resolver.ts";
import { computeWorkflowQueueStatistics } from "../src/lib/workflow/workflow-queue-statistics.ts";
import { createWorkflowQueueValidator, WORKFLOW_QUEUE_PRIORITY_DEFAULT } from "../src/lib/workflow/workflow-queue-validator.ts";
import { WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";

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
  let n = 0;
  let s = 0;
  return {
    now: () => (n += 1),
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
  };
}

function main() {
  check("eight workflow queues, in the requested order", WORKFLOW_QUEUE_IDS.join() === "RESEARCH,OPPORTUNITY,TRAFFIC,LANDING_PAGE,REVIEW,PUBLICATION,MONITORING,ARCHIVE");
  check("eight queue definitions are seeded", WORKFLOW_QUEUE_DEFINITIONS.map((d) => d.id).join() === WORKFLOW_QUEUE_IDS.join());
  check("a queue item has exactly the requested fields", WORKFLOW_QUEUE_ITEM_KEYS.join() === "id,queueId,workflowId,candidateId,currentState,targetState,priority,createdAt,updatedAt,metadata");
  check("stages map onto waiting rooms", resolveWorkflowQueueId("CREATED") === "RESEARCH" && resolveWorkflowQueueId("DISCOVERED") === "OPPORTUNITY" && resolveWorkflowQueueId("TRAFFIC_ANALYZED") === "LANDING_PAGE" && resolveWorkflowQueueId("READY_FOR_PUBLICATION") === "PUBLICATION" && resolveWorkflowQueueId("ARCHIVED") === null && resolveWorkflowQueueId("FAILED") === null);
  check("targets are the unique forward stage", resolveWorkflowQueueTarget("CREATED") === "DISCOVERED" && resolveWorkflowQueueTarget("MONITORING") === "ARCHIVED" && resolveWorkflowQueueTarget("FAILED") === null);

  const registry = createWorkflowQueueRegistry();
  check("the registry lists eight queues", registry.list().length === 8 && registry.get("RESEARCH")?.currentStates.join() === "CREATED");
  let duplicateQueue = false;
  try {
    registry.register({ id: "RESEARCH", currentStates: ["CREATED"] });
  } catch (error) {
    duplicateQueue = error instanceof WorkflowFrameworkError && has(error.issues, /Invalid Queue/);
  }
  check("Invalid Queue: a second registration is rejected", duplicateQueue);
  check("Invalid Queue: an unknown id is rejected", has(registry.validate("NOPE"), /Invalid Queue/));

  const validator = createWorkflowQueueValidator({ registry });
  const queue = createWorkflowQueue({ ...clocks(), lookup: { get: (id) => (id === "missing" ? null : { id }) } });
  const first = queue.enqueue({ workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED", context, metadata: { note: "wait" } });
  check("enqueue places a CREATED workflow on the research queue", first.status === "ENQUEUED" && first.item?.queueId === "RESEARCH" && first.item.targetState === "DISCOVERED" && first.item.priority === WORKFLOW_QUEUE_PRIORITY_DEFAULT);
  check("enqueue copies decision and execution metadata", first.item?.metadata.decisionAnalysisId === "d-1" && first.item?.metadata["execution.run"] === "r1" && first.item?.metadata.note === "wait");
  check("the item is frozen", Object.isFrozen(first.item) && Object.isFrozen(first.item?.metadata));

  const duplicate = queue.enqueue({ workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" });
  check("Duplicate Queue Item is rejected", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Queue Item/) && queue.list().length === 1);
  check("Unknown Workflow is rejected", queue.enqueue({ workflowId: "missing", candidateId: "cand-2", currentState: "CREATED" }).status === "REJECTED" && has(queue.enqueue({ workflowId: "", candidateId: "cand-2", currentState: "CREATED" }).issues, /Unknown Workflow/));
  check("Invalid Queue is rejected", has(queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "CREATED", queueId: "ARCHIVE" }).issues, /Invalid Queue/));
  check("Invalid Transition is rejected", has(queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "CREATED", targetState: "PUBLISHED" }).issues, /Unknown Transition|Invalid Transition/));
  check("Invalid Metadata is rejected", has(queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "CREATED", metadata: { a: { b: 1 } } as never }).issues, /Invalid metadata/));
  check("a terminal stage is rejected", has(queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "ARCHIVED" }).issues, /Invalid Transition/));
  check("rejected enqueues add nothing", queue.list().length === 1);

  const high = queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "CREATED", priority: 200 });
  const low = queue.enqueue({ workflowId: "wf-3", candidateId: "cand-3", currentState: "DISCOVERED", priority: 50 });
  check("later queues accept later stages", high.status === "ENQUEUED" && low.status === "ENQUEUED" && low.item?.queueId === "OPPORTUNITY");
  check("peek is deterministic: higher priority first", queue.peek()?.workflowId === "wf-2" && queue.peek("RESEARCH")?.workflowId === "wf-2" && queue.peek("OPPORTUNITY")?.workflowId === "wf-3");
  check("peek does not remove", queue.list("RESEARCH").length === 2);

  const taken = queue.dequeue("RESEARCH");
  check("dequeue returns the next research item and holds it", taken.status === "DEQUEUED" && taken.item?.workflowId === "wf-2" && queue.peek("RESEARCH")?.workflowId === "wf-1" && queue.get(taken.item!.id)?.workflowId === "wf-2");
  const retried = queue.retry(taken.item!.id);
  check("retry restores a dequeued item", retried.status === "RETRIED" && retried.item?.workflowId === "wf-2" && queue.peek("RESEARCH")?.workflowId === "wf-2");
  check("retry of a waiting item is rejected", queue.retry(retried.item!.id).status === "REJECTED");
  const again = queue.dequeue("RESEARCH");
  const removed = queue.remove(again.item!.id);
  check("remove deletes a held item", removed.status === "REMOVED" && queue.get(again.item!.id) === null);
  check("the same workflow can be enqueued after remove", queue.enqueue({ workflowId: "wf-2", candidateId: "cand-2", currentState: "CREATED", priority: 200 }).status === "ENQUEUED");

  const moved = queue.move(low.item!.id, "ARCHIVE");
  check("Move to a room that does not accept the stage is rejected", moved.status === "REJECTED" && has(moved.issues, /Invalid Queue/));
  const stay = queue.move(low.item!.id, "OPPORTUNITY");
  check("Move to the matching room is accepted", stay.status === "MOVED" && stay.item?.queueId === "OPPORTUNITY");

  const stats = queue.statistics();
  check("statistics count waiting items by queue", stats.total === queue.list().length && stats.byQueue.RESEARCH === 2 && stats.byQueue.OPPORTUNITY === 1 && stats.held === 0);
  check("pure statistics match the queue", computeWorkflowQueueStatistics(queue.list()).total === stats.total);

  const ordered = orderWorkflowQueueItems([
    { id: "b", queueId: "RESEARCH", priority: 1, createdAt: "2026-01-01T00:00:02.000Z" },
    { id: "a", queueId: "RESEARCH", priority: 1, createdAt: "2026-01-01T00:00:01.000Z" },
    { id: "c", queueId: "RESEARCH", priority: 2, createdAt: "2026-01-01T00:00:03.000Z" },
  ]);
  check("resolver order is priority, then createdAt, then id", ordered.map((i) => i.id).join() === "c,a,b");

  const contextBefore = JSON.stringify(context);
  queue.enqueue({ workflowId: "wf-ctx", candidateId: "cand-ctx", currentState: "CREATED", context });
  check("No mutation: enqueue does not change the context", JSON.stringify(context) === contextBefore);
  const copy = queue.get(first.item!.id)!;
  try {
    (copy as { workflowId: string }).workflowId = "hacked";
  } catch {
    /* frozen */
  }
  check("returned items stay frozen under assignment", queue.get(first.item!.id)?.workflowId === "wf-1");

  const other = createWorkflowQueue({ timestamp: () => "2026-01-02T00:00:00.000Z", idFactory: () => "queue-item-other" });
  other.enqueue({ workflowId: "wf-1", candidateId: "cand-1", currentState: "CREATED" });
  check("Independent execution: a second queue does not see the first", other.list().length === 1 && other.get(first.item!.id) === null && queue.get("queue-item-other") === null);

  const empty = queue.dequeue("ARCHIVE");
  check("dequeue of an empty room is EMPTY", empty.status === "EMPTY" && empty.item === null);
  check("validator accepts a stored item", validator.validateItem(first.item).length === 0);

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the architecture contracts remain six modules", architecture.every((f) => readdirSync(dir).includes(f)));
  const implementation = ["workflow-queue.ts", "workflow-queue-registry.ts", "workflow-queue-validator.ts", "workflow-queue-resolver.ts", "workflow-queue-statistics.ts"];
  check("the five queue modules are present", implementation.every((f) => readdirSync(dir).includes(f)));
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
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports the workflow queue", !others.some((f) => /workflow-queue/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow queue: all checks passed.");
}

main();
