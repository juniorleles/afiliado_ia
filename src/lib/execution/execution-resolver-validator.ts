/**
 * Execution Resolver: validator.
 *
 * Pure rules for resolver input, the task graph, snapshots, and metadata. It
 * rejects a missing task, a missing contract, a missing host, a circular
 * wait, a duplicate task, and invalid metadata. It only reports problems: it
 * never resolves, invokes a host, or changes what it is given.
 */
import { EXECUTION_GRAPH_KEYS, EXECUTION_RESOLVER_SNAPSHOT_KEYS, RESOLVED_EXECUTION_PLAN_KEYS } from "./execution-resolver-plan";
import { isFlatExecutionMetadata } from "./execution-task-validator";
import type { ExecutionDependency } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";

const TASK_ID = /^[a-z][a-z0-9-]*$/;
const TOKEN = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "plan",
  "tasks",
  "contracts",
  "dependencies",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
const CONTEXT_RECORDS = ["decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface ExecutionResolverValidator {
  validateInput(input: unknown): ExecutionIssue[];
  validateGraph(taskIds: readonly string[], dependencies: readonly ExecutionDependency[]): ExecutionIssue[];
  validateSnapshot(input: unknown): ExecutionIssue[];
  validateMetadata(input: unknown): ExecutionIssue[];
  validatePlan(input: unknown): ExecutionIssue[];
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

export function createExecutionResolverValidator(): ExecutionResolverValidator {
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
      if (typeof id !== "string" || !TASK_ID.test(id)) {
        issues.push({ field: "tasks", message: "Missing Task: every task must carry a well-formed id." });
        continue;
      }
      if (seen.has(id)) issues.push({ field: "tasks", message: `Duplicate Task: "${id}" is already listed.` });
      seen.add(id);
    }
    const ids = new Set(taskIds.filter((id) => typeof id === "string"));
    const pairSeen = new Set<string>();
    const edges = new Map<string, string[]>([...ids].map((id) => [id, []]));
    for (const item of dependencies) {
      if (!item || typeof item.from !== "string" || typeof item.to !== "string") {
        issues.push({ field: "dependencies", message: "Missing Task: every wait must name a from task and a to task." });
        continue;
      }
      const pair = `${item.from}->${item.to}`;
      if (pairSeen.has(pair)) continue;
      pairSeen.add(pair);
      if (!ids.has(item.from)) issues.push({ field: "dependencies", message: `Missing Task: "${item.from}" is not listed.` });
      if (!ids.has(item.to)) issues.push({ field: "dependencies", message: `Missing Task: "${item.to}" is not listed.` });
      if (ids.has(item.from) && ids.has(item.to)) edges.get(item.from)!.push(item.to);
    }
    for (const cycle of findCycles(edges)) {
      issues.push({ field: "dependencies", message: `Circular Dependency: ${[...cycle].reverse().join(" -> ")}.` });
    }
    return issues;
  }

  function validateInput(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "plan", message: "an object of plan, tasks, and metadata is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `unexpected member "${key}".` });
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `"${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `"${key}" must carry a non-empty id.` });
    }
    for (const key of CONTEXT_METADATA) {
      const value = input[key];
      if (value === undefined) continue;
      if (!isFlatExecutionMetadata(value)) {
        issues.push({ field: key, message: `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.` });
      }
    }
    const plan = input.plan;
    if (plan !== undefined && plan !== null) {
      if (!isPlainRecord(plan)) issues.push({ field: "plan", message: "a plan must be an object." });
      else if (idOf(plan) === null) issues.push({ field: "plan.id", message: "a plan must carry a non-empty id." });
    }
    if (input.tasks !== undefined && !Array.isArray(input.tasks)) {
      issues.push({ field: "tasks", message: "tasks must be a list." });
    }
    if (input.contracts !== undefined && !Array.isArray(input.contracts)) {
      issues.push({ field: "contracts", message: "contracts must be a list." });
    }
    if (input.dependencies !== undefined && !Array.isArray(input.dependencies)) {
      issues.push({ field: "dependencies", message: "dependencies must be a list." });
    }
    const taskSource = Array.isArray(input.tasks)
      ? input.tasks
      : isPlainRecord(plan) && Array.isArray(plan.tasks)
        ? plan.tasks
        : null;
    if (taskSource === null) {
      issues.push({ field: "tasks", message: "Missing Task: tasks are required." });
    } else if (taskSource.length === 0) {
      issues.push({ field: "tasks", message: "Missing Task: tasks are required." });
    } else {
      const nodes: string[] = [];
      taskSource.forEach((item, index) => {
        if (!isPlainRecord(item) || typeof item.id !== "string") {
          issues.push({ field: `tasks[${index}].id`, message: "Missing Task: a well-formed task id is required." });
        } else {
          nodes.push(item.id);
        }
      });
      const deps = Array.isArray(input.dependencies)
        ? (input.dependencies as ExecutionDependency[])
        : isPlainRecord(plan) && Array.isArray(plan.dependencies)
          ? (plan.dependencies as ExecutionDependency[])
          : [];
      issues.push(...validateGraph(nodes, deps));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "a snapshot record is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of EXECUTION_RESOLVER_SNAPSHOT_KEYS) {
      if (!(key in input)) issues.push({ field: key, message: `member "${key}" is missing.` });
    }
    if (typeof input.snapshotId !== "string" || !TOKEN.test(input.snapshotId)) {
      issues.push({ field: "snapshotId", message: "a well-formed snapshot id is required." });
    }
    if (input.planId !== null && (typeof input.planId !== "string" || input.planId.trim() === "")) {
      issues.push({ field: "planId", message: "planId must be a non-empty id or null." });
    }
    if (input.workflowId !== null && (typeof input.workflowId !== "string" || input.workflowId.trim() === "")) {
      issues.push({ field: "workflowId", message: "workflowId must be a non-empty id or null." });
    }
    if (input.decisionId !== null && (typeof input.decisionId !== "string" || input.decisionId.trim() === "")) {
      issues.push({ field: "decisionId", message: "decisionId must be a non-empty id or null." });
    }
    for (const list of ["orderedTasks", "contractIds", "providerIds"] as const) {
      if (!Array.isArray(input[list]) || input[list].some((id) => typeof id !== "string")) {
        issues.push({ field: list, message: `${list} must be a list of ids.` });
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  function validatePlan(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "plan", message: "a resolved plan is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of RESOLVED_EXECUTION_PLAN_KEYS) {
      if (!(key in input)) issues.push({ field: key, message: `member "${key}" is missing.` });
    }
    if (typeof input.id !== "string" || input.id.trim() === "") {
      issues.push({ field: "id", message: "a plan must carry a non-empty id." });
    }
    if (!Array.isArray(input.tasks)) issues.push({ field: "tasks", message: "Missing Task: tasks must be a list." });
    else if (input.tasks.length === 0) issues.push({ field: "tasks", message: "Missing Task: tasks are required." });
    if (!Array.isArray(input.contracts) || input.contracts.length === 0) {
      issues.push({ field: "contracts", message: "Missing Contract: no eligible contract is available." });
    }
    if (!Array.isArray(input.providers) || input.providers.length === 0) {
      issues.push({ field: "providers", message: "Missing Provider: no enabled host supports the resolved contracts." });
    }
    if (!isPlainRecord(input.graph)) {
      issues.push({ field: "graph", message: "an execution graph is required." });
    } else {
      for (const key of EXECUTION_GRAPH_KEYS) {
        if (!(key in input.graph)) issues.push({ field: `graph.${key}`, message: `member "${key}" is missing.` });
      }
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateInput, validateGraph, validateSnapshot, validateMetadata, validatePlan };
}
