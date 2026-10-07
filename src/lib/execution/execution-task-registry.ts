/**
 * Execution Task Framework: task registry.
 *
 * Holds the task modules plugged into the planner. It checks each module
 * against the contract when it is registered, and tracks whether it is enabled.
 * It never builds a plan and never resolves dependencies: those are checked
 * and ordered by the pipeline.
 *
 * Not to be confused with ExecutionRegistry (execution-registry.ts), the
 * architecture contract for plan records. This registry holds task modules.
 */
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionTaskCategory, ExecutionTaskEntry, ExecutionTaskModule } from "./execution-task-contract";
import { validateExecutionTaskModule, validateNoDuplicateExecutionTaskId } from "./execution-task-validator";

export class ExecutionTaskFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: ExecutionIssue[] = [],
  ) {
    super(message);
    this.name = "ExecutionTaskFrameworkError";
  }
}

export interface ExecutionTaskFilter {
  category?: ExecutionTaskCategory;
  enabled?: boolean;
}

export interface ExecutionTaskRegistry {
  /** Rejects a module that breaks the contract or repeats a registered id. Starts as module.enabled. */
  register(module: ExecutionTaskModule): ExecutionTaskEntry;
  remove(id: string): ExecutionTaskEntry;
  enable(id: string): ExecutionTaskEntry;
  disable(id: string): ExecutionTaskEntry;
  get(id: string): ExecutionTaskEntry | null;
  /** Highest priority first, then id. */
  list(filter?: ExecutionTaskFilter): ExecutionTaskEntry[];
  count(): number;
  /** Reports contract problems without registering. */
  validate(module: unknown): ExecutionIssue[];
}

export function createExecutionTaskRegistry(): ExecutionTaskRegistry {
  const entries = new Map<string, ExecutionTaskEntry>();

  const mustGet = (id: string): ExecutionTaskEntry => {
    const entry = entries.get(id);
    if (!entry) throw new ExecutionTaskFrameworkError(`Task "${id}" is not registered.`, [{ field: "id", message: `Task "${id}" is not registered.` }]);
    return entry;
  };
  const setEnabled = (id: string, enabled: boolean): ExecutionTaskEntry => {
    const next: ExecutionTaskEntry = { ...mustGet(id), enabled };
    entries.set(id, next);
    return next;
  };

  return {
    register(module) {
      let issues = validateExecutionTaskModule(module);
      if (issues.length === 0) issues = validateNoDuplicateExecutionTaskId(entries.keys(), module.id);
      if (issues.length > 0) throw new ExecutionTaskFrameworkError("Task is invalid.", issues);
      const entry: ExecutionTaskEntry = { id: module.id, module, enabled: module.enabled };
      entries.set(entry.id, entry);
      return entry;
    },
    remove(id) {
      const entry = mustGet(id);
      entries.delete(id);
      return entry;
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => entries.get(id) ?? null,
    list(filter = {}) {
      return [...entries.values()]
        .filter(
          (e) =>
            (filter.category === undefined || e.module.category === filter.category) &&
            (filter.enabled === undefined || e.enabled === filter.enabled),
        )
        .sort((a, b) => b.module.priority - a.module.priority || a.id.localeCompare(b.id));
    },
    count: () => entries.size,
    validate: (module) => validateExecutionTaskModule(module),
  };
}
