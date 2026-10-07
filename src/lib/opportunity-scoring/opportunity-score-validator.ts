/**
 * Host record domain: opportunity scoring validator.
 *
 * Pure local rules for one market report. It rejects a missing report, a
 * broken evidence graph, missing statistics, and invalid metadata. It does
 * not change what it is given.
 */
import {
  OPPORTUNITY_SCORE_CONTEXT_MEMBERS,
  OPPORTUNITY_SCORE_ENVELOPE_MEMBERS,
  type OpportunityScoreMetadata,
} from "./opportunity-score-context";
import {
  OPPORTUNITY_EXECUTION_STATISTICS_KEYS,
  OPPORTUNITY_SCORE_CONTEXT_RECORD_KEYS,
  OPPORTUNITY_SCORE_SNAPSHOT_KEYS,
} from "./opportunity-score-snapshot";
import {
  OPPORTUNITY_COVERAGE_FIELDS,
  OPPORTUNITY_GRAPH_NODE_IDS,
  OPPORTUNITY_METRIC_KEYS,
  OPPORTUNITY_REPORT_RECORD_KEYS,
  OPPORTUNITY_STATISTICS_INPUT_KEYS,
  type OpportunityScoreIssue,
} from "./opportunity-score-types";

const SNAPSHOT_ID = /^[a-z][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration", "metadata"] as const;
const ALLOWED_INPUT_KEYS = new Set<string>([...OPPORTUNITY_SCORE_CONTEXT_MEMBERS, ...OPPORTUNITY_SCORE_ENVELOPE_MEMBERS]);

export interface OpportunityScoreValidator {
  validateInput(input: unknown): OpportunityScoreIssue[];
  validateMetadata(input: unknown): OpportunityScoreIssue[];
  validateSnapshot(input: unknown): OpportunityScoreIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

export function isFlatOpportunityScoreMetadata(value: unknown): value is OpportunityScoreMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function invalid(field: string, message: string): OpportunityScoreIssue {
  return { field, message: `Invalid Metadata: ${message}` };
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createOpportunityScoreValidator(): OpportunityScoreValidator {
  function validateMetadata(input: unknown): OpportunityScoreIssue[] {
    if (input === undefined) return [];
    if (!isFlatOpportunityScoreMetadata(input)) return [invalid("metadata", "a flat record of text, numbers, booleans, or null is required.")];
    return [];
  }

  function validateReport(report: unknown): OpportunityScoreIssue[] {
    if (!isPlainRecord(report)) return [{ field: "report", message: "Missing Market Report: a market report is required." }];
    const issues: OpportunityScoreIssue[] = [];
    for (const field of OPPORTUNITY_REPORT_RECORD_KEYS) {
      if (report[field] === undefined) issues.push({ field: `report.${field}`, message: "Missing Market Report: a market report is required." });
    }
    const search = report.searchSummary;
    if (!isPlainRecord(search) || textOf(search.snapshotId) === "" || textOf(search.query) === "") {
      issues.push({ field: "report.searchSummary", message: "Missing Market Report: a market report is required." });
    }
    for (const field of ["serpSummary", "sponsoredSummary"] as const) {
      const summary = report[field];
      if (!isPlainRecord(summary) || typeof summary.count !== "number" || !Array.isArray(summary.urls)) {
        issues.push({ field: `report.${field}`, message: "Missing Market Report: a market report is required." });
      }
    }
    const pages = report.landingPageSummary;
    if (!isPlainRecord(pages) || typeof pages.count !== "number" || !Array.isArray(pages.landingPageIds)) {
      issues.push({ field: "report.landingPageSummary", message: "Missing Market Report: a market report is required." });
    }
    const products = report.observedProductSummary;
    if (!isPlainRecord(products) || typeof products.count !== "number" || !Array.isArray(products.productNames) || !Array.isArray(products.languages)) {
      issues.push({ field: "report.observedProductSummary", message: "Missing Market Report: a market report is required." });
    }
    for (const field of ["observedBrands", "observedDomains", "observedCategories", "observedPrices", "observedLanguages", "missingEvidence", "warnings"] as const) {
      if (!Array.isArray(report[field])) issues.push({ field: `report.${field}`, message: "Missing Market Report: a market report is required." });
    }
    const coverage = report.evidenceCoverage;
    if (!isPlainRecord(coverage)) {
      issues.push({ field: "report.evidenceCoverage", message: "Missing Market Report: a market report is required." });
    } else {
      for (const field of OPPORTUNITY_COVERAGE_FIELDS) {
        const value = coverage[field];
        if (value !== "PRESENT" && value !== "ABSENT") {
          issues.push({ field: `report.evidenceCoverage.${field}`, message: "Missing Market Report: a market report is required." });
        }
      }
    }
    if (report.origin !== "OBSERVED" || report.provenance !== "DIRECT_SOURCE") {
      issues.push({ field: "report.origin", message: "Missing Market Report: a market report is required." });
    }
    return issues;
  }

  function validateGraph(graph: unknown): OpportunityScoreIssue[] {
    if (!isPlainRecord(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return [{ field: "graph", message: "Corrupted Evidence Graph: an evidence graph is required." }];
    }
    const issues: OpportunityScoreIssue[] = [];
    const ids = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (!isPlainRecord(node) || textOf(node.id) === "" || textOf(node.kind) === "" || typeof node.label !== "string" || (node.present !== "PRESENT" && node.present !== "ABSENT")) {
        issues.push({ field: `graph.nodes.${index}`, message: "Corrupted Evidence Graph: a graph node needs an id, a kind, a label, and a presence." });
        return;
      }
      const id = textOf(node.id);
      if (ids.has(id)) issues.push({ field: `graph.nodes.${index}`, message: "Corrupted Evidence Graph: a graph node id is repeated." });
      ids.add(id);
    });
    for (const id of OPPORTUNITY_GRAPH_NODE_IDS) {
      if (!ids.has(id)) issues.push({ field: "graph.nodes", message: `Corrupted Evidence Graph: the evidence graph is missing the "${id}" node.` });
    }
    graph.edges.forEach((edge, index) => {
      if (!isPlainRecord(edge) || textOf(edge.from) === "" || textOf(edge.to) === "") {
        issues.push({ field: `graph.edges.${index}`, message: "Corrupted Evidence Graph: a graph edge needs two node ids." });
        return;
      }
      if (!ids.has(textOf(edge.from)) || !ids.has(textOf(edge.to))) {
        issues.push({ field: `graph.edges.${index}`, message: "Corrupted Evidence Graph: a graph edge must join two stored nodes." });
      }
    });
    return issues;
  }

  function validateStatistics(statistics: unknown): OpportunityScoreIssue[] {
    if (!isPlainRecord(statistics)) return [{ field: "statistics", message: "Missing Statistics: market statistics are required." }];
    const issues: OpportunityScoreIssue[] = [];
    for (const field of OPPORTUNITY_STATISTICS_INPUT_KEYS) {
      const value = statistics[field];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ field: `statistics.${field}`, message: "Missing Statistics: market statistics are required." });
      }
    }
    return issues;
  }

  function validateInput(input: unknown): OpportunityScoreIssue[] {
    if (!isPlainRecord(input)) return [{ field: "report", message: "Missing Market Report: a market report is required." }];
    const issues: OpportunityScoreIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!ALLOWED_INPUT_KEYS.has(key)) issues.push(invalid(key, `unexpected member "${key}".`));
    }
    for (const key of METADATA_FIELDS) {
      if (key in input) issues.push(...validateMetadata(input[key]).map((item) => invalid(key, item.message.replace(/^Invalid Metadata:\s*/, ""))));
    }
    issues.push(...validateReport(input.report));
    issues.push(...validateGraph(input.graph));
    issues.push(...validateStatistics(input.statistics));
    return issues;
  }

  function validateSnapshot(input: unknown): OpportunityScoreIssue[] {
    if (!isPlainRecord(input)) return [invalid("snapshot", "a snapshot record is required.")];
    const issues: OpportunityScoreIssue[] = [];
    for (const field of OPPORTUNITY_SCORE_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push(invalid(field, `snapshot member "${field}" is missing.`));
    }
    if (typeof input.scoreId !== "string" || !SNAPSHOT_ID.test(input.scoreId)) issues.push(invalid("scoreId", "a well-formed evaluation id is required."));
    if (!isPlainRecord(input.metrics)) issues.push(invalid("metrics", "opportunity metrics are required."));
    else {
      for (const field of OPPORTUNITY_METRIC_KEYS) {
        const value = input.metrics[field];
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
          issues.push(invalid(`metrics.${field}`, `${field} must be a finite number or null.`));
        }
      }
    }
    if (!isPlainRecord(input.evidence)) issues.push(invalid("evidence", "metric evidence is required."));
    if (!isPlainRecord(input.statistics)) issues.push(invalid("statistics", "execution statistics are required."));
    else {
      for (const field of OPPORTUNITY_EXECUTION_STATISTICS_KEYS) {
        const value = input.statistics[field];
        if (typeof value !== "number" || !Number.isFinite(value)) issues.push(invalid(`statistics.${field}`, `${field} must be a finite number.`));
      }
    }
    if (!isPlainRecord(input.context)) issues.push(invalid("context", "an evaluation context is required."));
    else {
      for (const field of OPPORTUNITY_SCORE_CONTEXT_RECORD_KEYS) {
        if (typeof input.context[field] !== "string") issues.push(invalid(`context.${field}`, `${field} must be text.`));
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
