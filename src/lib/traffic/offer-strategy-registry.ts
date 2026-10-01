/**
 * Offer Strategy Signal: strategy registry.
 *
 * Strategies are metadata only: an id, a name, a family, and the structural
 * or contextual requirements of each offer dimension. No campaign type is
 * encoded here, and a strategy never classifies a product.
 *
 * The registry supports registering, enabling, disabling, and validating
 * strategies. Registration copies the strategy, so later changes to the
 * caller's object never reach the registry, and everything it returns is
 * frozen. It reads and writes nothing outside its own memory.
 */
import type { OfferStrategy } from "./offer-strategy-definitions";
import { validateOfferStrategy } from "./offer-strategy-validator";
import { freezeDeepTraffic } from "./traffic-signal-context";
import type { TrafficIssue } from "./traffic-validator";

export interface OfferStrategyEntry {
  readonly id: string;
  readonly strategy: OfferStrategy;
  readonly enabled: boolean;
}

export class OfferStrategyError extends Error {
  readonly issues: readonly TrafficIssue[];
  constructor(message: string, issues: readonly TrafficIssue[]) {
    super(message);
    this.name = "OfferStrategyError";
    this.issues = issues;
  }
}

export interface OfferStrategyRegistry {
  /** Adds a strategy. Throws OfferStrategyError for an invalid strategy or a duplicate id. */
  register(strategy: unknown): OfferStrategyEntry;
  enable(id: string): OfferStrategyEntry;
  disable(id: string): OfferStrategyEntry;
  /** What registering this strategy would be told: its own problems, and a duplicate id. Changes nothing. */
  validate(strategy: unknown): TrafficIssue[];
  get(id: string): OfferStrategyEntry | null;
  /** Sorted by id. */
  list(): OfferStrategyEntry[];
  count(): number;
}

function copyStrategy(strategy: OfferStrategy): OfferStrategy {
  return freezeDeepTraffic(JSON.parse(JSON.stringify(strategy)) as OfferStrategy);
}

export function createOfferStrategyRegistry(initial: readonly unknown[] = []): OfferStrategyRegistry {
  const strategies = new Map<string, { strategy: OfferStrategy; enabled: boolean }>();

  const entryOf = (id: string): OfferStrategyEntry => {
    const found = strategies.get(id) as { strategy: OfferStrategy; enabled: boolean };
    return freezeDeepTraffic({ id, strategy: found.strategy, enabled: found.enabled });
  };
  const mustExist = (id: string) => {
    if (!strategies.has(id)) throw new OfferStrategyError("Unknown strategy.", [{ field: "id", message: `Unknown strategy "${id}".` }]);
  };
  const setEnabled = (id: string, enabled: boolean) => {
    mustExist(id);
    (strategies.get(id) as { enabled: boolean }).enabled = enabled;
    return entryOf(id);
  };

  const registry: OfferStrategyRegistry = {
    validate(strategy) {
      const issues = validateOfferStrategy(strategy);
      const id = (strategy as { id?: unknown } | null)?.id;
      if (issues.length === 0 && typeof id === "string" && strategies.has(id)) issues.push({ field: "id", message: `Duplicate strategy "${id}": a strategy with this id is already registered.` });
      return issues;
    },
    register(strategy) {
      const issues = registry.validate(strategy);
      if (issues.length > 0) throw new OfferStrategyError("Invalid offer definition.", issues);
      const copy = copyStrategy(strategy as OfferStrategy);
      strategies.set(copy.id, { strategy: copy, enabled: copy.enabled });
      return entryOf(copy.id);
    },
    enable: (id) => setEnabled(id, true),
    disable: (id) => setEnabled(id, false),
    get: (id) => (strategies.has(id) ? entryOf(id) : null),
    list: () => [...strategies.keys()].sort().map(entryOf),
    count: () => strategies.size,
  };
  for (const strategy of initial) registry.register(strategy);
  return registry;
}
