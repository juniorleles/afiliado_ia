/**
 * Host record domain: product portfolio builder.
 *
 * Restates one product's existing report, graph, and analyses into a
 * comparison draft. It reads landing, competition, commercial, and search
 * signals, and discovery, opportunity, traffic, and decision results when
 * they were supplied. It does not run those engines and it does not approve
 * a product.
 */
import { confidenceOf, type PortfolioDraft } from "./portfolio-ranking";
import { PORTFOLIO_LEVELS, type PortfolioIssue, type PortfolioLevel } from "./portfolio-snapshot";

const SUMMARY_KINDS = [
  ["landingPageSummary", "LandingPageEvidence"],
  ["searchSummary", "SearchEvidence"],
  ["competitionSummary", "CompetitionEvidence"],
  ["commercialSummary", "CommercialEvidence"],
] as const;

const BLOCKED_DECISIONS = ["REFUSED", "BLOCKED", "CONFLICT"] as const;
const BLOCKED_DISCOVERY = ["FAILED", "IGNORED"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function slugOf(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug === "" ? "" : slug;
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

function pushMissing(items: string[], text: string) {
  if (!items.includes(text)) items.push(text);
}

function recommendationEntry(report: unknown, candidateId: string): Record<string, unknown> | null {
  if (!isRecord(report)) return null;
  if (Array.isArray(report.recommendations)) {
    const match = report.recommendations.find((item) => {
      if (!isRecord(item)) return false;
      if (textOf(item.candidateId) === candidateId) return true;
      const name = textOf(item.productName);
      return name !== null && slugOf(name) === candidateId;
    });
    if (isRecord(match)) return match;
    return null;
  }
  if (textOf(report.candidateId) !== null || textOf(report.level) !== null || typeof report.confidence === "number") return report;
  return null;
}

export interface PortfolioBuilder {
  build(bundle: Record<string, unknown>): { draft: PortfolioDraft | null; issues: PortfolioIssue[] };
}

export function createPortfolioBuilder(): PortfolioBuilder {
  function build(bundle: Record<string, unknown>): { draft: PortfolioDraft | null; issues: PortfolioIssue[] } {
    const report = isRecord(bundle.productIntelligenceReport) ? bundle.productIntelligenceReport : null;
    if (report === null) return { draft: null, issues: [{ field: "productIntelligenceReport", message: "Missing Reports: a Product Intelligence Report is required." }] };
    const imported = isRecord(report.importedProduct) ? report.importedProduct : null;
    const productName = imported ? textOf(imported.productName) : null;
    if (productName === null) return { draft: null, issues: [{ field: "productIntelligenceReport", message: "Missing Reports: a product name is required." }] };

    const discovery = isRecord(bundle.discoveryAnalysis) ? bundle.discoveryAnalysis : null;
    const opportunity = isRecord(bundle.opportunityAnalysis) ? bundle.opportunityAnalysis : null;
    const traffic = isRecord(bundle.trafficAnalysis) ? bundle.trafficAnalysis : null;
    const decision = isRecord(bundle.decisionAnalysis) ? bundle.decisionAnalysis : null;
    const candidateId = textOf(discovery?.id) ?? textOf(discovery?.candidateId) ?? textOf(opportunity?.candidateId) ?? slugOf(productName);
    if (candidateId === "") return { draft: null, issues: [{ field: "productIntelligenceReport", message: "Missing Reports: a product name is required." }] };

    const graph = isRecord(bundle.evidenceGraph) ? bundle.evidenceGraph : isRecord(report.evidenceGraph) ? report.evidenceGraph : null;
    const missing: string[] = [];
    const negative: string[] = [];
    for (const item of stringsOf(report.missingEvidence)) pushMissing(missing, item);
    if (graph !== null && Array.isArray(graph.nodes)) {
      for (const node of graph.nodes) {
        if (!isRecord(node) || typeof node.kind !== "string") continue;
        if (node.present === "ABSENT") pushMissing(missing, node.kind);
        if (isRecord(report.evidenceSummary)) {
          const summaryField =
            node.kind === "ProductFacts"
              ? "productFacts"
              : node.kind === "LandingPageEvidence"
                ? "landingPageEvidence"
                : node.kind === "SearchEvidence"
                  ? "searchEvidence"
                  : node.kind === "CompetitionEvidence"
                    ? "competitionEvidence"
                    : node.kind === "CommercialEvidence"
                      ? "commercialEvidence"
                      : null;
          if (summaryField !== null && report.evidenceSummary[summaryField] !== undefined && report.evidenceSummary[summaryField] !== node.present) {
            return { draft: null, issues: [{ field: "evidenceGraph", message: `Corrupted Portfolio: evidence graph presence for "${node.kind}" does not match the report.` }] };
          }
        }
      }
    }

    const landing = isRecord(report.landingPageSummary) ? report.landingPageSummary : null;
    const search = isRecord(report.searchSummary) ? report.searchSummary : null;
    const competition = isRecord(report.competitionSummary) ? report.competitionSummary : null;
    const commercial = isRecord(report.commercialSummary) ? report.commercialSummary : null;
    for (const [section, kind] of SUMMARY_KINDS) {
      if (!isRecord(report[section])) pushMissing(missing, kind);
    }

    const recommendation = recommendationEntry(bundle.recommendationReport, candidateId);
    for (const item of stringsOf(recommendation?.missingEvidence)) pushMissing(missing, item);
    if (Array.isArray(recommendation?.negativeEvidence)) {
      for (const item of recommendation.negativeEvidence) {
        if (isRecord(item) && textOf(item.text) !== null) negative.push(textOf(item.text) as string);
        else if (typeof item === "string" && item.trim() !== "") negative.push(item.trim());
      }
    }

    const discoveryStatus = textOf(discovery?.status);
    const opportunityStatus = textOf(opportunity?.status);
    const trafficStatus = textOf(traffic?.status);
    const decisionStatus = textOf(decision?.decisionStatus);
    if (discovery === null) pushMissing(missing, "DiscoveryResults");
    if (opportunity === null) pushMissing(missing, "OpportunityResults");
    if (traffic === null) pushMissing(missing, "TrafficResults");
    if (decision === null) pushMissing(missing, "DecisionResults");
    if (discoveryStatus !== null && (BLOCKED_DISCOVERY as readonly string[]).includes(discoveryStatus)) negative.push(discoveryStatus);
    if (opportunityStatus === "FAILED" || opportunityStatus === "REFUSED") negative.push(opportunityStatus);
    if (trafficStatus === "FAILED" || trafficStatus === "REFUSED") negative.push(trafficStatus);
    if (decisionStatus !== null && (BLOCKED_DECISIONS as readonly string[]).includes(decisionStatus)) negative.push(decisionStatus);

    const stated = recommendation && typeof recommendation.confidence === "number" && Number.isFinite(recommendation.confidence) ? recommendation.confidence : null;
    const presentSignals = [landing, search, competition, commercial, discovery, opportunity, traffic, decision].filter((item) => item !== null).length;
    const confidence = stated !== null && stated >= 0 && stated <= 1 ? stated : confidenceOf(presentSignals, negative.length, missing.length);
    const levelText = textOf(recommendation?.level);
    const level: PortfolioLevel | null = levelText !== null && (PORTFOLIO_LEVELS as readonly string[]).includes(levelText) ? (levelText as PortfolioLevel) : null;

    const draft: PortfolioDraft = {
      productName,
      candidateId,
      confidence,
      level,
      missingEvidence: missing,
      negativeEvidence: negative,
      observedSignals: presentSignals,
      landingPage: landing ? textOf(landing.headline) ?? textOf(landing.priceVisibility) : null,
      competition: competition ? textOf(competition.brandPresence) ?? (typeof competition.numberOfAdvertisers === "number" ? String(competition.numberOfAdvertisers) : null) : null,
      commercial: commercial ? textOf(commercial.directPurchaseIntent) : null,
      search: search ? textOf(search.searchResultPresence) ?? textOf(search.officialWebsite) : null,
      discoveryStatus,
      opportunityStatus,
      trafficStatus,
      decisionStatus,
    };
    return { draft, issues: [] };
  }

  return { build };
}
