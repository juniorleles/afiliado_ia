/**
 * Evidence Provider Framework: shared context.
 *
 * One immutable context is handed to every provider in a run. It is created
 * empty: nothing populates the candidate, the resolved product data, or the
 * configuration yet. `extensions` is the room left for future inputs.
 *
 * Everything in it is plain data: strings, finite numbers, booleans, null,
 * lists, and plain objects. That is what makes it safe to share, to freeze,
 * and to copy. The same rule applies to the evidence a provider returns.
 *
 * The only outside reference is a type-only import of the Discovery candidate.
 */
import type { DiscoveryCandidate } from "../../discovery/discovery-types";
import type { OpportunityMetadata } from "../opportunity-types";

export interface EvidenceContext {
  /** The Discovery candidate under analysis, or null when none is supplied. */
  readonly candidate: Readonly<DiscoveryCandidate> | null;
  /** Product data that was already resolved for this run. Plain data, possibly nested. */
  readonly resolvedProductData: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<OpportunityMetadata>;
  readonly runtime: Readonly<OpportunityMetadata>;
  readonly configuration: Readonly<OpportunityMetadata>;
  /** Reserved for future inputs. */
  readonly extensions: Readonly<OpportunityMetadata>;
}

export type EvidenceContextInit = Partial<{
  candidate: DiscoveryCandidate | null;
  resolvedProductData: Record<string, unknown>;
  metadata: OpportunityMetadata;
  runtime: OpportunityMetadata;
  configuration: OpportunityMetadata;
  extensions: OpportunityMetadata;
}>;

const MAX_DEPTH = 64;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Describes the first reason a value is not plain data, or returns null when
 * it is plain data. An object property may be undefined (it counts as absent);
 * nothing else may be.
 */
export function describeNonPlainData(value: unknown, path = "value"): string | null {
  const stack = new Set<object>();
  const visit = (current: unknown, where: string, depth: number): string | null => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return null;
    if (typeof current === "number") return Number.isFinite(current) ? null : `${where} is not a finite number.`;
    if (typeof current === "undefined") return `${where} is undefined.`;
    if (typeof current !== "object") return `${where} is a ${typeof current}, which is not plain data.`;
    if (depth > MAX_DEPTH) return `${where} is nested deeper than ${MAX_DEPTH} levels.`;
    if (stack.has(current)) return `${where} contains a cycle.`;
    const isList = Array.isArray(current);
    if (!isList && !isPlainObject(current)) return `${where} is not a plain object or list.`;
    stack.add(current);
    try {
      if (isList) {
        for (let i = 0; i < (current as unknown[]).length; i += 1) {
          const problem = visit((current as unknown[])[i], `${where}[${i}]`, depth + 1);
          if (problem) return problem;
        }
      } else {
        for (const [key, inner] of Object.entries(current as Record<string, unknown>)) {
          if (inner === undefined) continue;
          const problem = visit(inner, `${where}.${key}`, depth + 1);
          if (problem) return problem;
        }
      }
      return null;
    } finally {
      stack.delete(current);
    }
  };
  return visit(value, path, 0);
}

/**
 * Copies the plain containers in a value and freezes the copies. Anything that
 * is not a plain container is kept by reference and is never frozen, so a
 * caller's own objects are never touched. Properties that are undefined are
 * left out. Cycles are preserved rather than followed forever.
 */
export function cloneFrozenData<T>(value: T): T {
  const copies = new WeakMap<object, unknown>();
  const copy = (current: unknown): unknown => {
    if (typeof current !== "object" || current === null) return current;
    if (copies.has(current)) return copies.get(current);
    if (Array.isArray(current)) {
      const list: unknown[] = [];
      copies.set(current, list);
      for (const item of current) list.push(copy(item));
      return Object.freeze(list);
    }
    if (!isPlainObject(current)) return current;
    const record: Record<string, unknown> = {};
    copies.set(current, record);
    for (const [key, inner] of Object.entries(current)) {
      if (inner !== undefined) record[key] = copy(inner);
    }
    return Object.freeze(record);
  };
  return copy(value) as T;
}

/** True when the value and every object inside it is frozen. Cycles are handled. */
export function isDeepFrozen(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (current: unknown): boolean => {
    if (typeof current !== "object" || current === null) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    if (!Object.isFrozen(current)) return false;
    return Object.values(current).every(visit);
  };
  return visit(value);
}

/**
 * Builds a frozen context from copies of the inputs, so later changes to the
 * caller's objects never reach a provider. Every field defaults to empty.
 * It does not validate: use validateEvidenceContext for that.
 */
export function createEvidenceContext(init: EvidenceContextInit = {}): EvidenceContext {
  return Object.freeze({
    candidate: init.candidate ? cloneFrozenData(init.candidate) : null,
    resolvedProductData: cloneFrozenData(init.resolvedProductData ?? {}),
    metadata: cloneFrozenData(init.metadata ?? {}),
    runtime: cloneFrozenData(init.runtime ?? {}),
    configuration: cloneFrozenData(init.configuration ?? {}),
    extensions: cloneFrozenData(init.extensions ?? {}),
  });
}
