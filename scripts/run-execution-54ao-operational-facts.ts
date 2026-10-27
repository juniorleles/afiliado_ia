import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { loadOrReconcileLedger, loadStoredFactCandidates } from "../src/lib/presell-quality/candidate-ledger.ts";
import { extractAndPersistOperationalFacts } from "../src/lib/presell-quality/operational-extract.ts";
import { classifySourceIdentity, investigateCampaignSourceIdentity } from "../src/lib/presell-quality/source-identity.ts";
import { buildCommercialGraph } from "../src/lib/presell-quality/commercial-graph.ts";
import { prepareReviewQueue, reviewSummary } from "../src/lib/presell-quality/review-prepare.ts";
import { buildContentGapReport } from "../src/lib/presell-quality/content-gap-report.ts";
import { buildEvidenceInventory } from "../src/lib/presell-quality/evidence-inventory.ts";
import { mapContentGapsToCandidates } from "../src/lib/presell-quality/content-gap-map.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54ao-operational-facts");

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const campaignId = 237;
  const beforeCandidates = loadStoredFactCandidates(campaignId);
  const run = readLatestProductResearch(campaignId);
  const accepted = acceptedProposals(run);
  const acceptedSellerHosts = [...new Set(accepted.map((item) => {
    try {
      return item.sourceUrl ? new URL(item.sourceUrl).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  }).filter(Boolean))];
  const extracted = await extractAndPersistOperationalFacts({ campaignId });
  const ledger = loadOrReconcileLedger(campaignId);
  const identities = investigateCampaignSourceIdentity({
    campaignId,
    hosts: ledger.candidates.map((item) => ({ host: item.sourceHost, sourceClass: item.sourceClass })),
    acceptedSellerHosts,
  }).records;
  const graph = buildCommercialGraph({
    campaignId,
    productName: "Sugar Defender",
    run,
    candidates: ledger.candidates,
  });
  const queue = prepareReviewQueue({
    campaignId,
    candidates: ledger.candidates,
    run,
    identities,
    relations: graph.relations,
  });
  const summary = reviewSummary(queue);
  const inventory = buildEvidenceInventory({ campaignId, run, candidates: beforeCandidates, idPrefix: "54AE" });
  const gaps = mapContentGapsToCandidates({
    gaps: buildContentGapReport({ inventory }).gaps,
    queue,
  });
  const ready = queue.filter((item) => item.state === "READY_FOR_REVIEW");
  const newReady = ready.filter((item) => item.candidateId.startsWith("54AO-"));
  const enrichment =
    newReady.length > 0
      ? "EVIDENCE_ENRICHMENT_SUCCESS"
      : extracted.newCandidates.length > 0
        ? "EVIDENCE_ENRICHMENT_PARTIAL"
        : "EVIDENCE_ENRICHMENT_EXHAUSTED";
  const viability = {
    result: enrichment,
    newCandidates: extracted.newCandidates.length,
    readyForReview: summary.readyForReview,
    recommendedNextAction:
      enrichment === "EVIDENCE_ENRICHMENT_SUCCESS"
        ? "Human review of READY_FOR_REVIEW operational candidates. Do not auto-accept."
        : enrichment === "EVIDENCE_ENRICHMENT_EXHAUSTED"
          ? "Stop investigating this product until new external evidence is provided."
          : "Keep candidates blocked until the recorded objective requirement is met.",
  };
  writeJson(path.join(ROOT, "stored-document-inventory.json"), extracted.documents.map((item) => ({
    ...item,
    url: sanitizeSharedUrl(item.url),
  })));
  writeJson(path.join(ROOT, "operational-extractions.json"), extracted.extracts);
  writeJson(path.join(ROOT, "new-candidates.json"), extracted.newCandidates);
  writeJson(path.join(ROOT, "deduplication-report.json"), {
    before: beforeCandidates.length,
    extracted: extracted.extracts.length,
    persisted: extracted.newCandidates.length,
    duplicatesRejected: extracted.duplicatesRejected,
  });
  writeJson(path.join(ROOT, "eligibility-report.json"), {
    summary,
    queue: queue.map((item) => ({
      id: item.candidateId,
      field: item.field,
      host: item.sourceHost,
      state: item.state,
      eligible: item.eligible,
      blocker: item.blocker,
    })),
  });
  writeJson(path.join(ROOT, "content-gap-update.json"), gaps);
  writeJson(path.join(ROOT, "campaign-viability.json"), viability);
  const summaryMd = `# Execution 54AO — operational facts extraction

- Stored documents found: ${extracted.documents.length}
- Documents with HTML: ${extracted.documents.filter((item) => item.htmlAvailable).length}
- Operational extracts: ${extracted.extracts.length}
- Candidates before/after: ${beforeCandidates.length}/${ledger.candidates.length}
- New persisted candidates: ${extracted.newCandidates.length}
- Duplicates rejected: ${extracted.duplicatesRejected}
- READY_FOR_REVIEW: ${summary.readyForReview}
- SOURCE_IDENTITY_UNRESOLVED: ${summary.identityUnresolved}
- High-risk: ${summary.highRisk}
- Content gaps: ${gaps.length}
- Gaps with ready candidates: ${gaps.filter((item) => item.resolutionPossible === "AFTER_HUMAN_ACCEPT" && item.relatedCandidateIds.some((id) => id.startsWith("54AO-"))).length}
- Enrichment: ${enrichment}
- Real facts approved: 0
- Product contract changed: no
`;
  writeFileSync(path.join(ROOT, "execution-summary.md"), summaryMd);
  console.log(summaryMd);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
