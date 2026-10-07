/**
 * Host record domain: affiliate provider adapter.
 *
 * A provider copies listing fields for one network from records it is given.
 * The registry holds adapters. This module does not reach an outside system.
 */
import type { AffiliateIssue, ObservedProduct, ResolutionEvidence, ResolvedAffiliateProduct } from "./affiliate-provider-types";

export interface AffiliateProviderResult {
  issues: readonly AffiliateIssue[];
  product: ResolvedAffiliateProduct | null;
  evidence: ResolutionEvidence | null;
}

export interface AffiliateProvider {
  readonly network: string;
  resolve(observed: ObservedProduct, records: readonly unknown[]): AffiliateProviderResult;
}
