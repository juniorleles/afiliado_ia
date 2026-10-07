/**
 * Host record domain: opportunity scoring builder.
 *
 * Measures one market report. Each metric uses only its own listed inputs.
 * Repeated values are kept once where the metric is a unique count.
 * This module does not reach an outside system.
 */
import { freezeDeepOpportunityScore } from "./opportunity-score-snapshot";
import {
  OPPORTUNITY_COVERAGE_FIELDS,
  type OpportunityEvidence,
  type OpportunityMetrics,
} from "./opportunity-score-types";

export interface OpportunityScoreDraft {
  metrics: OpportunityMetrics;
  evidence: OpportunityEvidence;
  context: { query: string; searchSnapshotId: string };
}

export interface OpportunityScoreBuilder {
  build(input: Record<string, unknown>): OpportunityScoreDraft;
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (text !== "") out.push(text);
  }
  return out;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.trim();
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

function amountOf(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)/.exec(value);
  if (match === null) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function fixed(value: number): number {
  return Number(value.toFixed(6));
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return fixed(numerator / denominator);
}

function populationVariance(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  const mean = sum / values.length;
  let squared = 0;
  for (const value of values) {
    const delta = value - mean;
    squared += delta * delta;
  }
  return fixed(squared / values.length);
}

export function createOpportunityScoreBuilder(): OpportunityScoreBuilder {
  return {
    build(input) {
      const report = input.report as Record<string, unknown>;
      const search = report.searchSummary as Record<string, unknown>;
      const sponsored = report.sponsoredSummary as Record<string, unknown>;
      const products = report.observedProductSummary as Record<string, unknown>;
      const coverage = report.evidenceCoverage as Record<string, unknown>;
      const hosts = unique(texts(sponsored.urls).map(hostOf).filter((host): host is string => host !== null));
      const domains = unique(texts(report.observedDomains));
      const landingPageIds = unique(texts((report.landingPageSummary as Record<string, unknown>).landingPageIds));
      const productNames = texts(products.productNames);
      const brands = unique(texts(report.observedBrands));
      const categories = unique(texts(report.observedCategories));
      const amounts = texts(report.observedPrices).map(amountOf).filter((amount): amount is number => amount !== null);
      const languages = texts(products.languages);
      const counts = new Map<string, number>();
      for (const language of languages) counts.set(language, (counts.get(language) ?? 0) + 1);
      let modalLanguage: string | null = null;
      let modalCount = 0;
      for (const language of languages) {
        const count = counts.get(language) ?? 0;
        if (count > modalCount) {
          modalCount = count;
          modalLanguage = language;
        }
      }
      const serpUrls = Array.isArray((report.serpSummary as Record<string, unknown>).urls)
        ? ((report.serpSummary as Record<string, unknown>).urls as readonly unknown[])
        : [];
      const rowCount = serpUrls.length;
      const coveredCount = serpUrls.filter((url) => typeof url === "string" && url.trim() !== "").length;
      const presentFields = OPPORTUNITY_COVERAGE_FIELDS.filter((field) => coverage[field] === "PRESENT");
      const absentFields = OPPORTUNITY_COVERAGE_FIELDS.filter((field) => coverage[field] === "ABSENT");
      const metrics: OpportunityMetrics = {
        sponsoredAdvertiserCount: hosts.length,
        uniqueDomainCount: domains.length,
        uniqueLandingPageCount: landingPageIds.length,
        observedProductCount: productNames.length,
        observedBrandCount: brands.length,
        observedCategoryCount: categories.length,
        priceVariance: populationVariance(amounts),
        languageConsistency: ratio(modalCount, languages.length),
        serpCoverage: ratio(coveredCount, rowCount),
        evidenceCompleteness: ratio(presentFields.length, OPPORTUNITY_COVERAGE_FIELDS.length) ?? 0,
      };
      const evidence: OpportunityEvidence = {
        sponsoredAdvertiserCount: { hosts },
        uniqueDomainCount: { domains },
        uniqueLandingPageCount: { landingPageIds },
        observedProductCount: { productNames },
        observedBrandCount: { brands },
        observedCategoryCount: { categories },
        priceVariance: { amounts },
        languageConsistency: { languages, modalLanguage },
        serpCoverage: { coveredCount, rowCount },
        evidenceCompleteness: { presentFields, absentFields },
      };
      return {
        metrics: freezeDeepOpportunityScore(metrics),
        evidence: freezeDeepOpportunityScore(evidence),
        context: {
          query: typeof search.query === "string" ? search.query.trim() : "",
          searchSnapshotId: typeof search.snapshotId === "string" ? search.snapshotId.trim() : "",
        },
      };
    },
  };
}
