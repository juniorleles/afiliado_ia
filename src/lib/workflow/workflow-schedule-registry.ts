/**
 * Workflow Engine: schedule registry.
 *
 * Holds the six window kinds a workflow item may be planned under. It never
 * stores items, never opens a window, and never runs work. Registering the
 * same kind twice is rejected.
 */
import type { WorkflowIssue } from "./workflow-validator";
import { WorkflowFrameworkError } from "./workflow-transition-registry";

export const WORKFLOW_SCHEDULE_KINDS = [
  "Immediate",
  "Scheduled",
  "Delayed",
  "Recurring",
  "Retry",
  "Manual",
] as const;
export type WorkflowScheduleKind = (typeof WORKFLOW_SCHEDULE_KINDS)[number];

export interface WorkflowExecutionWindow {
  kind: WorkflowScheduleKind;
  startAt: string;
  endAt: string | null;
  delayMs: number | null;
  intervalMs: number | null;
  paused: boolean;
}

export interface WorkflowScheduleRegistry {
  register(kind: WorkflowScheduleKind): WorkflowScheduleKind;
  get(kind: WorkflowScheduleKind): WorkflowScheduleKind | null;
  list(): WorkflowScheduleKind[];
  validate(kind: unknown): WorkflowIssue[];
}

export function isWorkflowScheduleKind(value: unknown): value is WorkflowScheduleKind {
  return typeof value === "string" && (WORKFLOW_SCHEDULE_KINDS as readonly string[]).includes(value);
}

export function createWorkflowScheduleRegistry(options: { seed?: boolean } = {}): WorkflowScheduleRegistry {
  const kinds = new Set<WorkflowScheduleKind>();

  const validate = (kind: unknown): WorkflowIssue[] => {
    if (!isWorkflowScheduleKind(kind)) {
      return [{ field: "kind", message: `Invalid Window: "${String(kind)}" is not a schedule kind.` }];
    }
    return [];
  };

  const register = (kind: WorkflowScheduleKind): WorkflowScheduleKind => {
    const issues = validate(kind);
    if (issues.length > 0) throw new WorkflowFrameworkError("Schedule is invalid.", issues);
    if (kinds.has(kind)) {
      throw new WorkflowFrameworkError("Schedule is invalid.", [
        { field: "kind", message: `Duplicate Schedule: kind "${kind}" is already registered.` },
      ]);
    }
    kinds.add(kind);
    return kind;
  };

  const registry: WorkflowScheduleRegistry = {
    register,
    get: (kind) => (kinds.has(kind) ? kind : null),
    list: () => WORKFLOW_SCHEDULE_KINDS.filter((kind) => kinds.has(kind)),
    validate,
  };

  if (options.seed !== false) {
    for (const kind of WORKFLOW_SCHEDULE_KINDS) register(kind);
  }

  return registry;
}
