/**
 * Execution Provider Framework: validator.
 *
 * Pure rules for host records, resolver input, and snapshots. It rejects a
 * duplicate host, a duplicate capability, an invalid version, invalid
 * metadata, and an unsupported contract. It only reports problems: it never
 * registers, resolves, invokes a host, or changes what it is given.
 */
import {
  EXECUTION_PROVIDER_KEYS,
  EXECUTION_PROVIDER_METHODS,
} from "./execution-provider";
import {
  EXECUTION_PROVIDER_CAPABILITIES,
  isExecutionProviderCapability,
} from "./execution-provider-capabilities";
import { isFlatExecutionMetadata } from "./execution-task-validator";
import type { ExecutionIssue } from "./execution-validator";

const HOST_ID = /^[a-z][a-z0-9-]*$/;
const TOKEN = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "plan",
  "contracts",
  "contractIds",
  "capabilities",
  "providerIds",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface ExecutionProviderValidator {
  validateProvider(input: unknown, knownContractIds?: readonly string[]): ExecutionIssue[];
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

export function isExecutionProviderVersion(value: unknown): boolean {
  return typeof value === "string" && SEMVER.test(value);
}

export function createExecutionProviderValidator(): ExecutionProviderValidator {
  function validateMetadata(input: unknown): ExecutionIssue[] {
    if (input === undefined) return [];
    if (!isFlatExecutionMetadata(input)) {
      return [{ field: "metadata", message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProvider(input: unknown, knownContractIds?: readonly string[]): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "provider", message: "a host record is required." }];
    const issues: ExecutionIssue[] = [];
    const add = (field: string, message: string) => issues.push({ field, message });

    for (const field of EXECUTION_PROVIDER_KEYS) {
      if (input[field] === undefined || input[field] === null) add(field, `member "${field}" is missing.`);
    }
    for (const method of EXECUTION_PROVIDER_METHODS) {
      if (typeof input[method] !== "function") add(method, `method "${method}" is missing.`);
    }
    if (input.id !== undefined && input.id !== null) {
      if (typeof input.id !== "string" || !HOST_ID.test(input.id)) {
        add("id", "a well-formed host id is required.");
      }
    }
    if (input.name !== undefined && input.name !== null) {
      if (typeof input.name !== "string" || input.name.trim() === "") add("name", "name must not be empty.");
    }
    if (input.version !== undefined && input.version !== null && !isExecutionProviderVersion(input.version)) {
      add("version", "Invalid version: version must be a semantic version such as 1.0.0.");
    }

    const contracts = input.supportedContracts;
    if (contracts !== undefined && contracts !== null) {
      if (!Array.isArray(contracts)) {
        add("supportedContracts", "supportedContracts must be a list of contract ids.");
      } else if (contracts.length === 0) {
        add("supportedContracts", "at least one supported contract is required.");
      } else {
        if (contracts.some((item) => typeof item !== "string" || !TOKEN.test(item))) {
          add("supportedContracts", "supportedContracts must contain only well-formed contract ids.");
        }
        if (new Set(contracts).size !== contracts.length) {
          add("supportedContracts", "supportedContracts must not repeat a contract id.");
        }
        if (knownContractIds) {
          const known = new Set(knownContractIds);
          for (const id of contracts) {
            if (typeof id === "string" && !known.has(id)) {
              add("supportedContracts", `Unsupported Contract: "${id}" is not a known contract.`);
            }
          }
        }
      }
    }

    const capabilities = input.capabilities;
    if (capabilities !== undefined && capabilities !== null) {
      if (!Array.isArray(capabilities)) {
        add("capabilities", "capabilities must be a list of capability ids.");
      } else if (capabilities.length === 0) {
        add("capabilities", "at least one capability is required.");
      } else {
        if (capabilities.some((item) => !isExecutionProviderCapability(item))) {
          add("capabilities", "Unsupported Capability: a capability id is not supported.");
        }
        const seen = new Set<string>();
        for (const item of capabilities) {
          if (typeof item !== "string") continue;
          if (seen.has(item)) add("capabilities", `Duplicate Capability: "${item}" is listed more than once.`);
          seen.add(item);
        }
      }
    }

    issues.push(...validateMetadata(input.metadata === undefined ? {} : input.metadata).map((issue) => ({ ...issue, field: "metadata" })));
    return issues;
  }

  function validateInput(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "provider", message: "an object of contracts, plan, and metadata is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `unexpected member "${key}".` });
      }
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
    if (input.contracts !== undefined) {
      if (!Array.isArray(input.contracts)) {
        issues.push({ field: "contracts", message: "contracts must be a list." });
      } else {
        input.contracts.forEach((item, index) => {
          if (idOf(item) === null) issues.push({ field: `contracts[${index}].id`, message: "a well-formed contract id is required." });
        });
      }
    }
    if (input.contractIds !== undefined) {
      if (!Array.isArray(input.contractIds) || input.contractIds.some((id) => typeof id !== "string" || !TOKEN.test(id))) {
        issues.push({ field: "contractIds", message: "contractIds must be a list of well-formed ids." });
      }
    }
    if (input.providerIds !== undefined) {
      if (!Array.isArray(input.providerIds) || input.providerIds.some((id) => typeof id !== "string" || !HOST_ID.test(id))) {
        issues.push({ field: "providerIds", message: "providerIds must be a list of well-formed ids." });
      }
    }
    if (input.capabilities !== undefined) {
      if (!Array.isArray(input.capabilities) || input.capabilities.some((item) => !isExecutionProviderCapability(item))) {
        issues.push({ field: "capabilities", message: "Unsupported Capability: a capability id is not supported." });
      } else {
        const seen = new Set<string>();
        for (const item of input.capabilities as string[]) {
          if (seen.has(item)) issues.push({ field: "capabilities", message: `Duplicate Capability: "${item}" is listed more than once.` });
          seen.add(item);
        }
      }
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "a snapshot record is required." }];
    const issues: ExecutionIssue[] = [];
    if (typeof input.snapshotId !== "string" || !TOKEN.test(input.snapshotId)) {
      issues.push({ field: "snapshotId", message: "a well-formed snapshot id is required." });
    }
    if (input.planId !== null && (typeof input.planId !== "string" || input.planId.trim() === "")) {
      issues.push({ field: "planId", message: "planId must be a non-empty id or null." });
    }
    for (const list of ["providerIds", "contractIds"] as const) {
      if (!Array.isArray(input[list]) || input[list].some((id) => typeof id !== "string")) {
        issues.push({ field: list, message: `${list} must be a list of ids.` });
      }
    }
    if (!Array.isArray(input.capabilities) || input.capabilities.some((item) => !(EXECUTION_PROVIDER_CAPABILITIES as readonly unknown[]).includes(item))) {
      issues.push({ field: "capabilities", message: "capabilities must be a list of known capability ids." });
    }
    if (!Array.isArray(input.providers)) {
      issues.push({ field: "providers", message: "a snapshot must carry host records." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateProvider, validateInput, validateSnapshot, validateMetadata };
}
