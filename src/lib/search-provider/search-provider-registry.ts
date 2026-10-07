/**
 * Host record domain: search provider registry.
 *
 * Holds provider adapters in the order they were registered. A repeated name
 * is refused and the list is left unchanged. This module does not reach an
 * outside system.
 */
import { createMockSearchProvider } from "./providers/mock-search-provider";
import type { SearchProvider } from "./search-provider";
import { createSearchProviderValidator, type SearchProviderValidator } from "./search-provider-validator";
import { freezeDeepSearchProvider, type ProviderConfiguration, type SearchIssue, type SearchProviderStatus } from "./search-provider-types";

export interface SearchProviderRegistry {
  register(provider: unknown): SearchIssue[];
  get(name: string): SearchProvider | null;
  list(): readonly string[];
  configuration(): ProviderConfiguration;
}

export interface SearchProviderRegistryResult {
  status: SearchProviderStatus;
  issues: SearchIssue[];
  registry: SearchProviderRegistry | null;
  configuration: ProviderConfiguration | null;
}

function configurationOf(names: readonly string[]): ProviderConfiguration {
  return freezeDeepSearchProvider({
    providers: [...names],
    origin: "REGISTERED",
    provenance: "DIRECT_SOURCE",
  });
}

export function createSearchProviderRegistry(providers: readonly unknown[] = [createMockSearchProvider()], validator: SearchProviderValidator = createSearchProviderValidator()): SearchProviderRegistryResult {
  const issues: SearchIssue[] = [];
  const seen = new Set<string>();
  const accepted: SearchProvider[] = [];
  for (const provider of providers) {
    const contract = validator.validateContract(provider);
    if (contract.length > 0) {
      issues.push(...contract);
      continue;
    }
    const name = (provider as SearchProvider).provider;
    if (seen.has(name)) {
      issues.push({ field: "provider", message: `Duplicate Provider: "${name}" is already registered.` });
      continue;
    }
    seen.add(name);
    accepted.push(provider as SearchProvider);
  }
  if (issues.length > 0) return { status: "REJECTED", issues, registry: null, configuration: null };

  const ordered = [...accepted];
  const byName = new Map(ordered.map((provider) => [provider.provider, provider]));

  const registry: SearchProviderRegistry = {
    register(provider) {
      const contract = validator.validateContract(provider);
      if (contract.length > 0) return contract;
      const name = (provider as SearchProvider).provider;
      if (byName.has(name)) return [{ field: "provider", message: `Duplicate Provider: "${name}" is already registered.` }];
      byName.set(name, provider as SearchProvider);
      ordered.push(provider as SearchProvider);
      return [];
    },
    get: (name) => byName.get(name) ?? null,
    list: () => ordered.map((provider) => provider.provider),
    configuration: () => configurationOf(ordered.map((provider) => provider.provider)),
  };

  return { status: "OK", issues: [], registry, configuration: registry.configuration() };
}
