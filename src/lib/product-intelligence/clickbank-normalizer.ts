/**
 * Host record domain: ClickBank product normalizer.
 *
 * Restates extracted marketplace text into currency, numbers, percentages,
 * categories, languages, and URLs. It never invents a missing field and never
 * judges a marketplace figure. This layer stays offline.
 */
import type { ClickBankExtractedRecord, ClickBankMoney, ClickBankProductFacts, ClickBankSourceFact } from "./clickbank-types";
import { copyPlainClickBank, freezeDeepClickBank } from "./clickbank-types";

export interface ClickBankNormalizer {
  normalize(record: ClickBankExtractedRecord, sourceUrl: string, metadata?: Record<string, string | number | boolean | null>): ClickBankProductFacts;
  normalizeMoney(input: unknown): ClickBankMoney | null;
  normalizeNumber(input: unknown): number | null;
  normalizePercent(input: unknown): number | null;
  normalizeCategory(input: unknown): string | null;
  normalizeLanguage(input: unknown): string | null;
  normalizeUrl(input: unknown): string | null;
}

const LANGUAGE_MAP: Record<string, string> = {
  english: "en",
  en: "en",
  "en-us": "en",
  spanish: "es",
  es: "es",
  portuguese: "pt",
  pt: "pt",
  "pt-br": "pt",
  french: "fr",
  fr: "fr",
  german: "de",
  de: "de",
  italian: "it",
  it: "it",
  japanese: "ja",
  ja: "ja",
};

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function sourceFact(field: string, text: string | null, sourceUrl: string): ClickBankSourceFact | null {
  if (!text) return null;
  return { field, text, sourceUrl, confidence: "DIRECT_SOURCE" };
}

export function createClickBankNormalizer(): ClickBankNormalizer {
  function normalizeUrl(input: unknown): string | null {
    const text = textOf(input);
    if (!text) return null;
    const trimmed = text.replace(/\/+$/, "");
    return /^https:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
  }

  function normalizeNumber(input: unknown): number | null {
    if (typeof input === "number" && Number.isFinite(input)) return input;
    const text = textOf(input);
    if (!text) return null;
    const cleaned = text.replace(/,/g, "").replace(/[^\d.-]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  function normalizePercent(input: unknown): number | null {
    const text = textOf(input);
    if (text && /%/.test(text)) return normalizeNumber(text);
    return normalizeNumber(input);
  }

  function normalizeMoney(input: unknown): ClickBankMoney | null {
    const text = textOf(input);
    if (!text) return null;
    let currency = "UNKNOWN";
    if (/\$|USD/i.test(text)) currency = "USD";
    else if (/€|EUR/i.test(text)) currency = "EUR";
    else if (/£|GBP/i.test(text)) currency = "GBP";
    const amount = normalizeNumber(text);
    if (amount === null) return null;
    return freezeDeepClickBank({ amount, currency, text });
  }

  function normalizeCategory(input: unknown): string | null {
    const text = textOf(input);
    if (!text) return null;
    return text.replace(/\s+/g, " ").trim();
  }

  function normalizeLanguage(input: unknown): string | null {
    const text = textOf(input);
    if (!text) return null;
    const key = text.toLowerCase().replace(/_/g, "-");
    return LANGUAGE_MAP[key] ?? key.split("-")[0] ?? null;
  }

  function normalize(record: ClickBankExtractedRecord, sourceUrl: string, metadata: Record<string, string | number | boolean | null> = {}): ClickBankProductFacts {
    const marketplaceUrl = normalizeUrl(record.marketplaceUrl) ?? (normalizeUrl(sourceUrl) ?? sourceUrl);
    const facts: ClickBankSourceFact[] = [];
    const push = (field: string, text: string | null) => {
      const item = sourceFact(field, text, marketplaceUrl);
      if (item) facts.push(item);
    };
    push("productName", record.productName);
    push("vendor", record.vendor);
    push("vendorId", record.vendorId);
    push("category", record.category);
    push("gravity", record.gravity);
    push("initialSale", record.initialSale);
    push("averageSale", record.averageSale);
    push("averageRebill", record.averageRebill);
    push("commissionType", record.commissionType);
    push("language", record.language);
    push("marketplaceUrl", record.marketplaceUrl);
    push("affiliatePage", record.affiliatePage);
    push("supportUrl", record.supportUrl);
    push("refundPolicy", record.refundPolicy);
    push("description", record.description);
    push("disclaimer", record.disclaimer);
    for (const item of record.affiliateResources) push("affiliateResources", item);

    const resources = [...new Set(record.affiliateResources.map((item) => normalizeUrl(item) ?? textOf(item)).filter((item): item is string => item !== null))];

    return freezeDeepClickBank({
      productName: textOf(record.productName) ?? "",
      vendor: textOf(record.vendor) ?? "",
      vendorId: textOf(record.vendorId),
      category: normalizeCategory(record.category),
      gravity: normalizeNumber(record.gravity),
      initialSale: normalizeMoney(record.initialSale),
      averageSale: normalizeMoney(record.averageSale),
      averageRebill: normalizeMoney(record.averageRebill),
      commissionType: textOf(record.commissionType),
      language: normalizeLanguage(record.language),
      marketplaceUrl,
      affiliatePage: normalizeUrl(record.affiliatePage),
      supportUrl: normalizeUrl(record.supportUrl),
      refundPolicy: textOf(record.refundPolicy),
      affiliateResources: resources,
      description: textOf(record.description),
      disclaimer: textOf(record.disclaimer),
      origin: "IMPORTED",
      provenance: "DIRECT_SOURCE",
      sourceUrl: marketplaceUrl,
      sourceFacts: facts,
      metadata: copyPlainClickBank(metadata),
    });
  }

  return {
    normalize,
    normalizeMoney,
    normalizeNumber,
    normalizePercent,
    normalizeCategory,
    normalizeLanguage,
    normalizeUrl,
  };
}
