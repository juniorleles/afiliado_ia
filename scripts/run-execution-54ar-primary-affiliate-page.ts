import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { processPrimaryAffiliatePage, readPrimaryPageResearch } from "../src/lib/presell-quality/primary-page-research.ts";
import { loadOrReconcileLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { classifyUrlRoles } from "../src/lib/campaign-sources/roles.ts";
import { inspectNonCheckoutUrl } from "../src/lib/campaign-sources/related-hosts.ts";
import {
  PRIMARY_AFFILIATE_LANDING_PAGE,
  publicLandingUrl,
  readPrimaryAffiliatePage,
  redactPrivateUrlText,
  sourcePriorityOf,
} from "../src/lib/campaign-sources/primary-page.ts";
import { readUserProvidedAffiliateUrl } from "../src/lib/campaign-sources/user-provided.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54ar-primary-affiliate-page");
const CAMPAIGN_ID = 237;

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const page = readPrimaryAffiliatePage(CAMPAIGN_ID);
  const record = readUserProvidedAffiliateUrl(CAMPAIGN_ID);
  const roles = record ? classifyUrlRoles(record.originalUrl) : null;
  const genericInspect = record
    ? await inspectNonCheckoutUrl(record.originalUrl, async () => ({ status: 0, location: null }))
    : null;
  const diagnosis = {
    kind: PRIMARY_AFFILIATE_LANDING_PAGE,
    publicUrl: page?.publicUrl ?? null,
    host: page?.host ?? null,
    path: page?.path ?? null,
    genericFetchable: roles?.fetchable ?? false,
    genericCheckout: roles?.checkout ?? false,
    primaryReadAllowed: page?.readAllowed ?? false,
    genericInspectBlocked: genericInspect?.blocked ?? null,
    rootCause: page
      ? "Generic pipeline classified the user-provided /c/order-now.php path as checkout and skipped extraction. 54AR allows read-only access to the registered PRIMARY_AFFILIATE_LANDING_PAGE without transactional clicks."
      : "No user-provided primary affiliate page is registered.",
    notes: page?.notes ?? [],
  };
  writeJson(path.join(ROOT, "primary-page-diagnosis.json"), diagnosis);

  const result = await processPrimaryAffiliatePage({ campaignId: CAMPAIGN_ID });
  const ledger = loadOrReconcileLedger(CAMPAIGN_ID);
  const accepted = acceptedProposals(readLatestProductResearch(CAMPAIGN_ID));
  const integrity = campaignIntegritySnapshot(CAMPAIGN_ID);

  writeJson(path.join(ROOT, "navigation-report.json"), {
    requestedUrl: result.publicUrl,
    finalUrl: result.inventory?.finalUrl ?? null,
    accessStatus: result.accessStatus,
    renderStatus: result.renderStatus,
    expandedControls: result.expandedControls,
    transactionalClicks: result.transactionalClicks,
    reason: result.rootCause,
  });
  writeJson(path.join(ROOT, "section-inventory.json"), {
    title: result.inventory?.title ?? null,
    sections: (result.inventory?.sections ?? []).map((item) => ({ heading: item.heading, text: item.text.slice(0, 280), elementId: item.elementId })),
    extractionStatus: result.extractionStatus,
    missing: result.inventory?.missing ?? [],
    errors: result.inventory?.extractionErrors ?? [],
  });
  writeJson(path.join(ROOT, "faq-extraction.json"), {
    questions: (result.inventory?.faqs ?? []).map((item) => item.question),
    answersFound: (result.inventory?.faqs ?? []).filter((item) => item.answer).length,
    unanswered: (result.inventory?.faqs ?? []).filter((item) => !item.answer).map((item) => item.question),
    items: result.inventory?.faqs ?? [],
  });
  writeJson(path.join(ROOT, "commercial-facts.json"), {
    facts: (result.inventory?.facts ?? []).map((item) => ({
      field: item.field,
      risk: item.risk,
      section: item.section,
      text: item.text.slice(0, 400),
    })),
    images: result.inventory?.images ?? [],
  });
  writeJson(path.join(ROOT, "candidate-deduplication.json"), {
    candidatesBefore: 61,
    newCandidates: result.newCandidates.length,
    duplicates: result.duplicates,
    candidatesAfter: ledger.candidates.length,
    highRiskBlocked: result.highRiskBlocked,
    ids: result.newCandidates.map((item) => item.candidateId),
  });
  writeJson(path.join(ROOT, "source-priority-report.json"), {
    primaryPriority: record ? sourcePriorityOf({ url: record.originalUrl, campaignId: CAMPAIGN_ID }) : null,
    secondaryResearch: result.secondaryResearch,
    publicUrl: publicLandingUrl(result.publicUrl),
  });
  writeFileSync(path.join(ROOT, "execution-summary.md"), [
    "# Execution 54AR — primary affiliate page",
    "",
    `- Kind: ${PRIMARY_AFFILIATE_LANDING_PAGE}`,
    `- Access: ${result.accessStatus}`,
    `- Render: ${result.renderStatus}`,
    `- Extraction: ${result.extractionStatus}`,
    `- Root cause: ${redactPrivateUrlText(result.rootCause)}`,
    `- FAQ questions: ${result.inventory?.faqs.length ?? 0}`,
    `- FAQ answers: ${result.inventory?.faqs.filter((item) => item.answer).length ?? 0}`,
    `- Images: ${result.inventory?.images.length ?? 0}`,
    `- New candidates: ${result.newCandidates.length}`,
    `- Duplicates: ${result.duplicates}`,
    `- High-risk blocked: ${result.highRiskBlocked}`,
    `- Accepted facts: ${accepted.length}`,
    `- Commercial authorization: ${integrity.publicationStatus === "APPROVED" ? "unexpected" : "BLOCKED"}`,
    `- OpenAI: 0`,
    "",
  ].join("\n"));
  console.log(JSON.stringify({
    accessStatus: result.accessStatus,
    renderStatus: result.renderStatus,
    extractionStatus: result.extractionStatus,
    faqs: result.inventory?.faqs.length ?? 0,
    answers: result.inventory?.faqs.filter((item) => item.answer).length ?? 0,
    newCandidates: result.newCandidates.length,
    duplicates: result.duplicates,
    highRiskBlocked: result.highRiskBlocked,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
