/**
 * Traffic Signal Framework: validator.
 *
 * Pure rules for signal modules, dependencies, signal output, and the shared
 * context. It rejects duplicate signal ids, circular dependencies, invalid
 * categories, invalid versions, missing contracts, and invalid metadata. It
 * only reports problems: it never registers, enables, or reorders anything,
 * and it never changes what it is given.
 */
import { TRAFFIC_SIGNAL_RESULT_STATUSES, type TrafficSignalEntry } from "./traffic-signal-contract";
import { TRAFFIC_SIGNAL_CATEGORIES } from "./traffic-types";
import type { TrafficIssue } from "./traffic-validator";

const SIGNAL_ID = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const TRAFFIC_SIGNAL_PRIORITY_MIN = 0;
export const TRAFFIC_SIGNAL_PRIORITY_MAX = 1000;

const DEPENDENCY_LISTS = ["requires", "optional", "conflicts"] as const;
const MODULE_METHODS = ["supportsAnalysis", "analyze", "validate"] as const;
const MODULE_FIELDS = ["id", "name", "version", "category", "enabled", "priority", "dependencies"] as const;

export function isTrafficSignalCategory(value: unknown): boolean {
  return (TRAFFIC_SIGNAL_CATEGORIES as readonly unknown[]).includes(value);
}

export function isTrafficSignalVersion(value: unknown): boolean {
  return typeof value === "string" && SEMVER.test(value);
}

/** Checks a signal module against the contract. Reports every problem found. */
export function validateTrafficSignalModule(input: unknown): TrafficIssue[] {
  if (typeof input !== "object" || input === null) {
    return [{ field: "module", message: "Signal contract is missing." }];
  }
  const module = input as Record<string, unknown>;
  const issues: TrafficIssue[] = [];
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
  if (module.version !== undefined && module.version !== null && !isTrafficSignalVersion(module.version)) {
    add("version", "Version must be a semantic version such as 1.0.0.");
  }
  if (module.category !== undefined && module.category !== null && !isTrafficSignalCategory(module.category)) {
    add("category", "Category is not supported.");
  }
  if (module.enabled !== undefined && module.enabled !== null && typeof module.enabled !== "boolean") {
    add("enabled", "enabled must be true or false.");
  }
  if (module.priority !== undefined && module.priority !== null) {
    const p = module.priority;
    if (typeof p !== "number" || !Number.isInteger(p) || p < TRAFFIC_SIGNAL_PRIORITY_MIN || p > TRAFFIC_SIGNAL_PRIORITY_MAX) {
      add("priority", `Priority must be an integer from ${TRAFFIC_SIGNAL_PRIORITY_MIN} to ${TRAFFIC_SIGNAL_PRIORITY_MAX}.`);
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
export function validateNoDuplicateTrafficSignalId(existing: Iterable<string>, id: string): TrafficIssue[] {
  for (const known of existing) {
    if (known === id) return [{ field: "id", message: `Signal "${id}" is already registered.` }];
  }
  return [];
}

/** The ordering edges between enabled signals: dependency id -> ids that must run after it. */
export function trafficDependencyEdges(entries: readonly TrafficSignalEntry[]): Map<string, string[]> {
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
export function validateTrafficDependencies(entries: readonly TrafficSignalEntry[]): TrafficIssue[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const issues: TrafficIssue[] = [];
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
  for (const cycle of findCycles(trafficDependencyEdges(entries))) {
    // Each arrow reads "depends on".
    issues.push({ field: "dependencies", message: `Circular dependency: ${[...cycle].reverse().join(" -> ")}.` });
  }
  return issues;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** A plain object whose values are strings, finite numbers, booleans, or null, under non-empty keys. */
export function isFlatTrafficMetadata(value: unknown): boolean {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

/** Data that can be copied without loss: plain objects, arrays, strings, finite numbers, booleans, and null, with no cycle. */
export function isPlainTrafficData(value: unknown, seen: unknown[] = []): boolean {
  if (isFlatValue(value)) return true;
  if (typeof value !== "object" || value === null || seen.includes(value)) return false;
  const path = [...seen, value];
  if (Array.isArray(value)) return value.every((item) => isPlainTrafficData(item, path));
  return isPlainRecord(value) && Object.values(value).every((item) => isPlainTrafficData(item, path));
}

/** Checks what analyze() returned. The framework does not interpret confidence beyond its type. */
export function validateTrafficSignalOutput(input: unknown): TrafficIssue[] {
  if (typeof input !== "object" || input === null) return [{ field: "output", message: "Signal output must be an object." }];
  const output = input as Record<string, unknown>;
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  if (!(TRAFFIC_SIGNAL_RESULT_STATUSES as readonly unknown[]).includes(output.status)) add("status", "Status is not supported.");
  if (output.confidence !== null && !(typeof output.confidence === "number" && Number.isFinite(output.confidence))) {
    add("confidence", "Confidence must be a finite number or null.");
  }
  if (!isFlatTrafficMetadata(output.metadata)) add("metadata", "Metadata must be a flat object of strings, numbers, booleans, or null.");
  for (const list of ["warnings", "errors"] as const) {
    const value = output[list];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) add(list, `"${list}" must be a list of text.`);
  }
  if (output.status === "FAILED" && Array.isArray(output.errors) && output.errors.length === 0) {
    add("errors", "A FAILED result requires at least one error.");
  }
  return issues;
}

const CONTEXT_RECORDS = ["candidate", "opportunityAnalysis", "opportunityExplanation"] as const;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration", "extensions"] as const;
const CONTEXT_MEMBERS = [...CONTEXT_RECORDS, ...CONTEXT_METADATA] as const;
const idOf = (value: unknown, key: string): string | null => (isPlainRecord(value) && typeof value[key] === "string" && value[key].trim() !== "" ? (value[key] as string) : null);

/**
 * Checks a context or the members a context is to be made from. Every member
 * must be plain data. Metadata must be flat. A record that is supplied must
 * name itself, and the Opportunity records must refer to the same candidate
 * and the same analysis. With `complete`, every member must be present, as in
 * a context a pipeline is about to run.
 */
export function validateTrafficSignalContext(input: unknown, complete = false): TrafficIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ field: "context", message: "Invalid context: an object is required." }];
  }
  const record = input as Record<string, unknown>;
  const issues: TrafficIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const key of Object.keys(record)) {
    if (!(CONTEXT_MEMBERS as readonly string[]).includes(key)) add(key, `Invalid context: unexpected member "${key}"; future inputs go in "extensions".`);
  }
  if (complete) {
    for (const key of CONTEXT_MEMBERS) if (!(key in record)) add(key, `Invalid context: member "${key}" is missing.`);
  }
  const identity: Record<(typeof CONTEXT_RECORDS)[number], string> = { candidate: "id", opportunityAnalysis: "analysisId", opportunityExplanation: "analysisId" };
  for (const key of CONTEXT_RECORDS) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (!isPlainRecord(value) || !isPlainTrafficData(value)) add(key, `Invalid context: "${key}" must be plain data.`);
    else if (idOf(value, identity[key]) === null) add(key, `Invalid context: "${key}" must carry a non-empty ${identity[key]}.`);
  }
  for (const key of CONTEXT_METADATA) {
    const value = record[key];
    if (value === undefined && !complete) continue;
    if (!isFlatTrafficMetadata(value)) add(key, `Invalid metadata: "${key}" must be a flat object of strings, numbers, booleans, or null with non-empty keys.`);
  }

  const candidateId = idOf(record.candidate, "id");
  const analysisId = idOf(record.opportunityAnalysis, "analysisId");
  const analysisCandidate = isPlainRecord(record.opportunityAnalysis) ? record.opportunityAnalysis.candidateId : undefined;
  if (candidateId !== null && typeof analysisCandidate === "string" && analysisCandidate !== candidateId) {
    add("opportunityAnalysis", "Invalid context: the Opportunity analysis belongs to a different candidate.");
  }
  const explanationCandidate = isPlainRecord(record.opportunityExplanation) ? record.opportunityExplanation.candidateId : undefined;
  if (candidateId !== null && typeof explanationCandidate === "string" && explanationCandidate !== candidateId) {
    add("opportunityExplanation", "Invalid context: the Opportunity explanation belongs to a different candidate.");
  }
  const explanationAnalysis = idOf(record.opportunityExplanation, "analysisId");
  if (analysisId !== null && explanationAnalysis !== null && explanationAnalysis !== analysisId) {
    add("opportunityExplanation", "Invalid context: the Opportunity explanation belongs to a different analysis.");
  }
  return issues;
}
