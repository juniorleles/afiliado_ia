/**
 * Execution Task Framework: validator.
 *
 * Pure rules for task modules, dependencies, task output, and the shared
 * context. It rejects duplicate task ids, circular dependencies, invalid
 * categories, invalid versions, missing contracts, and invalid metadata. It
 * only reports problems: it never registers, enables, or reorders anything,
 * and it never changes what it is given.
 */
import {
  EXECUTION_TASK_CATEGORIES,
  EXECUTION_TASK_RESULT_STATUSES,
  type ExecutionTaskEntry,
} from "./execution-task-contract";
import type { ExecutionIssue } from "./execution-validator";

const TASK_ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const EXECUTION_TASK_PRIORITY_MIN = 0;
export const EXECUTION_TASK_PRIORITY_MAX = 1000;

const DEPENDENCY_LISTS = ["requires", "optional", "conflicts"] as const;
const MODULE_METHODS = ["supportsPlan", "build", "validate"] as const;
const MODULE_FIELDS = ["id", "name", "version", "category", "enabled", "priority", "dependencies"] as const;
const CONTEXT_RECORDS = ["decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const CONTEXT_MEMBERS = [...CONTEXT_RECORDS, ...CONTEXT_METADATA] as const;

export function isExecutionTaskCategory(value: unknown): boolean {
  return (EXECUTION_TASK_CATEGORIES as readonly unknown[]).includes(value);
}

export function isExecutionTaskVersion(value: unknown): boolean {
  return typeof value === "string" && SEMVER.test(value);
}

/** Checks a task module against the contract. Reports every problem found. */
export function validateExecutionTaskModule(input: unknown): ExecutionIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "module", message: "Missing contract: a task module is required." }];
  }
  const module = input as Record<string, unknown>;
  const issues: ExecutionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const field of MODULE_FIELDS) {
    if (module[field] === undefined || module[field] === null) add(field, `Missing contract: member "${field}" is missing.`);
  }
  for (const method of MODULE_METHODS) {
    if (typeof module[method] !== "function") add(method, `Missing contract: method "${method}" is missing.`);
  }

  if (module.id !== undefined && module.id !== null) {
    if (typeof module.id !== "string" || !TASK_ID.test(module.id)) {
      add("id", "Id must be lowercase letters, digits, and hyphens, starting with a letter.");
    }
  }
  if (module.name !== undefined && module.name !== null) {
    if (typeof module.name !== "string" || module.name.trim() === "") add("name", "Name must not be empty.");
  }
  if (module.version !== undefined && module.version !== null && !isExecutionTaskVersion(module.version)) {
    add("version", "Invalid version: version must be a semantic version such as 1.0.0.");
  }
  if (module.category !== undefined && module.category !== null && !isExecutionTaskCategory(module.category)) {
    add("category", "Category is not supported.");
  }
  if (module.enabled !== undefined && module.enabled !== null && typeof module.enabled !== "boolean") {
    add("enabled", "enabled must be true or false.");
  }
  if (module.priority !== undefined && module.priority !== null) {
    const p = module.priority;
    if (typeof p !== "number" || !Number.isInteger(p) || p < EXECUTION_TASK_PRIORITY_MIN || p > EXECUTION_TASK_PRIORITY_MAX) {
      add("priority", `Priority must be an integer from ${EXECUTION_TASK_PRIORITY_MIN} to ${EXECUTION_TASK_PRIORITY_MAX}.`);
    }
  }

  const deps = module.dependencies;
  if (deps !== undefined && deps !== null) {
    if (typeof deps !== "object" || Array.isArray(deps)) {
      add("dependencies", "Dependencies must be an object with requires, optional, and conflicts.");
    } else {
      const lists: Record<string, string[]> = {};
      for (const list of DEPENDENCY_LISTS) {
        const value = (deps as Record<string, unknown>)[list];
        if (!Array.isArray(value)) {
          add(`dependencies.${list}`, `"${list}" must be a list of task ids.`);
          continue;
        }
        const ids = value as unknown[];
        if (ids.some((id) => typeof id !== "string" || !TASK_ID.test(id))) {
          add(`dependencies.${list}`, `"${list}" must contain only valid task ids.`);
          continue;
        }
        if (new Set(ids).size !== ids.length) add(`dependencies.${list}`, `"${list}" must not repeat an id.`);
        if (typeof module.id === "string" && ids.includes(module.id)) {
          add(`dependencies.${list}`, "A task cannot depend on or conflict with itself.");
        }
        lists[list] = ids as string[];
      }
      const requiredOrOptional = [...(lists.requires ?? []), ...(lists.optional ?? [])];
      if ((lists.conflicts ?? []).some((id) => requiredOrOptional.includes(id))) {
        add("dependencies.conflicts", "A task cannot both conflict with and depend on the same task.");
      }
      if ((lists.requires ?? []).some((id) => (lists.optional ?? []).includes(id))) {
        add("dependencies.optional", "A task cannot list the same id as required and optional.");
      }
    }
  }
  return issues;
}

/** Rejects an id that is already registered. */
export function validateNoDuplicateExecutionTaskId(existing: Iterable<string>, id: string): ExecutionIssue[] {
  for (const known of existing) {
    if (known === id) return [{ field: "id", message: `Duplicate Task: "${id}" is already registered.` }];
  }
  return [];
}

/** The ordering edges between enabled tasks: dependency id -> ids that must be collected after it. */
export function executionTaskDependencyEdges(entries: readonly ExecutionTaskEntry[]): Map<string, string[]> {
  const enabled = new Map(entries.filter((e) => e.enabled).map((e) => [e.id, e]));
  const edges = new Map<string, string[]>([...enabled.keys()].map((id) => [id, []]));
  for (const entry of enabled.values()) {
    const { requires, optional } = entry.module.dependencies;
    for (const dep of [...requires, ...optional]) {
      if (enabled.has(dep)) edges.get(dep)!.push(entry.id);
    }
  }
  return edges;
}

/** Finds circular dependencies among enabled tasks. Each cycle is reported once. */
function findCycles(edges: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of [...(edges.get(id) ?? [])].sort()) {
      if (state.get(next) === "visiting") {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (state.get(next) === undefined) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, "done");
  };
  for (const id of [...edges.keys()].sort()) {
    if (state.get(id) === undefined) visit(id);
  }
  return cycles;
}

/**
 * Validates the declared dependencies of every enabled task: required
 * tasks must be registered and enabled, conflicting tasks must not be
 * enabled, and there must be no cycle. Nothing is changed or resolved.
 */
export function validateExecutionTaskDependencies(entries: readonly ExecutionTaskEntry[]): ExecutionIssue[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const issues: ExecutionIssue[] = [];
  const conflictPairs = new Set<string>();

  for (const entry of [...entries].filter((e) => e.enabled).sort((a, b) => a.id.localeCompare(b.id))) {
    for (const dep of entry.module.dependencies.requires) {
      const target = byId.get(dep);
      if (!target) {
        issues.push({ field: "dependencies.requires", message: `Task "${entry.id}" requires "${dep}", which is not registered.` });
      } else if (!target.enabled) {
        issues.push({ field: "dependencies.requires", message: `Task "${entry.id}" requires "${dep}", which is disabled.` });
      }
    }
    for (const other of entry.module.dependencies.conflicts) {
      if (byId.get(other)?.enabled) {
        const key = [entry.id, other].sort().join("|");
        if (conflictPairs.has(key)) continue;
        conflictPairs.add(key);
        issues.push({ field: "dependencies.conflicts", message: `Task "${entry.id}" conflicts with "${other}", and both are enabled.` });
      }
    }
  }
  for (const cycle of findCycles(executionTaskDependencyEdges(entries))) {
    issues.push({ field: "dependencies", message: `Circular dependency: ${[...cycle].reverse().join(" -> ")}.` });
  }
  return issues;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** A plain object whose values are strings, finite numbers, booleans, or null, under non-empty keys. */
export function isFlatExecutionMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

/** Checks what build() returned. The framework does not interpret duration beyond its type. */
export function validateExecutionTaskOutput(input: unknown): ExecutionIssue[] {
  if (typeof input !== "object" || input === null) return [{ field: "output", message: "Task output must be an object." }];
  const output = input as Record<string, unknown>;
  const issues: ExecutionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (!(EXECUTION_TASK_RESULT_STATUSES as readonly unknown[]).includes(output.status)) add("status", "Status is not supported.");
  if (output.estimatedDuration !== null && !(typeof output.estimatedDuration === "number" && Number.isFinite(output.estimatedDuration) && output.estimatedDuration >= 0)) {
    add("estimatedDuration", "estimatedDuration must be a finite number of 0 or more, or null.");
  }
  if (!isFlatExecutionMetadata(output.metadata)) add("metadata", "Invalid metadata: metadata must be a flat object of strings, numbers, booleans, or null.");
  if (!Array.isArray(output.warnings) || output.warnings.some((item) => typeof item !== "string")) {
    add("warnings", "warnings must be a list of text.");
  }
  if (output.status === "FAILED" && Array.isArray(output.warnings) && output.warnings.length === 0) {
    add("warnings", "A FAILED result requires at least one warning.");
  }
  if (output.status === "BLOCKED" && Array.isArray(output.warnings) && output.warnings.length === 0) {
    add("warnings", "A BLOCKED result requires at least one warning.");
  }
  if (output.status === "SKIPPED" && Array.isArray(output.warnings) && output.warnings.length === 0) {
    add("warnings", "A SKIPPED result requires at least one warning.");
  }
  return issues;
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

/**
 * Checks a context or the members a context is to be made from. Metadata
 * must be flat. A record that is supplied must name itself as an id holder.
 * With `complete`, every member must be present, as in a context a pipeline
 * is about to collect.
 */
export function validateExecutionTaskContext(input: unknown, complete = false): ExecutionIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "context", message: "Invalid context: an object is required." }];
  }
  const record = input as Record<string, unknown>;
  const issues: ExecutionIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const key of Object.keys(record)) {
    if (!(CONTEXT_MEMBERS as readonly string[]).includes(key)) add(key, `Invalid context: unexpected member "${key}".`);
  }
  if (complete) {
    for (const key of CONTEXT_MEMBERS) if (!(key in record)) add(key, `Invalid context: member "${key}" is missing.`);
  }
  for (const key of CONTEXT_RECORDS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (!isPlainRecord(value)) add(key, `Invalid context: "${key}" must be an id holder.`);
    else if (idOf(value) === null) add(key, `Invalid context: "${key}" must carry a non-empty id.`);
  }
  for (const key of CONTEXT_METADATA) {
    const value = record[key];
    if (value === undefined && !complete) continue;
    if (!isFlatExecutionMetadata(value)) add(key, `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.`);
  }
  return issues;
}

/**
 * Checks that enabled tasks still satisfy the contract and that their
 * declared graph is valid. When a context is given, it is checked too.
 */
export function validateExecutionTaskPlan(entries: readonly ExecutionTaskEntry[], context?: unknown): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  for (const entry of entries.filter((e) => e.enabled)) {
    issues.push(...validateExecutionTaskModule(entry.module));
  }
  issues.push(...validateExecutionTaskDependencies(entries));
  if (context !== undefined) issues.push(...validateExecutionTaskContext(context, true));
  return issues;
}
