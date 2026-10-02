/**
 * Execution Provider Framework: host resolution.
 *
 * Decides which registered hosts are compatible with given contracts and
 * capabilities. It never invokes a host, never runs a contract, never reaches
 * an outside system, and never changes a workflow stage. A refused input
 * returns REJECTED with issues and no snapshot.
 *
 * Not the Execution Contract Resolver and not the Execution Plan Resolver.
 * This module only resolves hosts. Compatibility is read from declared
 * fields; host methods are never called.
 */
import type { ExecutionPlan } from "./execution-plan";
import type { ExecutionMetadata } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionContract } from "./execution-contract";
import {
  copyExecutionProviderRecord,
  freezeDeepExecutionProvider,
  type ExecutionProviderEntry,
  type ExecutionProviderRecord,
} from "./execution-provider";
import {
  createExecutionProviderCapabilityRegistry,
  type ExecutionProviderCapability,
  type ExecutionProviderCapabilityRegistry,
} from "./execution-provider-capabilities";
import { createExecutionProviderRegistry, type ExecutionProviderRegistry } from "./execution-provider-registry";
import { createExecutionProviderSnapshot, type ExecutionProviderSnapshot } from "./execution-provider-snapshot";
import { createExecutionProviderValidator, type ExecutionProviderValidator } from "./execution-provider-validator";

export const EXECUTION_PROVIDER_RESOLVE_STATUSES = ["OK", "REJECTED"] as const;
export type ExecutionProviderResolveStatus = (typeof EXECUTION_PROVIDER_RESOLVE_STATUSES)[number];

export type ExecutionProviderClock = () => number;
export type ExecutionProviderTimestamp = () => string;
export type ExecutionProviderIdFactory = () => string;

export interface ExecutionProviderResolverInput {
  plan?: Pick<ExecutionPlan, "id"> | null;
  contracts?: readonly Pick<ExecutionContract, "id">[];
  contractIds?: readonly string[];
  capabilities?: readonly ExecutionProviderCapability[];
  providerIds?: readonly string[];
  executionMetadata?: ExecutionMetadata;
  runtimeMetadata?: ExecutionMetadata;
  configuration?: ExecutionMetadata;
}

export interface ExecutionProviderResolveResult {
  status: ExecutionProviderResolveStatus;
  issues: ExecutionIssue[];
  providers: readonly ExecutionProviderRecord[];
  metadata: ExecutionMetadata;
  executionTime: number;
  snapshot: ExecutionProviderSnapshot | null;
}

export interface ExecutionProviderResolver {
  readonly validator: ExecutionProviderValidator;
  readonly registry: ExecutionProviderRegistry;
  readonly capabilities: ExecutionProviderCapabilityRegistry;
  validate(input: unknown): ExecutionIssue[];
  resolve(input: unknown): ExecutionProviderResolveResult;
  resolveContract(contractId: string): ExecutionProviderResolveResult;
  resolveCapability(capability: ExecutionProviderCapability): ExecutionProviderResolveResult;
  inspect(id: string): ExecutionProviderEntry | null;
  getSnapshot(snapshotId: string): ExecutionProviderSnapshot | null;
}

export interface ExecutionProviderResolverOptions {
  validator?: ExecutionProviderValidator;
  registry?: ExecutionProviderRegistry;
  capabilities?: ExecutionProviderCapabilityRegistry;
  now?: ExecutionProviderClock;
  timestamp?: ExecutionProviderTimestamp;
  idFactory?: ExecutionProviderIdFactory;
}

const defaultClock: ExecutionProviderClock = () => performance.now();

function refused(issues: ExecutionIssue[], executionTime = 0): ExecutionProviderResolveResult {
  return {
    status: "REJECTED",
    issues,
    providers: [],
    metadata: {},
    executionTime,
    snapshot: null,
  };
}

function catalogIds(input: ExecutionProviderResolverInput): string[] | null {
  if (!input.contracts) return null;
  return input.contracts.map((item) => item.id);
}

function wantedContractIds(input: ExecutionProviderResolverInput): string[] {
  if (input.contractIds) return [...input.contractIds];
  return catalogIds(input) ?? [];
}

export function createExecutionProviderResolver(options: ExecutionProviderResolverOptions = {}): ExecutionProviderResolver {
  const validator = options.validator ?? createExecutionProviderValidator();
  const registry = options.registry ?? createExecutionProviderRegistry();
  const capabilities = options.capabilities ?? createExecutionProviderCapabilityRegistry();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `snapshot-${++serial}`);
  const snapshots = new Map<string, ExecutionProviderSnapshot>();

  const extraIssues = (input: ExecutionProviderResolverInput): ExecutionIssue[] => {
    const issues: ExecutionIssue[] = [];
    const known = catalogIds(input);
    const enabled = registry.list({ enabled: true });
    const named = input.providerIds ? new Set(input.providerIds) : null;

    if (input.providerIds) {
      for (const id of input.providerIds) {
        const entry = registry.get(id);
        if (!entry) {
          issues.push({ field: "providerIds", message: `Missing Provider: "${id}" is not registered.` });
        } else if (!entry.enabled) {
          issues.push({ field: "providerIds", message: `Missing Provider: "${id}" is disabled.` });
        }
      }
    }

    const pool = named ? enabled.filter((item) => named.has(item.id)) : enabled;
    const contracts = wantedContractIds(input);
    for (const contractId of contracts) {
      if (known && !known.includes(contractId)) {
        issues.push({ field: "contractIds", message: `Unsupported Contract: "${contractId}" is not a known contract.` });
        continue;
      }
      const matches = pool.filter((item) => item.supportedContracts.includes(contractId));
      if (matches.length === 0) {
        if (named && named.size > 0) {
          issues.push({ field: "contractIds", message: `Unsupported Contract: the named host does not support "${contractId}".` });
        } else {
          issues.push({ field: "contractIds", message: `Missing Provider: no enabled host supports contract "${contractId}".` });
        }
      }
    }

    for (const capability of input.capabilities ?? []) {
      const matches = pool.filter((item) => item.capabilities.includes(capability));
      if (matches.length === 0) {
        issues.push({ field: "capabilities", message: `Unsupported Capability: no enabled host declares "${capability}".` });
      }
    }
    return issues;
  };

  const finish = (draft: ExecutionProviderResolverInput, started: number): ExecutionProviderResolveResult => {
    const graphIssues = extraIssues(draft);
    if (graphIssues.length > 0) return refused(graphIssues, Math.max(0, now() - started));

    const named = draft.providerIds ? new Set(draft.providerIds) : null;
    const wantedContracts = wantedContractIds(draft);
    const wantedCapabilities = draft.capabilities ?? [];
    const compatible = registry
      .list({ enabled: true })
      .filter((item) => named === null || named.has(item.id))
      .filter((item) => wantedContracts.length === 0 || wantedContracts.some((id) => item.supportedContracts.includes(id)))
      .filter((item) => wantedCapabilities.length === 0 || wantedCapabilities.every((cap) => item.capabilities.includes(cap)))
      .sort((a, b) => a.id.localeCompare(b.id));
    const records = compatible.map((item) => freezeDeepExecutionProvider(copyExecutionProviderRecord(item)));
    const metadata = freezeDeepExecutionProvider({ ...(draft.executionMetadata ?? {}) });
    const createdAt = timestamp();
    const snapshotId = idFactory();
    const capList = wantedCapabilities.length > 0 ? [...wantedCapabilities] : [...new Set(compatible.flatMap((item) => [...item.capabilities]))].sort();
    const snapshot = createExecutionProviderSnapshot({
      snapshotId,
      planId: draft.plan && typeof draft.plan.id === "string" ? draft.plan.id : null,
      providerIds: records.map((item) => item.id),
      contractIds: wantedContracts,
      capabilities: capList,
      providers: records,
      createdAt,
      metadata,
    });
    const snapshotIssues = validator.validateSnapshot(snapshot);
    if (snapshotIssues.length > 0) return refused(snapshotIssues, Math.max(0, now() - started));
    snapshots.set(snapshotId, snapshot);
    return freezeDeepExecutionProvider({
      status: "OK" as const,
      issues: [],
      providers: snapshot.providers,
      metadata,
      executionTime: Math.max(0, now() - started),
      snapshot,
    });
  };

  return {
    validator,
    registry,
    capabilities,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as ExecutionProviderResolverInput)];
    },
    resolve(input) {
      const started = now();
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues, Math.max(0, now() - started));
        return finish(input as ExecutionProviderResolverInput, started);
      } catch (error) {
        return refused(
          [{ field: "provider", message: error instanceof Error ? error.message : "the resolver could not resolve hosts." }],
          Math.max(0, now() - started),
        );
      }
    },
    resolveContract(contractId) {
      const started = now();
      try {
        return finish({ contractIds: [contractId] }, started);
      } catch (error) {
        return refused(
          [{ field: "contractIds", message: error instanceof Error ? error.message : "the resolver could not resolve hosts." }],
          Math.max(0, now() - started),
        );
      }
    },
    resolveCapability(capability) {
      const started = now();
      try {
        const issues = validator.validateInput({ capabilities: [capability] });
        if (issues.length > 0) return refused(issues, Math.max(0, now() - started));
        return finish({ capabilities: [capability] }, started);
      } catch (error) {
        return refused(
          [{ field: "capabilities", message: error instanceof Error ? error.message : "the resolver could not resolve hosts." }],
          Math.max(0, now() - started),
        );
      }
    },
    inspect: (id) => registry.inspect(id),
    getSnapshot: (snapshotId) => snapshots.get(snapshotId) ?? null,
  };
}
