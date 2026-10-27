import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import { buildContentGapReport } from "@/lib/presell-quality/content-gap-report";
import { buildEvidenceInventory } from "@/lib/presell-quality/evidence-inventory";
import { loadStoredFactCandidates, loadOrReconcileLedger } from "@/lib/presell-quality/candidate-ledger";
import { investigateCampaignSourceIdentity, readSourceIdentityReview } from "@/lib/presell-quality/source-identity";
import { prepareReviewQueue, reviewSummary } from "@/lib/presell-quality/review-prepare";
import { mapContentGapsToCandidates } from "@/lib/presell-quality/content-gap-map";
import { readEvidenceAudit } from "@/lib/presell-quality/review-decide";

export type EvidenceReviewWorkspace = {
  campaignId: number;
  run: ReturnType<typeof readLatestProductResearch>;
  ledger: ReturnType<typeof loadOrReconcileLedger>;
  queue: ReturnType<typeof prepareReviewQueue>;
  summary: ReturnType<typeof reviewSummary>;
  acceptedCount: number;
  identities: ReturnType<typeof investigateCampaignSourceIdentity>["records"];
  gaps: ReturnType<typeof mapContentGapsToCandidates>;
  lastReview: ReturnType<typeof readEvidenceAudit>[number] | null;
  regenerationRequired: boolean;
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
  const investigated = investigateCampaignSourceIdentity({
    campaignId,
    hosts: ledger.candidates.map((item) => ({ host: item.sourceHost, sourceClass: item.sourceClass })),
    acceptedSellerHosts,
  });
  const storedIdentity = readSourceIdentityReview(campaignId);
  const identities = (storedIdentity?.records ?? investigated.records).map((record) => {
    const fresh = investigated.records.find((item) => item.host === record.host);
    if (record.confirmedByHuman) return record;
    return fresh ?? record;
  });
  const rejectedIds = new Set(readEvidenceAudit(campaignId).filter((item) => item.decision === "REJECT").map((item) => item.candidateId));
  const queue = prepareReviewQueue({
    campaignId,
    candidates: ledger.candidates,
    run,
    identities,
    rejectedIds,
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
    gaps,
    lastReview: readEvidenceAudit(campaignId).at(-1) ?? null,
    regenerationRequired: ledger.regenerationRequired,
    commercialAuthorization: "BLOCKED" as const,
    publicationReadiness: "BLOCKED" as const,
  };
}
