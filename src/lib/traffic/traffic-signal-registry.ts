/**
 * Traffic Signal Framework: signal registry.
 *
 * Holds the signal modules plugged into the engine. It checks each module
 * against the contract when it is registered, and tracks whether it is enabled.
 * It never runs a signal and never resolves dependencies: those are checked
 * and ordered by the pipeline.
 *
 * Not to be confused with TrafficSignalRegistry (traffic-registry.ts), the
 * contract for signal definitions. This registry holds executable modules.
 */
import type { TrafficIssue } from "./traffic-validator";
import type { TrafficSignalCategory } from "./traffic-types";
import type { TrafficSignalEntry, TrafficSignalModule } from "./traffic-signal-contract";
import { validateNoDuplicateTrafficSignalId, validateTrafficSignalModule } from "./traffic-signal-validator";

export class TrafficFrameworkError extends Error {
  constructor(
    message: string,
    readonly issues: TrafficIssue[] = [],
  ) {
    super(message);
    this.name = "TrafficFrameworkError";
  }
}

export interface TrafficSignalFilterOptions {
  category?: TrafficSignalCategory;
  enabled?: boolean;
}

export interface TrafficModuleRegistry {
  /** Rejects a module that breaks the contract or repeats a registered id. Starts as module.enabled. */
  register(module: TrafficSignalModule): TrafficSignalEntry;
  remove(id: string): TrafficSignalEntry;
  enable(id: string): TrafficSignalEntry;
  disable(id: string): TrafficSignalEntry;
  get(id: string): TrafficSignalEntry | null;
  /** Highest priority first, then id. */
  list(filter?: TrafficSignalFilterOptions): TrafficSignalEntry[];
  count(): number;
  /** Reports contract problems without registering. */
  validate(module: unknown): TrafficIssue[];
}

export function createTrafficModuleRegistry(): TrafficModuleRegistry {
  const entries = new Map<string, TrafficSignalEntry>();

  const mustGet = (id: string): TrafficSignalEntry => {
    const entry = entries.get(id);
    if (!entry) throw new TrafficFrameworkError(`Signal "${id}" is not registered.`, [{ field: "id", message: `Signal "${id}" is not registered.` }]);
    return entry;
  };
  const setEnabled = (id: string, enabled: boolean): TrafficSignalEntry => {
    const next: TrafficSignalEntry = { ...mustGet(id), enabled };
    entries.set(id, next);
    return next;
  };

  return {
    register(module) {
      let issues = validateTrafficSignalModule(module);
      if (issues.length === 0) issues = validateNoDuplicateTrafficSignalId(entries.keys(), module.id);
      if (issues.length > 0) throw new TrafficFrameworkError("Signal is invalid.", issues);
      const entry: TrafficSignalEntry = { id: module.id, module, enabled: module.enabled };
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
    validate: (module) => validateTrafficSignalModule(module),
  };
}
