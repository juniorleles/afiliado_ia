/**
 * Workflow Engine: event registry.
 *
 * Holds the event kinds the bus may publish. It never stores payloads, never
 * notifies a listener, and never runs work. Registering the same kind twice
 * is rejected.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { WorkflowFrameworkError } from "./workflow-transition-registry";
import { isWorkflowEventType, WORKFLOW_EVENT_TYPES, type WorkflowEventType } from "./workflow-event";

export interface WorkflowEventRegistry {
  register(type: WorkflowEventType): WorkflowEventType;
  get(type: WorkflowEventType): WorkflowEventType | null;
  list(): WorkflowEventType[];
  validate(type: unknown): WorkflowIssue[];
}

export function createWorkflowEventRegistry(options: { seed?: boolean } = {}): WorkflowEventRegistry {
  const types = new Set<WorkflowEventType>();

  const validate = (type: unknown): WorkflowIssue[] => {
    if (!isWorkflowEventType(type)) return [{ field: "type", message: `Unknown Event: "${String(type)}" is not a workflow event.` }];
    return [];
  };

  const register = (type: WorkflowEventType): WorkflowEventType => {
    const issues = validate(type);
    if (issues.length > 0) throw new WorkflowFrameworkError("Event is invalid.", issues);
    if (types.has(type)) {
      throw new WorkflowFrameworkError("Event is invalid.", [{ field: "type", message: `Duplicate Event: "${type}" is already registered.` }]);
    }
    types.add(type);
    return type;
  };

  const registry: WorkflowEventRegistry = {
    register,
    get: (type) => (types.has(type) ? type : null),
    list: () => WORKFLOW_EVENT_TYPES.filter((type) => types.has(type)),
    validate,
  };

  if (options.seed !== false) {
    for (const type of WORKFLOW_EVENT_TYPES) register(type);
  }

  return registry;
}
