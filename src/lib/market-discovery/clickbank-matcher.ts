/**
 * Host record domain: observed product matcher.
 *
 * Finds supplied listing records whose product name, and vendor when the
 * observation has one, agree with the observed product. More than one
 * agreement is ambiguous. A listing figure is not a reason to keep one
 * record. This module does not change what it is given.
 */
import type { ClickBankIssue, MarketplaceRecord, MatchConfidence, MatchMethod, ObservedProduct } from "./clickbank-types";

export interface ClickBankMatch {
  issues: ClickBankIssue[];
  record: MarketplaceRecord | null;
  matchMethod: MatchMethod;
  matchConfidence: MatchConfidence;
}

export interface ClickBankMatcher {
  match(observed: ObservedProduct, records: readonly MarketplaceRecord[]): ClickBankMatch;
}

function matchKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function createClickBankMatcher(): ClickBankMatcher {
  return {
    match(observed, records) {
      const name = matchKey(observed.productName);
      const vendor = observed.vendor === null || observed.vendor.trim() === "" ? null : matchKey(observed.vendor);
      const method: MatchMethod = vendor === null ? "EXACT_PRODUCT" : "EXACT_PRODUCT_AND_VENDOR";
      const found = records.filter((record) => {
        if (matchKey(record.productName) !== name) return false;
        if (vendor === null) return true;
        return record.vendor !== null && matchKey(record.vendor) === vendor;
      });
      if (found.length > 1) {
        return {
          issues: [{ field: "marketplaceRecords", message: "Ambiguous Match: more than one listing record agrees with the observed product." }],
          record: null,
          matchMethod: "UNMATCHED",
          matchConfidence: "UNMATCHED",
        };
      }
      if (found.length === 0) {
        return { issues: [], record: null, matchMethod: "UNMATCHED", matchConfidence: "UNMATCHED" };
      }
      return {
        issues: [],
        record: found[0] ?? null,
        matchMethod: method,
        matchConfidence: vendor === null ? "NAME_ONLY" : "CONFIRMED",
      };
    },
  };
}
