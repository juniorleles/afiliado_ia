/**
 * Host record domain: affiliate provider registry.
 *
 * Holds provider adapters in the order they were given. A name selects the
 * adapter with that network. This module does not reach an outside system.
 */
import type { AffiliateProvider } from "./affiliate-provider";
import { createClickBankProvider } from "./providers/clickbank-provider";

export interface AffiliateProviderRegistry {
  get(network: string): AffiliateProvider | null;
  list(): readonly string[];
}

export function createAffiliateProviderRegistry(providers: readonly AffiliateProvider[] = [createClickBankProvider()]): AffiliateProviderRegistry {
  const ordered: AffiliateProvider[] = [];
  const byNetwork = new Map<string, AffiliateProvider>();
  for (const provider of providers) {
    if (byNetwork.has(provider.network)) continue;
    byNetwork.set(provider.network, provider);
    ordered.push(provider);
  }
  return {
    get: (network) => byNetwork.get(network) ?? null,
    list: () => ordered.map((provider) => provider.network),
  };
}
