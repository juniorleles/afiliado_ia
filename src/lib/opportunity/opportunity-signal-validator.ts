/**
 * Opportunity Signal Framework: validator.
 *
 * Pure rules for signal modules, dependencies, and signal output. It only
 * reports problems: it never registers, enables, or reorders anything.
 */
import { SIGNAL_RESULT_STATUSES, type SignalEntry } from "./opportunity-signal-contract";
import { OPPORTUNITY_SIGNAL_CATEGORIES } from "./opportunity-types";
import type { OpportunityIssue } from "./opportunity-validator";

const SIGNAL_ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const SIGNAL_PRIORITY_MIN = 0;
export const SIGNAL_PRIORITY_MAX = 1000;

const DEPENDENCY_LISTS = ["requires", "optional", "conflicts"] as const;
const MODULE_METHODS = ["supportsCandidate", "analyze", "validate"] as const;
const MODULE_FIELDS = ["id", "name", "version", "category", "enabled", "priority", "dependencies"] as const;

export function isSignalCategory(value: unknown): boolean {
  return (OPPORTUNITY_SIGNAL_CATEGORIES as readonly unknown[]).includes(value);
}

export function isSignalVersion(value: unknown): boolean {
  return typeof value === "string" && SEMVER.test(value);
}

/** Checks a signal module against the contract. Reports every problem found. */
export function validateSignalModule(input: unknown): OpportunityIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "module", message: "Signal contract is missing." }];
  }
  const module = input as Record<string, unknown>;
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const field of MODULE_FIELDS) {
    if (module[field] === undefined || module[field] === null) add(field, `Contract member "${field}" is missing.`);
  }
  for (const method of MODULE_METHODS) {
    if (typeof module[method] !== "function") add(method, `Contract method "${method}" is missing.`);
  }

  if (module.id !== undefined && module.id !== null) {
    if (typeof module.id !== "string" || !SIGNAL_ID.test(module.id)) {
      add("id", "Id must be lowercase letters, digits, and hyphens, starting with a letter.");
    }
  }
  if (module.name !== undefined && module.name !== null) {
    if (typeof module.name !== "string" || module.name.trim() === "") add("name", "Name must not be empty.");
  }
  if (module.version !== undefined && module.version !== null && !isSignalVersion(module.version)) {
    add("version", "Version must be a semantic version such as 1.0.0.");
  }
  if (module.category !== undefined && module.category !== null && !isSignalCategory(module.category)) {
    add("category", "Category is not supported.");
  }
  if (module.enabled !== undefined && module.enabled !== null && typeof module.enabled !== "boolean") {
    add("enabled", "enabled must be true or false.");
  }
  if (module.priority !== undefined && module.priority !== null) {
    const p = module.priority;
    if (typeof p !== "number" || !Number.isInteger(p) || p < SIGNAL_PRIORITY_MIN || p > SIGNAL_PRIORITY_MAX) {
      add("priority", `Priority must be an integer from ${SIGNAL_PRIORITY_MIN} to ${SIGNAL_PRIORITY_MAX}.`);
    }
  }

  const deps = module.dependencies;
  if (deps !== undefined && deps !== null) {
    if (typeof deps !== "object" || Array.isArray(deps)) {
      add("dependencies", "Dependencies must be an object with requires, optional, and conflicts.");
    } else {
      const lists: Record<string, string[]> = {};
      for (const list of DEPENDENCY_LISTS) {
        const value = (deps as Record<string, unknown>)[list];
        if (!Array.isArray(value)) {
          add(`dependencies.${list}`, `"${list}" must be a list of signal ids.`);
          continue;
        }
        const ids = value as unknown[];
        if (ids.some((id) => typeof id !== "string" || !SIGNAL_ID.test(id))) {
          add(`dependencies.${list}`, `"${list}" must contain only valid signal ids.`);
          continue;
        }
        if (new Set(ids).size !== ids.length) add(`dependencies.${list}`, `"${list}" must not repeat an id.`);
        if (typeof module.id === "string" && ids.includes(module.id)) {
          add(`dependencies.${list}`, "A signal cannot depend on or conflict with itself.");
        }
        lists[list] = ids as string[];
      }
      const requiredOrOptional = [...(lists.requires ?? []), ...(lists.optional ?? [])];
      if ((lists.conflicts ?? []).some((id) => requiredOrOptional.includes(id))) {
        add("dependencies.conflicts", "A signal cannot both conflict with and depend on the same signal.");
      }
      if ((lists.requires ?? []).some((id) => (lists.optional ?? []).includes(id))) {
        add("dependencies.optional", "A signal cannot list the same id as required and optional.");
      }
    }
  }
  return issues;
}

/** Rejects an id that is already registered. */
export function validateNoDuplicateSignalId(existing: Iterable<string>, id: string): OpportunityIssue[] {
  for (const known of existing) {
    if (known === id) return [{ field: "id", message: `Signal "${id}" is already registered.` }];
  }
  return [];
}

/** The ordering edges between enabled signals: dependency id -> ids that must run after it. */
export function dependencyEdges(entries: readonly SignalEntry[]): Map<string, string[]> {
  const enabled = new Map(entries.filter((e) => e.enabled).map((e) => [e.id, e]));
  const edges = new Map<string, string[]>([...enabled.keys()].map((id) => [id, []]));
  for (const entry of enabled.values()) {
    const { requires, optional } = entry.module.dependencies;
    for (const dep of [...requires, ...optional]) {
      if (enabled.has(dep)) edges.get(dep)!.push(entry.id);
    }
  }
  return edges;
}

/** Finds circular dependencies among enabled signals. Each cycle is reported once. */
function findCycles(edges: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string) => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of [...(edges.get(id) ?? [])].sort()) {
      if (state.get(next) === "visiting") {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (state.get(next) === undefined) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, "done");
  };
  for (const id of [...edges.keys()].sort()) {
    if (state.get(id) === undefined) visit(id);
  }
  return cycles;
}

/**
 * Validates the declared dependencies of every enabled signal: required
 * signals must be registered and enabled, conflicting signals must not be
 * enabled, and there must be no cycle. Nothing is changed or resolved.
 */
export function validateDependencies(entries: readonly SignalEntry[]): OpportunityIssue[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const issues: OpportunityIssue[] = [];
  const conflictPairs = new Set<string>();

  for (const entry of [...entries].filter((e) => e.enabled).sort((a, b) => a.id.localeCompare(b.id))) {
    for (const dep of entry.module.dependencies.requires) {
      const target = byId.get(dep);
      if (!target) {
        issues.push({ field: "dependencies.requires", message: `Signal "${entry.id}" requires "${dep}", which is not registered.` });
      } else if (!target.enabled) {
        issues.push({ field: "dependencies.requires", message: `Signal "${entry.id}" requires "${dep}", which is disabled.` });
      }
    }
    for (const other of entry.module.dependencies.conflicts) {
      if (byId.get(other)?.enabled) {
        const key = [entry.id, other].sort().join("|");
        if (conflictPairs.has(key)) continue;
        conflictPairs.add(key);
        issues.push({ field: "dependencies.conflicts", message: `Signal "${entry.id}" conflicts with "${other}", and both are enabled.` });
      }
    }
  }
  for (const cycle of findCycles(dependencyEdges(entries))) {
    // Each arrow reads "depends on".
    issues.push({ field: "dependencies", message: `Circular dependency: ${[...cycle].reverse().join(" -> ")}.` });
  }
  return issues;
}

function flatMetadataIssue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
  return Object.values(value).some(
    (v) => !(v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))),
  );
}

/** Checks what analyze() returned. The framework does not interpret confidence beyond its type. */
export function validateSignalOutput(input: unknown): OpportunityIssue[] {
  if (typeof input !== "object" || input === null) return [{ field: "output", message: "Signal output must be an object." }];
  const output = input as Record<string, unknown>;
  const issues: OpportunityIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (!(SIGNAL_RESULT_STATUSES as readonly unknown[]).includes(output.status)) add("status", "Status is not supported.");
  if (output.confidence !== null && !(typeof output.confidence === "number" && Number.isFinite(output.confidence))) {
    add("confidence", "Confidence must be a finite number or null.");
  }
  if (flatMetadataIssue(output.metadata)) add("metadata", "Metadata must be a flat object of strings, numbers, booleans, or null.");
  for (const list of ["warnings", "errors"] as const) {
    const value = output[list];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) add(list, `"${list}" must be a list of text.`);
  }
  if (output.status === "FAILED" && Array.isArray(output.errors) && output.errors.length === 0) {
    add("errors", "A FAILED result requires at least one error.");
  }
  return issues;
}
