/**
 * Evidence Provider Framework: validator.
 *
 * Pure rules for providers, the context, and what a provider returns. It only
 * reports problems: it never registers, enables, or changes anything.
 */
import type { OpportunityIssue } from "../opportunity-validator";
import { EVIDENCE_KINDS } from "./evidence-provider-contract";
import { describeNonPlainData, isPlainObject } from "./evidence-provider-context";

const PROVIDER_ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const PROVIDER_PRIORITY_MIN = 0;
export const PROVIDER_PRIORITY_MAX = 1000;

const PROVIDER_FIELDS = ["id", "name", "version", "kind", "priority", "enabled"] as const;
const PROVIDER_METHODS = ["supports", "collect", "validate"] as const;
const CONTEXT_FLAT = ["metadata", "runtime", "configuration", "extensions"] as const;

export function isProviderVersion(value: unknown): boolean {
  return typeof value === "string" && SEMVER.test(value);
}

export function isEvidenceKind(value: unknown): boolean {
  return (EVIDENCE_KINDS as readonly unknown[]).includes(value);
}

function flatMetadataIssue(value: unknown): boolean {
  if (!isPlainObject(value)) return true;
  return Object.entries(value).some(
    ([key, v]) => key.trim() === "" || !(v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))),
  );
}

/** Checks a provider against the contract. Reports every problem found. */
export function validateEvidenceProvider(input: unknown): OpportunityIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "provider", message: "Provider contract is missing." }];
  }
  const provider = input as Record<string, unknown>;
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const field of PROVIDER_FIELDS) {
    if (provider[field] === undefined || provider[field] === null) add(field, `Contract member "${field}" is missing.`);
  }
  for (const method of PROVIDER_METHODS) {
    if (typeof provider[method] !== "function") add(method, `Contract method "${method}" is missing.`);
  }

  if (provider.id !== undefined && provider.id !== null) {
    if (typeof provider.id !== "string" || !PROVIDER_ID.test(provider.id)) {
      add("id", "Id must be lowercase letters, digits, and hyphens, starting with a letter.");
    }
  }
  if (provider.name !== undefined && provider.name !== null) {
    if (typeof provider.name !== "string" || provider.name.trim() === "") add("name", "Name must not be empty.");
  }
  if (provider.version !== undefined && provider.version !== null && !isProviderVersion(provider.version)) {
    add("version", "Version must be a semantic version such as 1.0.0.");
  }
  if (provider.kind !== undefined && provider.kind !== null && !isEvidenceKind(provider.kind)) {
    add("kind", "Kind is not supported.");
  }
  if (provider.enabled !== undefined && provider.enabled !== null && typeof provider.enabled !== "boolean") {
    add("enabled", "enabled must be true or false.");
  }
  if (provider.priority !== undefined && provider.priority !== null) {
    const p = provider.priority;
    if (typeof p !== "number" || !Number.isInteger(p) || p < PROVIDER_PRIORITY_MIN || p > PROVIDER_PRIORITY_MAX) {
      add("priority", `Priority must be an integer from ${PROVIDER_PRIORITY_MIN} to ${PROVIDER_PRIORITY_MAX}.`);
    }
  }
  return issues;
}

/** Rejects an id that is already registered. */
export function validateNoDuplicateProviderId(existing: Iterable<string>, id: string): OpportunityIssue[] {
  for (const known of existing) {
    if (known === id) return [{ field: "id", message: `Provider "${id}" is already registered.` }];
  }
  return [];
}

/**
 * Checks a list of providers before any of them is registered: each must meet
 * the contract and no id may repeat. A provider's issues are prefixed with its
 * position and, when it has one, its id.
 */
export function validateEvidenceProviders(input: unknown): OpportunityIssue[] {
  if (!Array.isArray(input)) return [{ field: "providers", message: "Providers must be a list." }];
  const issues: OpportunityIssue[] = [];
  const seen = new Set<string>();
  input.forEach((provider, index) => {
    const id = typeof provider?.id === "string" ? provider.id : null;
    const label = id ? `providers[${index}] (${id})` : `providers[${index}]`;
    for (const issue of validateEvidenceProvider(provider)) issues.push({ field: `${label}.${issue.field}`, message: issue.message });
    if (id !== null) {
      if (seen.has(id)) issues.push({ field: `${label}.id`, message: `Provider "${id}" appears more than once.` });
      seen.add(id);
    }
  });
  return issues;
}

/** Checks a context: every member present, flat metadata flat, product data plain. */
export function validateEvidenceContext(input: unknown): OpportunityIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "context", message: "Evidence context is missing." }];
  }
  const context = input as Record<string, unknown>;
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field: `context.${field}`, message });

  for (const member of ["candidate", "resolvedProductData", ...CONTEXT_FLAT]) {
    if (context[member] === undefined) add(member, `Context member "${member}" is missing.`);
  }

  const candidate = context.candidate;
  if (candidate !== undefined && candidate !== null) {
    if (!isPlainObject(candidate) || typeof candidate.id !== "string" || candidate.id.trim() === "") {
      add("candidate", "Candidate must be null or an object with a non-empty id.");
    } else {
      const problem = describeNonPlainData(candidate, "candidate");
      if (problem) add("candidate", problem);
    }
  }

  const data = context.resolvedProductData;
  if (data !== undefined) {
    if (!isPlainObject(data)) add("resolvedProductData", "Resolved product data must be an object of plain data.");
    else {
      const problem = describeNonPlainData(data, "resolvedProductData");
      if (problem) add("resolvedProductData", problem);
    }
  }

  for (const member of CONTEXT_FLAT) {
    if (context[member] !== undefined && flatMetadataIssue(context[member])) {
      add(member, `"${member}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.`);
    }
  }
  return issues;
}

/** Checks what collect() returned. */
export function validateEvidenceOutput(input: unknown): OpportunityIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "output", message: "Provider output must be an object." }];
  }
  const output = input as Record<string, unknown>;
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (output.payload === undefined) add("payload", "Payload must be null or plain data.");
  else if (output.payload !== null) {
    const problem = describeNonPlainData(output.payload, "payload");
    if (problem) add("payload", problem);
  }
  if (flatMetadataIssue(output.metadata)) add("metadata", "Metadata must be a flat object of strings, numbers, booleans, or null.");
  if (!Array.isArray(output.warnings) || output.warnings.some((item) => typeof item !== "string")) {
    add("warnings", '"warnings" must be a list of text.');
  }
  return issues;
}
