/**
 * Execution Dependency Resolver: eligibility resolution.
 *
 * Decides whether each planned task is READY, BLOCKED, or WAITING from typed
 * dependencies. It never runs a task, never calls an outside system, and
 * never changes a workflow stage. A refused input returns REJECTED with
 * issues and no graph.
 *
 * Not the Execution Plan Resolver (execution-plan-resolver.ts), which only
 * orders a plan. This module only resolves eligibility.
 */
import type { ExecutionPlan } from "./execution-plan";
import type { ExecutionDependency, ExecutionMetadata, ExecutionTask } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";
import {
  createExecutionDependencyGraph,
  freezeDeepExecutionDependency,
  type ExecutionDependencyGraph,
  type ExecutionTaskEligibility,
  type ExecutionTypedDependency,
} from "./execution-dependency-graph";
import { createExecutionDependencyRegistry, type ExecutionDependencyRegistry } from "./execution-dependency-registry";
import {
  copyIdHolder,
  createExecutionDependencySnapshot,
  type ExecutionDependencySnapshot,
} from "./execution-dependency-snapshot";
import { createExecutionDependencyValidator, type ExecutionDependencyValidator } from "./execution-dependency-validator";

export const EXECUTION_DEPENDENCY_RESOLVE_STATUSES = ["OK", "REJECTED"] as const;
export type ExecutionDependencyResolveStatus = (typeof EXECUTION_DEPENDENCY_RESOLVE_STATUSES)[number];

export type ExecutionDependencyClock = () => number;
export type ExecutionDependencyTimestamp = () => string;
export type ExecutionDependencyIdFactory = () => string;

export interface ExecutionDependencyResolverInput {
  plan?: Pick<ExecutionPlan, "id" | "tasks" | "dependencies"> | null;
  tasks?: readonly ExecutionTask[];
  dependencies?: readonly ExecutionTypedDependency[];
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  executionMetadata?: ExecutionMetadata;
  runtimeMetadata?: ExecutionMetadata;
  configuration?: ExecutionMetadata;
}

export interface ExecutionDependencyResolveResult {
  status: ExecutionDependencyResolveStatus;
  issues: ExecutionIssue[];
  graph: ExecutionDependencyGraph | null;
  ready: readonly string[];
  blocked: readonly string[];
  waiting: readonly string[];
  metadata: ExecutionMetadata;
  executionTime: number;
  snapshot: ExecutionDependencySnapshot | null;
}

export interface ExecutionDependencyResolver {
  readonly validator: ExecutionDependencyValidator;
  readonly registry: ExecutionDependencyRegistry;
  validate(input: unknown): ExecutionIssue[];
  resolve(input: unknown): ExecutionDependencyResolveResult;
  getSnapshot(graphId: string): ExecutionDependencySnapshot | null;
}

export interface ExecutionDependencyResolverOptions {
  validator?: ExecutionDependencyValidator;
  registry?: ExecutionDependencyRegistry;
  now?: ExecutionDependencyClock;
  timestamp?: ExecutionDependencyTimestamp;
  idFactory?: ExecutionDependencyIdFactory;
}

const defaultClock: ExecutionDependencyClock = () => performance.now();

function refused(issues: ExecutionIssue[], executionTime = 0): ExecutionDependencyResolveResult {
  return {
    status: "REJECTED",
    issues,
    graph: null,
    ready: [],
    blocked: [],
    waiting: [],
    metadata: {},
    executionTime,
    snapshot: null,
  };
}

function tasksOf(input: ExecutionDependencyResolverInput): ExecutionTask[] {
  if (input.tasks) return [...input.tasks];
  if (input.plan?.tasks) return [...input.plan.tasks];
  return [];
}

function untypedToRequired(list: readonly ExecutionDependency[]): ExecutionTypedDependency[] {
  return list.map((item) => ({
    id: `req-${item.from}-to-${item.to}`,
    from: item.from,
    to: item.to,
    kind: "REQUIRED" as const,
    metadata: {},
  }));
}

function mergedEdges(input: ExecutionDependencyResolverInput, registry: ExecutionDependencyRegistry): ExecutionTypedDependency[] {
  const fromPlan = untypedToRequired(input.plan?.dependencies ?? []);
  const typed = input.dependencies ? [...input.dependencies] : registry.list();
  return [...fromPlan, ...typed];
}

function sequencingOrder(nodes: readonly string[], edges: readonly ExecutionTypedDependency[]): string[] {
  const indexOf = new Map(nodes.map((id, index) => [id, index]));
  const waiting = new Map(nodes.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(nodes.map((id) => [id, []]));
  for (const edge of edges) {
    if (edge.kind !== "REQUIRED" && edge.kind !== "OPTIONAL") continue;
    if (!waiting.has(edge.from) || !waiting.has(edge.to)) continue;
    outgoing.get(edge.from)!.push(edge.to);
    waiting.set(edge.to, (waiting.get(edge.to) ?? 0) + 1);
  }
  const order: string[] = [];
  const remaining = new Map(waiting);
  while (remaining.size > 0) {
    const free = [...remaining.entries()].filter(([, count]) => count === 0).map(([id]) => id);
    free.sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0) || a.localeCompare(b));
    const next = free[0];
    if (next === undefined) break;
    order.push(next);
    remaining.delete(next);
    for (const target of outgoing.get(next) ?? []) {
      if (remaining.has(target)) remaining.set(target, (remaining.get(target) ?? 1) - 1);
    }
  }
  return order;
}

function classify(
  id: string,
  nodes: readonly string[],
  edges: readonly ExecutionTypedDependency[],
  eligibility: Map<string, ExecutionTaskEligibility>,
): ExecutionTaskEligibility {
  const indexOf = new Map(nodes.map((item, index) => [item, index]));
  const incoming = edges.filter((edge) => edge.to === id);
  if (incoming.some((edge) => edge.kind === "BLOCKING" && nodes.includes(edge.from))) return "BLOCKED";
  const required = incoming.filter((edge) => edge.kind === "REQUIRED" && nodes.includes(edge.from));
  if (required.some((edge) => eligibility.get(edge.from) !== "READY")) return "WAITING";
  const optional = incoming.filter((edge) => edge.kind === "OPTIONAL" && nodes.includes(edge.from));
  if (optional.some((edge) => eligibility.get(edge.from) !== "READY")) return "WAITING";
  const others = edges
    .filter((edge) => edge.kind === "CONFLICTING" && (edge.from === id || edge.to === id))
    .map((edge) => (edge.from === id ? edge.to : edge.from))
    .filter((other) => other !== id && nodes.includes(other));
  const loses = others.some((other) => {
    const status = eligibility.get(other);
    if (status === "BLOCKED" || status === "WAITING") return false;
    return (indexOf.get(other) ?? 0) < (indexOf.get(id) ?? 0);
  });
  if (loses) return "BLOCKED";
  return "READY";
}

function resolveEligibility(nodes: readonly string[], edges: readonly ExecutionTypedDependency[]): {
  ready: string[];
  blocked: string[];
  waiting: string[];
} {
  const eligibility = new Map<string, ExecutionTaskEligibility>();
  const walk = sequencingOrder(nodes, edges);
  const sequence = walk.length === nodes.length ? walk : [...nodes];
  for (let pass = 0; pass <= nodes.length; pass += 1) {
    let changed = false;
    for (const id of sequence) {
      const next = classify(id, nodes, edges, eligibility);
      if (eligibility.get(id) !== next) {
        eligibility.set(id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const ready: string[] = [];
  const blocked: string[] = [];
  const waiting: string[] = [];
  for (const id of nodes) {
    const status = eligibility.get(id) ?? "READY";
    if (status === "BLOCKED") blocked.push(id);
    else if (status === "WAITING") waiting.push(id);
    else ready.push(id);
  }
  return { ready, blocked, waiting };
}

export function createExecutionDependencyResolver(options: ExecutionDependencyResolverOptions = {}): ExecutionDependencyResolver {
  const validator = options.validator ?? createExecutionDependencyValidator();
  const registry = options.registry ?? createExecutionDependencyRegistry();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `graph-${++serial}`);
  const snapshots = new Map<string, ExecutionDependencySnapshot>();

  const extraIssues = (input: ExecutionDependencyResolverInput): ExecutionIssue[] => {
    const tasks = tasksOf(input);
    const nodes = tasks.map((item) => item.id);
    return validator.validateGraph(nodes, mergedEdges(input, registry));
  };

  return {
    validator,
    registry,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as ExecutionDependencyResolverInput)];
    },
    resolve(input) {
      const started = now();
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues, Math.max(0, now() - started));
        const draft = input as ExecutionDependencyResolverInput;
        const graphIssues = extraIssues(draft);
        if (graphIssues.length > 0) return refused(graphIssues, Math.max(0, now() - started));

        const tasks = tasksOf(draft);
        const nodes = tasks.map((item) => item.id);
        const edges = mergedEdges(draft, registry);
        const graph = createExecutionDependencyGraph(nodes, edges);
        const { ready, blocked, waiting } = resolveEligibility(nodes, graph.edges);
        const metadata = freezeDeepExecutionDependency({ ...(draft.executionMetadata ?? {}) });
        const createdAt = timestamp();
        const graphId = idFactory();
        const snapshot = createExecutionDependencySnapshot({
          graphId,
          planId: draft.plan && typeof draft.plan.id === "string" ? draft.plan.id : null,
          workflowId: copyIdHolder(draft.workflowSnapshot)?.id ?? null,
          decisionId: copyIdHolder(draft.decisionAnalysis)?.id ?? null,
          ready,
          blocked,
          waiting,
          graph,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, Math.max(0, now() - started));
        snapshots.set(graphId, snapshot);
        const executionTime = Math.max(0, now() - started);
        return freezeDeepExecutionDependency({
          status: "OK" as const,
          issues: [],
          graph,
          ready,
          blocked,
          waiting,
          metadata,
          executionTime,
          snapshot,
        });
      } catch (error) {
        return refused(
          [{ field: "graph", message: error instanceof Error ? error.message : "Invalid Graph: the resolver could not resolve dependencies." }],
          Math.max(0, now() - started),
        );
      }
    },
    getSnapshot: (graphId) => snapshots.get(graphId) ?? null,
  };
}
