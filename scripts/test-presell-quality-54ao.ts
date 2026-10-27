// npx tsx scripts/test-presell-quality-54ao.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { writeProductResearchRun } from "../src/lib/product-research/store.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import { loadStoredFactCandidates } from "../src/lib/presell-quality/candidate-ledger.ts";
import { extractAndPersistOperationalFacts, extractOperationalFactsFromDocuments, readOperationalCandidates } from "../src/lib/presell-quality/operational-extract.ts";
import { classifySourceIdentity } from "../src/lib/presell-quality/source-identity.ts";
import { buildCommercialGraph } from "../src/lib/presell-quality/commercial-graph.ts";
import { prepareReviewQueue } from "../src/lib/presell-quality/review-prepare.ts";
import { loadOrReconcileLedger, reconcileStoredCandidates, writeCandidateLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { evidenceReviewAuthGate } from "../src/lib/presell-quality/review-decide.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function proposal(field: FieldProposal["field"], text: string, status: FieldProposal["status"], sourceUrl = "https://example.test/novalis"): FieldProposal {
  return {
    field,
    currentValue: text,
    suggestedValue: text,
    status,
    evidenceIds: text ? ["ev-n1"] : [],
    sourceUrl,
    sourceClass: "SELLER",
    verification: "SELLER_STATED",
    restriction: "PUBLISHABLE",
    collectedAt: "2026-01-01T00:00:00.000Z",
    eligibleForBatch: false,
    notes: [],
    evidenceIncomplete: !text,
  };
}

function fakeRun(campaignId: number, proposals: FieldProposal[]): ProductResearchRun {
  return {
    version: 1,
    runId: `run-ao-${campaignId}`,
    campaignId,
    productName: "Novalis Core",
    status: "COMPLETED",
    stage: "done",
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:00.000Z",
    seeds: [],
    seedRejection: null,
    limitations: [],
    sources: [],
    coverageTotal: proposals.length,
    coverageMax: 11,
    reviewAccepted: proposals.filter((item) => item.status === "ACCEPTED").length,
    reviewTotal: proposals.length,
    publicationReadiness: "BLOCKED",
    publicationReason: "quality",
    grounding: "PASS",
    neutrality: "PASS",
    contentQuality: "PASS",
    commercialAuthorization: "BLOCKED",
    proposals,
    decisions: [],
    error: null,
  };
}

const SHIPPING_HTML = `<html><body>
<p>Orders are processed within 24 hours after payment is confirmed.</p>
<p>United States: Free, 5 - 7 working days</p>
<p>Shipping fees apply to destinations outside the listed regions.</p>
</body></html>`;
const RETURNS_HTML = `<html><body>
<p>You have 60 days from the date of delivery to return the product and request a refund.</p>
<p>Send the product back with the packing slip included in the package.</p>
</body></html>`;
const CONTACT_HTML = `<html><body>
<p>Email support at support@example.test for order questions.</p>
</body></html>`;
const MEDICAL_HTML = `<html><body><p>Clinically proven to treat fatigue in 14 days.</p></body></html>`;

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const stored = loadStoredFactCandidates(237);
  const run237 = readLatestProductResearch(237);
  assert(stored.length === 42, "1. carregamento de evidencias");
  assert(acceptedProposals(run237).length === 4, "17. quatro fatos ACCEPTED preservados");
  const before237 = campaignIntegritySnapshot(237);

  const extracts = extractOperationalFactsFromDocuments({
    documents: [
      { url: "https://example.test/info/shipping.html", html: SHIPPING_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/return-policy.html", html: RETURNS_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/contact.html", html: CONTACT_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
    ],
    accepted: [
      proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund.", "ACCEPTED"),
    ],
    existing: [],
  });
  assert(extracts.some((item) => /24 hours|working days|shipping fees/i.test(item.text)), "2. extracao operacional / 7. prazos");
  assert(extracts.every((item) => item.excerpt && item.sourceUrl.includes("example.test")), "3. trecho original e 4. origem");
  assert(extracts.every((item) => item.verification === "SELLER_STATED"), "5. atribuicao ao vendedor");
  assert(extracts.some((item) => /packing slip|60 days/i.test(item.text)), "8. condicoes comerciais");
  const again = extractOperationalFactsFromDocuments({
    documents: [
      { url: "https://example.test/info/shipping.html", html: SHIPPING_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
    ],
    accepted: [],
    existing: extracts.map((item) => ({
      field: item.field,
      text: item.text,
      sourceUrl: item.sourceUrl,
      sourceClass: item.sourceClass,
      excerpt: item.excerpt,
      collectedAt: item.collectedAt,
      verification: item.verification,
      usable: true,
      approvedForUse: false as const,
      blockReason: null,
      duplicateOf: null,
    })),
  });
  assert(again.length === 0, "9. deduplicacao");

  const root = mkdtempSync(path.join(os.tmpdir(), "54ao-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;
  process.env.AIA_PRODUCT_RESEARCH_ROOT = path.join(root, "research");
  const isolated = createCampaign({
    name: "Novalis 54AO",
    slug: `novalis-54ao-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  mkdirSync(path.join(root, String(isolated.id)), { recursive: true });
  writeFileSync(path.join(root, String(isolated.id), "expansion-54ae.json"), JSON.stringify({
    factCandidates: [],
    inventory: [
      { requestedUrl: "https://example.test/info/shipping.html", finalUrl: "https://example.test/info/shipping.html", extracted: true, htmlBytes: SHIPPING_HTML.length, sourceClass: "SELLER" },
    ],
  }));
  const run = writeProductResearchRun(fakeRun(isolated.id, [
    proposal("description", "Novalis Core is a documented mineral capsule.", "ACCEPTED"),
    proposal("ingredients", "Mineral blend", "ACCEPTED"),
    proposal("howItWorks", "Take one capsule daily.", "ACCEPTED"),
    proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund.", "ACCEPTED"),
    proposal("faq", "", "NOT_FOUND"),
    proposal("manufacturer", "", "NOT_FOUND"),
  ]));
  const first = await extractAndPersistOperationalFacts({
    campaignId: isolated.id,
    documents: [
      { url: "https://example.test/info/shipping.html", html: SHIPPING_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/return-policy.html", html: RETURNS_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/contact.html", html: CONTACT_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/shipping.html", html: MEDICAL_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
    ],
  });
  assert(first.newCandidates.length > 0, "11. persistencia de novos candidatos");
  const second = await extractAndPersistOperationalFacts({
    campaignId: isolated.id,
    documents: [
      { url: "https://example.test/info/shipping.html", html: SHIPPING_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/return-policy.html", html: RETURNS_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
      { url: "https://example.test/info/contact.html", html: CONTACT_HTML, fetchedAt: "2026-01-01T00:00:00.000Z", sourceClass: "SELLER" },
    ],
  });
  assert(second.newCandidates.length === first.newCandidates.length, "10. idempotencia");
  assert(readOperationalCandidates(isolated.id).length === first.newCandidates.length, "11. arquivo persistido");
  const ledger = writeCandidateLedger(reconcileStoredCandidates({
    campaignId: isolated.id,
    candidates: [
      ...loadStoredFactCandidates(isolated.id),
      ...readOperationalCandidates(isolated.id),
    ],
    idPrefix: "54AE",
  }));
  const identity = classifySourceIdentity({ host: "example.test", acceptedSellerHosts: ["example.test"] });
  const graph = buildCommercialGraph({ campaignId: isolated.id, productName: "Novalis Core", run, candidates: ledger.candidates });
  const queue = prepareReviewQueue({
    campaignId: isolated.id,
    candidates: ledger.candidates,
    run,
    identities: [identity],
    relations: graph.relations,
  });
  assert(queue.some((item) => item.state === "READY_FOR_REVIEW" && item.field === "faq"), "12. elegibilidade operacional");
  assert(!queue.some((item) => /clinically proven|treat fatigue/i.test(item.extractedValue) && item.eligible), "13. alegacao medica bloqueada");
  assert(queue.filter((item) => item.field === "manufacturer").every((item) => item.state !== "READY_FOR_REVIEW" || identity.role === "MANUFACTURER"), "14. fabricante nao verificado");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "16. autorizacao");
  assert(readFileSync(path.join(process.cwd(), "src/app/admin/[id]/fatos/research-actions.ts"), "utf8").includes("requireAdmin()"), "16. acao exige admin");
  assert(readFileSync(path.join(process.cwd(), "src/components/product-review/evidence-review-step.tsx"), "utf8").includes("data-ready"), "15. interface destaca prontos");
  assert(acceptedProposals(run).length === 4, "17. contract isolado preservado");
  assert(run.publicationReadiness === "BLOCKED", "19. publicacao bloqueada");
  assert(run.commercialAuthorization === "BLOCKED", "20. CTA comercial bloqueado");
  assert(
    ["description", "ingredients", "howItWorks", "guarantee"].every((field) => acceptedProposals(run237).some((item) => item.field === field)),
    "18. product contract 237 intacto",
  );
  assert(loadOrReconcileLedger(isolated.id).candidates.length >= first.newCandidates.length, "11. ledger incorpora operacionais");
  console.log(`PASS test-presell-quality-54ao.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
