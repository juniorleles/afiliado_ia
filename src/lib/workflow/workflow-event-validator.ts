/**
 * Workflow Engine: event validator.
 *
 * Reports problems with event kinds, payloads, stages, and metadata. It never
 * throws, never changes its input, never notifies a listener, and never runs
 * work.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { createWorkflowTransitionValidator, isFlatWorkflowMetadata, isWorkflowState } from "./workflow-transition-validator";
import { createWorkflowEventRegistry, type WorkflowEventRegistry } from "./workflow-event-registry";
import { WORKFLOW_EVENT_KEYS, type WorkflowEvent } from "./workflow-event";

export interface WorkflowEventValidator {
  validateType(input: unknown): WorkflowIssue[];
  validatePayload(input: unknown): WorkflowIssue[];
  validateMetadata(input: unknown): WorkflowIssue[];
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isIso = (value: unknown): boolean => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

export function createWorkflowEventValidator(options: { registry?: WorkflowEventRegistry } = {}): WorkflowEventValidator {
  const registry = options.registry ?? createWorkflowEventRegistry();
  const transitions = createWorkflowTransitionValidator();

  const validateType = (input: unknown): WorkflowIssue[] => {
    const issues = registry.validate(input);
    if (issues.length > 0) return issues;
    if (registry.get(input as WorkflowEvent["type"]) === null) {
      return [{ field: "type", message: `Unknown Event: "${String(input)}" is not registered.` }];
    }
    return [];
  };

  const validateMetadata = (input: unknown): WorkflowIssue[] => {
    if (isFlatWorkflowMetadata(input)) return [];
    return [{ field: "metadata", message: "Invalid metadata: a flat record of strings, numbers, booleans, or null is required." }];
  };

  const validatePayload = (input: unknown): WorkflowIssue[] => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return [{ field: "payload", message: "Invalid Payload: an event object is required." }];
    }
    const record = input as Record<string, unknown>;
    const issues: WorkflowIssue[] = [];
    for (const key of Object.keys(record)) {
      if (!(WORKFLOW_EVENT_KEYS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Payload: unexpected field "${key}".` });
      }
    }
    if (!nonEmpty(record.id)) issues.push({ field: "id", message: "Invalid Payload: an event id is required." });
    issues.push(...validateType(record.type));
    if (!nonEmpty(record.workflowId)) issues.push({ field: "workflowId", message: "Invalid Payload: a workflow id is required." });
    if (!nonEmpty(record.candidateId)) issues.push({ field: "candidateId", message: "Invalid Payload: a candidate id is required." });
    if (record.previousState !== null && record.previousState !== undefined) {
      issues.push(...transitions.validateState(record.previousState).map((issue) => ({ field: "previousState", message: issue.message.replace("Unknown State", "Invalid State") })));
    }
    if (!isWorkflowState(record.currentState)) {
      issues.push({ field: "currentState", message: `Invalid State: "${String(record.currentState)}" is not a workflow stage.` });
    } else {
      issues.push(...transitions.validateState(record.currentState).map((issue) => ({ field: "currentState", message: issue.message.replace("Unknown State", "Invalid State") })));
    }
    if (!isIso(record.timestamp)) issues.push({ field: "timestamp", message: "Invalid Payload: timestamp must be an ISO timestamp." });
    issues.push(...validateMetadata(record.metadata));
    return issues;
  };

  return { validateType, validatePayload, validateMetadata };
}
