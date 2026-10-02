/**
 * Execution Contract Framework: validator.
 *
 * Pure rules for contract records, resolver input, and snapshots. It rejects
 * a duplicate contract, an invalid version, missing requirements, invalid
 * metadata, and an invalid contract. It only reports problems: it never
 * registers, resolves, or changes what it is given.
 */
import {
  EXECUTION_CONTRACT_CATEGORIES,
  EXECUTION_CONTRACT_KEYS,
  EXECUTION_CONTRACT_REQUIREMENT_KEYS,
  type ExecutionContractRequirementKey,
} from "./execution-contract";
import { isFlatExecutionMetadata } from "./execution-task-validator";
import type { ExecutionIssue } from "./execution-validator";

const CONTRACT_ID = /^[a-z][a-z0-9-]*$/;
const TOKEN = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INPUT_MEMBERS = [
  "plan",
  "tasks",
  "contracts",
  "contractIds",
  "decisionAnalysis",
  "workflowSnapshot",
  "executionMetadata",
  "runtimeMetadata",
  "configuration",
] as const;
const CONTEXT_RECORDS = ["decisionAnalysis", "workflowSnapshot"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const TOKEN_LISTS = ["capabilities", "inputs", "outputs"] as const;

export interface ExecutionContractValidator {
  validateContract(input: unknown): ExecutionIssue[];
  validateInput(input: unknown): ExecutionIssue[];
  validateSnapshot(input: unknown): ExecutionIssue[];
  validateMetadata(input: unknown): ExecutionIssue[];
  validateRequirements(contract: unknown, input: unknown): ExecutionIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const idOf = (value: unknown): string | null => (isPlainRecord(value) && typeof value.id === "string" && value.id.trim() !== "" ? value.id : null);

export function isExecutionContractCategory(value: unknown): boolean {
  return (EXECUTION_CONTRACT_CATEGORIES as readonly unknown[]).includes(value);
}

export function isExecutionContractVersion(value: unknown): boolean {
  return typeof value === "string" && SEMVER.test(value);
}

export function isExecutionContractRequirementKey(value: unknown): value is ExecutionContractRequirementKey {
  return (EXECUTION_CONTRACT_REQUIREMENT_KEYS as readonly unknown[]).includes(value);
}

function tasksOf(input: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(input.tasks)) return input.tasks;
  if (isPlainRecord(input.plan) && Array.isArray(input.plan.tasks)) return input.plan.tasks;
  return null;
}

function requirementPresent(input: Record<string, unknown>, key: ExecutionContractRequirementKey): boolean {
  if (key === "plan") return idOf(input.plan) !== null;
  if (key === "tasks") {
    const tasks = tasksOf(input);
    return tasks !== null && tasks.length > 0;
  }
  if (key === "decisionAnalysis" || key === "workflowSnapshot") return idOf(input[key]) !== null;
  return key in input && isFlatExecutionMetadata(input[key]);
}

export function createExecutionContractValidator(): ExecutionContractValidator {
  function validateMetadata(input: unknown): ExecutionIssue[] {
    if (input === undefined) return [];
    if (!isFlatExecutionMetadata(input)) {
      return [{ field: "metadata", message: "Invalid metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateTokenList(field: string, value: unknown): ExecutionIssue[] {
    if (!Array.isArray(value)) return [{ field, message: `Invalid Contract: "${field}" must be a list of tokens.` }];
    const issues: ExecutionIssue[] = [];
    if (value.some((item) => typeof item !== "string" || !TOKEN.test(item))) {
      issues.push({ field, message: `Invalid Contract: "${field}" must contain only well-formed tokens.` });
      return issues;
    }
    if (new Set(value).size !== value.length) {
      issues.push({ field, message: `Invalid Contract: "${field}" must not repeat a token.` });
    }
    return issues;
  }

  function validateContract(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "contract", message: "Invalid Contract: a contract record is required." }];
    const issues: ExecutionIssue[] = [];
    const add = (field: string, message: string) => issues.push({ field, message });

    for (const field of EXECUTION_CONTRACT_KEYS) {
      if (input[field] === undefined || input[field] === null) add(field, `Invalid Contract: member "${field}" is missing.`);
    }
    if (input.id !== undefined && input.id !== null) {
      if (typeof input.id !== "string" || !CONTRACT_ID.test(input.id)) {
        add("id", "Invalid Contract: a well-formed contract id is required.");
      }
    }
    if (input.name !== undefined && input.name !== null) {
      if (typeof input.name !== "string" || input.name.trim() === "") add("name", "Invalid Contract: name must not be empty.");
    }
    if (input.version !== undefined && input.version !== null && !isExecutionContractVersion(input.version)) {
      add("version", "Invalid version: version must be a semantic version such as 1.0.0.");
    }
    if (input.category !== undefined && input.category !== null && !isExecutionContractCategory(input.category)) {
      add("category", "Invalid Contract: category is not supported.");
    }
    for (const field of TOKEN_LISTS) {
      if (input[field] === undefined || input[field] === null) continue;
      issues.push(...validateTokenList(field, input[field]));
    }
    const requirements = input.requirements;
    if (requirements !== undefined && requirements !== null) {
      if (!Array.isArray(requirements)) {
        add("requirements", "Missing Requirements: requirements must be a list of input members.");
      } else if (requirements.length === 0) {
        add("requirements", "Missing Requirements: at least one requirement is required.");
      } else {
        if (requirements.some((item) => !isExecutionContractRequirementKey(item))) {
          add("requirements", "Missing Requirements: every requirement must name a known input member.");
        }
        if (new Set(requirements).size !== requirements.length) {
          add("requirements", "Invalid Contract: requirements must not repeat a token.");
        }
      }
    }
    issues.push(...validateMetadata(input.metadata === undefined ? {} : input.metadata).map((issue) => ({ ...issue, field: "metadata" })));
    return issues;
  }

  function validateRequirements(contract: unknown, input: unknown): ExecutionIssue[] {
    const contractIssues = validateContract(contract);
    if (contractIssues.length > 0) return contractIssues;
    if (!isPlainRecord(input)) return [{ field: "input", message: "Invalid Contract: an object of plan, tasks, and metadata is required." }];
    const record = contract as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "contract";
    const issues: ExecutionIssue[] = [];
    for (const key of record.requirements as ExecutionContractRequirementKey[]) {
      if (!requirementPresent(input, key)) {
        issues.push({ field: "requirements", message: `Missing Requirements: contract "${id}" requires "${key}".` });
      }
    }
    return issues;
  }

  function validateInput(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "contract", message: "Invalid Contract: an object of plan, tasks, and metadata is required." }];
    const issues: ExecutionIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(INPUT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Contract: unexpected member "${key}".` });
      }
    }
    for (const key of CONTEXT_RECORDS) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      if (!isPlainRecord(value)) issues.push({ field: key, message: `Invalid Contract: "${key}" must be an id holder.` });
      else if (idOf(value) === null) issues.push({ field: key, message: `Invalid Contract: "${key}" must carry a non-empty id.` });
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
      if (!isPlainRecord(plan)) issues.push({ field: "plan", message: "Invalid Contract: a plan must be an object." });
      else if (typeof plan.id !== "string" || plan.id.trim() === "") {
        issues.push({ field: "plan.id", message: "Invalid Contract: a plan must carry a non-empty id." });
      } else if (plan.tasks !== undefined && !Array.isArray(plan.tasks)) {
        issues.push({ field: "plan.tasks", message: "Invalid Contract: plan tasks must be a list." });
      }
    }
    if (input.tasks !== undefined && !Array.isArray(input.tasks)) {
      issues.push({ field: "tasks", message: "Invalid Contract: tasks must be a list." });
    }
    if (input.contractIds !== undefined) {
      if (!Array.isArray(input.contractIds) || input.contractIds.some((id) => typeof id !== "string" || !CONTRACT_ID.test(id))) {
        issues.push({ field: "contractIds", message: "Invalid Contract: contractIds must be a list of well-formed ids." });
      }
    }
    if (input.contracts !== undefined) {
      if (!Array.isArray(input.contracts)) {
        issues.push({ field: "contracts", message: "Invalid Contract: contracts must be a list." });
      } else {
        const seen = new Set<string>();
        input.contracts.forEach((item, index) => {
          const path = `contracts[${index}]`;
          const itemIssues = validateContract(item);
          for (const issue of itemIssues) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
          if (isPlainRecord(item) && typeof item.id === "string") {
            if (seen.has(item.id)) issues.push({ field: `${path}.id`, message: `Duplicate Contract: "${item.id}" is already listed.` });
            seen.add(item.id);
          }
        });
      }
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ExecutionIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Contract: a snapshot record is required." }];
    const issues: ExecutionIssue[] = [];
    if (typeof input.snapshotId !== "string" || !TOKEN.test(input.snapshotId)) {
      issues.push({ field: "snapshotId", message: "Invalid Contract: a well-formed snapshot id is required." });
    }
    if (input.planId !== null && (typeof input.planId !== "string" || input.planId.trim() === "")) {
      issues.push({ field: "planId", message: "Invalid Contract: planId must be a non-empty id or null." });
    }
    if (input.workflowId !== null && (typeof input.workflowId !== "string" || input.workflowId.trim() === "")) {
      issues.push({ field: "workflowId", message: "Invalid Contract: workflowId must be a non-empty id or null." });
    }
    if (input.decisionId !== null && (typeof input.decisionId !== "string" || input.decisionId.trim() === "")) {
      issues.push({ field: "decisionId", message: "Invalid Contract: decisionId must be a non-empty id or null." });
    }
    if (!Array.isArray(input.resolvedIds) || input.resolvedIds.some((id) => typeof id !== "string")) {
      issues.push({ field: "resolvedIds", message: "Invalid Contract: resolvedIds must be a list of contract ids." });
    }
    if (!Array.isArray(input.contracts)) {
      issues.push({ field: "contracts", message: "Invalid Contract: a snapshot must carry contracts." });
    } else {
      input.contracts.forEach((item, index) => {
        const path = `contracts[${index}]`;
        for (const issue of validateContract(item)) issues.push({ field: `${path}.${issue.field}`, message: issue.message });
      });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Contract: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return { validateContract, validateInput, validateSnapshot, validateMetadata, validateRequirements };
}
