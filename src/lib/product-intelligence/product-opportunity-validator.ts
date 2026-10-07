/**
 * Host record domain: product opportunity validator.
 *
 * Pure local rules for a mapping input, ProductFacts, an evidence graph, and
 * snapshots. It rejects missing ProductFacts, a missing evidence graph, an
 * invalid mapping, and invalid metadata. It only reports problems: it never
 * fetches a page and never changes what it is given.
 */
import { PRODUCT_OPPORTUNITY_CONTEXT_MEMBERS, PRODUCT_OPPORTUNITY_GRAPH_FIELDS, PRODUCT_OPPORTUNITY_GRAPH_KINDS } from "./product-opportunity-context";
import {
  PRODUCT_OPPORTUNITY_EVIDENCE_MAPPING_KEYS,
  PRODUCT_OPPORTUNITY_SNAPSHOT_KEYS,
  PRODUCT_OPPORTUNITY_STAGES,
  type ProductOpportunityIssue,
  type ProductOpportunityMetadata,
} from "./product-opportunity-snapshot";

const HTTPS = /^https:\/\/[^\s]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTEXT_METADATA = ["executionMetadata", "runtimeMetadata", "configuration"] as const;

export interface ProductOpportunityValidator {
  validateInput(input: unknown): ProductOpportunityIssue[];
  validateProductFacts(input: unknown): ProductOpportunityIssue[];
  validateEvidenceGraph(input: unknown): ProductOpportunityIssue[];
  validateMapping(input: unknown): ProductOpportunityIssue[];
  validateMetadata(input: unknown): ProductOpportunityIssue[];
  validateSnapshot(input: unknown): ProductOpportunityIssue[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isFlatValue = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

export function isFlatProductOpportunityMetadata(value: unknown): value is ProductOpportunityMetadata {
  return isPlainRecord(value) && Object.entries(value).every(([key, v]) => key.trim() !== "" && isFlatValue(v));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createProductOpportunityValidator(): ProductOpportunityValidator {
  function validateMetadata(input: unknown): ProductOpportunityIssue[] {
    if (input === undefined) return [];
    if (!isFlatProductOpportunityMetadata(input)) {
      return [{ field: "metadata", message: "Invalid Metadata: a flat record of text, numbers, booleans, or null is required." }];
    }
    return [];
  }

  function validateProductFacts(input: unknown): ProductOpportunityIssue[] {
    if (!isPlainRecord(input) || input.productFacts === undefined || input.productFacts === null) {
      return [{ field: "productFacts", message: "Missing ProductFacts: a ProductFacts record is required." }];
    }
    if (!isPlainRecord(input.productFacts)) {
      return [{ field: "productFacts", message: "Missing ProductFacts: ProductFacts must be a plain record." }];
    }
    if (textOf(input.productFacts.productName) === null && textOf(input.productFacts.name) === null) {
      return [{ field: "productName", message: "Missing ProductFacts: a product name is required." }];
    }
    return [];
  }

  function validateEvidenceGraph(input: unknown): ProductOpportunityIssue[] {
    if (!isPlainRecord(input) || input.evidenceGraph === undefined || input.evidenceGraph === null) {
      return [{ field: "evidenceGraph", message: "Missing Evidence Graph: an evidence graph is required." }];
    }
    if (!isPlainRecord(input.evidenceGraph)) {
      return [{ field: "evidenceGraph", message: "Invalid Mapping: an evidence graph must be a plain record." }];
    }
    const graph = input.evidenceGraph;
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return [{ field: "evidenceGraph", message: "Invalid Mapping: an evidence graph needs a node list and an edge list." }];
    }
    const seen = new Set<string>();
    for (const node of graph.nodes) {
      if (!isPlainRecord(node) || typeof node.kind !== "string" || (node.present !== "PRESENT" && node.present !== "ABSENT")) {
        return [{ field: "evidenceGraph.nodes", message: "Invalid Mapping: each graph node needs a kind and a presence token." }];
      }
      if (!(PRODUCT_OPPORTUNITY_GRAPH_KINDS as readonly string[]).includes(node.kind)) {
        return [{ field: "evidenceGraph.nodes", message: `Invalid Mapping: unknown graph kind "${node.kind}".` }];
      }
      if (seen.has(node.kind)) {
        return [{ field: "evidenceGraph.nodes", message: `Invalid Mapping: graph kind "${node.kind}" is repeated.` }];
      }
      seen.add(node.kind);
      const field = PRODUCT_OPPORTUNITY_GRAPH_FIELDS[node.kind as keyof typeof PRODUCT_OPPORTUNITY_GRAPH_FIELDS];
      const bundle = input[field];
      if (node.present === "PRESENT" && !isPlainRecord(bundle)) {
        return [{ field, message: `Invalid Mapping: ${node.kind} is marked present and the record is missing.` }];
      }
      if (node.present === "ABSENT" && bundle !== undefined && bundle !== null) {
        return [{ field, message: `Invalid Mapping: ${node.kind} is marked absent and a record was supplied.` }];
      }
    }
    for (const kind of PRODUCT_OPPORTUNITY_GRAPH_KINDS) {
      if (!seen.has(kind)) {
        return [{ field: "evidenceGraph.nodes", message: `Invalid Mapping: evidence graph is missing "${kind}".` }];
      }
    }
    for (const edge of graph.edges) {
      if (!isPlainRecord(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") {
        return [{ field: "evidenceGraph.edges", message: "Invalid Mapping: each graph edge needs a from and a to." }];
      }
    }
    const landing = textOf(isPlainRecord(input.productFacts) ? input.productFacts.landingPage : null)
      ?? textOf(isPlainRecord(input.productFacts) ? input.productFacts.affiliatePage : null);
    if (landing === null || !HTTPS.test(landing)) {
      return [{ field: "landingPage", message: "Invalid Mapping: a well-formed https landing page is required." }];
    }
    return [];
  }

  function validateMapping(input: unknown): ProductOpportunityIssue[] {
    if (!isPlainRecord(input)) return [{ field: "mapping", message: "Invalid Mapping: an evidence mapping record is required." }];
    const issues: ProductOpportunityIssue[] = [];
    for (const field of PRODUCT_OPPORTUNITY_EVIDENCE_MAPPING_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Mapping: mapping member "${field}" is missing.` });
    }
    if (!Array.isArray(input.stages) || input.stages.join() !== PRODUCT_OPPORTUNITY_STAGES.join()) {
      issues.push({ field: "stages", message: "Invalid Mapping: stages must follow Product Intelligence, Discovery, Opportunity, Evidence Provider, and Signal Pipeline." });
    }
    if (!Array.isArray(input.entries)) {
      issues.push({ field: "entries", message: "Invalid Mapping: mapping entries must be a list." });
    } else {
      for (const entry of input.entries) {
        if (!isPlainRecord(entry) || textOf(entry.from) === null || textOf(entry.to) === null || textOf(entry.text) === null) {
          issues.push({ field: "entries", message: "Invalid Mapping: each mapping entry needs from, to, and text." });
          break;
        }
        const stage = String(entry.to).split(".")[0];
        if (!(PRODUCT_OPPORTUNITY_STAGES as readonly string[]).includes(stage ?? "")) {
          issues.push({ field: "entries", message: "Invalid Mapping: a mapping target must name a pipeline stage." });
          break;
        }
      }
    }
    if (input.origin !== "OBSERVED") issues.push({ field: "origin", message: "Invalid Mapping: origin must be OBSERVED." });
    if (input.provenance !== "DIRECT_SOURCE") issues.push({ field: "provenance", message: "Invalid Mapping: provenance must be DIRECT_SOURCE." });
    return issues;
  }

  function validateInput(input: unknown): ProductOpportunityIssue[] {
    if (!isPlainRecord(input)) {
      return [{ field: "adapter", message: "Invalid Metadata: an object of ProductFacts and an evidence graph is required." }];
    }
    const issues: ProductOpportunityIssue[] = [];
    for (const key of Object.keys(input)) {
      if (!(PRODUCT_OPPORTUNITY_CONTEXT_MEMBERS as readonly string[]).includes(key)) {
        issues.push({ field: key, message: `Invalid Metadata: unexpected member "${key}".` });
      }
    }
    issues.push(...validateProductFacts(input));
    issues.push(...validateEvidenceGraph(input));
    if (input.productIntelligenceReport !== undefined && input.productIntelligenceReport !== null && !isPlainRecord(input.productIntelligenceReport)) {
      issues.push({ field: "productIntelligenceReport", message: "Invalid Mapping: a product intelligence report must be a plain record." });
    }
    for (const key of CONTEXT_METADATA) {
      issues.push(...validateMetadata(input[key]).map((item) => ({ field: key, message: item.message.replace("metadata", `"${key}"`) })));
    }
    return issues;
  }

  function validateSnapshot(input: unknown): ProductOpportunityIssue[] {
    if (!isPlainRecord(input)) return [{ field: "snapshot", message: "Invalid Metadata: a snapshot record is required." }];
    const issues: ProductOpportunityIssue[] = [];
    for (const field of PRODUCT_OPPORTUNITY_SNAPSHOT_KEYS) {
      if (input[field] === undefined) issues.push({ field, message: `Invalid Metadata: snapshot member "${field}" is missing.` });
    }
    if (typeof input.mappingId !== "string" || !/^[a-z][a-z0-9-]*$/.test(input.mappingId)) {
      issues.push({ field: "mappingId", message: "Invalid Metadata: a well-formed mapping id is required." });
    }
    if (typeof input.productName !== "string" || input.productName.trim() === "") {
      issues.push({ field: "productName", message: "Missing ProductFacts: a product name is required." });
    }
    if (typeof input.landingPage !== "string" || !HTTPS.test(input.landingPage)) {
      issues.push({ field: "landingPage", message: "Invalid Mapping: a well-formed https landing page is required." });
    }
    if (typeof input.createdAt !== "string" || !ISO.test(input.createdAt)) {
      issues.push({ field: "createdAt", message: "Invalid Metadata: createdAt must be an ISO-8601 instant in UTC." });
    }
    issues.push(...validateMetadata(input.metadata));
    return issues;
  }

  return {
    validateInput,
    validateProductFacts,
    validateEvidenceGraph,
    validateMapping,
    validateMetadata,
    validateSnapshot,
  };
}
