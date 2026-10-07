/**
 * Workflow Engine: failure registry.
 *
 * Holds the five failure kinds a workflow recovery may classify. It never
 * stores snapshots, never retries, and never runs work. Registering the same
 * kind twice is rejected.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { WorkflowFrameworkError } from "./workflow-transition-registry";

export const WORKFLOW_FAILURE_TYPES = [
  "RetryableFailure",
  "PermanentFailure",
  "ValidationFailure",
  "BlockedWorkflow",
  "ManualInterventionRequired",
] as const;
export type WorkflowFailureType = (typeof WORKFLOW_FAILURE_TYPES)[number];

export interface WorkflowFailureRegistry {
  register(type: WorkflowFailureType): WorkflowFailureType;
  get(type: WorkflowFailureType): WorkflowFailureType | null;
  list(): WorkflowFailureType[];
  validate(type: unknown): WorkflowIssue[];
}

export function isWorkflowFailureType(value: unknown): value is WorkflowFailureType {
  return typeof value === "string" && (WORKFLOW_FAILURE_TYPES as readonly string[]).includes(value);
}

export function isWorkflowRetryableFailure(type: WorkflowFailureType): boolean {
  return type === "RetryableFailure";
}

export function createWorkflowFailureRegistry(options: { seed?: boolean } = {}): WorkflowFailureRegistry {
  const types = new Set<WorkflowFailureType>();

  const validate = (type: unknown): WorkflowIssue[] => {
    if (!isWorkflowFailureType(type)) {
      return [{ field: "failureType", message: `Invalid Metadata: "${String(type)}" is not a failure type.` }];
    }
    return [];
  };

  const register = (type: WorkflowFailureType): WorkflowFailureType => {
    const issues = validate(type);
    if (issues.length > 0) throw new WorkflowFrameworkError("Failure is invalid.", issues);
    if (types.has(type)) {
      throw new WorkflowFrameworkError("Failure is invalid.", [
        { field: "failureType", message: `Duplicate Failure: type "${type}" is already registered.` },
      ]);
    }
    types.add(type);
    return type;
  };

  const registry: WorkflowFailureRegistry = {
    register,
    get: (type) => (types.has(type) ? type : null),
    list: () => WORKFLOW_FAILURE_TYPES.filter((type) => types.has(type)),
    validate,
  };

  if (options.seed !== false) {
    for (const type of WORKFLOW_FAILURE_TYPES) register(type);
  }

  return registry;
}
