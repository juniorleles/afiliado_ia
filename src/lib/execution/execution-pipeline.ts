/**
 * Execution Resolver: prepare pipeline.
 *
 * Loads id holders, resolves tasks, waits, contracts, and hosts, validates
 * the plan, then freezes the graph. Each prepare step runs at most once per
 * resolve. The pipeline never invokes a host, never runs a task, and never
 * reaches an outside system.
 */
import type { ExecutionPlan } from "./execution-plan";
import type { ExecutionContract } from "./execution-contract";
import { createExecutionContractResolver, type ExecutionContractResolver } from "./execution-contract-resolver";
import { createExecutionDependencyResolver, type ExecutionDependencyResolver } from "./execution-dependency-resolver";
import { createExecutionProviderResolver, type ExecutionProviderResolver } from "./execution-provider-resolver";
import type { ExecutionDependency, ExecutionMetadata, ExecutionTask } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";
import {
  copyExecutionTask,
  copyIdHolder,
  createExecutionGraph,
  createExecutionResolverSnapshot,
  createResolvedExecutionPlan,
  freezeDeepExecutionResolver,
  type ExecutionGraph,
  type ExecutionResolverSnapshot,
  type ExecutionResolverStatistics,
  type ResolvedExecutionPlan,
} from "./execution-resolver-plan";
import type { ExecutionProviderRecord } from "./execution-provider";
import {
  createExecutionRecorder,
  type ExecutionPipelineStep,
  type ExecutionRecorder,
} from "./execution-resolver-recorder";
import { createExecutionResolverValidator, type ExecutionResolverValidator } from "./execution-resolver-validator";

export const EXECUTION_RESOLVE_STATUSES = ["OK", "REJECTED"] as const;
export type ExecutionResolveStatus = (typeof EXECUTION_RESOLVE_STATUSES)[number];

export type ExecutionResolverClock = () => number;
export type ExecutionResolverTimestamp = () => string;
export type ExecutionResolverIdFactory = () => string;

export interface ExecutionResolverInput {
  plan?: Pick<ExecutionPlan, "id" | "tasks" | "dependencies" | "decisionAnalysisId" | "workflowSnapshotId" | "metadata" | "createdAt" | "executionTime"> | null;
  tasks?: readonly ExecutionTask[];
  contracts?: readonly ExecutionContract[];
  dependencies?: ExecutionPlan["dependencies"];
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  executionMetadata?: ExecutionMetadata;
  runtimeMetadata?: ExecutionMetadata;
  configuration?: ExecutionMetadata;
}

export interface ExecutionResolveResult {
  status: ExecutionResolveStatus;
  issues: ExecutionIssue[];
  graph: ExecutionGraph | null;
  plan: ResolvedExecutionPlan | null;
  orderedTasks: readonly string[];
  contracts: readonly ExecutionContract[];
  providers: readonly ExecutionProviderRecord[];
  metadata: ExecutionMetadata;
  statistics: ExecutionResolverStatistics | null;
  snapshot: ExecutionResolverSnapshot | null;
  executionTime: number;
}

export interface ExecutionPipeline {
  readonly recorder: ExecutionRecorder;
  readonly validator: ExecutionResolverValidator;
  readonly dependencyResolver: ExecutionDependencyResolver;
  readonly contractResolver: ExecutionContractResolver;
  readonly providerResolver: ExecutionProviderResolver;
  run(input: unknown): ExecutionResolveResult;
}

export interface ExecutionPipelineOptions {
  recorder?: ExecutionRecorder;
  validator?: ExecutionResolverValidator;
  dependencyResolver?: ExecutionDependencyResolver;
  contractResolver?: ExecutionContractResolver;
  providerResolver?: ExecutionProviderResolver;
  now?: ExecutionResolverClock;
  timestamp?: ExecutionResolverTimestamp;
  idFactory?: ExecutionResolverIdFactory;
}

const defaultClock: ExecutionResolverClock = () => performance.now();

function refused(issues: ExecutionIssue[], executionTime = 0): ExecutionResolveResult {
  return {
    status: "REJECTED",
    issues,
    graph: null,
    plan: null,
    orderedTasks: [],
    contracts: [],
    providers: [],
    metadata: {},
    statistics: null,
    snapshot: null,
    executionTime,
  };
}

function tasksOf(input: ExecutionResolverInput): ExecutionTask[] {
  if (input.tasks) return [...input.tasks];
  if (input.plan?.tasks) return [...input.plan.tasks];
  return [];
}

function dependenciesOf(input: ExecutionResolverInput): ExecutionDependency[] {
  if (input.dependencies) return [...input.dependencies];
  if (input.plan?.dependencies) return [...input.plan.dependencies];
  return [];
}

function orderTasks(taskIds: readonly string[], dependencies: readonly ExecutionDependency[]): string[] {
  const indexOf = new Map(taskIds.map((id, index) => [id, index]));
  const waiting = new Map(taskIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(taskIds.map((id) => [id, []]));
  for (const item of dependencies) {
    if (!waiting.has(item.from) || !waiting.has(item.to)) continue;
    outgoing.get(item.from)!.push(item.to);
    waiting.set(item.to, (waiting.get(item.to) ?? 0) + 1);
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

export function createExecutionPipeline(options: ExecutionPipelineOptions = {}): ExecutionPipeline {
  const recorder = options.recorder ?? createExecutionRecorder();
  const validator = options.validator ?? createExecutionResolverValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `graph-${++serial}`);
  const dependencyResolver = options.dependencyResolver ?? createExecutionDependencyResolver({ now, timestamp });
  const contractResolver = options.contractResolver ?? createExecutionContractResolver({ now, timestamp });
  const providerResolver = options.providerResolver ?? createExecutionProviderResolver({ now, timestamp });

  const mark = (step: ExecutionPipelineStep) => recorder.record(step);

  return {
    recorder,
    validator,
    dependencyResolver,
    contractResolver,
    providerResolver,
    run(input) {
      const started = now();
      recorder.reset();
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues, Math.max(0, now() - started));
        const draft = input as ExecutionResolverInput;

        mark("LOAD_WORKFLOW_SNAPSHOT");
        const workflow =
          copyIdHolder(draft.workflowSnapshot) ??
          (draft.plan && typeof draft.plan.workflowSnapshotId === "string" ? { id: draft.plan.workflowSnapshotId } : null);

        mark("LOAD_DECISION_ANALYSIS");
        const decision =
          copyIdHolder(draft.decisionAnalysis) ??
          (draft.plan && typeof draft.plan.decisionAnalysisId === "string" ? { id: draft.plan.decisionAnalysisId } : null);

        mark("RESOLVE_TASKS");
        const tasks = tasksOf(draft).map(copyExecutionTask);
        const dependencies = dependenciesOf(draft);
        const taskIds = tasks.map((item) => item.id);
        const taskIssues = validator.validateGraph(taskIds, dependencies);
        if (taskIssues.length > 0) return refused(taskIssues, Math.max(0, now() - started));
        const orderedIds = orderTasks(taskIds, dependencies);
        if (orderedIds.length !== taskIds.length) {
          return refused([{ field: "dependencies", message: "Circular Dependency: the task graph could not be ordered." }], Math.max(0, now() - started));
        }
        const orderedTasks = orderedIds.map((id) => tasks.find((item) => item.id === id)!);

        mark("RESOLVE_DEPENDENCIES");
        const planForDeps = {
          id: draft.plan && typeof draft.plan.id === "string" ? draft.plan.id : "plan",
          tasks: orderedTasks,
          dependencies,
        };
        const deps = dependencyResolver.resolve({
          plan: planForDeps,
          tasks: orderedTasks,
          decisionAnalysis: decision,
          workflowSnapshot: workflow,
          executionMetadata: draft.executionMetadata,
          runtimeMetadata: draft.runtimeMetadata,
          configuration: draft.configuration,
        });
        if (deps.status !== "OK" || deps.graph === null) {
          return refused(deps.issues.length > 0 ? deps.issues : [{ field: "dependencies", message: "Circular Dependency: waits could not be resolved." }], Math.max(0, now() - started));
        }

        mark("RESOLVE_CONTRACTS");
        const contracts = contractResolver.resolve({
          plan: planForDeps,
          tasks: orderedTasks,
          contracts: draft.contracts,
          decisionAnalysis: decision,
          workflowSnapshot: workflow,
          executionMetadata: draft.executionMetadata,
          runtimeMetadata: draft.runtimeMetadata,
          configuration: draft.configuration,
        });
        if (contracts.status !== "OK") {
          return refused(contracts.issues.length > 0 ? contracts.issues : [{ field: "contracts", message: "Missing Contract: no eligible contract is available." }], Math.max(0, now() - started));
        }
        if (contracts.contracts.length === 0) {
          return refused([{ field: "contracts", message: "Missing Contract: no eligible contract is available." }], Math.max(0, now() - started));
        }

        mark("RESOLVE_PROVIDERS");
        const providers = providerResolver.resolve({
          plan: { id: planForDeps.id },
          contracts: contracts.contracts,
          executionMetadata: draft.executionMetadata,
          runtimeMetadata: draft.runtimeMetadata,
          configuration: draft.configuration,
        });
        if (providers.status !== "OK") {
          return refused(providers.issues.length > 0 ? providers.issues : [{ field: "providers", message: "Missing Provider: no enabled host supports the resolved contracts." }], Math.max(0, now() - started));
        }
        if (providers.providers.length === 0) {
          return refused([{ field: "providers", message: "Missing Provider: no enabled host supports the resolved contracts." }], Math.max(0, now() - started));
        }

        mark("VALIDATE_PLAN");
        const metadata = freezeDeepExecutionResolver({ ...(draft.executionMetadata ?? draft.plan?.metadata ?? {}) });
        const createdAt = timestamp();
        const snapshotId = idFactory();
        const planId = draft.plan && typeof draft.plan.id === "string" ? draft.plan.id : snapshotId;
        const statistics: ExecutionResolverStatistics = {
          taskCount: orderedTasks.length,
          readyCount: deps.ready.length,
          blockedCount: deps.blocked.length,
          waitingCount: deps.waiting.length,
          contractCount: contracts.contracts.length,
          providerCount: providers.providers.length,
          dependencyCount: deps.graph.edges.length,
        };
        const graph = createExecutionGraph({
          nodes: orderedIds,
          edges: deps.graph.edges,
          contractIds: contracts.contracts.map((item) => item.id),
          providerIds: providers.providers.map((item) => item.id),
        });
        const resolved = createResolvedExecutionPlan({
          id: planId,
          decisionAnalysisId: decision?.id ?? null,
          workflowSnapshotId: workflow?.id ?? null,
          tasks: orderedTasks,
          dependencies: deps.graph.edges,
          contracts: [...contracts.contracts],
          providers: [...providers.providers],
          metadata,
          statistics,
          graph,
          executionTime: Math.max(0, now() - started),
          createdAt,
        });
        const planIssues = validator.validatePlan(resolved);
        if (planIssues.length > 0) return refused(planIssues, Math.max(0, now() - started));

        mark("FREEZE_EXECUTION_GRAPH");
        const snapshot = createExecutionResolverSnapshot({
          snapshotId,
          planId,
          workflowId: workflow?.id ?? null,
          decisionId: decision?.id ?? null,
          orderedTasks: orderedIds,
          contractIds: graph.contractIds,
          providerIds: graph.providerIds,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, Math.max(0, now() - started));

        return freezeDeepExecutionResolver({
          status: "OK" as const,
          issues: [],
          graph,
          plan: resolved,
          orderedTasks: snapshot.orderedTasks,
          contracts: resolved.contracts,
          providers: resolved.providers,
          metadata,
          statistics,
          snapshot,
          executionTime: resolved.executionTime,
        });
      } catch (error) {
        return refused(
          [{ field: "plan", message: error instanceof Error ? error.message : "the resolver could not prepare the graph." }],
          Math.max(0, now() - started),
        );
      }
    },
  };
}
