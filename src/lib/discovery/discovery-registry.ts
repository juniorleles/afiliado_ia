/**
 * Discovery Foundation: source registry.
 *
 * In-memory registry of source descriptors. It performs no I/O and no
 * persistence, and it registers no concrete providers itself; later steps
 * register them. Future plugins register through registerPlugin.
 */
import {
  filterSources,
  sortSourcesByPriority,
  statusImpliesEnabled,
  validateDiscoverySource,
  type DiscoverySourceAdapter,
  type DiscoverySourceFilter,
  type DiscoverySourceIssue,
} from "./discovery-sources";
import type { DiscoverySource } from "./discovery-types";

export class DiscoverySourceRegistryError extends Error {
  constructor(
    message: string,
    readonly issues: DiscoverySourceIssue[] = [],
  ) {
    super(message);
    this.name = "DiscoverySourceRegistryError";
  }
}

export interface DiscoveryRegistry {
  /** Validates and stores a source. Rejects invalid sources and duplicate ids. */
  register(source: DiscoverySource): DiscoverySource;
  /** Registers a plugin adapter; its source must use discoveryType PLUGIN. */
  registerPlugin(adapter: DiscoverySourceAdapter): DiscoverySource;
  enable(id: string): DiscoverySource;
  disable(id: string): DiscoverySource;
  get(id: string): DiscoverySource | null;
  getAdapter(id: string): DiscoverySourceAdapter | null;
  /** Sources ordered by priority, highest first, optionally filtered. */
  list(filter?: DiscoverySourceFilter): DiscoverySource[];
  validate(source: unknown): DiscoverySourceIssue[];
}

export function createDiscoveryRegistry(): DiscoveryRegistry {
  const sources = new Map<string, DiscoverySource>();
  const adapters = new Map<string, DiscoverySourceAdapter>();

  const mustGet = (id: string): DiscoverySource => {
    const source = sources.get(id);
    if (!source) throw new DiscoverySourceRegistryError(`Source "${id}" is not registered.`);
    return source;
  };

  const register = (source: DiscoverySource): DiscoverySource => {
    const issues = validateDiscoverySource(source);
    if (issues.length > 0) {
      throw new DiscoverySourceRegistryError("Source is invalid.", issues);
    }
    if (sources.has(source.id)) {
      throw new DiscoverySourceRegistryError(`Source "${source.id}" is already registered.`);
    }
    const stored = { ...source };
    sources.set(stored.id, stored);
    return { ...stored };
  };

  return {
    register,
    registerPlugin(adapter) {
      if (adapter.source.discoveryType !== "PLUGIN") {
        throw new DiscoverySourceRegistryError("A plugin source must use discoveryType PLUGIN.", [
          { field: "discoveryType", message: "Plugin sources must use discoveryType PLUGIN." },
        ]);
      }
      const stored = register(adapter.source);
      adapters.set(stored.id, adapter);
      return stored;
    },
    enable(id) {
      const source = mustGet(id);
      if (source.status === "DEPRECATED") {
        throw new DiscoverySourceRegistryError(`Source "${id}" is deprecated and cannot be enabled.`);
      }
      const status = statusImpliesEnabled(source.status) ? source.status : "ACTIVE";
      const updated = { ...source, enabled: true, status } as DiscoverySource;
      sources.set(id, updated);
      return { ...updated };
    },
    disable(id) {
      const source = mustGet(id);
      const status = source.status === "DEPRECATED" ? "DEPRECATED" : "DISABLED";
      const updated = { ...source, enabled: false, status } as DiscoverySource;
      sources.set(id, updated);
      return { ...updated };
    },
    get(id) {
      const source = sources.get(id);
      return source ? { ...source } : null;
    },
    getAdapter(id) {
      return adapters.get(id) ?? null;
    },
    list(filter) {
      return sortSourcesByPriority(filterSources([...sources.values()], filter)).map((source) => ({ ...source }));
    },
    validate: validateDiscoverySource,
  };
}
