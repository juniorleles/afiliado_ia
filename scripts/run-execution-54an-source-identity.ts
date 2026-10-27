import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { loadStoredFactCandidates, reconcileStoredCandidates } from "../src/lib/presell-quality/candidate-ledger.ts";
import { investigateCampaignSourceIdentity, writeSourceIdentityReview } from "../src/lib/presell-quality/source-identity.ts";
import {
  buildCommercialGraph,
  mergeStoredGraph,
  readCommercialGraph,
  sourceIdentityPanel,
  writeCommercialGraph,
} from "../src/lib/presell-quality/commercial-graph.ts";
import { prepareReviewQueue, reviewSummary } from "../src/lib/presell-quality/review-prepare.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54an-source-identity");

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const campaignId = 237;
  const stored = loadStoredFactCandidates(campaignId);
  const ledger = reconcileStoredCandidates({ campaignId, candidates: stored });
  const run = readLatestProductResearch(campaignId);
  const accepted = acceptedProposals(run);
  const acceptedSellerHosts = [...new Set(accepted.map((item) => {
    try {
      return item.sourceUrl ? new URL(item.sourceUrl).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  }).filter(Boolean))];
  const identity = investigateCampaignSourceIdentity({
    campaignId,
    hosts: [
      ...ledger.candidates.map((item) => ({ host: item.sourceHost, sourceClass: item.sourceClass })),
      ...readCampaignSources(campaignId).map((item) => {
        try {
          const host = new URL(item.originalUrl).hostname.toLowerCase();
          return {
            host: /(^|\.)hop\.clickbank\.net$/i.test(host) ? "hop.clickbank.net" : host,
            sourceClass: item.sourceType,
          };
        } catch {
          return { host: "", sourceClass: item.sourceType };
        }
      }),
    ],
    acceptedSellerHosts,
  });
  writeSourceIdentityReview(identity);
  const beforeQueue = prepareReviewQueue({
    campaignId,
    candidates: ledger.candidates,
    run,
    identities: identity.records,
  });
  const graph = writeCommercialGraph(mergeStoredGraph(
    buildCommercialGraph({
      campaignId,
      productName: "Sugar Defender",
      run,
      candidates: ledger.candidates,
    }),
    readCommercialGraph(campaignId),
  ));
  const afterQueue = prepareReviewQueue({
    campaignId,
    candidates: ledger.candidates,
    run,
    identities: identity.records,
    relations: graph.relations,
  });
  const before = reviewSummary(beforeQueue);
  const after = reviewSummary(afterQueue);
  const panel = sourceIdentityPanel({ graph, identities: identity.records });
  writeJson(path.join(ROOT, "source-inventory.json"), {
    campaignId,
    collectedAt: new Date().toISOString(),
    sources: readCampaignSources(campaignId).map((item) => {
      let host = "";
      try {
        host = new URL(item.originalUrl).hostname.toLowerCase();
      } catch {
        host = "";
      }
      if (/(^|\.)hop\.clickbank\.net$/i.test(host)) host = "hop.clickbank.net";
      return {
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        host,
        url: (() => {
          const cleaned = sanitizeSharedUrl(item.originalUrl).replace(/^https:\/\/[^/]*hop\.clickbank\.net\/?.*$/i, "https://hop.clickbank.net/");
          try {
            const parsed = new URL(cleaned);
            if (/\/(cart|checkout|order-now|ordernow|buy-now)/i.test(parsed.pathname)) return `${parsed.origin}${parsed.pathname}`;
            return cleaned;
          } catch {
            return cleaned;
          }
        })(),
        status: item.sourceStatus,
        classification: item.sourceClassification,
        verification: item.verificationStatus,
      };
    }),
    candidateHosts: [...new Set(ledger.candidates.map((item) => item.sourceHost))],
    acceptedSellerHosts,
  });
  writeJson(path.join(ROOT, "commercial-relationships.json"), graph);
  writeJson(path.join(ROOT, "identity-verification.json"), {
    records: identity.records,
    panel,
    verifiedSellerRelationships: graph.relations.filter((item) => item.scope === "SELLER" && item.state === "VERIFIED").length,
    verifiedManufacturerRelationships: graph.relations.filter((item) => item.scope === "MANUFACTURER" && item.state === "VERIFIED").length,
    partiallySupportedRelationships: graph.relations.filter((item) => item.state === "PARTIALLY_SUPPORTED").length,
    unresolvedRelationships: graph.relations.filter((item) => item.state === "UNRESOLVED").length,
    humanConfirmationsRecorded: 0,
  });
  writeJson(path.join(ROOT, "candidate-eligibility-before-after.json"), {
    before,
    after,
    beforeQueue: beforeQueue.map((item) => ({ id: item.candidateId, field: item.field, host: item.sourceHost, state: item.state })),
    afterQueue: afterQueue.map((item) => ({ id: item.candidateId, field: item.field, host: item.sourceHost, state: item.state, blocker: item.blocker })),
    unlocked: afterQueue.filter((item) => item.state === "READY_FOR_REVIEW").map((item) => item.candidateId),
  });
  writeJson(path.join(ROOT, "human-confirmation-workflow.json"), {
    realCampaignConfirmations: 0,
    isolatedFixtureRequired: true,
    genericConfirmationBlocked: true,
    manufacturerRequiresDocumentedProof: true,
    sellerConfirmationDoesNotVerifyManufacturer: true,
    ui: "/admin/237/fatos#etapa-evidencias",
  });
  const summaryMd = `# Execution 54AN — seller identity verification

- Sources investigated: ${[...new Set([...acceptedSellerHosts, ...ledger.candidates.map((item) => item.sourceHost)])].filter(Boolean).join(", ")}
- Relationships found: ${graph.relations.length}
- Verified seller relationships: ${graph.relations.filter((item) => item.scope === "SELLER" && item.state === "VERIFIED").length}
- Verified manufacturer relationships: ${graph.relations.filter((item) => item.scope === "MANUFACTURER" && item.state === "VERIFIED").length}
- Partially supported relationships: ${graph.relations.filter((item) => item.state === "PARTIALLY_SUPPORTED").length}
- Unresolved relationships: ${graph.relations.filter((item) => item.state === "UNRESOLVED").length}
- Candidates before/after: ${before.total}/${after.total}
- SOURCE_IDENTITY_UNRESOLVED before/after: ${before.identityUnresolved}/${after.identityUnresolved}
- READY_FOR_REVIEW before/after: ${before.readyForReview}/${after.readyForReview}
- High-risk claims: ${after.highRisk}
- Human confirmations on campaign 237: 0
- Real facts approved: 0
- Product contract changed: no
- Publication readiness: BLOCKED
- Commercial authorization: BLOCKED
`;
  writeFileSync(path.join(ROOT, "execution-summary.md"), summaryMd);
  console.log(summaryMd);
}

main();
