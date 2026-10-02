/**
 * Workflow Engine: human approval manager.
 *
 * In-memory control of approval states. It pauses a workflow by recording a
 * human request and the outcome of that request. It never runs work, never
 * records a business choice, never notifies anyone, never reaches an outside
 * system, never writes a store, and never calls a model.
 *
 * The only clock is an injectable `now`; its default is wall time in
 * milliseconds and is the only time source in the manager. `timestamp` is
 * injectable so tests are deterministic.
 */
import type { WorkflowContext } from "./workflow-context";
import type { WorkflowMetadata } from "./workflow-types";
import type { WorkflowIssue } from "./workflow-validator";
import { freezeDeepWorkflow } from "./workflow-state-snapshot";
import {
  createWorkflowApprovalRegistry,
  type WorkflowApprovalRegistry,
} from "./workflow-approval-registry";
import {
  createWorkflowApprovalSnapshot,
  type WorkflowApprovalSnapshot,
} from "./workflow-approval-snapshot";
import {
  isWorkflowApprovalOpen,
  orderWorkflowApprovalSnapshots,
  resolveWorkflowApprovalDecision,
  type WorkflowApprovalAction,
} from "./workflow-approval-resolver";
import {
  createWorkflowApprovalValidator,
  type WorkflowApprovalRequestInput,
  type WorkflowApprovalValidator,
} from "./workflow-approval-validator";

export { WORKFLOW_APPROVAL_SNAPSHOT_KEYS, type WorkflowApprovalSnapshot } from "./workflow-approval-snapshot";

export interface WorkflowApprovalRequest extends WorkflowApprovalRequestInput {
  context?: WorkflowContext | null;
  event?: { id: string; type?: string } | null;
  queueItem?: { id: string } | null;
}

export interface WorkflowLookup {
  get(id: string): { id: string } | null;
}

export interface WorkflowApprovalActor {
  approvedBy?: string;
  reviewedBy?: string;
}

export interface WorkflowApprovalResult {
  status: "REQUESTED" | "APPROVED" | "DECLINED" | "RETURNED" | "CANCELLED" | "EXPIRED" | "REJECTED";
  item: WorkflowApprovalSnapshot | null;
  issues: WorkflowIssue[];
}

export interface HumanApprovalManager {
  readonly registry: WorkflowApprovalRegistry;
  readonly validator: WorkflowApprovalValidator;
  request(input: WorkflowApprovalRequest): WorkflowApprovalResult;
  approve(id: string, actor: WorkflowApprovalActor): WorkflowApprovalResult;
  reject(id: string, actor?: WorkflowApprovalActor): WorkflowApprovalResult;
  returnForChanges(id: string, actor?: WorkflowApprovalActor): WorkflowApprovalResult;
  cancel(id: string): WorkflowApprovalResult;
  expire(id: string): WorkflowApprovalResult;
  snapshot(id: string): WorkflowApprovalSnapshot | null;
  get(id: string): WorkflowApprovalSnapshot | null;
  list(): WorkflowApprovalSnapshot[];
}

export interface HumanApprovalManagerOptions {
  registry?: WorkflowApprovalRegistry;
  validator?: WorkflowApprovalValidator;
  lookup?: WorkflowLookup;
  now?: () => number;
  timestamp?: () => string;
  idFactory?: () => string;
}

const STATUS_BY_ACTION: Record<WorkflowApprovalAction, Exclude<WorkflowApprovalResult["status"], "REJECTED">> = {
  RequestApproval: "REQUESTED",
  Approve: "APPROVED",
  Reject: "DECLINED",
  ReturnForChanges: "RETURNED",
  CancelRequest: "CANCELLED",
  ExpireRequest: "EXPIRED",
};

function copyItem(item: WorkflowApprovalSnapshot): WorkflowApprovalSnapshot {
  return createWorkflowApprovalSnapshot(item);
}

function copyScalar(source: WorkflowMetadata, prefix: string, metadata: WorkflowMetadata): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      metadata[`${prefix}${key}`] = value;
    }
  }
}

function metadataFrom(input: WorkflowApprovalRequest): WorkflowMetadata {
  const metadata: WorkflowMetadata = { ...(input.metadata ?? {}) };
  const analysis = input.context?.decisionAnalysis ?? null;
  if (typeof analysis?.id === "string") metadata.decisionAnalysisId = analysis.id;
  if (typeof input.context?.decisionStatus === "string") metadata.decisionStatus = input.context.decisionStatus;
  copyScalar(input.context?.executionMetadata ?? {}, "execution.", metadata);
  copyScalar(input.context?.runtimeMetadata ?? {}, "runtime.", metadata);
  copyScalar(input.context?.configuration ?? {}, "configuration.", metadata);
  if (typeof input.event?.id === "string") metadata.eventId = input.event.id;
  if (typeof input.event?.type === "string") metadata.eventType = input.event.type;
  if (typeof input.queueItem?.id === "string") metadata.queueItemId = input.queueItem.id;
  return metadata;
}

function rejected(issues: WorkflowIssue[]): WorkflowApprovalResult {
  return freezeDeepWorkflow({ status: "REJECTED" as const, item: null, issues });
}

function actorName(actor: WorkflowApprovalActor | undefined, field: "approvedBy" | "reviewedBy"): string | null {
  const value = actor?.[field] ?? actor?.reviewedBy ?? actor?.approvedBy;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function createHumanApprovalManager(options: HumanApprovalManagerOptions = {}): HumanApprovalManager {
  const now = options.now ?? (() => Date.now());
  const timestamp = options.timestamp ?? (() => new Date(now()).toISOString());
  const registry = options.registry ?? createWorkflowApprovalRegistry();
  const validator = options.validator ?? createWorkflowApprovalValidator({ registry });
  const lookup = options.lookup;
  let sequence = 0;
  const idFactory = options.idFactory ?? (() => `approval-${(sequence += 1)}`);
  const items = new Map<string, WorkflowApprovalSnapshot>();

  const missing = (id: string): WorkflowApprovalResult =>
    rejected([{ field: "id", message: `Invalid State: approval "${id}" is not known.` }]);

  const findOpen = (workflowId: string): WorkflowApprovalSnapshot | null => {
    for (const item of items.values()) {
      if (item.workflowId === workflowId && isWorkflowApprovalOpen(item.decision)) return item;
    }
    return null;
  };

  const applyAction = (
    item: WorkflowApprovalSnapshot,
    action: WorkflowApprovalAction,
    patch: { approvedBy?: string | null; metadata?: WorkflowMetadata },
  ): WorkflowApprovalResult => {
    const issues = validator.validateTransition(item.decision, action);
    if (issues.length > 0) return rejected(issues);
    const decision = resolveWorkflowApprovalDecision(item.decision, action);
    if (decision === null) {
      return rejected([{ field: "action", message: `Invalid Transition: ${action} is not allowed from ${item.decision}.` }]);
    }
    const updated = createWorkflowApprovalSnapshot({
      ...item,
      approvedBy: patch.approvedBy !== undefined ? patch.approvedBy : item.approvedBy,
      decision,
      timestamp: timestamp(),
      metadata: patch.metadata ?? item.metadata,
    });
    const itemIssues = validator.validateSnapshot(updated);
    if (itemIssues.length > 0) return rejected(itemIssues);
    items.set(updated.id, updated);
    return freezeDeepWorkflow({ status: STATUS_BY_ACTION[action], item: copyItem(updated), issues: [] });
  };

  return {
    registry,
    validator,
    request(input) {
      void now();
      const issues = [...validator.validateRequest(input)];
      if (lookup && typeof input.workflowId === "string" && lookup.get(input.workflowId) === null) {
        issues.push({ field: "workflowId", message: `Unknown Workflow: workflow "${input.workflowId}" is not known.` });
      }
      if (issues.length > 0) return rejected(issues);
      const open = findOpen(input.workflowId);
      if (open !== null && open.decision === "NeedsChanges") {
        return applyAction(open, "RequestApproval", {
          metadata: { ...open.metadata, ...metadataFrom(input) },
        });
      }
      issues.push(...validator.validateDuplicate(items.values(), input.workflowId));
      if (issues.length > 0) return rejected(issues);
      const item = createWorkflowApprovalSnapshot({
        id: idFactory(),
        workflowId: input.workflowId,
        currentState: input.currentState,
        requestedBy: input.requestedBy,
        approvedBy: null,
        decision: "PendingApproval",
        timestamp: timestamp(),
        metadata: metadataFrom(input),
      });
      const itemIssues = validator.validateSnapshot(item);
      if (itemIssues.length > 0) return rejected(itemIssues);
      items.set(item.id, item);
      return freezeDeepWorkflow({ status: "REQUESTED" as const, item: copyItem(item), issues: [] });
    },
    approve(id, actor) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const approvedBy = actorName(actor, "approvedBy");
      if (approvedBy === null) {
        return rejected([{ field: "approvedBy", message: "Invalid Metadata: approvedBy is required." }]);
      }
      return applyAction(item, "Approve", { approvedBy, metadata: { ...item.metadata, approvedBy } });
    },
    reject(id, actor) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const reviewedBy = actorName(actor, "reviewedBy");
      const metadata = { ...item.metadata };
      if (reviewedBy !== null) metadata.reviewedBy = reviewedBy;
      return applyAction(item, "Reject", { metadata });
    },
    returnForChanges(id, actor) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      const reviewedBy = actorName(actor, "reviewedBy");
      const metadata = { ...item.metadata };
      if (reviewedBy !== null) metadata.reviewedBy = reviewedBy;
      return applyAction(item, "ReturnForChanges", { metadata });
    },
    cancel(id) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      return applyAction(item, "CancelRequest", {});
    },
    expire(id) {
      void now();
      const item = items.get(id);
      if (item === undefined) return missing(id);
      return applyAction(item, "ExpireRequest", {});
    },
    snapshot(id) {
      const item = items.get(id);
      return item ? copyItem(item) : null;
    },
    get(id) {
      const item = items.get(id);
      return item ? copyItem(item) : null;
    },
    list() {
      return orderWorkflowApprovalSnapshots([...items.values()]).map(copyItem);
    },
  };
}
