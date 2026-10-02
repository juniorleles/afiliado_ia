/**
 * Execution Plan Builder: assemble one immutable plan.
 *
 * Turns read-only task results and context into one frozen plan, a snapshot,
 * statistics, and a summary. It never runs a task, never calls a provider,
 * never reaches an outside system, and never changes a workflow stage. A
 * refused input returns REJECTED with issues and no plan.
 *
 * This builder is not the Execution Planner contract (execution-planner.ts)
 * and not the Execution Dependency Resolver.
 */
import { EXECUTION_TASK_CATEGORIES, type ExecutionTaskCategory, type ExecutionTaskResult } from "./execution-task-contract";
import type { ExecutionIssue } from "./execution-validator";
import { createExecutionPlanResolver, type ExecutionPlanResolver } from "./execution-plan-resolver";
import {
  copyIdHolder,
  copyPlainExecutionPlan,
  createExecutionPlanSnapshot,
  freezeDeepExecutionPlan,
  type BuiltExecutionPlan,
  type ExecutionPlanSnapshot,
  type ExecutionPlanSummary,
  type ExecutionPlanTaskSpec,
  type ExecutionPostcondition,
  type ExecutionStage,
} from "./execution-plan-snapshot";
import { computeExecutionPlanStatistics, type ExecutionPlanStatistics } from "./execution-plan-statistics";
import { createExecutionPlanValidator, type ExecutionPlanValidator } from "./execution-plan-validator";
import type { ExecutionMetadata, ExecutionPrecondition, ExecutionStep } from "./execution-types";

export const EXECUTION_PLAN_BUILD_STATUSES = ["OK", "REJECTED"] as const;
export type ExecutionPlanBuildStatus = (typeof EXECUTION_PLAN_BUILD_STATUSES)[number];

export type ExecutionPlanClock = () => number;
export type ExecutionPlanTimestamp = () => string;
export type ExecutionPlanIdFactory = () => string;

export interface ExecutionPlanBuilderInput {
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  results: readonly ExecutionTaskResult[];
  executionMetadata?: ExecutionMetadata;
  runtimeMetadata?: ExecutionMetadata;
  configuration?: ExecutionMetadata;
  preconditions?: readonly ExecutionPrecondition[];
  postconditions?: readonly ExecutionPostcondition[];
  tasks?: readonly ExecutionPlanTaskSpec[];
}

export interface ExecutionPlanBuildResult {
  status: ExecutionPlanBuildStatus;
  issues: ExecutionIssue[];
  plan: BuiltExecutionPlan | null;
  snapshot: ExecutionPlanSnapshot | null;
  statistics: ExecutionPlanStatistics | null;
  summary: ExecutionPlanSummary | null;
}

export interface ExecutionPlanBuilder {
  readonly validator: ExecutionPlanValidator;
  readonly resolver: ExecutionPlanResolver;
  validate(input: unknown): ExecutionIssue[];
  build(input: unknown): ExecutionPlanBuildResult;
  getSnapshot(planId: string): ExecutionPlanSnapshot | null;
}

export interface ExecutionPlanBuilderOptions {
  validator?: ExecutionPlanValidator;
  resolver?: ExecutionPlanResolver;
  now?: ExecutionPlanClock;
  timestamp?: ExecutionPlanTimestamp;
  idFactory?: ExecutionPlanIdFactory;
}

const defaultClock: ExecutionPlanClock = () => performance.now();

function refused(issues: ExecutionIssue[]): ExecutionPlanBuildResult {
  return { status: "REJECTED", issues, plan: null, snapshot: null, statistics: null, summary: null };
}

function categoryOf(result: ExecutionTaskResult, spec: ExecutionPlanTaskSpec | undefined): ExecutionTaskCategory {
  if (spec?.category !== undefined) return spec.category;
  const named = result.metadata.category;
  if (typeof named === "string" && (EXECUTION_TASK_CATEGORIES as readonly string[]).includes(named)) {
    return named as ExecutionTaskCategory;
  }
  return "FUTURE";
}

export function createExecutionPlanBuilder(options: ExecutionPlanBuilderOptions = {}): ExecutionPlanBuilder {
  const validator = options.validator ?? createExecutionPlanValidator();
  const resolver = options.resolver ?? createExecutionPlanResolver();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `plan-${++serial}`);
  const snapshots = new Map<string, ExecutionPlanSnapshot>();

  const extraIssues = (input: ExecutionPlanBuilderInput): ExecutionIssue[] => {
    const results = input.results;
    return [...resolver.detectConflicts(results), ...resolver.resolveOrder(results).issues];
  };

  return {
    validator,
    resolver,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as ExecutionPlanBuilderInput)];
    },
    build(input) {
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues);
        const draft = input as ExecutionPlanBuilderInput;
        const graphIssues = extraIssues(draft);
        if (graphIssues.length > 0) return refused(graphIssues);

        const start = now();
        const { order, dependencies } = resolver.resolveOrder(draft.results);
        const catalog = new Map((draft.tasks ?? []).map((spec) => [spec.id, spec]));
        const byId = new Map(draft.results.map((item) => [item.taskId, item]));
        const tasks = order.map((id) => {
          const result = byId.get(id)!;
          const spec = catalog.get(id);
          const steps: ExecutionStep[] = copyPlainExecutionPlan(spec?.steps ? [...spec.steps] : []);
          return {
            id,
            name: spec?.name ?? id,
            steps,
            metadata: copyPlainExecutionPlan({
              ...(spec?.metadata ?? {}),
              ...result.metadata,
              status: result.status,
              estimatedDuration: result.estimatedDuration,
            }),
          };
        });
        const stages: ExecutionStage[] = EXECUTION_TASK_CATEGORIES.flatMap((category) => {
          const taskIds = order.filter((id) => categoryOf(byId.get(id)!, catalog.get(id)) === category);
          return taskIds.length > 0 ? [{ id: category, category, taskIds }] : [];
        });
        const preconditions = copyPlainExecutionPlan([...(draft.preconditions ?? [])]);
        const postconditions = copyPlainExecutionPlan([...(draft.postconditions ?? [])]);
        const metadata = copyPlainExecutionPlan(draft.executionMetadata ?? {});
        const decisionId = copyIdHolder(draft.decisionAnalysis)?.id ?? null;
        const workflowId = copyIdHolder(draft.workflowSnapshot)?.id ?? null;
        const createdAt = timestamp();
        const id = idFactory();
        const executionTime = Math.max(0, now() - start);
        const plan = freezeDeepExecutionPlan({
          id,
          decisionAnalysisId: decisionId,
          workflowSnapshotId: workflowId,
          tasks,
          dependencies: copyPlainExecutionPlan(dependencies),
          preconditions,
          postconditions,
          stages,
          metadata,
          executionTime,
          createdAt,
        });
        const snapshot = createExecutionPlanSnapshot({
          planId: id,
          workflowId,
          decisionId,
          orderedTasks: order,
          dependencies,
          createdAt,
          metadata,
        });
        const planIssues = [...validator.validatePlan(plan), ...validator.validateSnapshot(snapshot)];
        if (planIssues.length > 0) return refused(planIssues);
        snapshots.set(id, snapshot);
        const conflictCount = resolver.detectConflicts(draft.results).length;
        const statistics = freezeDeepExecutionPlan(
          computeExecutionPlanStatistics(draft.results, {
            dependencyCount: dependencies.length,
            stageCount: stages.length,
            preconditionCount: preconditions.length,
            postconditionCount: postconditions.length,
            conflictCount,
          }),
        );
        const summary = freezeDeepExecutionPlan({
          planId: id,
          taskCount: order.length,
          readyCount: draft.results.filter((item) => item.status === "READY").length,
          stageCount: stages.length,
          dependencyCount: dependencies.length,
        });
        return { status: "OK", issues: [], plan, snapshot, statistics, summary };
      } catch (error) {
        return refused([{ field: "plan", message: error instanceof Error ? error.message : "Invalid Plan: the builder could not assemble a plan." }]);
      }
    },
    getSnapshot: (planId) => snapshots.get(planId) ?? null,
  };
}
