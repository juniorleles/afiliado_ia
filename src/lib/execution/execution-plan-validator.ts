/**
 * Execution Plan Builder: validator.
 *
 * Pure rules for builder input, task results, the assembled plan, snapshots,
 * gates, and the task graph. It rejects circular dependencies, duplicate
 * task ids, missing dependencies, invalid metadata, and an invalid plan. It
 * only reports problems: it never builds, stores, or changes what it is given.
 *
 * Preconditions and postconditions are restated, never judged.
 */
import { EXECUTION_TASK_CATEGORIES, EXECUTION_TASK_RESULT_STATUSES } from "./execution-task-contract";
import { isFlatExecutionMetadata } from "./execution-task-validator";
import type { ExecutionDependency } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";

const TASK_ID = /^[a-z][a-z0-9-]*$/;
const PLAN_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "decisionAnalysis",
  "workflowSnapshot",
  "results",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
  "preconditions",
  "postconditions",
  "tasks",
] as const;
const CONTEXT_RECORDS = ["decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const DEPENDENCY_LISTS = ["requires", "optional", "conflicts"] as const;
const RESULT_FIELDS = ["taskId", "status", "warnings", "metadata", "estimatedDuration", "dependencies", "executionOrder"] as const;

export interface ExecutionPlanValidator {
  validateInput(input: unknown): ExecutionIssue[];
  validatePlan(input: unknown): ExecutionIssue[];
  validateSnapshot(input: unknown): ExecutionIssue[];
  validateMetadata(input: unknown): ExecutionIssue[];
  validateGraph(taskIds: readonly string[], dependencies: readonly ExecutionDependency[]): ExecutionIssue[];
  validatePreconditions(input: unknown): ExecutionIssue[];
  validatePostconditions(input: unknown): ExecutionIssue[];
  validateResults(input: unknown): ExecutionIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

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

function validateGateList(input: unknown, field: string): ExecutionIssue[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return [{ field, message: `Invalid Plan: ${field} must be a list.` }];
  const issues: ExecutionIssue[] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const path = `${field}[${index}]`;
    if (!isPlainRecord(item)) {
      issues.push({ field: path, message: `Invalid Plan: ${field} must be id holders with metadata.` });
      return;
    }
    if (typeof item.id !== "string" || item.id.trim() === "") {
      issues.push({ field: `${path}.id`, message: `Invalid Plan: a ${field.slice(0, -1)} id is required.` });
    } else if (seen.has(item.id)) {
      issues.push({ field: `${path}.id`, message: `Invalid Plan: "${item.id}" is already listed.` });
    } else {
      seen.add(item.id);
    }
    if (item.metadata !== undefined && !isFlatExecutionMetadata(item.metadata)) {
      issues.push({ field: `${path}.metadata`, message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." });
    }
  });
  return issues;
}

export function createExecutionPlanValidator(): ExecutionPlanValidator {
  function validateMetadata(input: unknown): ExecutionIssue[] {
    if (input === undefined) return [];
    if (!isFlatExecutionMetadata(input)) {
      return [{ field: "metadata", message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateGraph(taskIds: readonly string[], dependencies: readonly ExecutionDependency[]): ExecutionIssue[] {
    const issues: ExecutionIssue[] = [];
    const seen = new Set<string>();
    for (const id of taskIds) {
      if (seen.has(id)) issues.push({ field: "tasks", message: `Duplicate Task: "${id}" is already listed.` });
      seen.add(id);
    }
    const ids = new Set(taskIds);
    const pairSeen = new Set<string>();
    const edges = new Map<string, string[]>([...ids].map((id) => [id, []]));
    for (const item of dependencies) {
      if (!isPlainRecord(item) || typeof item.from !== "string" || typeof item.to !== "string") {
        issues.push({ field: "dependencies", message: "Invalid Plan: a dependency must name from and to." });
        continue;
      }
      if (!ids.has(item.from) || !ids.has(item.to)) {
        issues.push({ field: "dependencies", message: `Missing Dependency: "${item.from}" or "${item.to}" names no listed task.` });
        continue;
      }
      const pair = `${item.from}->${item.to}`;
      if (pairSeen.has(pair)) continue;
      pairSeen.add(pair);
      edges.get(item.from)!.push(item.to);
    }
    for (const cycle of findCycles(edges)) {
      issues.push({ field: "dependencies", message: `Circular dependency: ${[...cycle].reverse().join(" -> ")}.` });
    }
    return issues;
  }

  function validateResults(input: unknown): ExecutionIssue[] {
    if (!Array.isArray(input)) return [{ field: "results", message: "Invalid Plan: results must be a list." }];
    const issues: ExecutionIssue[] = [];
    const seen = new Set<string>();
    input.forEach((item, index) => {
      const path = `results[${index}]`;
      if (!isPlainRecord(item)) {
        issues.push({ field: path, message: "Invalid Plan: a task result must be an object." });
        return;
      }
      for (const field of RESULT_FIELDS) {
        if (item[field] === undefined) issues.push({ field: `${path}.${field}`, message: `Invalid Plan: result member "${field}" is missing.` });
      }
      if (typeof item.taskId !== "string" || !TASK_ID.test(item.taskId)) {
        issues.push({ field: `${path}.taskId`, message: "Invalid Plan: a well-formed task id is required." });
      } else if (seen.has(item.taskId)) {
        issues.push({ field: `${path}.taskId`, message: `Duplicate Task: "${item.taskId}" is already listed.` });
      } else {
        seen.add(item.taskId);
      }
      if (item.status !== undefined && !(EXECUTION_TASK_RESULT_STATUSES as readonly unknown[]).includes(item.status)) {
        issues.push({ field: `${path}.status`, message: "Invalid Plan: a result status is not supported." });
      }
      if (item.warnings !== undefined && (!Array.isArray(item.warnings) || item.warnings.some((warning) => typeof warning !== "string"))) {
        issues.push({ field: `${path}.warnings`, message: "Invalid Plan: warnings must be a list of text." });
      }
      if (item.metadata !== undefined && !isFlatExecutionMetadata(item.metadata)) {
        issues.push({ field: `${path}.metadata`, message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." });
      }
      if (item.estimatedDuration !== undefined && item.estimatedDuration !== null && !(typeof item.estimatedDuration === "number" && Number.isFinite(item.estimatedDuration) && item.estimatedDuration >= 0)) {
        issues.push({ field: `${path}.estimatedDuration`, message: "Invalid Plan: estimatedDuration must be a finite number of 0 or more, or null." });
      }
      if (item.executionOrder !== undefined && !(typeof item.executionOrder === "number" && Number.isInteger(item.executionOrder) && item.executionOrder >= 0)) {
        issues.push({ field: `${path}.executionOrder`, message: "Invalid Plan: executionOrder must be an integer of 0 or more." });
      }
      const deps = item.dependencies;
      if (deps !== undefined && deps !== null) {
        if (!isPlainRecord(deps)) {
          issues.push({ field: `${path}.dependencies`, message: "Invalid Plan: dependencies must be an object with requires, optional, and conflicts." });
        } else {
          for (const list of DEPENDENCY_LISTS) {
            const value = deps[list];
            if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
              issues.push({ field: `${path}.dependencies.${list}`, message: `Invalid Plan: "${list}" must be a list of task ids.` });
            }
          }
        }
      }
    });
    return issues;
  }

  function validateInput(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "plan", message: "Invalid Plan: an object of results and context is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Plan: unexpected member "${key}".` });
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `Invalid Plan: "${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `Invalid Plan: "${key}" must carry a non-empty id.` });
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      if (!isFlatExecutionMetadata(value)) {
        issues.push({ field: key, message: `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
      }
    }
    if (!("results" in input)) issues.push({ field: "results", message: "Invalid Plan: results are required." });
    else issues.push(...validateResults(input.results));
    issues.push(...validateGateList(input.preconditions, "preconditions"));
    issues.push(...validateGateList(input.postconditions, "postconditions"));
    if (input.tasks !== undefined) {
      if (!Array.isArray(input.tasks)) {
        issues.push({ field: "tasks", message: "Invalid Plan: tasks must be a list." });
      } else {
        const seen = new Set<string>();
        input.tasks.forEach((item, index) => {
          const path = `tasks[${index}]`;
          if (!isPlainRecord(item)) {
            issues.push({ field: path, message: "Invalid Plan: a task spec must be an object." });
            return;
          }
          if (typeof item.id !== "string" || !TASK_ID.test(item.id)) {
            issues.push({ field: `${path}.id`, message: "Invalid Plan: a well-formed task id is required." });
          } else if (seen.has(item.id)) {
            issues.push({ field: `${path}.id`, message: `Duplicate Task: "${item.id}" is already listed.` });
          } else {
            seen.add(item.id);
          }
          if (typeof item.name !== "string" || item.name.trim() === "") {
            issues.push({ field: `${path}.name`, message: "Invalid Plan: a non-empty task name is required." });
          }
          if (item.category !== undefined && !(EXECUTION_TASK_CATEGORIES as readonly unknown[]).includes(item.category)) {
            issues.push({ field: `${path}.category`, message: "Invalid Plan: a task category is not supported." });
          }
          if (item.metadata !== undefined && !isFlatExecutionMetadata(item.metadata)) {
            issues.push({ field: `${path}.metadata`, message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." });
          }
        });
      }
    }
    return issues;
  }

  function validatePlan(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "plan", message: "Invalid Plan: a plan record is required." }];
    const issues: ExecutionIssue[] = [];
    if (typeof input.id !== "string" || !PLAN_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Plan: a well-formed plan id is required." });
    }
    if (input.decisionAnalysisId !== null && (typeof input.decisionAnalysisId !== "string" || input.decisionAnalysisId.trim() === "")) {
      issues.push({ field: "decisionAnalysisId", message: "Invalid Plan: decisionAnalysisId must be a non-empty id or null." });
    }
    if (input.workflowSnapshotId !== null && (typeof input.workflowSnapshotId !== "string" || input.workflowSnapshotId.trim() === "")) {
      issues.push({ field: "workflowSnapshotId", message: "Invalid Plan: workflowSnapshotId must be a non-empty id or null." });
    }
    if (!Array.isArray(input.tasks)) issues.push({ field: "tasks", message: "Invalid Plan: tasks must be a list." });
    if (!Array.isArray(input.dependencies)) issues.push({ field: "dependencies", message: "Invalid Plan: dependencies must be a list." });
    issues.push(...validateMetadata(input.metadata));
    issues.push(...validateGateList(input.preconditions, "preconditions"));
    issues.push(...validateGateList(input.postconditions, "postconditions"));
    if (typeof input.executionTime !== "number" || !Number.isFinite(input.executionTime) || input.executionTime < 0) {
      issues.push({ field: "executionTime", message: "Invalid Plan: executionTime must be a finite number of 0 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Plan: createdAt must be an ISO-8601 instant in UTC." });
    }
    if (Array.isArray(input.tasks) && Array.isArray(input.dependencies)) {
      const ids = input.tasks.map((item) => (isPlainRecord(item) && typeof item.id === "string" ? item.id : ""));
      issues.push(...validateGraph(ids, input.dependencies as ExecutionDependency[]));
    }
    if (Array.isArray(input.stages)) {
      input.stages.forEach((item, index) => {
        if (!isPlainRecord(item) || !(EXECUTION_TASK_CATEGORIES as readonly unknown[]).includes(item.category) || !Array.isArray(item.taskIds)) {
          issues.push({ field: `stages[${index}]`, message: "Invalid Plan: a stage must name a supported category and a list of task ids." });
        }
      });
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Plan: a snapshot record is required." }];
    const issues: ExecutionIssue[] = [];
    if (typeof input.planId !== "string" || !PLAN_ID.test(input.planId)) {
      issues.push({ field: "planId", message: "Invalid Plan: a well-formed plan id is required." });
    }
    if (input.workflowId !== null && (typeof input.workflowId !== "string" || input.workflowId.trim() === "")) {
      issues.push({ field: "workflowId", message: "Invalid Plan: workflowId must be a non-empty id or null." });
    }
    if (input.decisionId !== null && (typeof input.decisionId !== "string" || input.decisionId.trim() === "")) {
      issues.push({ field: "decisionId", message: "Invalid Plan: decisionId must be a non-empty id or null." });
    }
    if (!Array.isArray(input.orderedTasks) || input.orderedTasks.some((id) => typeof id !== "string")) {
      issues.push({ field: "orderedTasks", message: "Invalid Plan: orderedTasks must be a list of task ids." });
    }
    if (!Array.isArray(input.dependencies)) issues.push({ field: "dependencies", message: "Invalid Plan: dependencies must be a list." });
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Plan: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (Array.isArray(input.orderedTasks) && Array.isArray(input.dependencies) && input.orderedTasks.every((id) => typeof id === "string")) {
      issues.push(...validateGraph(input.orderedTasks as string[], input.dependencies as ExecutionDependency[]));
    }
    return issues;
  }

  return {
    validateInput,
    validatePlan,
    validateSnapshot,
    validateMetadata,
    validateGraph,
    validatePreconditions: (input) => validateGateList(input, "preconditions"),
    validatePostconditions: (input) => validateGateList(input, "postconditions"),
    validateResults,
  };
}
