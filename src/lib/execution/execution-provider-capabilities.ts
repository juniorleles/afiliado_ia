/**
 * Execution Provider Framework: capability catalog.
 *
 * Names the verbs a host may later carry out. FUTURE is the room left for
 * later verbs. This module never runs work, never reaches an outside system,
 * and never invokes a host.
 */
import { copyPlainExecutionProvider, freezeDeepExecutionProvider } from "./execution-provider";
import type { ExecutionMetadata } from "./execution-types";
import type { ExecutionIssue } from "./execution-validator";
import { isFlatExecutionMetadata } from "./execution-task-validator";

/** Verbs a host may declare. FUTURE is the room left for later verbs. */
export const EXECUTION_PROVIDER_CAPABILITIES = [
  "GENERATE",
  "CREATE",
  "UPDATE",
  "DELETE",
  "PAUSE",
  "RESUME",
  "PUBLISH",
  "ARCHIVE",
  "MONITOR",
  "FUTURE",
] as const;
export type ExecutionProviderCapability = (typeof EXECUTION_PROVIDER_CAPABILITIES)[number];

export const EXECUTION_PROVIDER_CAPABILITY_KEYS = ["id", "name", "metadata"] as const;

export interface ExecutionProviderCapabilityRecord {
  id: ExecutionProviderCapability;
  name: string;
  metadata: ExecutionMetadata;
}

export class ExecutionProviderCapabilityError extends Error {
  constructor(
    message: string,
    readonly issues: ExecutionIssue[] = [],
  ) {
    super(message);
    this.name = "ExecutionProviderCapabilityError";
  }
}

export interface ExecutionProviderCapabilityRegistry {
  register(capability: ExecutionProviderCapabilityRecord): ExecutionProviderCapabilityRecord;
  remove(id: string): ExecutionProviderCapabilityRecord;
  get(id: string): ExecutionProviderCapabilityRecord | null;
  inspect(id: string): ExecutionProviderCapabilityRecord | null;
  list(): ExecutionProviderCapabilityRecord[];
  count(): number;
  validate(capability: unknown): ExecutionIssue[];
}

export function isExecutionProviderCapability(value: unknown): value is ExecutionProviderCapability {
  return (EXECUTION_PROVIDER_CAPABILITIES as readonly unknown[]).includes(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function validateExecutionProviderCapabilityRecord(input: unknown): ExecutionIssue[] {
  if (!isPlainRecord(input)) return [{ field: "capability", message: "Invalid Contract: a capability record is required." }];
  const issues: ExecutionIssue[] = [];
  if (!isExecutionProviderCapability(input.id)) {
    issues.push({ field: "id", message: "Unsupported Capability: a capability id is not supported." });
  }
  if (typeof input.name !== "string" || input.name.trim() === "") {
    issues.push({ field: "name", message: "Invalid Contract: capability name must not be empty." });
  }
  if (input.metadata === undefined || input.metadata === null) {
    issues.push({ field: "metadata", message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." });
  } else if (!isFlatExecutionMetadata(input.metadata)) {
    issues.push({ field: "metadata", message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." });
  }
  return issues;
}

export function copyExecutionProviderCapabilityRecord(item: ExecutionProviderCapabilityRecord): ExecutionProviderCapabilityRecord {
  return {
    id: item.id,
    name: item.name,
    metadata: copyPlainExecutionProvider(item.metadata ?? {}),
  };
}

export function createExecutionProviderCapabilityRegistry(): ExecutionProviderCapabilityRegistry {
  const byId = new Map<string, ExecutionProviderCapabilityRecord>();

  const mustGet = (id: string): ExecutionProviderCapabilityRecord => {
    const entry = byId.get(id);
    if (!entry) {
      throw new ExecutionProviderCapabilityError(`Capability "${id}" is not registered.`, [
        { field: "id", message: `Unsupported Capability: "${id}" is not registered.` },
      ]);
    }
    return entry;
  };

  return {
    register(capability) {
      const issues = validateExecutionProviderCapabilityRecord(capability);
      if (issues.length > 0) throw new ExecutionProviderCapabilityError("Capability is invalid.", issues);
      if (byId.has(capability.id)) {
        throw new ExecutionProviderCapabilityError("Capability is invalid.", [
          { field: "id", message: `Duplicate Capability: "${capability.id}" is already registered.` },
        ]);
      }
      const stored = freezeDeepExecutionProvider(copyExecutionProviderCapabilityRecord(capability));
      byId.set(stored.id, stored);
      return stored;
    },
    remove(id) {
      const entry = mustGet(id);
      byId.delete(id);
      return entry;
    },
    get: (id) => byId.get(id) ?? null,
    inspect: (id) => byId.get(id) ?? null,
    list: () => [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    count: () => byId.size,
    validate: (capability) => validateExecutionProviderCapabilityRecord(capability),
  };
}
