/**
 * Execution Dependency Resolver: validator.
 *
 * Pure rules for typed dependencies, the graph, resolver input, and
 * snapshots. It rejects circular dependencies, missing dependencies,
 * duplicate dependencies, an invalid graph, and invalid metadata. It only
 * reports problems: it never resolves, stores, or changes what it is given.
 */
import {
  EXECUTION_DEPENDENCY_KINDS,
  dependencyKeyOf,
  type ExecutionDependencyKind,
  type ExecutionTypedDependency,
} from "./execution-dependency-graph";
import { isFlatExecutionMetadata } from "./execution-task-validator";
import type { ExecutionIssue } from "./execution-validator";

const TASK_ID = /^[a-z][a-z0-9-]*$/;
const DEP_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "plan",
  "tasks",
  "dependencies",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
const CONTEXT_RECORDS = ["decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const SEQUENCING_KINDS: readonly ExecutionDependencyKind[] = ["REQUIRED", "OPTIONAL"];

export interface ExecutionDependencyValidator {
  validateDependency(input: unknown): ExecutionIssue[];
  validateGraph(nodes: readonly string[], edges: readonly unknown[]): ExecutionIssue[];
  validateInput(input: unknown): ExecutionIssue[];
  validateSnapshot(input: unknown): ExecutionIssue[];
  validateMetadata(input: unknown): ExecutionIssue[];
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

export function createExecutionDependencyValidator(): ExecutionDependencyValidator {
  function validateMetadata(input: unknown): ExecutionIssue[] {
    if (input === undefined) return [];
    if (!isFlatExecutionMetadata(input)) {
      return [{ field: "metadata", message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateDependency(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "dependency", message: "Invalid Graph: a typed dependency must be an object." }];
    const issues: ExecutionIssue[] = [];
    if (typeof input.id !== "string" || !DEP_ID.test(input.id)) {
      issues.push({ field: "id", message: "Invalid Graph: a well-formed dependency id is required." });
    }
    if (typeof input.from !== "string" || !TASK_ID.test(input.from)) {
      issues.push({ field: "from", message: "Invalid Graph: a well-formed from task id is required." });
    }
    if (typeof input.to !== "string" || !TASK_ID.test(input.to)) {
      issues.push({ field: "to", message: "Invalid Graph: a well-formed to task id is required." });
    }
    if (!(EXECUTION_DEPENDENCY_KINDS as readonly unknown[]).includes(input.kind)) {
      issues.push({ field: "kind", message: "Invalid Graph: a dependency kind is not supported." });
    }
    if (typeof input.from === "string" && input.from === input.to) {
      issues.push({ field: "to", message: "Invalid Graph: a task cannot wait on itself." });
    }
    issues.push(...validateMetadata(input.metadata === undefined ? {} : input.metadata).map((issue) => ({ ...issue, field: "metadata" })));
    return issues;
  }

  function validateGraph(nodes: readonly string[], edges: readonly unknown[]): ExecutionIssue[] {
    const issues: ExecutionIssue[] = [];
    const seenNodes = new Set<string>();
    for (const id of nodes) {
      if (typeof id !== "string" || !TASK_ID.test(id)) {
        issues.push({ field: "nodes", message: "Invalid Graph: every node must be a well-formed task id." });
        continue;
      }
      if (seenNodes.has(id)) issues.push({ field: "nodes", message: `Duplicate Task: "${id}" is already listed.` });
      seenNodes.add(id);
    }
    const ids = new Set(nodes.filter((id) => typeof id === "string"));
    const pairSeen = new Set<string>();
    const idSeen = new Set<string>();
    const sequencing = new Map<string, string[]>([...ids].map((id) => [id, []]));

    edges.forEach((raw, index) => {
      const path = `edges[${index}]`;
      const edgeIssues = validateDependency(raw);
      for (const issue of edgeIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
      if (!isPlainRecord(raw) || typeof raw.from !== "string" || typeof raw.to !== "string" || typeof raw.kind !== "string") return;
      const kind = raw.kind as ExecutionDependencyKind;
      if (typeof raw.id === "string") {
        if (idSeen.has(raw.id)) issues.push({ field: `${path}.id`, message: `Duplicate Dependency: "${raw.id}" is already listed.` });
        idSeen.add(raw.id);
      }
      const pair = dependencyKeyOf(raw.from, raw.to, kind);
      if (pairSeen.has(pair)) {
        issues.push({ field: path, message: `Duplicate Dependency: "${raw.from}" to "${raw.to}" as ${kind} is already listed.` });
      }
      pairSeen.add(pair);

      const fromMissing = !ids.has(raw.from);
      const toMissing = !ids.has(raw.to);
      if (kind === "OPTIONAL") {
        if (toMissing) issues.push({ field: `${path}.to`, message: `Missing Dependency: "${raw.to}" names no listed task.` });
      } else if (fromMissing || toMissing) {
        issues.push({ field: path, message: `Missing Dependency: "${raw.from}" or "${raw.to}" names no listed task.` });
      }
      if ((SEQUENCING_KINDS as readonly string[]).includes(kind) && ids.has(raw.from) && ids.has(raw.to)) {
        sequencing.get(raw.from)!.push(raw.to);
      }
    });

    for (const cycle of findCycles(sequencing)) {
      issues.push({ field: "dependencies", message: `Circular dependency: ${[...cycle].reverse().join(" -> ")}.` });
    }
    return issues;
  }

  function validateInput(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "graph", message: "Invalid Graph: an object of tasks and dependencies is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Graph: unexpected member "${key}".` });
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `Invalid Graph: "${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `Invalid Graph: "${key}" must carry a non-empty id.` });
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
      if (!isPlainRecord(plan)) issues.push({ field: "plan", message: "Invalid Graph: a plan must be an object." });
      else if (!Array.isArray(plan.tasks)) issues.push({ field: "plan.tasks", message: "Invalid Graph: plan tasks must be a list." });
    }
    if (input.tasks !== undefined && !Array.isArray(input.tasks)) {
      issues.push({ field: "tasks", message: "Invalid Graph: tasks must be a list." });
    }
    if (input.dependencies !== undefined && !Array.isArray(input.dependencies)) {
      issues.push({ field: "dependencies", message: "Invalid Graph: dependencies must be a list." });
    }
    const taskSource = Array.isArray(input.tasks)
      ? input.tasks
      : isPlainRecord(plan) && Array.isArray(plan.tasks)
        ? plan.tasks
        : null;
    if (taskSource === null) {
      issues.push({ field: "tasks", message: "Invalid Graph: tasks are required." });
    } else {
      const nodes: string[] = [];
      taskSource.forEach((item, index) => {
        if (!isPlainRecord(item) || typeof item.id !== "string") {
          issues.push({ field: `tasks[${index}].id`, message: "Invalid Graph: a well-formed task id is required." });
        } else {
          nodes.push(item.id);
        }
      });
      const typed = Array.isArray(input.dependencies) ? input.dependencies : [];
      issues.push(...validateGraph(nodes, typed));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Graph: a snapshot record is required." }];
    const issues: ExecutionIssue[] = [];
    if (typeof input.graphId !== "string" || !DEP_ID.test(input.graphId)) {
      issues.push({ field: "graphId", message: "Invalid Graph: a well-formed graph id is required." });
    }
    if (input.planId !== null && (typeof input.planId !== "string" || input.planId.trim() === "")) {
      issues.push({ field: "planId", message: "Invalid Graph: planId must be a non-empty id or null." });
    }
    if (input.workflowId !== null && (typeof input.workflowId !== "string" || input.workflowId.trim() === "")) {
      issues.push({ field: "workflowId", message: "Invalid Graph: workflowId must be a non-empty id or null." });
    }
    if (input.decisionId !== null && (typeof input.decisionId !== "string" || input.decisionId.trim() === "")) {
      issues.push({ field: "decisionId", message: "Invalid Graph: decisionId must be a non-empty id or null." });
    }
    for (const list of ["ready", "blocked", "waiting"] as const) {
      if (!Array.isArray(input[list]) || input[list].some((id) => typeof id !== "string")) {
        issues.push({ field: list, message: `Invalid Graph: ${list} must be a list of task ids.` });
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Graph: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    if (isPlainRecord(input.graph) && Array.isArray(input.graph.nodes) && Array.isArray(input.graph.edges)) {
      issues.push(...validateGraph(input.graph.nodes as string[], input.graph.edges));
    } else {
      issues.push({ field: "graph", message: "Invalid Graph: a snapshot must carry nodes and edges." });
    }
    return issues;
  }

  return { validateDependency, validateGraph, validateInput, validateSnapshot, validateMetadata };
}
