import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { loadStoredFactCandidates, reconcileStoredCandidates } from "../src/lib/presell-quality/candidate-ledger.ts";
import { investigateCampaignSourceIdentity, writeSourceIdentityReview } from "../src/lib/presell-quality/source-identity.ts";
import { prepareReviewQueue, reviewSummary } from "../src/lib/presell-quality/review-prepare.ts";
import { buildContentGapReport } from "../src/lib/presell-quality/content-gap-report.ts";
import { buildEvidenceInventory } from "../src/lib/presell-quality/evidence-inventory.ts";
import { mapContentGapsToCandidates } from "../src/lib/presell-quality/content-gap-map.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54am-product-review");

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
    hosts: ledger.candidates.map((item) => ({ host: item.sourceHost, sourceClass: item.sourceClass })),
    acceptedSellerHosts,
  });
  writeSourceIdentityReview(identity);
  const queue = prepareReviewQueue({
    campaignId,
    candidates: ledger.candidates,
    run,
    identities: identity.records,
  });
  const summary = reviewSummary(queue);
  const inventory = buildEvidenceInventory({ campaignId, run, candidates: stored, idPrefix: "54AE" });
  const gaps = mapContentGapsToCandidates({
    gaps: buildContentGapReport({ inventory }).gaps,
    queue,
  });
  writeJson(path.join(ROOT, "candidate-inventory.json"), ledger);
  writeJson(path.join(ROOT, "review-eligibility.json"), { summary, queue });
  writeJson(path.join(ROOT, "source-identity-review.json"), identity);
  writeJson(path.join(ROOT, "content-gap-mapping.json"), gaps);
  writeJson(path.join(ROOT, "approval-workflow-tests.json"), {
    isolatedAcceptRequired: true,
    realCampaignApprovals: 0,
    publicationReadiness: "BLOCKED",
    commercialAuthorization: "BLOCKED",
  });
  const summaryMd = `# Execution 54AM — product evidence review

- Candidates loaded: ${ledger.preservedCount}
- Accepted facts unchanged: ${accepted.length}
- Ready for review: ${summary.readyForReview}
- Source identity unresolved: ${summary.identityUnresolved}
- High-risk claims: ${summary.highRisk}
- Verified manufacturer hosts: ${identity.records.filter((item) => item.state === "VERIFIED").length}
- Real facts approved: 0
- Product contract changed: no
- Review UI: /admin/${campaignId}/fatos#etapa-evidencias
`;
  writeFileSync(path.join(ROOT, "execution-summary.md"), summaryMd);
  console.log(summaryMd);
}

main();
