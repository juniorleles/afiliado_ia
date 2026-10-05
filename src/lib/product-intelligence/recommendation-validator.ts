/**
 * Host record domain: product recommendation validator.
 *
 * Checks a recommendation input, a built ranking, and a snapshot. It rejects
 * missing evidence, an invalid report, a corrupted ranking, and invalid
 * metadata. It does not rank a product and it does not approve one.
 */
import { compareRecommendations, type RecommendationDraft } from "./ranking-engine";
import {
  RECOMMENDATION_CONTEXT_MEMBERS,
  RECOMMENDATION_ENTRY_KEYS,
  RECOMMENDATION_GRAPH_KINDS,
  RECOMMENDATION_LEVELS,
  RECOMMENDATION_PRODUCT_MEMBERS,
  RECOMMENDATION_SNAPSHOT_KEYS,
  type RecommendationEntry,
  type RecommendationIssue,
  type RecommendationMetadata,
} from "./recommendation-snapshot";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const METADATA_FIELDS = ["executionMetadata", "runtimeMetadata", "configuration"] as const;
const ANALYSIS_FIELDS = ["discoveryAnalysis", "opportunityAnalysis", "trafficAnalysis", "decisionAnalysis"] as const;
const SUMMARY_FIELDS = {
  ProductFacts: "productFacts",
  LandingPageEvidence: "landingPageEvidence",
  SearchEvidence: "searchEvidence",
  CompetitionEvidence: "competitionEvidence",
  CommercialEvidence: "commercialEvidence",
} as const;

export interface RecommendationValidator {
  validateInput(input: unknown): RecommendationIssue[];
  validateRanking(entries: readonly RecommendationEntry[]): RecommendationIssue[];
  validateSnapshot(input: unknown): RecommendationIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (value: unknown) => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

function isFlat(value: unknown): value is RecommendationMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, inner]) => key.trim() !== "" && isFlatValue(inner));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function bundlesOf(input: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(input.products)) {
    return input.products.filter(isPlainRecord);
  }
  return [input];
}

export function createRecommendationValidator(): RecommendationValidator {
  function validateMetadata(input: unknown, field: string): RecommendationIssue[] {
    if (input === undefined) return [];
    if (!isFlat(input)) {
      return [{ field, message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateBundle(bundle: Record<string, unknown>, path: string): RecommendationIssue[] {
    const issues: RecommendationIssue[] = [];
    const prefix = path === "" ? "" : `${path}.`;
    const allowed = path === "" ? [...RECOMMENDATION_PRODUCT_MEMBERS, ...METADATA_FIELDS] : RECOMMENDATION_PRODUCT_MEMBERS;
    for (const key of Object.keys(bundle)) {
      if (!(allowed as readonly string[]).includes(key)) {
        issues.push({ field: `${prefix}${key}`, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    if (!isPlainRecord(bundle.productIntelligenceReport)) {
      issues.push({ field: `${prefix}productIntelligenceReport`, message: "Invalid Report: a Product Intelligence Report record is required." });
    } else {
      const report = bundle.productIntelligenceReport;
      const imported = isPlainRecord(report.importedProduct) ? report.importedProduct : null;
      if (imported === null || textOf(imported.productName) === null) {
        issues.push({ field: `${prefix}productIntelligenceReport`, message: "Invalid Report: a product name is required." });
      }
      if (report.missingEvidence !== undefined && (!Array.isArray(report.missingEvidence) || report.missingEvidence.some((item) => typeof item !== "string"))) {
        issues.push({ field: `${prefix}productIntelligenceReport.missingEvidence`, message: "Invalid Report: missing evidence must be a list of text." });
      }
    }
    if (!isPlainRecord(bundle.evidenceGraph)) {
      issues.push({ field: `${prefix}evidenceGraph`, message: "Missing Evidence: an evidence graph is required." });
    } else {
      issues.push(...validateGraph(bundle.evidenceGraph, bundle.productIntelligenceReport, `${prefix}evidenceGraph`));
    }
    for (const field of ANALYSIS_FIELDS) {
      if (!isPlainRecord(bundle[field])) {
        issues.push({ field: `${prefix}${field}`, message: `Missing Evidence: ${field} is required.` });
      }
    }
    if (issues.length > 0) return issues;
    const discovery = bundle.discoveryAnalysis as Record<string, unknown>;
    const opportunity = bundle.opportunityAnalysis as Record<string, unknown>;
    const traffic = bundle.trafficAnalysis as Record<string, unknown>;
    const decision = bundle.decisionAnalysis as Record<string, unknown>;
    const candidateId = textOf(discovery.id) ?? textOf(discovery.candidateId);
    if (candidateId === null || textOf(discovery.status) === null) {
      issues.push({ field: `${prefix}discoveryAnalysis`, message: "Invalid Report: discovery analysis needs an id and a status." });
    }
    if ((textOf(opportunity.analysisId) ?? textOf(opportunity.id)) === null || textOf(opportunity.status) === null) {
      issues.push({ field: `${prefix}opportunityAnalysis`, message: "Invalid Report: opportunity analysis needs an id and a status." });
    }
    if ((textOf(traffic.analysisId) ?? textOf(traffic.id)) === null || textOf(traffic.status) === null) {
      issues.push({ field: `${prefix}trafficAnalysis`, message: "Invalid Report: traffic analysis needs an id and a status." });
    }
    if ((textOf(decision.analysisId) ?? textOf(decision.id)) === null || textOf(decision.decisionStatus) === null) {
      issues.push({ field: `${prefix}decisionAnalysis`, message: "Invalid Report: decision analysis needs an id and a decision status." });
    }
    const opportunityCandidate = textOf(opportunity.candidateId);
    const trafficCandidate = textOf(traffic.candidateId);
    const decisionCandidate = textOf(decision.candidateId);
    if (candidateId !== null && opportunityCandidate !== null && opportunityCandidate !== candidateId) {
      issues.push({ field: `${prefix}opportunityAnalysis`, message: "Invalid Report: the Opportunity analysis belongs to a different candidate." });
    }
    if (candidateId !== null && trafficCandidate !== null && trafficCandidate !== candidateId) {
      issues.push({ field: `${prefix}trafficAnalysis`, message: "Invalid Report: the Traffic analysis belongs to a different candidate." });
    }
    if (candidateId !== null && decisionCandidate !== null && decisionCandidate !== candidateId) {
      issues.push({ field: `${prefix}decisionAnalysis`, message: "Invalid Report: the Decision analysis belongs to a different candidate." });
    }
    return issues;
  }

  function validateGraph(graph: Record<string, unknown>, report: unknown, field: string): RecommendationIssue[] {
    if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      return [{ field, message: "Missing Evidence: the evidence graph needs at least one node." }];
    }
    if (!Array.isArray(graph.edges)) {
      return [{ field: `${field}.edges`, message: "Invalid Report: evidence graph edges must be a list." }];
    }
    const issues: RecommendationIssue[] = [];
    const seen = new Set<string>();
    let factsPresent = false;
    for (const node of graph.nodes) {
      if (!isPlainRecord(node) || typeof node.kind !== "string" || (node.present !== "PRESENT" && node.present !== "ABSENT")) {
        return [{ field: `${field}.nodes`, message: "Invalid Report: each graph node needs a kind and a presence token." }];
      }
      if (!(RECOMMENDATION_GRAPH_KINDS as readonly string[]).includes(node.kind)) {
        return [{ field: `${field}.nodes`, message: `Invalid Report: unknown graph kind "${node.kind}".` }];
      }
      if (seen.has(node.kind)) {
        return [{ field: `${field}.nodes`, message: `Invalid Report: graph kind "${node.kind}" is repeated.` }];
      }
      seen.add(node.kind);
      if (node.kind === "ProductFacts" && node.present === "PRESENT") factsPresent = true;
      if (isPlainRecord(report) && isPlainRecord(report.evidenceSummary)) {
        const summaryField = SUMMARY_FIELDS[node.kind as keyof typeof SUMMARY_FIELDS];
        const summary = report.evidenceSummary[summaryField];
        if (summary !== undefined && summary !== node.present) {
          issues.push({ field, message: `Invalid Report: evidence graph presence for "${node.kind}" does not match the report.` });
        }
      }
      if (isPlainRecord(report) && Array.isArray(report.missingEvidence) && node.present === "PRESENT" && report.missingEvidence.includes(node.kind)) {
        issues.push({ field, message: `Invalid Report: "${node.kind}" is present on the graph and listed as missing.` });
      }
    }
    for (const kind of RECOMMENDATION_GRAPH_KINDS) {
      if (!seen.has(kind)) {
        issues.push({ field, message: `Missing Evidence: evidence graph is missing "${kind}".` });
      }
    }
    if (!factsPresent) {
      issues.push({ field, message: "Missing Evidence: ProductFacts were not observed." });
    }
    for (const edge of graph.edges) {
      if (!isPlainRecord(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") {
        issues.push({ field: `${field}.edges`, message: "Invalid Report: each graph edge needs a from and a to." });
        break;
      }
    }
    return issues;
  }

  function validateInput(input: unknown): RecommendationIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "evidence", message: "Missing Evidence: a product bundle is required." }];
    }
    const issues: RecommendationIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(RECOMMENDATION_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    for (const key of METADATA_FIELDS) issues.push(...validateMetadata(input[key], key));
    const hasProducts = input.products !== undefined;
    const hasSingle = RECOMMENDATION_PRODUCT_MEMBERS.some((key) => input[key] !== undefined);
    if (hasProducts && hasSingle) {
      issues.push({ field: "products", message: "Invalid Metadata: pass either a product list or one product bundle." });
    }
    if (!hasProducts && !hasSingle) {
      issues.push({ field: "evidence", message: "Missing Evidence: a product bundle is required." });
    }
    if (issues.length > 0) return issues;
    if (hasProducts) {
      if (!Array.isArray(input.products) || input.products.length === 0) {
        return [{ field: "products", message: "Missing Evidence: at least one product bundle is required." }];
      }
      input.products.forEach((item, index) => {
        if (!isPlainRecord(item)) {
          issues.push({ field: `products.${index}`, message: "Invalid Report: each product bundle must be a plain record." });
          return;
        }
        issues.push(...validateBundle(item, `products.${index}`));
      });
      return issues;
    }
    return validateBundle(input, "");
  }

  function validateRanking(entries: readonly RecommendationEntry[]): RecommendationIssue[] {
    if (entries.length === 0) {
      return [{ field: "ranking", message: "Corrupted Ranking: a ranking needs at least one product." }];
    }
    const issues: RecommendationIssue[] = [];
    const positions = new Set<number>();
    const candidates = new Set<string>();
    for (const entry of entries) {
      for (const key of RECOMMENDATION_ENTRY_KEYS) {
        if (entry[key] === undefined) issues.push({ field: key, message: `Corrupted Ranking: recommendation member "${key}" is missing.` });
      }
      if (!(RECOMMENDATION_LEVELS as readonly string[]).includes(entry.level)) {
        issues.push({ field: "level", message: "Corrupted Ranking: a recommendation level is not supported." });
      }
      if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
        issues.push({ field: "confidence", message: "Corrupted Ranking: confidence must be a finite number from 0 through 1." });
      }
      if (!Number.isInteger(entry.rankingPosition) || entry.rankingPosition < 1) {
        issues.push({ field: "rankingPosition", message: "Corrupted Ranking: ranking position must be an integer of 1 or more." });
      }
      if (positions.has(entry.rankingPosition)) {
        issues.push({ field: "rankingPosition", message: `Corrupted Ranking: position ${entry.rankingPosition} is repeated.` });
      }
      positions.add(entry.rankingPosition);
      if (candidates.has(entry.candidateId)) {
        issues.push({ field: "candidateId", message: `Corrupted Ranking: candidate "${entry.candidateId}" is repeated.` });
      }
      candidates.add(entry.candidateId);
      if (entry.origin !== "OBSERVED") issues.push({ field: "origin", message: "Corrupted Ranking: origin must be OBSERVED." });
      if (entry.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Corrupted Ranking: provenance must be DIRECT_SOURCE." });
    }
    for (let position = 1; position <= entries.length; position += 1) {
      if (!positions.has(position)) {
        issues.push({ field: "rankingPosition", message: `Corrupted Ranking: position ${position} is missing.` });
      }
    }
    const drafts: RecommendationDraft[] = entries.map((entry) => ({
      productName: entry.productName,
      candidateId: entry.candidateId,
      level: entry.level,
      confidence: entry.confidence,
      positiveEvidence: entry.positiveEvidence,
      negativeEvidence: entry.negativeEvidence,
      missingEvidence: entry.missingEvidence,
      riskSummary: entry.riskSummary,
      readinessSummary: entry.readinessSummary,
      origin: entry.origin,
      provenance: entry.provenance,
    }));
    const ordered = [...drafts].sort(compareRecommendations);
    const actual = [...entries].sort((left, right) => left.rankingPosition - right.rankingPosition);
    for (let index = 0; index < ordered.length; index += 1) {
      if (actual[index]?.candidateId !== ordered[index]?.candidateId) {
        issues.push({ field: "ranking", message: "Corrupted Ranking: ranking position does not follow the evidence order." });
        break;
      }
    }
    return issues;
  }

  function validateSnapshot(input: unknown): RecommendationIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: RecommendationIssue[] = [];
    for (const field of RECOMMENDATION_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.recommendationId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.recommendationId)) {
      issues.push({ field: "recommendationId", message: "Invalid Metadata: a well-formed recommendation id is required." });
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Invalid Report: a product name is required." });
    }
    if (typeof input.rankingPosition !== "number" || !Number.isInteger(input.rankingPosition) || input.rankingPosition < 1) {
      issues.push({ field: "rankingPosition", message: "Corrupted Ranking: ranking position must be an integer of 1 or more." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata, "metadata"));
    return issues;
  }

  return { validateInput, validateRanking, validateSnapshot };
}

export { bundlesOf };
