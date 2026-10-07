/**
 * Host record domain: ClickBank provider adapter.
 *
 * Copies one supplied ClickBank listing when its product name, and its vendor
 * when the observation has one, agrees with the observed product. More than
 * one agreement is ambiguous. A listing figure is not a reason to keep one
 * record. This module does not reach an outside system.
 */
import type { AffiliateProvider, AffiliateProviderResult } from "../affiliate-provider";
import { isFlatResolutionMetadata, createAffiliateProviderValidator, type AffiliateValidator } from "../affiliate-provider-validator";
import type { AffiliateRecord, MatchMethod, ObservedProduct, ResolutionEvidence, ResolutionMetadata, ResolvedAffiliateProduct } from "../affiliate-provider-types";

export const CLICKBANK_NETWORK = "CLICKBANK";

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function matchKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function copyRecord(source: Record<string, unknown>): AffiliateRecord {
  const metadata = isFlatResolutionMetadata(source.marketplaceMetadata) ? source.marketplaceMetadata : {};
  const resources = Array.isArray(source.affiliateResources) ? source.affiliateResources.filter((item): item is string => typeof item === "string") : [];
  return {
    productName: textOrNull(source.productName) ?? "",
    vendor: textOrNull(source.vendor),
    category: textOrNull(source.category),
    affiliateUrl: textOrNull(source.affiliateUrl),
    commission: textOrNull(source.commission),
    gravity: typeof source.gravity === "number" ? source.gravity : null,
    marketplaceMetadata: { ...metadata } as ResolutionMetadata,
    affiliateResources: [...resources],
  };
}

function blankProduct(observed: ObservedProduct, network: string): ResolvedAffiliateProduct {
  return {
    observedProductName: observed.productName,
    observedVendor: observed.vendor,
    network,
    vendor: null,
    productName: null,
    category: null,
    affiliateUrl: null,
    commission: null,
    gravity: null,
    marketplaceMetadata: {},
    affiliateResources: [],
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

function matchedProduct(observed: ObservedProduct, network: string, record: AffiliateRecord): ResolvedAffiliateProduct {
  return {
    observedProductName: observed.productName,
    observedVendor: observed.vendor,
    network,
    vendor: record.vendor,
    productName: record.productName,
    category: record.category,
    affiliateUrl: record.affiliateUrl,
    commission: record.commission,
    gravity: record.gravity,
    marketplaceMetadata: { ...record.marketplaceMetadata },
    affiliateResources: [...record.affiliateResources],
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

function evidenceFor(network: string, record: AffiliateRecord | null, method: MatchMethod): ResolutionEvidence {
  return {
    network,
    matchedProductName: record?.productName ?? null,
    matchedVendor: record?.vendor ?? null,
    matchMethod: method,
    marketplaceSource: network,
    evidenceMetadata: record === null ? {} : { ...record.marketplaceMetadata },
    origin: "RESOLVED",
    provenance: "DIRECT_SOURCE",
  };
}

export function createClickBankProvider(validator: AffiliateValidator = createAffiliateProviderValidator()): AffiliateProvider {
  return {
    network: CLICKBANK_NETWORK,
    resolve(observed, records) {
      const copied: AffiliateRecord[] = [];
      for (const [index, record] of records.entries()) {
        const issues = validator.validateRecord(record).map((item) => ({ ...item, field: `catalogs.${CLICKBANK_NETWORK}.${index}.${item.field}` }));
        if (issues.length > 0 || typeof record !== "object" || record === null) return { issues, product: null, evidence: null };
        copied.push(copyRecord(record as Record<string, unknown>));
      }
      const name = matchKey(observed.productName);
      const vendor = observed.vendor === null || observed.vendor.trim() === "" ? null : matchKey(observed.vendor);
      const method: MatchMethod = vendor === null ? "EXACT_PRODUCT" : "EXACT_PRODUCT_AND_VENDOR";
      const found = copied.filter((record) => {
        if (matchKey(record.productName) !== name) return false;
        if (vendor === null) return true;
        return record.vendor !== null && matchKey(record.vendor) === vendor;
      });
      if (found.length > 1) {
        return {
          issues: [{ field: `catalogs.${CLICKBANK_NETWORK}`, message: "Ambiguous Match: more than one listing agrees with the observed product." }],
          product: null,
          evidence: null,
        };
      }
      const record = found[0] ?? null;
      if (record === null) return { issues: [], product: blankProduct(observed, CLICKBANK_NETWORK), evidence: evidenceFor(CLICKBANK_NETWORK, null, "UNMATCHED") };
      const result: AffiliateProviderResult = {
        issues: [],
        product: matchedProduct(observed, CLICKBANK_NETWORK, record),
        evidence: evidenceFor(CLICKBANK_NETWORK, record, method),
      };
      return result;
    },
  };
}
