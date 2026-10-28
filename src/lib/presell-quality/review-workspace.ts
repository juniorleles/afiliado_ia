import { getCampaignById } from "@/lib/campaigns";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import { buildContentGapReport } from "@/lib/presell-quality/content-gap-report";
import { buildEvidenceInventory } from "@/lib/presell-quality/evidence-inventory";
import { loadStoredFactCandidates, loadOrReconcileLedger } from "@/lib/presell-quality/candidate-ledger";
import { investigateCampaignSourceIdentity, readSourceIdentityReview } from "@/lib/presell-quality/source-identity";
import {
  buildCommercialGraph,
  mergeStoredGraph,
  readCommercialGraph,
  sourceIdentityPanel,
  writeCommercialGraph,
} from "@/lib/presell-quality/commercial-graph";
import { prepareReviewQueue, reviewSummary } from "@/lib/presell-quality/review-prepare";
import { mapContentGapsToCandidates } from "@/lib/presell-quality/content-gap-map";
import { readEvidenceAudit } from "@/lib/presell-quality/review-decide";
import { evaluateRegenerationGate } from "@/lib/presell-quality/regeneration-gate";
import { buildOperationalReviewCard } from "@/lib/presell-quality/operational-theme";
import { readPrimaryPageResearch } from "@/lib/presell-quality/primary-page-research";
import { readPrimaryAffiliatePage } from "@/lib/campaign-sources/primary-page";

export type EvidenceReviewWorkspace = {
  campaignId: number;
  run: ReturnType<typeof readLatestProductResearch>;
  ledger: ReturnType<typeof loadOrReconcileLedger>;
  queue: ReturnType<typeof prepareReviewQueue>;
  summary: ReturnType<typeof reviewSummary>;
  acceptedCount: number;
  identities: ReturnType<typeof investigateCampaignSourceIdentity>["records"];
  graph: ReturnType<typeof buildCommercialGraph>;
  identityPanel: ReturnType<typeof sourceIdentityPanel>;
  verifiedSellerRelationships: number;
  verifiedManufacturerRelationships: number;
  partiallySupportedRelationships: number;
  unresolvedRelationships: number;
  gaps: ReturnType<typeof mapContentGapsToCandidates>;
  lastReview: ReturnType<typeof readEvidenceAudit>[number] | null;
  regenerationRequired: boolean;
  regenerationGate: ReturnType<typeof evaluateRegenerationGate>;
  operationalCards: ReturnType<typeof buildOperationalReviewCard>[];
  primaryPage: ReturnType<typeof readPrimaryPageResearch>;
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
};

export function loadEvidenceReviewWorkspace(campaignId: number): EvidenceReviewWorkspace {
  const run = readLatestProductResearch(campaignId);
  const stored = loadStoredFactCandidates(campaignId);
  const ledger = loadOrReconcileLedger(campaignId);
  const accepted = acceptedProposals(run);
  const acceptedSellerHosts = [...new Set(accepted.map((item) => {
    try {
      return item.sourceUrl ? new URL(item.sourceUrl).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  }).filter(Boolean))];
  const primaryPage = readPrimaryPageResearch(campaignId);
  const primaryHost = readPrimaryAffiliatePage(campaignId)?.host;
  const investigated = investigateCampaignSourceIdentity({
    campaignId,
    hosts: ledger.candidates.map((item) => ({ host: item.sourceHost, sourceClass: item.sourceClass })),
    acceptedSellerHosts,
    primaryAffiliateHosts: primaryHost ? [primaryHost] : [],
  });
  const storedIdentity = readSourceIdentityReview(campaignId);
  const storedRecords = storedIdentity?.records ?? investigated.records;
  const extras = investigated.records.filter((item) => !storedRecords.some((row) => row.host === item.host));
  const identities = [...storedRecords, ...extras].map((record) => {
    const fresh = investigated.records.find((item) => item.host === record.host);
    if (record.confirmedByHuman) return record;
    return fresh ?? record;
  });
  const campaign = getCampaignById(campaignId);
  const graph = writeCommercialGraph(mergeStoredGraph(
    buildCommercialGraph({
      campaignId,
      productName: campaign?.name,
      run,
      candidates: ledger.candidates,
    }),
    readCommercialGraph(campaignId),
  ));
  const rejectedIds = new Set(readEvidenceAudit(campaignId).filter((item) => item.decision === "REJECT").map((item) => item.candidateId));
  const queue = prepareReviewQueue({
    campaignId,
    candidates: ledger.candidates,
    run,
    identities,
    relations: graph.relations,
    rejectedIds,
    primaryAffiliateHosts: primaryHost ? [primaryHost] : [],
  });
  const inventory = buildEvidenceInventory({
    campaignId,
    run,
    candidates: stored,
    idPrefix: "54AE",
  });
  const gaps = mapContentGapsToCandidates({
    gaps: buildContentGapReport({ inventory }).gaps,
    queue,
  });
  return {
    campaignId,
    run,
    ledger,
    queue,
    summary: reviewSummary(queue),
    acceptedCount: accepted.length,
    identities,
    graph,
    identityPanel: sourceIdentityPanel({ graph, identities }),
    verifiedSellerRelationships: graph.relations.filter((item) => item.scope === "SELLER" && item.state === "VERIFIED").length,
    verifiedManufacturerRelationships: graph.relations.filter((item) => item.scope === "MANUFACTURER" && item.state === "VERIFIED").length,
    partiallySupportedRelationships: graph.relations.filter((item) => item.state === "PARTIALLY_SUPPORTED").length,
    unresolvedRelationships: graph.relations.filter((item) => item.state === "UNRESOLVED").length,
    gaps,
    lastReview: readEvidenceAudit(campaignId).at(-1) ?? null,
    regenerationRequired: ledger.regenerationRequired,
    regenerationGate: evaluateRegenerationGate({ campaignId, run }),
    operationalCards: queue.map(buildOperationalReviewCard),
    primaryPage,
    commercialAuthorization: "BLOCKED" as const,
    publicationReadiness: "BLOCKED" as const,
  };
}
