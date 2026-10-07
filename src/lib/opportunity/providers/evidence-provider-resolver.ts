/**
 * Evidence Provider Framework: resolver.
 *
 * The one place that works with providers as a set. It registers, enables,
 * and disables them, picks the ones that apply to a context, validates them,
 * collects their evidence, and merges what was collected.
 *
 * It has no business logic. It never reads a platform module, never opens a
 * payload, and never combines two payloads: when two providers supply the same
 * kind, the higher priority wins whole and the other is recorded as
 * superseded. Absence is never filled in. It scores nothing, calls no AI, and
 * makes no HTTP request.
 *
 * Nothing is cached. Every call asks the providers again. Providers run one
 * after another, highest priority first, so a run is repeatable; one that
 * throws, fails validation, or returns something malformed becomes a FAILED
 * result and does not stop the others. Each payload is copied and frozen
 * before it leaves, so a signal can read it but cannot change it.
 */
import type { OpportunityIssue } from "../opportunity-validator";
import type { OpportunityMetadata } from "../opportunity-types";
import {
  EVIDENCE_KINDS,
  type EvidenceCollectionResult,
  type EvidenceKind,
  type EvidencePayloads,
  type EvidenceProvider,
  type EvidenceProviderEntry,
} from "./evidence-provider-contract";
import { cloneFrozenData, createEvidenceContext, isDeepFrozen, type EvidenceContext } from "./evidence-provider-context";
import { EvidenceFrameworkError, createEvidenceRegistry, type EvidenceRegistry } from "./evidence-provider-registry";
import { validateEvidenceContext, validateEvidenceOutput, validateEvidenceProvider } from "./evidence-provider-validator";

export type EvidenceClock = () => number;

export interface EvidenceResolverOptions {
  /** Defaults to a new, empty registry. */
  registry?: EvidenceRegistry;
  /** Milliseconds clock for executionTime. */
  now?: EvidenceClock;
  /**
   * Told about every collection, after it ran, with its results. It only
   * listens: it cannot change the results, and if it throws the collection
   * is unaffected.
   */
  observer?: (results: readonly EvidenceCollectionResult[]) => void;
}

/** One piece of merged evidence: the payload and where it came from. */
export interface EvidenceItem<K extends EvidenceKind = EvidenceKind> {
  readonly kind: K;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly priority: number;
  readonly payload: Readonly<EvidencePayloads[K]>;
  readonly metadata: Readonly<OpportunityMetadata>;
  readonly warnings: readonly string[];
}

export interface SupersededEvidence {
  kind: EvidenceKind;
  providerId: string;
  supersededBy: string;
}

export interface FailedEvidence {
  providerId: string;
  kind: EvidenceKind;
  errors: string[];
}

/** What the resolver hands to signals. At most one item per kind. */
export interface MergedEvidence {
  items: { readonly [K in EvidenceKind]?: EvidenceItem<K> };
  /** Kinds with an item, in the framework's kind order. */
  collectedKinds: EvidenceKind[];
  /** Kinds with no item. They stay absent. */
  missingKinds: EvidenceKind[];
  superseded: SupersededEvidence[];
  failed: FailedEvidence[];
  warnings: string[];
  /** Flat. Arrays are comma-joined. */
  metadata: OpportunityMetadata;
}

export interface EvidenceReport {
  results: EvidenceCollectionResult[];
  merged: MergedEvidence;
}

/** The enabled providers for a context, and the enabled ones that do not apply. */
export interface EvidenceResolution {
  /** Run order: highest priority first, then id. */
  providers: EvidenceProviderEntry[];
  unsupported: Array<{ entry: EvidenceProviderEntry; /** Set when supports() threw. */ error: string | null }>;
}

export interface EvidenceResolver {
  readonly registry: EvidenceRegistry;
  registerProvider(provider: EvidenceProvider): EvidenceProviderEntry;
  enableProvider(id: string): EvidenceProviderEntry;
  disableProvider(id: string): EvidenceProviderEntry;
  /** Throws EvidenceFrameworkError when the context is invalid. */
  resolveProviders(context: EvidenceContext, filter?: { kind?: EvidenceKind }): EvidenceResolution;
  /**
   * Reports problems with the registered providers: contract breaks, and, when
   * a context is given, an invalid context and each applicable provider's own
   * validate() problems. Changes nothing.
   */
  validateProviders(context?: EvidenceContext): OpportunityIssue[];
  /** Throws EvidenceFrameworkError when the context is invalid. */
  collectEvidence(context: EvidenceContext, filter?: { kind?: EvidenceKind }): Promise<EvidenceCollectionResult[]>;
  mergeEvidence(results: readonly EvidenceCollectionResult[]): MergedEvidence;
  /** collectEvidence, then mergeEvidence. */
  run(context: EvidenceContext, filter?: { kind?: EvidenceKind }): Promise<EvidenceReport>;
}

const defaultClock: EvidenceClock = () => performance.now();

function freezeResult(result: EvidenceCollectionResult): EvidenceCollectionResult {
  Object.freeze(result.metadata);
  Object.freeze(result.warnings);
  Object.freeze(result.errors);
  return Object.freeze(result);
}

const byRank = (a: { priority: number; providerId: string }, b: { priority: number; providerId: string }) =>
  b.priority - a.priority || a.providerId.localeCompare(b.providerId);

/**
 * Merges collection results into at most one item per kind. Only COLLECTED
 * results contribute. Among results of one kind the highest priority wins
 * whole, then the lowest id; the others are listed as superseded. Payloads are
 * never opened or combined. Throws when a provider id appears twice.
 */
export function mergeEvidence(results: readonly EvidenceCollectionResult[]): MergedEvidence {
  const ids = new Set<string>();
  for (const result of results) {
    if (ids.has(result.providerId)) {
      throw new EvidenceFrameworkError(`Provider "${result.providerId}" appears more than once in the results.`, [
        { field: "providerId", message: `Provider "${result.providerId}" appears more than once in the results.` },
      ]);
    }
    ids.add(result.providerId);
  }

  const ordered = [...results].sort(byRank);
  const items: Partial<Record<EvidenceKind, EvidenceItem>> = {};
  const superseded: SupersededEvidence[] = [];
  const failed: FailedEvidence[] = [];
  const warnings: string[] = [];
  let emptyCount = 0;
  let skippedCount = 0;

  for (const result of ordered) {
    if (result.status === "FAILED") {
      failed.push({ providerId: result.providerId, kind: result.kind, errors: [...result.errors] });
      warnings.push(`${result.providerId}: collection failed, ${result.errors.join("; ")}`);
    } else if (result.status === "EMPTY") {
      emptyCount += 1;
    } else if (result.status === "SKIPPED") {
      skippedCount += 1;
    } else if (result.status === "COLLECTED") {
      const winner = items[result.kind];
      if (winner) {
        superseded.push({ kind: result.kind, providerId: result.providerId, supersededBy: winner.providerId });
        warnings.push(`${result.kind}: ${result.providerId} was superseded by ${winner.providerId}.`);
        continue;
      }
      items[result.kind] = Object.freeze({
        kind: result.kind,
        providerId: result.providerId,
        providerVersion: result.providerVersion,
        priority: result.priority,
        payload: result.payload as EvidenceItem["payload"],
        metadata: result.metadata,
        warnings: result.warnings,
      });
      for (const warning of result.warnings) warnings.push(`${result.providerId}: ${warning}`);
    }
  }

  const collectedKinds = EVIDENCE_KINDS.filter((kind) => items[kind] !== undefined);
  const missingKinds = EVIDENCE_KINDS.filter((kind) => items[kind] === undefined);
  const metadata: OpportunityMetadata = {
    collectedKinds: collectedKinds.join(","),
    missingKinds: missingKinds.join(","),
    collectedCount: collectedKinds.length,
    missingCount: missingKinds.length,
    emptyCount,
    failedCount: failed.length,
    skippedCount,
    supersededCount: superseded.length,
  };
  for (const kind of collectedKinds) {
    metadata[`provider.${kind}`] = items[kind]!.providerId;
    metadata[`version.${kind}`] = items[kind]!.providerVersion;
  }

  Object.freeze(items);
  for (const list of [collectedKinds, missingKinds, superseded, failed, warnings]) Object.freeze(list);
  return Object.freeze({ items, collectedKinds, missingKinds, superseded, failed, warnings, metadata: Object.freeze(metadata) }) as MergedEvidence;
}

/** The merged evidence of one kind, or null when it is absent. */
export function evidenceOf<K extends EvidenceKind>(merged: MergedEvidence, kind: K): EvidenceItem<K> | null {
  return (merged.items[kind] as EvidenceItem<K> | undefined) ?? null;
}

export function createEvidenceResolver(options: EvidenceResolverOptions = {}): EvidenceResolver {
  const registry = options.registry ?? createEvidenceRegistry();
  const now = options.now ?? defaultClock;

  /** Rejects an invalid context. Hands providers a frozen copy unless the context already is frozen. */
  const prepare = (context: unknown): EvidenceContext => {
    const issues = validateEvidenceContext(context);
    if (issues.length > 0) throw new EvidenceFrameworkError("Evidence context is invalid.", issues);
    return isDeepFrozen(context) ? (context as EvidenceContext) : createEvidenceContext(context as EvidenceContext);
  };

  const plan = (context: EvidenceContext, filter: { kind?: EvidenceKind } = {}) => {
    const providers: EvidenceProviderEntry[] = [];
    const unsupported: EvidenceResolution["unsupported"] = [];
    for (const entry of registry.list({ enabled: true, kind: filter.kind })) {
      try {
        if (entry.provider.supports(context)) providers.push(entry);
        else unsupported.push({ entry, error: null });
      } catch (error) {
        unsupported.push({ entry, error: error instanceof Error ? error.message : "supports() threw an error." });
      }
    }
    return { providers, unsupported };
  };

  const resultFor = (
    provider: EvidenceProvider,
    status: EvidenceCollectionResult["status"],
    start: number,
    parts: Partial<Pick<EvidenceCollectionResult, "payload" | "metadata" | "warnings" | "errors">> = {},
  ): EvidenceCollectionResult =>
    freezeResult({
      providerId: provider.id,
      providerVersion: provider.version,
      kind: provider.kind,
      priority: provider.priority,
      status,
      payload: parts.payload ?? null,
      metadata: { ...(parts.metadata ?? {}) },
      warnings: [...(parts.warnings ?? [])],
      errors: [...(parts.errors ?? [])],
      executionTime: Math.max(0, now() - start),
    });

  const execute = async (provider: EvidenceProvider, context: EvidenceContext): Promise<EvidenceCollectionResult> => {
    const start = now();
    const failed = (errors: string[]) => resultFor(provider, "FAILED", start, { errors });
    try {
      const problems = provider.validate(context);
      if (problems.length > 0) return failed(problems.map((p) => `${p.field}: ${p.message}`));
      const output = await provider.collect(context);
      const issues = validateEvidenceOutput(output);
      if (issues.length > 0) return failed(issues.map((i) => `Invalid provider output, ${i.field}: ${i.message}`));
      const payload = output.payload === null ? null : cloneFrozenData(output.payload);
      return resultFor(provider, payload === null ? "EMPTY" : "COLLECTED", start, {
        payload,
        metadata: output.metadata,
        warnings: output.warnings,
      });
    } catch (error) {
      return failed([error instanceof Error ? error.message : "Provider threw an error."]);
    }
  };

  const collectEvidence = async (context: EvidenceContext, filter: { kind?: EvidenceKind } = {}) => {
    const prepared = prepare(context);
    const { providers, unsupported } = plan(prepared, filter);
    const results: EvidenceCollectionResult[] = [];
    for (const { entry, error } of unsupported) {
      const start = now();
      results.push(
        error === null
          ? resultFor(entry.provider, "SKIPPED", start, { warnings: ["Provider does not support this context."] })
          : resultFor(entry.provider, "FAILED", start, { errors: [error] }),
      );
    }
    for (const entry of providers) results.push(await execute(entry.provider, prepared));
    const sorted = results.sort(byRank);
    try {
      options.observer?.(sorted);
    } catch {
      // An observer never affects a collection.
    }
    return sorted;
  };

  return {
    registry,
    registerProvider: (provider) => registry.register(provider),
    enableProvider: (id) => registry.enable(id),
    disableProvider: (id) => registry.disable(id),

    resolveProviders(context, filter) {
      return plan(prepare(context), filter);
    },

    validateProviders(context) {
      const issues: OpportunityIssue[] = [];
      for (const entry of registry.list()) {
        for (const issue of validateEvidenceProvider(entry.provider)) {
          issues.push({ field: `${entry.id}.${issue.field}`, message: issue.message });
        }
      }
      if (context === undefined) return issues;
      const contextIssues = validateEvidenceContext(context);
      if (contextIssues.length > 0) return [...issues, ...contextIssues];
      const prepared = prepare(context);
      for (const entry of plan(prepared).providers) {
        try {
          for (const issue of entry.provider.validate(prepared)) issues.push({ field: `${entry.id}.${issue.field}`, message: issue.message });
        } catch (error) {
          issues.push({ field: entry.id, message: error instanceof Error ? error.message : "validate() threw an error." });
        }
      }
      return issues;
    },

    collectEvidence,
    mergeEvidence,

    async run(context, filter) {
      const results = await collectEvidence(context, filter);
      return { results, merged: mergeEvidence(results) };
    },
  };
}
