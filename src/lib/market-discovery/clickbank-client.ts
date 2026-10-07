/**
 * Host record domain: supplied marketplace listing reader.
 *
 * Copies one supplied listing record. It does not request a listing and it
 * does not change the record it is given.
 */
import { isFlatResolutionMetadata, createClickBankValidator, type ClickBankValidator } from "./clickbank-validator";
import { type ClickBankIssue, type MarketplaceMoney, type MarketplaceRecord, type ResolutionMetadata } from "./clickbank-types";

export interface ClickBankRead {
  record: MarketplaceRecord | null;
  issues: ClickBankIssue[];
}

export interface ClickBankClient {
  read(record: unknown): ClickBankRead;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function moneyOf(value: unknown): MarketplaceMoney | null {
  if (value === undefined || value === null || typeof value !== "object") return null;
  const money = value as MarketplaceMoney;
  return { amount: money.amount, currency: money.currency.trim(), text: money.text };
}

export function createClickBankClient(validator: ClickBankValidator = createClickBankValidator()): ClickBankClient {
  return {
    read(record) {
      const issues = validator.validateRecord(record);
      if (issues.length > 0 || typeof record !== "object" || record === null) return { record: null, issues };
      const source = record as Record<string, unknown>;
      const metadata = isFlatResolutionMetadata(source.marketplaceMetadata) ? source.marketplaceMetadata : {};
      const resources = Array.isArray(source.affiliateResources) ? source.affiliateResources.filter((item): item is string => typeof item === "string") : [];
      const copied: MarketplaceRecord = {
        productName: textOrNull(source.productName) ?? "",
        vendor: textOrNull(source.vendor),
        marketplaceUrl: textOrNull(source.marketplaceUrl),
        gravity: typeof source.gravity === "number" ? source.gravity : null,
        initialSale: moneyOf(source.initialSale),
        averageSale: moneyOf(source.averageSale),
        averageRebill: moneyOf(source.averageRebill),
        commissionType: textOrNull(source.commissionType),
        category: textOrNull(source.category),
        language: textOrNull(source.language),
        affiliateResources: [...resources],
        marketplaceMetadata: { ...metadata } as ResolutionMetadata,
      };
      return { record: copied, issues: [] };
    },
  };
}
