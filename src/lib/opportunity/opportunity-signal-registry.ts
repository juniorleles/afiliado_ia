/**
 * Opportunity Signal Framework: signal registry.
 *
 * Holds the signal modules plugged into the engine. It checks each module
 * against the contract when it is registered, and tracks whether it is enabled.
 * It never runs a signal and never resolves dependencies: those are checked
 * and ordered by the pipeline.
 *
 * Not to be confused with OpportunitySignalRegistry (opportunity-registry.ts),
 * the contract for signal definitions. This registry holds executable modules.
 */
import type { OpportunitySignalCategory } from "./opportunity-types";
import type { OpportunityIssue } from "./opportunity-validator";
import type { OpportunitySignalModule, SignalEntry } from "./opportunity-signal-contract";
import { validateNoDuplicateSignalId, validateSignalModule } from "./opportunity-signal-validator";

export class SignalFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: OpportunityIssue[] = [],
  ) {
    super(message);
    this.name = "SignalFrameworkError";
  }
}

export interface SignalFilter {
  category?: OpportunitySignalCategory;
  enabled?: boolean;
}

export interface SignalRegistry {
  /** Rejects a module that breaks the contract or repeats a registered id. Starts as module.enabled. */
  register(module: OpportunitySignalModule): SignalEntry;
  remove(id: string): SignalEntry;
  enable(id: string): SignalEntry;
  disable(id: string): SignalEntry;
  get(id: string): SignalEntry | null;
  /** Highest priority first, then id. */
  list(filter?: SignalFilter): SignalEntry[];
  count(): number;
  /** Reports contract problems without registering. */
  validate(module: unknown): OpportunityIssue[];
}

export function createSignalRegistry(): SignalRegistry {
  const entries = new Map<string, SignalEntry>();

  const mustGet = (id: string): SignalEntry => {
    const entry = entries.get(id);
    if (!entry) throw new SignalFrameworkError(`Signal "${id}" is not registered.`, [{ field: "id", message: `Signal "${id}" is not registered.` }]);
    return entry;
  };
  const setEnabled = (id: string, enabled: boolean): SignalEntry => {
    const next: SignalEntry = { ...mustGet(id), enabled };
    entries.set(id, next);
    return next;
  };

  return {
    register(module) {
      let issues = validateSignalModule(module);
      if (issues.length === 0) issues = validateNoDuplicateSignalId(entries.keys(), module.id);
      if (issues.length > 0) throw new SignalFrameworkError("Signal is invalid.", issues);
      const entry: SignalEntry = { id: module.id, module, enabled: module.enabled };
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
            (filter.category === undefined || e.module.category === filter.category) &&
            (filter.enabled === undefined || e.enabled === filter.enabled),
        )
        .sort((a, b) => b.module.priority - a.module.priority || a.id.localeCompare(b.id));
    },
    count: () => entries.size,
    validate: (module) => validateSignalModule(module),
  };
}
