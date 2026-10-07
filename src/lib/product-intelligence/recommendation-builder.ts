/**
 * Host record domain: product recommendation builder.
 *
 * Restates observed evidence into one recommendation draft. Positive evidence
 * is what was observed. Negative evidence is what the existing analyses
 * already named as blocked or failed. Missing evidence is what the report
 * and the graph already list as absent. This builder does not approve a
 * product and does not change another engine's record.
 */
import { confidenceOf, type RecommendationDraft } from "./ranking-engine";
import type { RecommendationEvidenceItem, RecommendationLevel } from "./recommendation-snapshot";

const PRESENCE_PATHS = [
  ["landingPageSummary", "priceVisibility"],
  ["searchSummary", "searchResultPresence"],
  ["searchSummary", "sponsoredResultPresence"],
  ["competitionSummary", "brandPresence"],
  ["competitionSummary", "marketplacePresence"],
  ["commercialSummary", "directPurchaseIntent"],
  ["commercialSummary", "priceVisibility"],
  ["commercialSummary", "commercialSearchPresence"],
  ["commercialSummary", "sponsoredSearchPresence"],
  ["commercialSummary", "supportAvailability"],
] as const;

const TEXT_PATHS = [
  ["importedProduct", "productName"],
  ["importedProduct", "vendor"],
  ["importedProduct", "category"],
  ["importedProduct", "landingPage"],
  ["landingPageSummary", "headline"],
  ["landingPageSummary", "primaryCta"],
  ["landingPageSummary", "guarantee"],
  ["landingPageSummary", "refundPolicy"],
  ["searchSummary", "officialWebsite"],
] as const;

const COUNT_PATHS = [
  ["searchSummary", "sponsoredResultCount"],
  ["competitionSummary", "numberOfAdvertisers"],
] as const;

const BLOCKED_DECISIONS = ["REFUSED", "BLOCKED", "CONFLICT"] as const;
const BLOCKED_DISCOVERY = ["FAILED", "IGNORED"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export interface RecommendationBuilder {
  build(bundle: Record<string, unknown>): RecommendationDraft;
}

export function createRecommendationBuilder(): RecommendationBuilder {
  function build(bundle: Record<string, unknown>): RecommendationDraft {
    const report = isRecord(bundle.productIntelligenceReport) ? bundle.productIntelligenceReport : {};
    const graph = isRecord(bundle.evidenceGraph) ? bundle.evidenceGraph : {};
    const discovery = isRecord(bundle.discoveryAnalysis) ? bundle.discoveryAnalysis : {};
    const opportunity = isRecord(bundle.opportunityAnalysis) ? bundle.opportunityAnalysis : {};
    const traffic = isRecord(bundle.trafficAnalysis) ? bundle.trafficAnalysis : {};
    const decision = isRecord(bundle.decisionAnalysis) ? bundle.decisionAnalysis : {};
    const imported = isRecord(report.importedProduct) ? report.importedProduct : {};
    const productName = textOf(imported.productName) ?? "";
    const candidateId = textOf(discovery.id) ?? textOf(discovery.candidateId) ?? "";
    const discoveryStatus = textOf(discovery.status) ?? "";
    const opportunityStatus = textOf(opportunity.status) ?? "";
    const trafficStatus = textOf(traffic.status) ?? "";
    const decisionStatus = textOf(decision.decisionStatus) ?? "";

    const positive: RecommendationEvidenceItem[] = [];
    const negative: RecommendationEvidenceItem[] = [];
    const missing: string[] = [];
    const pushMissing = (text: string) => {
      if (!missing.includes(text)) missing.push(text);
    };

    for (const node of Array.isArray(graph.nodes) ? graph.nodes : []) {
      if (!isRecord(node) || typeof node.kind !== "string") continue;
      if (node.present === "PRESENT") positive.push({ field: `evidenceGraph.${node.kind}`, text: "PRESENT" });
      if (node.present === "ABSENT") pushMissing(node.kind);
    }
    for (const item of stringsOf(report.missingEvidence)) pushMissing(item);

    for (const [section, field] of PRESENCE_PATHS) {
      const source = isRecord(report[section]) ? report[section] : null;
      if (source === null) continue;
      const token = source[field];
      if (token === "PRESENT") positive.push({ field: `${section}.${field}`, text: "PRESENT" });
      if (token === "ABSENT") pushMissing(`${section}.${field}`);
    }
    for (const [section, field] of TEXT_PATHS) {
      const source = isRecord(report[section]) ? report[section] : {};
      const text = textOf(source[field]);
      if (text !== null) positive.push({ field: `${section}.${field}`, text });
    }
    for (const [section, field] of COUNT_PATHS) {
      const source = isRecord(report[section]) ? report[section] : null;
      if (source === null) continue;
      const count = source[field];
      if (typeof count === "number" && Number.isFinite(count)) positive.push({ field: `${section}.${field}`, text: String(count) });
    }

    if (discoveryStatus !== "") {
      const item = { field: "discoveryAnalysis.status", text: discoveryStatus };
      if ((BLOCKED_DISCOVERY as readonly string[]).includes(discoveryStatus)) negative.push(item);
      else positive.push(item);
    }
    if (opportunityStatus !== "") {
      const item = { field: "opportunityAnalysis.status", text: opportunityStatus };
      if (opportunityStatus === "FAILED" || opportunityStatus === "REFUSED") negative.push(item);
      else if (opportunityStatus === "COMPLETED") positive.push(item);
    }
    if (trafficStatus !== "") {
      const item = { field: "trafficAnalysis.status", text: trafficStatus };
      if (trafficStatus === "FAILED" || trafficStatus === "REFUSED") negative.push(item);
      else if (trafficStatus === "COMPLETED") positive.push(item);
    }
    if (decisionStatus !== "") {
      const item = { field: "decisionAnalysis.decisionStatus", text: decisionStatus };
      if ((BLOCKED_DECISIONS as readonly string[]).includes(decisionStatus)) negative.push(item);
      else if (decisionStatus === "CLEARED") positive.push(item);
      else if (decisionStatus === "INCOMPLETE") pushMissing("Decision analysis is INCOMPLETE");
    }
    for (const ruleId of stringsOf(decision.blockingRules)) negative.push({ field: "decisionAnalysis.blockingRules", text: ruleId });
    for (const ruleId of stringsOf(decision.failedRules)) negative.push({ field: "decisionAnalysis.failedRules", text: ruleId });

    const level: RecommendationLevel =
      missing.length > 0 || (BLOCKED_DECISIONS as readonly string[]).includes(decisionStatus) || (BLOCKED_DISCOVERY as readonly string[]).includes(discoveryStatus)
        ? "INSUFFICIENT"
        : decisionStatus === "CLEARED" && opportunityStatus === "COMPLETED" && trafficStatus === "COMPLETED"
          ? "EXECUTION_CANDIDATE"
          : "HOLD";
    const riskItems = negative.map((item) => item.text);
    const readinessText = `Discovery ${discoveryStatus}. Opportunity ${opportunityStatus}. Traffic ${trafficStatus}. Decision ${decisionStatus}.`;
    return {
      productName,
      candidateId,
      level,
      confidence: confidenceOf(positive.length, negative.length, missing.length),
      positiveEvidence: positive,
      negativeEvidence: negative,
      missingEvidence: missing,
      riskSummary: {
        items: riskItems,
        text: riskItems.length === 0 ? "No negative evidence was observed." : riskItems.join("; "),
      },
      readinessSummary: {
        discoveryStatus,
        opportunityStatus,
        trafficStatus,
        decisionStatus,
        text: readinessText,
      },
      origin: "OBSERVED",
      provenance: "DIRECT_SOURCE",
    };
  }

  return { build };
}
