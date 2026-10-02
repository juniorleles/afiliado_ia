import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { WorkflowContext } from "../src/lib/workflow/workflow-context.ts";
import { createWorkflowEvent } from "../src/lib/workflow/workflow-event.ts";
import { createWorkflowQueue } from "../src/lib/workflow/workflow-queue.ts";
import { createWorkflowRetryManager } from "../src/lib/workflow/workflow-retry-manager.ts";
import {
  createHumanApprovalManager,
  WORKFLOW_APPROVAL_SNAPSHOT_KEYS,
} from "../src/lib/workflow/workflow-approval-manager.ts";
import { createWorkflowApprovalRegistry, WORKFLOW_APPROVAL_STATES } from "../src/lib/workflow/workflow-approval-registry.ts";
import {
  orderWorkflowApprovalSnapshots,
  resolveWorkflowApprovalActions,
  resolveWorkflowApprovalDecision,
  WORKFLOW_APPROVAL_ACTIONS,
} from "../src/lib/workflow/workflow-approval-resolver.ts";
import { createWorkflowApprovalSnapshot } from "../src/lib/workflow/workflow-approval-snapshot.ts";
import { createWorkflowApprovalValidator } from "../src/lib/workflow/workflow-approval-validator.ts";
import { WorkflowFrameworkError } from "../src/lib/workflow/workflow-transition-registry.ts";

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

function clocks(start = Date.parse(T0)) {
  let t = start;
  let i = 0;
  let s = 0;
  return {
    now: () => t,
    timestamp: () => new Date(Date.UTC(2026, 0, 1, 0, 0, (s += 1))).toISOString(),
    idFactory: () => `approval-${(i += 1)}`,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function main() {
  check(
    "six approval states, in the requested order",
    WORKFLOW_APPROVAL_STATES.join() === "PendingApproval,Approved,Rejected,NeedsChanges,Cancelled,Expired",
  );
  check(
    "six approval actions, in the requested order",
    WORKFLOW_APPROVAL_ACTIONS.join() === "RequestApproval,Approve,Reject,ReturnForChanges,CancelRequest,ExpireRequest",
  );
  check(
    "an approval snapshot has exactly the requested fields",
    WORKFLOW_APPROVAL_SNAPSHOT_KEYS.join() ===
      "id,workflowId,currentState,requestedBy,approvedBy,decision,timestamp,metadata",
  );

  const registry = createWorkflowApprovalRegistry();
  check("the registry seeds every approval state", registry.list().join() === WORKFLOW_APPROVAL_STATES.join());
  let duplicateState = false;
  try {
    registry.register("PendingApproval");
  } catch (error) {
    duplicateState = error instanceof WorkflowFrameworkError && has(error.issues, /Duplicate Approval/);
  }
  check("Duplicate Approval state is rejected", duplicateState);
  check("Invalid State: an unknown approval state is rejected", has(registry.validate("Nope"), /Invalid State/));

  const validator = createWorkflowApprovalValidator({ registry });
  const time = clocks();
  const approvals = createHumanApprovalManager({
    ...time,
    lookup: { get: (id) => (id === "missing" ? null : { id }) },
  });

  const requested = approvals.request({
    workflowId: "wf-1",
    currentState: "UNDER_REVIEW",
    requestedBy: "reviewer-a",
    context,
    metadata: { note: "pause" },
  });
  check(
    "Request Approval opens a pending snapshot",
    requested.status === "REQUESTED" &&
      requested.item?.decision === "PendingApproval" &&
      requested.item.requestedBy === "reviewer-a" &&
      requested.item.approvedBy === null &&
      requested.item.currentState === "UNDER_REVIEW",
  );
  check(
    "request copies decision, execution, runtime, and configuration metadata by id",
    requested.item?.metadata.decisionAnalysisId === "d-1" &&
      requested.item?.metadata["execution.run"] === "r1" &&
      requested.item?.metadata["runtime.host"] === "h1" &&
      requested.item?.metadata["configuration.mode"] === "m1" &&
      requested.item?.metadata.note === "pause",
  );
  check("the snapshot is frozen", Object.isFrozen(requested.item) && Object.isFrozen(requested.item?.metadata));
  check("snapshot() returns the same frozen record", approvals.snapshot(requested.item!.id)?.id === requested.item?.id);

  const duplicate = approvals.request({
    workflowId: "wf-1",
    currentState: "UNDER_REVIEW",
    requestedBy: "reviewer-a",
  });
  check("Duplicate Approval is rejected", duplicate.status === "REJECTED" && has(duplicate.issues, /Duplicate Approval/) && approvals.list().length === 1);
  check("Unknown Workflow is rejected", has(approvals.request({ workflowId: "missing", currentState: "UNDER_REVIEW", requestedBy: "a" }).issues, /Unknown Workflow/));
  check("Unknown Workflow: empty id is rejected", has(approvals.request({ workflowId: "", currentState: "UNDER_REVIEW", requestedBy: "a" }).issues, /Unknown Workflow/));
  check("Invalid State: an unknown workflow stage is rejected", has(approvals.request({ workflowId: "wf-2", currentState: "NOPE" as never, requestedBy: "a" }).issues, /Invalid State/));
  check("Invalid State: a terminal stage cannot request approval", has(approvals.request({ workflowId: "wf-2", currentState: "ARCHIVED", requestedBy: "a" }).issues, /Invalid State/));
  check("Invalid Metadata is rejected", has(approvals.request({ workflowId: "wf-2", currentState: "UNDER_REVIEW", requestedBy: "a", metadata: { a: { b: 1 } } as never }).issues, /Invalid Metadata/));
  check("rejected requests add nothing", approvals.list().length === 1);

  const approved = approvals.approve(requested.item!.id, { approvedBy: "reviewer-b" });
  check(
    "Approve records the actor and does not apply a workflow move",
    approved.status === "APPROVED" && approved.item?.decision === "Approved" && approved.item.approvedBy === "reviewer-b" && approved.item.currentState === "UNDER_REVIEW",
  );
  check("Approve of a closed request is Invalid Transition", has(approvals.approve(requested.item!.id, { approvedBy: "reviewer-b" }).issues, /Invalid Transition/));
  check("the same workflow can request again after a terminal outcome", approvals.request({ workflowId: "wf-1", currentState: "UNDER_REVIEW", requestedBy: "reviewer-a" }).status === "REQUESTED");

  const second = approvals.list().find((item) => item.decision === "PendingApproval")!;
  const declined = approvals.reject(second.id, { reviewedBy: "reviewer-c" });
  check("Reject stores Rejected without changing the workflow stage", declined.status === "DECLINED" && declined.item?.decision === "Rejected" && declined.item.currentState === "UNDER_REVIEW" && declined.item.metadata.reviewedBy === "reviewer-c");

  const changes = approvals.request({ workflowId: "wf-3", currentState: "LP_GENERATED", requestedBy: "reviewer-a" });
  const returned = approvals.returnForChanges(changes.item!.id, { reviewedBy: "reviewer-d" });
  check("Return For Changes moves to NeedsChanges", returned.status === "RETURNED" && returned.item?.decision === "NeedsChanges");
  const rerequested = approvals.request({ workflowId: "wf-3", currentState: "LP_GENERATED", requestedBy: "reviewer-a" });
  check("Request Approval from NeedsChanges returns to PendingApproval on the same id", rerequested.status === "REQUESTED" && rerequested.item?.id === changes.item?.id && rerequested.item?.decision === "PendingApproval");

  const cancellable = approvals.request({ workflowId: "wf-4", currentState: "UNDER_REVIEW", requestedBy: "reviewer-a" });
  const cancelled = approvals.cancel(cancellable.item!.id);
  check("Cancel Request closes the snapshot", cancelled.status === "CANCELLED" && cancelled.item?.decision === "Cancelled");

  const expirable = approvals.request({ workflowId: "wf-5", currentState: "UNDER_REVIEW", requestedBy: "reviewer-a" });
  const expired = approvals.expire(expirable.item!.id);
  check("Expire Request closes the snapshot", expired.status === "EXPIRED" && expired.item?.decision === "Expired");
  const pendingActor = approvals.request({ workflowId: "wf-actor", currentState: "UNDER_REVIEW", requestedBy: "reviewer-a" });
  check("Approve without an actor is Invalid Metadata", pendingActor.status === "REQUESTED" && has(approvals.approve(pendingActor.item!.id, {}).issues, /Invalid Metadata/) && approvals.get(pendingActor.item!.id)?.decision === "PendingApproval");
  check("unknown ids are rejected", approvals.approve("missing", { approvedBy: "a" }).status === "REJECTED" && approvals.cancel("missing").status === "REJECTED");

  check("PendingApproval allows approve, reject, return, cancel, and expire", resolveWorkflowApprovalActions("PendingApproval").join() === "Approve,Reject,ReturnForChanges,CancelRequest,ExpireRequest");
  check("NeedsChanges allows a new request, cancel, and expire", resolveWorkflowApprovalActions("NeedsChanges").join() === "RequestApproval,CancelRequest,ExpireRequest");
  check("terminal states allow no actions", resolveWorkflowApprovalActions("Approved").length === 0 && resolveWorkflowApprovalActions("Rejected").length === 0 && resolveWorkflowApprovalActions("Cancelled").length === 0 && resolveWorkflowApprovalActions("Expired").length === 0);
  check("resolver maps actions to states", resolveWorkflowApprovalDecision("PendingApproval", "Approve") === "Approved" && resolveWorkflowApprovalDecision("PendingApproval", "Reject") === "Rejected" && resolveWorkflowApprovalDecision("NeedsChanges", "RequestApproval") === "PendingApproval" && resolveWorkflowApprovalDecision("Approved", "Approve") === null);
  check("Invalid Transition: an unknown action is rejected", has(validator.validateTransition("PendingApproval", "Nope"), /Invalid Transition/));
  check("validator accepts a stored snapshot", validator.validateSnapshot(requested.item).length === 0);

  const ordered = orderWorkflowApprovalSnapshots([
    { id: "b", timestamp: "2026-01-01T00:00:02.000Z" },
    { id: "a", timestamp: "2026-01-01T00:00:02.000Z" },
    { id: "c", timestamp: "2026-01-01T00:00:01.000Z" },
  ]);
  check("resolver order is timestamp, then id", ordered.map((i) => i.id).join() === "c,a,b");

  const built = createWorkflowApprovalSnapshot({
    id: "approval-x",
    workflowId: "wf-x",
    currentState: "UNDER_REVIEW",
    requestedBy: "a",
    decision: "PendingApproval",
    timestamp: T0,
    metadata: { k: "v" },
  });
  check("createWorkflowApprovalSnapshot freezes copies", Object.isFrozen(built) && Object.isFrozen(built.metadata) && built.approvedBy === null);

  const contextBefore = JSON.stringify(context);
  approvals.request({ workflowId: "wf-ctx", currentState: "UNDER_REVIEW", requestedBy: "a", context });
  check("No mutation: request does not change the context", JSON.stringify(context) === contextBefore);
  const copy = approvals.get(requested.item!.id)!;
  try {
    (copy as { workflowId: string }).workflowId = "hacked";
  } catch {
    /* frozen */
  }
  check("returned snapshots stay frozen under assignment", approvals.get(requested.item!.id)?.workflowId === "wf-1");

  const other = createHumanApprovalManager({ timestamp: () => "2026-01-02T00:00:00.000Z", now: () => Date.parse("2026-01-02T00:00:00.000Z"), idFactory: () => "approval-other" });
  other.request({ workflowId: "wf-1", currentState: "UNDER_REVIEW", requestedBy: "a" });
  check("Independent execution: a second manager does not see the first", other.list().length === 1 && other.get(requested.item!.id) === null && approvals.get("approval-other") === null);

  const queue = createWorkflowQueue({ timestamp: () => T0, idFactory: () => "queue-item-1" });
  const waiting = queue.enqueue({ workflowId: "wf-q", candidateId: "cand-q", currentState: "CREATED" });
  const queued = createHumanApprovalManager({ ...clocks(), idFactory: () => "approval-q" }).request({
    workflowId: "wf-q",
    currentState: "CREATED",
    requestedBy: "a",
    queueItem: { id: waiting.item!.id },
  });
  check("approval consumes a queue item by id and does not dequeue it", queued.status === "REQUESTED" && queued.item?.metadata.queueItemId === "queue-item-1" && queue.list().length === 1);

  const notice = createWorkflowEvent({
    id: "event-1",
    type: "ReviewRequested",
    workflowId: "wf-e",
    candidateId: "cand-e",
    currentState: "LP_GENERATED",
    timestamp: T0,
  });
  const noticed = createHumanApprovalManager({ ...clocks(), idFactory: () => "approval-e" }).request({
    workflowId: "wf-e",
    currentState: "LP_GENERATED",
    requestedBy: "a",
    event: { id: notice.id, type: notice.type },
  });
  check("approval consumes an event by id and does not publish", noticed.status === "REQUESTED" && noticed.item?.metadata.eventId === "event-1");

  const retries = createWorkflowRetryManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "failure-1" });
  const failure = retries.record({ workflowId: "wf-r", currentState: "CREATED", failureType: "ManualInterventionRequired", lastError: "review" });
  check("retry recovery is unchanged by approval", failure.status === "RECORDED" && retries.list().length === 1);

  const sameA = createHumanApprovalManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "approval-same" });
  const firstPass = sameA.request({ workflowId: "wf-det", currentState: "UNDER_REVIEW", requestedBy: "a" });
  const sameB = createHumanApprovalManager({ timestamp: () => T0, now: () => Date.parse(T0), idFactory: () => "approval-same" });
  const secondPass = sameB.request({ workflowId: "wf-det", currentState: "UNDER_REVIEW", requestedBy: "a" });
  check("Deterministic approval flow: the same inputs yield the same snapshot", firstPass.item?.id === secondPass.item?.id && firstPass.item?.timestamp === secondPass.item?.timestamp && firstPass.item?.decision === secondPass.item?.decision);

  const dir = join(process.cwd(), "src/lib/workflow");
  const architecture = ["workflow-context.ts", "workflow-engine.ts", "workflow-registry.ts", "workflow-state-machine.ts", "workflow-types.ts", "workflow-validator.ts"];
  check("the architecture contracts remain six modules", architecture.every((f) => readdirSync(dir).includes(f)));
  const implementation = [
    "workflow-approval-manager.ts",
    "workflow-approval-registry.ts",
    "workflow-approval-validator.ts",
    "workflow-approval-resolver.ts",
    "workflow-approval-snapshot.ts",
  ];
  check("the five approval modules are present", implementation.every((f) => readdirSync(dir).includes(f)));
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
  check("no worker, processor, notifications, or execution plan", !bare.some((l) => /executionPlan|buildExecutionPlan|Worker|Processor|notify|email|slack|Promise\.all|Promise\.race/.test(l)));
  check("approval never enqueues, publishes, plans, or applies a move", !code.some((l) => /\.enqueue\(|\.dequeue\(|\.publish\(|\.plan\(|\.apply\(/.test(l)));
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
  check("no Opportunity, Discovery, Traffic, LP Builder, Platform, or Decision module imports workflow approval", !others.some((f) => /workflow-approval/.test(readFileSync(f, "utf8"))));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nWorkflow human approval: all checks passed.");
}

main();
