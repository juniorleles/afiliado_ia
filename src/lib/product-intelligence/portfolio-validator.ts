/**
 * Host record domain: product portfolio validator.
 *
 * Checks a portfolio envelope, a built portfolio, and a snapshot. It rejects
 * duplicate products, missing reports, a corrupted portfolio, and invalid
 * metadata. It does not compare products and it does not approve one.
 */
import { comparePortfolio, type PortfolioDraft } from "./portfolio-ranking";
import {
  PORTFOLIO_CONTEXT_MEMBERS,
  PORTFOLIO_ENTRY_KEYS,
  PORTFOLIO_PRODUCT_MEMBERS,
  PORTFOLIO_SNAPSHOT_KEYS,
  type PortfolioEntry,
  type PortfolioIssue,
  type PortfolioMetadata,
  type ProductPortfolio,
} from "./portfolio-snapshot";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface PortfolioValidator {
  validateInput(input: unknown): PortfolioIssue[];
  validatePortfolio(portfolio: ProductPortfolio): PortfolioIssue[];
  validateSnapshot(input: unknown): PortfolioIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

function isFlat(value: unknown): value is PortfolioMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createPortfolioValidator(): PortfolioValidator {
  function validateMetadata(input: unknown, field: string): PortfolioIssue[] {
    if (input === undefined) return [];
    if (!isFlat(input)) {
      return [{ field, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProduct(bundle: Record<string, unknown>, path: string): PortfolioIssue[] {
    const issues: PortfolioIssue[] = [];
    for (const key of Object.keys(bundle)) {
      if (!(PORTFOLIO_PRODUCT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: `${path}.${key}`, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    const report = bundle.productIntelligenceReport;
    if (!isPlainRecord(report)) {
      issues.push({ field: `${path}.productIntelligenceReport`, message: "Missing Reports: a Product Intelligence Report is required." });
      return issues;
    }
    const imported = isPlainRecord(report.importedProduct) ? report.importedProduct : null;
    if (imported === null || textOf(imported.productName) === null) {
      issues.push({ field: `${path}.productIntelligenceReport`, message: "Missing Reports: a product name is required." });
    }
    if (bundle.evidenceGraph !== undefined && bundle.evidenceGraph !== null && !isPlainRecord(bundle.evidenceGraph)) {
      issues.push({ field: `${path}.evidenceGraph`, message: "Corrupted Portfolio: an evidence graph must be a plain record." });
    }
    for (const field of ["discoveryAnalysis", "opportunityAnalysis", "trafficAnalysis", "decisionAnalysis", "recommendationReport"] as const) {
      if (bundle[field] !== undefined && bundle[field] !== null && !isPlainRecord(bundle[field])) {
        issues.push({ field: `${path}.${field}`, message: "Corrupted Portfolio: an analysis record must be a plain record." });
      }
    }
    return issues;
  }

  function validateInput(input: unknown): PortfolioIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "products", message: "Missing Reports: a list of Product Intelligence Reports is required." }];
    }
    const issues: PortfolioIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PORTFOLIO_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    for (const key of METADATA_FIELDS) issues.push(...validateMetadata(input[key], key));
    const hasProducts = input.products !== undefined;
    const hasReports = input.reports !== undefined;
    if (hasProducts && hasReports) {
      issues.push({ field: "products", message: "Invalid Metadata: pass either products or reports." });
    }
    if (!hasProducts && !hasReports) {
      issues.push({ field: "products", message: "Missing Reports: a list of Product Intelligence Reports is required." });
    }
    if (input.recommendationReports !== undefined && !Array.isArray(input.recommendationReports)) {
      issues.push({ field: "recommendationReports", message: "Invalid Metadata: recommendationReports must be a list." });
    }
    if (issues.length > 0) return issues;
    const list = (hasProducts ? input.products : input.reports) as unknown;
    if (!Array.isArray(list) || list.length === 0) {
      return [{ field: hasProducts ? "products" : "reports", message: "Missing Reports: at least one Product Intelligence Report is required." }];
    }
    const names = new Set<string>();
    list.forEach((item, index) => {
      const path = `${hasProducts ? "products" : "reports"}.${index}`;
      if (!isPlainRecord(item)) {
        issues.push({ field: path, message: "Missing Reports: a Product Intelligence Report is required." });
        return;
      }
      const bundle = isPlainRecord(item.productIntelligenceReport) || isPlainRecord(item.importedProduct) ? (isPlainRecord(item.importedProduct) ? { productIntelligenceReport: item } : item) : item;
      issues.push(...validateProduct(bundle, path));
      const report = isPlainRecord(bundle.productIntelligenceReport) ? bundle.productIntelligenceReport : null;
      const imported = report && isPlainRecord(report.importedProduct) ? report.importedProduct : null;
      const name = imported ? textOf(imported.productName) : null;
      if (name !== null) {
        if (names.has(name)) issues.push({ field: path, message: `Duplicate Products: "${name}" is repeated.` });
        names.add(name);
      }
    });
    return issues;
  }

  function validatePortfolio(portfolio: ProductPortfolio): PortfolioIssue[] {
    const issues: PortfolioIssue[] = [];
    const ranking = portfolio.ranking;
    if (!Array.isArray(ranking) || ranking.length === 0) {
      return [{ field: "ranking", message: "Corrupted Portfolio: a ranking needs at least one product." }];
    }
    const positions = new Set<number>();
    const candidates = new Set<string>();
    for (const entry of ranking) {
      for (const key of PORTFOLIO_ENTRY_KEYS) {
        if (entry[key] === undefined) issues.push({ field: key, message: `Corrupted Portfolio: portfolio member "${key}" is missing.` });
      }
      if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
        issues.push({ field: "confidence", message: "Corrupted Portfolio: confidence must be a finite number from 0 through 1." });
      }
      if (!Number.isInteger(entry.rankingPosition) || entry.rankingPosition < 1) {
        issues.push({ field: "rankingPosition", message: "Corrupted Portfolio: ranking position must be an integer of 1 or more." });
      }
      if (positions.has(entry.rankingPosition)) issues.push({ field: "rankingPosition", message: `Corrupted Portfolio: position ${entry.rankingPosition} is repeated.` });
      positions.add(entry.rankingPosition);
      if (candidates.has(entry.candidateId)) issues.push({ field: "candidateId", message: `Duplicate Products: "${entry.candidateId}" is repeated.` });
      candidates.add(entry.candidateId);
      if (entry.origin !== "OBSERVED") issues.push({ field: "origin", message: "Corrupted Portfolio: origin must be OBSERVED." });
      if (entry.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Corrupted Portfolio: provenance must be DIRECT_SOURCE." });
    }
    for (let position = 1; position <= ranking.length; position += 1) {
      if (!positions.has(position)) issues.push({ field: "rankingPosition", message: `Corrupted Portfolio: position ${position} is missing.` });
    }
    const drafts: PortfolioDraft[] = ranking.map((entry) => ({
      productName: entry.productName,
      candidateId: entry.candidateId,
      confidence: entry.confidence,
      level: entry.level,
      missingEvidence: entry.missingEvidence,
      negativeEvidence: [],
      observedSignals: entry.observedSignals,
      landingPage: entry.landingPage,
      competition: entry.competition,
      commercial: entry.commercial,
      search: entry.search,
      discoveryStatus: entry.discoveryStatus,
      opportunityStatus: entry.opportunityStatus,
      trafficStatus: entry.trafficStatus,
      decisionStatus: entry.decisionStatus,
    }));
    const ordered = [...drafts].sort(comparePortfolio);
    const actual = [...ranking].sort((left, right) => left.rankingPosition - right.rankingPosition);
    for (let index = 0; index < ordered.length; index += 1) {
      if (actual[index]?.candidateId !== ordered[index]?.candidateId) {
        issues.push({ field: "ranking", message: "Corrupted Portfolio: ranking position does not follow the comparison order." });
        break;
      }
    }
    const ids = new Set(ranking.map((entry) => entry.candidateId));
    const bestIds = new Set<string>();
    for (const item of portfolio.bestOpportunities) {
      if (!ids.has(item.candidateId)) issues.push({ field: "bestOpportunities", message: "Corrupted Portfolio: a best opportunity is not in the ranking." });
      if (bestIds.has(item.candidateId)) issues.push({ field: "bestOpportunities", message: `Duplicate Products: "${item.candidateId}" is repeated.` });
      bestIds.add(item.candidateId);
    }
    for (const item of portfolio.weakOpportunities) {
      if (!ids.has(item.candidateId)) issues.push({ field: "weakOpportunities", message: "Corrupted Portfolio: a weak opportunity is not in the ranking." });
      if (bestIds.has(item.candidateId)) issues.push({ field: "weakOpportunities", message: "Corrupted Portfolio: a product is both a best and a weak opportunity." });
    }
    if (portfolio.origin !== "OBSERVED") issues.push({ field: "origin", message: "Corrupted Portfolio: origin must be OBSERVED." });
    if (portfolio.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Corrupted Portfolio: provenance must be DIRECT_SOURCE." });
    return issues;
  }

  function validateSnapshot(input: unknown): PortfolioIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: PortfolioIssue[] = [];
    for (const field of PORTFOLIO_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.portfolioId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.portfolioId)) {
      issues.push({ field: "portfolioId", message: "Invalid Metadata: a well-formed portfolio id is required." });
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Missing Reports: a product name is required." });
    }
    if (typeof input.productCount !== "number" || !Number.isInteger(input.productCount) || input.productCount < 1) {
      issues.push({ field: "productCount", message: "Invalid Metadata: productCount must be an integer of 1 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata, "metadata"));
    return issues;
  }

  return { validateInput, validatePortfolio, validateSnapshot };
}

export function bundlesOf(input: Record<string, unknown>): Record<string, unknown>[] {
  const list = Array.isArray(input.products) ? input.products : Array.isArray(input.reports) ? input.reports : [];
  return list.filter(isPlainRecord).map((item) => (isPlainRecord(item.importedProduct) ? { productIntelligenceReport: item } : item));
}
