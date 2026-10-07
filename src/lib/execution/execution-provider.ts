/**
 * Execution Provider Framework: host record.
 *
 * Names a host that may later carry out a contract. The framework discovers,
 * validates, and resolves hosts from declared fields. It never invokes a
 * host, never runs a contract, never reaches an outside system, and never
 * changes a workflow stage.
 *
 * Distinct from ExecutionContract, which names what may be carried out. This
 * record names who may later carry it out.
 */
import type { ExecutionIssue } from "./execution-validator";
import type { ExecutionMetadata } from "./execution-types";
import type { ExecutionProviderCapability } from "./execution-provider-capabilities";

export const EXECUTION_PROVIDER_HEALTH_STATUSES = ["OK", "UNAVAILABLE"] as const;
export type ExecutionProviderHealthStatus = (typeof EXECUTION_PROVIDER_HEALTH_STATUSES)[number];

export interface ExecutionProviderHealth {
  status: ExecutionProviderHealthStatus;
  issues: ExecutionIssue[];
}

export const EXECUTION_PROVIDER_KEYS = [
  "id",
  "name",
  "version",
  "supportedContracts",
  "capabilities",
  "health",
  "validate",
  "supports",
  "metadata",
] as const;

export const EXECUTION_PROVIDER_METHODS = ["health", "validate", "supports"] as const;

/** One host module. The framework never calls its methods in this phase. */
export interface ExecutionProvider {
  readonly id: string;
  readonly name: string;
  /** Semantic version, for example "1.0.0". */
  readonly version: string;
  readonly supportedContracts: readonly string[];
  readonly capabilities: readonly ExecutionProviderCapability[];
  health(): ExecutionProviderHealth;
  validate(): ExecutionIssue[];
  supports(contractId: string, capability?: ExecutionProviderCapability): boolean;
  readonly metadata: ExecutionMetadata;
}

/** Declared fields copied at register time. Does not include methods. */
export interface ExecutionProviderRecord {
  id: string;
  name: string;
  version: string;
  supportedContracts: readonly string[];
  capabilities: readonly ExecutionProviderCapability[];
  enabled: boolean;
  metadata: ExecutionMetadata;
}

export interface ExecutionProviderEntry extends ExecutionProviderRecord {
  readonly module: ExecutionProvider;
}

/** Freezes an object and every object inside it. Never throws. */
export function freezeDeepExecutionProvider<T>(value: T): T {
  try {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const inner of Object.values(value)) freezeDeepExecutionProvider(inner);
    }
  } catch {
    /* freeze must not throw */
  }
  return value;
}

export function copyPlainExecutionProvider<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlainExecutionProvider(item)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copyPlainExecutionProvider(inner)])) as T;
  }
  return value;
}

export function copyExecutionProviderRecord(item: ExecutionProviderRecord): ExecutionProviderRecord {
  return {
    id: item.id,
    name: item.name,
    version: item.version,
    supportedContracts: [...item.supportedContracts],
    capabilities: [...item.capabilities],
    enabled: item.enabled,
    metadata: copyPlainExecutionProvider(item.metadata ?? {}),
  };
}

export function recordFromExecutionProvider(module: ExecutionProvider, enabled: boolean): ExecutionProviderRecord {
  return copyExecutionProviderRecord({
    id: module.id,
    name: module.name,
    version: module.version,
    supportedContracts: module.supportedContracts,
    capabilities: module.capabilities,
    enabled,
    metadata: module.metadata ?? {},
  });
}
