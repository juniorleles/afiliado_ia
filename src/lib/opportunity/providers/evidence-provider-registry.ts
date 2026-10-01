/**
 * Evidence Provider Framework: provider registry.
 *
 * Holds the providers plugged into the framework. It checks each provider
 * against the contract when it is registered, and tracks whether it is
 * enabled. It never collects evidence and never decides which provider wins:
 * the resolver does that.
 *
 * Nothing is registered by default. The registry starts empty.
 */
import type { OpportunityIssue } from "../opportunity-validator";
import type { EvidenceKind, EvidenceProvider, EvidenceProviderEntry } from "./evidence-provider-contract";
import { validateEvidenceProvider, validateNoDuplicateProviderId } from "./evidence-provider-validator";

export class EvidenceFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: OpportunityIssue[] = [],
  ) {
    super(message);
    this.name = "EvidenceFrameworkError";
  }
}

export interface EvidenceProviderFilter {
  kind?: EvidenceKind;
  enabled?: boolean;
}

export interface EvidenceRegistry {
  /** Rejects a provider that breaks the contract or repeats a registered id. Starts as provider.enabled. */
  register(provider: EvidenceProvider): EvidenceProviderEntry;
  remove(id: string): EvidenceProviderEntry;
  enable(id: string): EvidenceProviderEntry;
  disable(id: string): EvidenceProviderEntry;
  get(id: string): EvidenceProviderEntry | null;
  /** Highest priority first, then id. */
  list(filter?: EvidenceProviderFilter): EvidenceProviderEntry[];
  count(): number;
  /** Reports contract problems without registering. */
  validate(provider: unknown): OpportunityIssue[];
}

export function createEvidenceRegistry(): EvidenceRegistry {
  const entries = new Map<string, EvidenceProviderEntry>();

  const mustGet = (id: string): EvidenceProviderEntry => {
    const entry = entries.get(id);
    if (!entry) throw new EvidenceFrameworkError(`Provider "${id}" is not registered.`, [{ field: "id", message: `Provider "${id}" is not registered.` }]);
    return entry;
  };
  const setEnabled = (id: string, enabled: boolean): EvidenceProviderEntry => {
    const next: EvidenceProviderEntry = { ...mustGet(id), enabled };
    entries.set(id, next);
    return next;
  };

  return {
    register(provider) {
      let issues = validateEvidenceProvider(provider);
      if (issues.length === 0) issues = validateNoDuplicateProviderId(entries.keys(), provider.id);
      if (issues.length > 0) throw new EvidenceFrameworkError("Provider is invalid.", issues);
      const entry: EvidenceProviderEntry = { id: provider.id, provider, enabled: provider.enabled };
      entries.set(entry.id, entry);
      return entry;
    },
    remove(id) {
      const entry = mustGet(id);
      entries.delete(id);
      return entry;
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => entries.get(id) ?? null,
    list(filter = {}) {
      return [...entries.values()]
        .filter(
          (e) =>
            (filter.kind === undefined || e.provider.kind === filter.kind) &&
            (filter.enabled === undefined || e.enabled === filter.enabled),
        )
        .sort((a, b) => b.provider.priority - a.provider.priority || a.id.localeCompare(b.id));
    },
    count: () => entries.size,
    validate: (provider) => validateEvidenceProvider(provider),
  };
}
