/**
 * Host record domain: portfolio validator.
 *
 * Pure local rules for one grouping. It rejects a missing ranking, duplicate
 * opportunities, an invalid portfolio, and invalid metadata. It does not
 * change what it is given.
 */
import { PORTFOLIO_CONTEXT_MEMBERS, type PortfolioMetadata } from "./portfolio-context";
import {
  OPPORTUNITY_PORTFOLIO_KEYS,
  PORTFOLIO_CONTEXT_RECORD_KEYS,
  PORTFOLIO_EXECUTION_STATISTICS_KEYS,
  PORTFOLIO_GROUP_KEYS,
  PORTFOLIO_SNAPSHOT_KEYS,
} from "./portfolio-snapshot";
import {
  GROUP_DIMENSIONS,
  PORTFOLIO_DIMENSIONS,
  PORTFOLIO_STATISTICS_KEYS,
  PORTFOLIO_TYPE_NAMES,
  type PortfolioIssue,
} from "./portfolio-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const RANKING_KEYS = ["policyId", "ordered", "origin", "provenance"] as const;
const GROUPING_KEYS = ["opportunityId", ...GROUP_DIMENSIONS, "portfolioTypes"] as const;
const NAMED = new Set<string>(PORTFOLIO_TYPE_NAMES);

export interface PortfolioValidator {
  validateInput(input: unknown): PortfolioIssue[];
  validateMetadata(input: unknown): PortfolioIssue[];
  validateSnapshot(input: unknown): PortfolioIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatPortfolioMetadata(value: unknown): value is PortfolioMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): PortfolioIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function namedType(value: string): boolean {
  return NAMED.has(value);
}

export function createPortfolioValidator(): PortfolioValidator {
  function validateMetadata(input: unknown): PortfolioIssue[] {
    if (input === undefined) return [];
    if (!isFlatPortfolioMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateRanking(ranking: unknown): { issues: PortfolioIssue[]; ids: string[] } {
    if (!isPlainRecord(ranking)) return { issues: [{ field: "ranking", message: "Missing Opportunity Ranking: an opportunity ranking is required." }], ids: [] };
    const issues: PortfolioIssue[] = [];
    for (const key of Object.keys(ranking)) {
      if (!(RANKING_KEYS as readonly string[]).includes(key)) issues.push({ field: `ranking.${key}`, message: "Missing Opportunity Ranking: an opportunity ranking is required." });
    }
    if (!SNAPSHOT_ID.test(textOf(ranking.policyId))) issues.push({ field: "ranking.policyId", message: "Missing Opportunity Ranking: an opportunity ranking is required." });
    if (ranking.origin !== "OBSERVED" || ranking.provenance !== "DIRECT_SOURCE") {
      issues.push({ field: "ranking.origin", message: "Missing Opportunity Ranking: an opportunity ranking is required." });
    }
    const ids: string[] = [];
    if (!Array.isArray(ranking.ordered) || ranking.ordered.length === 0) {
      issues.push({ field: "ranking.ordered", message: "Missing Opportunity Ranking: an opportunity ranking is required." });
      return { issues, ids };
    }
    const seen = new Set<string>();
    ranking.ordered.forEach((item, index) => {
      if (!isPlainRecord(item) || Object.keys(item).some((key) => key !== "position" && key !== "opportunityId") || item.position !== index + 1) {
        issues.push({ field: `ranking.ordered.${index}`, message: "Missing Opportunity Ranking: an opportunity ranking is required." });
        return;
      }
      const opportunityId = textOf(item.opportunityId);
      if (!SNAPSHOT_ID.test(opportunityId)) {
        issues.push({ field: `ranking.ordered.${index}.opportunityId`, message: "Missing Opportunity Ranking: an opportunity ranking is required." });
        return;
      }
      if (seen.has(opportunityId)) issues.push({ field: `ranking.ordered.${index}.opportunityId`, message: `Duplicate Opportunities: opportunity id "${opportunityId}" is repeated.` });
      seen.add(opportunityId);
      ids.push(opportunityId);
    });
    return { issues, ids };
  }

  function validateOpportunities(opportunities: unknown, rankedIds: readonly string[]): PortfolioIssue[] {
    if (!Array.isArray(opportunities)) return [{ field: "opportunities", message: "Invalid Portfolio: grouping records are required." }];
    const issues: PortfolioIssue[] = [];
    const seen = new Set<string>();
    const ranked = new Set(rankedIds);
    opportunities.forEach((item, index) => {
      if (!isPlainRecord(item)) {
        issues.push({ field: `opportunities.${index}`, message: "Invalid Portfolio: a grouping record is required." });
        return;
      }
      for (const key of Object.keys(item)) {
        if (!(GROUPING_KEYS as readonly string[]).includes(key)) {
          issues.push({ field: `opportunities.${index}.${key}`, message: "Invalid Portfolio: a grouping record has an unknown member." });
        }
      }
      const opportunityId = textOf(item.opportunityId);
      if (!SNAPSHOT_ID.test(opportunityId)) {
        issues.push({ field: `opportunities.${index}.opportunityId`, message: "Invalid Portfolio: an opportunity id is required." });
      } else if (!ranked.has(opportunityId)) {
        issues.push({ field: `opportunities.${index}.opportunityId`, message: "Invalid Portfolio: a grouping record must name a ranked opportunity." });
      } else if (seen.has(opportunityId)) {
        issues.push({ field: `opportunities.${index}.opportunityId`, message: `Duplicate Opportunities: opportunity id "${opportunityId}" is repeated.` });
      } else {
        seen.add(opportunityId);
      }
      let groups = 0;
      for (const dimension of GROUP_DIMENSIONS) {
        if (!(dimension in item) || item[dimension] === undefined || item[dimension] === null) continue;
        if (typeof item[dimension] !== "string") {
          issues.push({ field: `opportunities.${index}.${dimension}`, message: "Invalid Portfolio: a grouping value must be text." });
          continue;
        }
        if (textOf(item[dimension]) !== "") groups += 1;
      }
      if ("portfolioTypes" in item && item.portfolioTypes !== undefined) {
        if (!Array.isArray(item.portfolioTypes)) {
          issues.push({ field: `opportunities.${index}.portfolioTypes`, message: "Invalid Portfolio: portfolio types must be a list." });
        } else {
          const tokens = new Set<string>();
          item.portfolioTypes.forEach((token, tokenIndex) => {
            const field = `opportunities.${index}.portfolioTypes.${tokenIndex}`;
            if (typeof token === "string") {
              const name = token.trim();
              if (!namedType(name)) {
                issues.push({ field, message: "Invalid Portfolio: a portfolio type must be health, beauty, finance, software, pets, education, or custom." });
                return;
              }
              if (tokens.has(name)) issues.push({ field, message: "Invalid Portfolio: a portfolio type is listed more than once." });
              tokens.add(name);
              groups += 1;
              return;
            }
            if (!isPlainRecord(token) || Object.keys(token).some((key) => key !== "portfolioType" && key !== "portfolioId") || token.portfolioType !== "custom" || !SNAPSHOT_ID.test(textOf(token.portfolioId))) {
              issues.push({ field, message: "Invalid Portfolio: a custom portfolio needs a custom id." });
              return;
            }
            const customId = textOf(token.portfolioId);
            if (tokens.has(customId)) issues.push({ field, message: "Invalid Portfolio: a portfolio type is listed more than once." });
            tokens.add(customId);
            groups += 1;
          });
        }
      }
      if (SNAPSHOT_ID.test(opportunityId) && groups === 0) {
        issues.push({ field: `opportunities.${index}`, message: "Invalid Portfolio: an opportunity must belong to at least one portfolio." });
      }
    });
    for (const opportunityId of rankedIds) {
      if (!seen.has(opportunityId)) issues.push({ field: "opportunities", message: `Invalid Portfolio: ranked opportunity "${opportunityId}" has no grouping record.` });
    }
    return issues;
  }

  function validateInput(input: unknown): PortfolioIssue[] {
    if (!isPlainRecord(input)) return [{ field: "ranking", message: "Missing Opportunity Ranking: an opportunity ranking is required." }];
    const issues: PortfolioIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PORTFOLIO_CONTEXT_MEMBERS as readonly string[]).includes(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of METADATA_FIELDS) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    const ranking = validateRanking(input.ranking);
    issues.push(...ranking.issues);
    issues.push(...validateOpportunities(input.opportunities, ranking.ids));
    return issues;
  }

  function validateSnapshot(input: unknown): PortfolioIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: PortfolioIssue[] = [];
    for (const field of PORTFOLIO_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.buildId !== "string" || !SNAPSHOT_ID.test(input.buildId)) issues.push(invalid("buildId", "a well-formed portfolio build id is required."));
    if (!isPlainRecord(input.portfolio)) issues.push(invalid("portfolio", "an opportunity portfolio is required."));
    else {
      for (const field of OPPORTUNITY_PORTFOLIO_KEYS) {
        if (input.portfolio[field] === undefined) issues.push(invalid(`portfolio.${field}`, `portfolio member "${field}" is missing.`));
      }
      if (!Array.isArray(input.portfolio.portfolios)) issues.push(invalid("portfolio.portfolios", "portfolios are required."));
      else {
        const portfolioIds = new Set<string>();
        input.portfolio.portfolios.forEach((group, index) => {
          if (!isPlainRecord(group)) {
            issues.push(invalid(`portfolio.portfolios.${index}`, "a portfolio is required."));
            return;
          }
          for (const field of PORTFOLIO_GROUP_KEYS) {
            if (group[field] === undefined) issues.push(invalid(`portfolio.portfolios.${index}.${field}`, `portfolio member "${field}" is missing.`));
          }
          if (!SNAPSHOT_ID.test(textOf(group.portfolioId)) || portfolioIds.has(textOf(group.portfolioId))) {
            issues.push(invalid(`portfolio.portfolios.${index}.portfolioId`, "a portfolio id must be unique."));
          }
          portfolioIds.add(textOf(group.portfolioId));
          if (typeof group.portfolioType !== "string" || !NAMED.has(group.portfolioType)) {
            issues.push(invalid(`portfolio.portfolios.${index}.portfolioType`, "a portfolio type is required."));
          }
          if (typeof group.dimension !== "string" || !(PORTFOLIO_DIMENSIONS as readonly string[]).includes(group.dimension)) {
            issues.push(invalid(`portfolio.portfolios.${index}.dimension`, "a grouping dimension is required."));
          }
          if (!Array.isArray(group.opportunityIds)) issues.push(invalid(`portfolio.portfolios.${index}.opportunityIds`, "opportunity ids are required."));
          else {
            const members = new Set<string>();
            group.opportunityIds.forEach((opportunityId) => {
              const id = textOf(opportunityId);
              if (members.has(id)) issues.push(invalid(`portfolio.portfolios.${index}.opportunityIds`, "a portfolio entry is repeated."));
              members.add(id);
            });
          }
        });
      }
      if (!isPlainRecord(input.portfolio.statistics)) issues.push(invalid("portfolio.statistics", "portfolio statistics are required."));
      else {
        for (const field of PORTFOLIO_STATISTICS_KEYS) {
          const value = input.portfolio.statistics[field];
          if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`portfolio.statistics.${field}`, `${field} must be a finite number.`));
        }
      }
    }
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "execution statistics are required."));
    else {
      for (const field of PORTFOLIO_EXECUTION_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "a portfolio context is required."));
    else {
      for (const field of PORTFOLIO_CONTEXT_RECORD_KEYS) {
        if (field === "policyId") {
          if (typeof input.context.policyId !== "string") issues.push(invalid("context.policyId", "policyId must be text."));
        } else if (!Array.isArray(input.context[field])) issues.push(invalid(`context.${field}`, `${field} must be a list.`));
      }
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) issues.push(invalid("createdAt", "createdAt must be an ISO-8601 instant in UTC."));
    if (input.origin !== "OBSERVED") issues.push(invalid("origin", "origin must be OBSERVED."));
    if (input.provenance !== "DIRECT_SOURCE") issues.push(invalid("provenance", "provenance must be DIRECT_SOURCE."));
    issues.push(...validateMetadata(input.metadata).map((item) => invalid("metadata", item.message.replace(/^Invalid Metadata:\s*/, ""))));
    return issues;
  }

  return { validateInput, validateMetadata, validateSnapshot };
}
