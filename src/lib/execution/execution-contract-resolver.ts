/**
 * Execution Contract Framework: eligibility resolution.
 *
 * Decides which registered contracts are eligible given a plan, tasks, and
 * metadata. It never runs a task, never calls an outside system, and never
 * changes a workflow stage. A refused input returns REJECTED with issues and
 * no snapshot.
 *
 * Not the Execution Plan Resolver (execution-plan-resolver.ts) and not the
 * Execution Dependency Resolver. This module only resolves contracts.
 */
import type { ExecutionPlan } from "./execution-plan";
import type { ExecutionMetadata, ExecutionTask } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";
import {
  freezeDeepExecutionContract,
  type ExecutionContract,
} from "./execution-contract";
import { createExecutionContractRegistry, type ExecutionContractRegistry } from "./execution-contract-registry";
import {
  copyIdHolder,
  createExecutionContractSnapshot,
  type ExecutionContractSnapshot,
} from "./execution-contract-snapshot";
import { createExecutionContractValidator, type ExecutionContractValidator } from "./execution-contract-validator";

export const EXECUTION_CONTRACT_RESOLVE_STATUSES = ["OK", "REJECTED"] as const;
export type ExecutionContractResolveStatus = (typeof EXECUTION_CONTRACT_RESOLVE_STATUSES)[number];

export type ExecutionContractClock = () => number;
export type ExecutionContractTimestamp = () => string;
export type ExecutionContractIdFactory = () => string;

export interface ExecutionContractResolverInput {
  plan?: Pick<ExecutionPlan, "id" | "tasks"> | null;
  tasks?: readonly ExecutionTask[];
  contracts?: readonly ExecutionContract[];
  contractIds?: readonly string[];
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  executionMetadata?: ExecutionMetadata;
  runtimeMetadata?: ExecutionMetadata;
  configuration?: ExecutionMetadata;
}

export interface ExecutionContractResolveResult {
  status: ExecutionContractResolveStatus;
  issues: ExecutionIssue[];
  contracts: readonly ExecutionContract[];
  metadata: ExecutionMetadata;
  executionTime: number;
  snapshot: ExecutionContractSnapshot | null;
}

export interface ExecutionContractResolver {
  readonly validator: ExecutionContractValidator;
  readonly registry: ExecutionContractRegistry;
  validate(input: unknown): ExecutionIssue[];
  resolve(input: unknown): ExecutionContractResolveResult;
  inspect(id: string): ExecutionContract | null;
  getSnapshot(snapshotId: string): ExecutionContractSnapshot | null;
}

export interface ExecutionContractResolverOptions {
  validator?: ExecutionContractValidator;
  registry?: ExecutionContractRegistry;
  now?: ExecutionContractClock;
  timestamp?: ExecutionContractTimestamp;
  idFactory?: ExecutionContractIdFactory;
}

const defaultClock: ExecutionContractClock = () => performance.now();

function refused(issues: ExecutionIssue[], executionTime = 0): ExecutionContractResolveResult {
  return {
    status: "REJECTED",
    issues,
    contracts: [],
    metadata: {},
    executionTime,
    snapshot: null,
  };
}

function catalogOf(input: ExecutionContractResolverInput, registry: ExecutionContractRegistry): ExecutionContract[] {
  return input.contracts ? [...input.contracts] : registry.list();
}

export function createExecutionContractResolver(options: ExecutionContractResolverOptions = {}): ExecutionContractResolver {
  const validator = options.validator ?? createExecutionContractValidator();
  const registry = options.registry ?? createExecutionContractRegistry();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `snapshot-${++serial}`);
  const snapshots = new Map<string, ExecutionContractSnapshot>();

  const extraIssues = (input: ExecutionContractResolverInput): ExecutionIssue[] => {
    const catalog = catalogOf(input, registry);
    const issues: ExecutionIssue[] = [];
    if (!input.contracts) {
      for (const item of catalog) issues.push(...validator.validateContract(item));
    }
    const byId = new Map(catalog.map((item) => [item.id, item]));
    for (const id of input.contractIds ?? []) {
      const found = byId.get(id);
      if (!found) {
        issues.push({ field: "contractIds", message: `Invalid Contract: "${id}" is not registered.` });
        continue;
      }
      issues.push(...validator.validateRequirements(found, input));
    }
    return issues;
  };

  return {
    validator,
    registry,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as ExecutionContractResolverInput)];
    },
    resolve(input) {
      const started = now();
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues, Math.max(0, now() - started));
        const draft = input as ExecutionContractResolverInput;
        const graphIssues = extraIssues(draft);
        if (graphIssues.length > 0) return refused(graphIssues, Math.max(0, now() - started));

        const catalog = catalogOf(draft, registry);
        const wanted = draft.contractIds ? new Set(draft.contractIds) : null;
        const resolved = catalog
          .filter((item) => (wanted === null || wanted.has(item.id)) && validator.validateRequirements(item, draft).length === 0)
          .sort((a, b) => a.id.localeCompare(b.id));
        const metadata = freezeDeepExecutionContract({ ...(draft.executionMetadata ?? {}) });
        const createdAt = timestamp();
        const snapshotId = idFactory();
        const snapshot = createExecutionContractSnapshot({
          snapshotId,
          planId: draft.plan && typeof draft.plan.id === "string" ? draft.plan.id : null,
          workflowId: copyIdHolder(draft.workflowSnapshot)?.id ?? null,
          decisionId: copyIdHolder(draft.decisionAnalysis)?.id ?? null,
          resolvedIds: resolved.map((item) => item.id),
          contracts: resolved,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, Math.max(0, now() - started));
        snapshots.set(snapshotId, snapshot);
        const executionTime = Math.max(0, now() - started);
        return freezeDeepExecutionContract({
          status: "OK" as const,
          issues: [],
          contracts: snapshot.contracts,
          metadata,
          executionTime,
          snapshot,
        });
      } catch (error) {
        return refused(
          [{ field: "contract", message: error instanceof Error ? error.message : "Invalid Contract: the resolver could not resolve contracts." }],
          Math.max(0, now() - started),
        );
      }
    },
    inspect: (id) => registry.inspect(id),
    getSnapshot: (snapshotId) => snapshots.get(snapshotId) ?? null,
  };
}
