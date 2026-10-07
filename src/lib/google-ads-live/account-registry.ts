/**
 * Host record domain: account registry.
 *
 * Groups accounts that were already read. Accessible accounts stay in the
 * supplied order. A child already present is listed once in the account list.
 */
import type { GoogleAuthAccount, GoogleAuthRegistry } from "./authentication-session";

export function buildAccountRegistry(registryId: string, accessible: readonly GoogleAuthAccount[], children: readonly GoogleAuthAccount[], accessibleCustomerIds: readonly string[]): GoogleAuthRegistry {
  const accounts: GoogleAuthAccount[] = [];
  const seen = new Set<string>();
  for (const account of accessible) {
    if (seen.has(account.customerId)) continue;
    seen.add(account.customerId);
    accounts.push({ ...account });
  }
  for (const account of children) {
    if (seen.has(account.customerId)) continue;
    seen.add(account.customerId);
    accounts.push({ ...account });
  }
  const childAccounts: GoogleAuthAccount[] = [];
  const seenChildren = new Set<string>();
  for (const account of children) {
    if (seenChildren.has(account.customerId)) continue;
    seenChildren.add(account.customerId);
    childAccounts.push({ ...account });
  }
  return {
    registryId,
    accounts,
    managerAccounts: accounts.filter((account) => account.manager).map((account) => ({ ...account })),
    childAccounts,
    accessibleCustomerIds: [...accessibleCustomerIds],
  };
}
