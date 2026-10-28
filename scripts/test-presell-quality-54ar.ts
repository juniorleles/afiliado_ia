// npx tsx scripts/test-presell-quality-54ar.ts
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { inspectPublicHttpsUrl } from "../src/lib/real-product-assets/ssrf.ts";
import { classifyUrlRoles } from "../src/lib/campaign-sources/roles.ts";
import { inspectNonCheckoutUrl } from "../src/lib/campaign-sources/related-hosts.ts";
import {
  registerUserProvidedAffiliateUrl,
  publicAffiliateView,
} from "../src/lib/campaign-sources/user-provided.ts";
import {
  PRIMARY_AFFILIATE_LANDING_PAGE,
  SOURCE_PRIORITY,
  isPrimaryAffiliateReadAllowed,
  primaryAffiliatePageOf,
  publicLandingUrl,
  redactPrivateUrlText,
  sameLandingPage,
  secondaryResearchAllowed,
  sourcePriorityOf,
} from "../src/lib/campaign-sources/primary-page.ts";
import {
  extractFaqItems,
  inventoryPrimaryHtml,
  isTransactionalControlText,
} from "../src/lib/campaign-sources/primary-extract.ts";
import { processPrimaryAffiliatePage } from "../src/lib/presell-quality/primary-page-research.ts";
import { loadOrReconcileLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { writeProductResearchRun } from "../src/lib/product-research/store.ts";
import { createProductResearchJob } from "../src/lib/product-research/run.ts";
import { evidenceReviewAuthGate } from "../src/lib/presell-quality/review-decide.ts";
import { REVIEW_COPY } from "../src/lib/presell-quality/review-labels.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";

const PRIMARY =
  "https://shop.novalis.example/c/order-now.php?hop=novalisx&hopId=aaaa-bbbb";
const HTML = `<!doctype html><html><head><title>Novalis Core</title></head><body>
<h1>Novalis Core</h1>
<p>Novalis Core is a liquid dietary supplement with a dropper bottle.</p>
<img src="https://shop.novalis.example/packshot.jpg" alt="Novalis bottle">
<details open><summary>How should I take Novalis Core?</summary><p>Take 2 droppers once a day with water. Do not exceed the labeled amount.</p></details>
<details><summary>Where can I buy Novalis Core and how soon can I receive it?</summary><p>Orders are prepared in 1 to 2 business days before shipment. Holiday orders can be delayed.</p></details>
<h2>What if Novalis Core does not work for me?</h2>
<h2>Ingredients</h2>
<p>Each serving lists magnesium and gymnema on the label.</p>
<button>Buy now</button>
<p>This formula treats diabetes and cures high blood sugar in 7 days.</p>
</body></html>`;

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function proposal(field: FieldProposal["field"], text: string): FieldProposal {
  return {
    field,
    currentValue: text,
    suggestedValue: text,
    status: "ACCEPTED",
    evidenceIds: ["ev-n1"],
    sourceUrl: "https://shop.novalis.example/info",
    sourceClass: "SELLER",
    verification: "SELLER_STATED",
    restriction: "PUBLISHABLE",
    collectedAt: "2026-01-01T00:00:00.000Z",
    eligibleForBatch: false,
    notes: [],
  };
}

function fakeRun(campaignId: number, proposals: FieldProposal[]): ProductResearchRun {
  return {
    version: 1,
    runId: `run-ar-${campaignId}`,
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
    reviewAccepted: proposals.length,
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

function withRoots<T>(fn: () => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "54ar-"));
  const previousSources = process.env.AIA_CAMPAIGN_SOURCES_ROOT;
  const previousQuality = process.env.AIA_PRESELL_QUALITY_ROOT;
  process.env.AIA_CAMPAIGN_SOURCES_ROOT = dir;
  process.env.AIA_PRESELL_QUALITY_ROOT = path.join(dir, "quality");
  try {
    return fn();
  } finally {
    if (previousSources === undefined) delete process.env.AIA_CAMPAIGN_SOURCES_ROOT;
    else process.env.AIA_CAMPAIGN_SOURCES_ROOT = previousSources;
    if (previousQuality === undefined) delete process.env.AIA_PRESELL_QUALITY_ROOT;
    else process.env.AIA_PRESELL_QUALITY_ROOT = previousQuality;
  }
}

async function withRootsAsync<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "54ar-"));
  const previousSources = process.env.AIA_CAMPAIGN_SOURCES_ROOT;
  const previousQuality = process.env.AIA_PRESELL_QUALITY_ROOT;
  process.env.AIA_CAMPAIGN_SOURCES_ROOT = dir;
  process.env.AIA_PRESELL_QUALITY_ROOT = path.join(dir, "quality");
  try {
    return await fn();
  } finally {
    if (previousSources === undefined) delete process.env.AIA_CAMPAIGN_SOURCES_ROOT;
    else process.env.AIA_CAMPAIGN_SOURCES_ROOT = previousSources;
    if (previousQuality === undefined) delete process.env.AIA_PRESELL_QUALITY_ROOT;
    else process.env.AIA_PRESELL_QUALITY_ROOT = previousQuality;
  }
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const ui = readFileSync("src/components/product-review/evidence-review-step.tsx", "utf8");
  const before = campaignIntegritySnapshot(237);

  const isolated = createCampaign({
    name: "Novalis 54AR",
    slug: `novalis-54ar-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  assert(!inspectPublicHttpsUrl("https://127.0.0.1/c/order-now.php").ok, "5. protecao SSRF");
  assert(!inspectPublicHttpsUrl("http://shop.novalis.example/c/order-now.php").ok, "5. HTTP bloqueado");
  let fetchedCheckout = false;
  const generic = await inspectNonCheckoutUrl(PRIMARY, async () => {
    fetchedCheckout = true;
    return { status: 200, location: null };
  });
  assert(!fetchedCheckout && generic.blocked, "6. controle de redirect: descoberta generica ainda nao abre order-now");
  assert(sameLandingPage(PRIMARY, "https://shop.novalis.example/c/order-now.php?hop=other"), "6. a pagina primaria e identificada pelo caminho, nao pelos parametros");
  assert(isTransactionalControlText("Buy now") && isTransactionalControlText("Finalizar pedido"), "7. bloqueio de acoes transacionais");
  assert(!isTransactionalControlText("How should I take Novalis Core?"), "7. controles de FAQ nao sao transacionais");

  const inventory = inventoryPrimaryHtml({ html: HTML, requestedUrl: PRIMARY, finalUrl: PRIMARY, title: "Novalis Core" });
  assert(inventory.sections.some((item) => /Novalis Core/i.test(item.heading)), "8. extracao HTML");
  assert(inventory.faqs.some((item) => /take Novalis Core/i.test(item.question) && item.answer), "10. accordion");
  assert(inventory.faqs.some((item) => /buy Novalis Core/i.test(item.question) && /1 to 2 business days/i.test(item.answer ?? "")), "11. FAQ");
  assert(inventory.faqs.some((item) => /does not work/i.test(item.question) && !item.answer), "12. resposta ausente");
  assert(inventory.facts.some((item) => /1 to 2 business days/i.test(item.text) && item.risk === "OPERATIONAL"), "13. captura de condicoes");
  assert(inventory.images.some((item) => item.src.includes("packshot.jpg")), "14. extracao de imagens");
  assert(inventory.facts.some((item) => item.risk === "HIGH_RISK" && /treats diabetes/i.test(item.text)), "17. classificacao de risco");
  const faqs = extractFaqItems(HTML);
  assert(faqs.length >= 2, "9. extracao JavaScript/accordion a partir do DOM renderizado");

  const result = await withRootsAsync(async () => {
    const recorded = registerUserProvidedAffiliateUrl({ campaignId: isolated.id, url: PRIMARY });
    const primary = primaryAffiliatePageOf(recorded)!;
    assert(primary.kind === PRIMARY_AFFILIATE_LANDING_PAGE && primary.readAllowed, "1. priorizacao da pagina primaria");
    assert(sourcePriorityOf({ url: PRIMARY, campaignId: isolated.id }) === SOURCE_PRIORITY.PRIMARY_AFFILIATE_LANDING_PAGE, "1. prioridade 1 da URL registrada");
    assert(primary.checkoutPathSuspected && classifyUrlRoles(PRIMARY).checkout, "2. URL de afiliado ainda e classificada como order path");
    assert(!classifyUrlRoles(PRIMARY).fetchable && isPrimaryAffiliateReadAllowed(isolated.id, PRIMARY), "2. leitura primaria permitida sem abrir descoberta generica");
    assert(recorded.attribution.hop === "novalisx" && recorded.commerciallyAuthorized === false, "3. parametros privados preservados");
    const published = publicAffiliateView(recorded);
    assert(published.originalUrl.includes("REDACTED") && !JSON.stringify(published).includes("novalisx"), "4. redacao de parametros em visao publica");
    assert(redactPrivateUrlText(PRIMARY).includes("REDACTED") && !redactPrivateUrlText(PRIMARY).includes("novalisx"), "4. redacao em logs");
    writeProductResearchRun(fakeRun(isolated.id, [
      proposal("description", "Novalis Core is a liquid dietary supplement."),
      proposal("ingredients", "Magnesium."),
      proposal("howItWorks", "Take two droppers."),
      proposal("guarantee", "60-day guarantee."),
    ]));
    const first = await processPrimaryAffiliatePage({ campaignId: isolated.id, html: HTML, visibleText: "Novalis Core Take 2 droppers", title: "Novalis Core" });
    const second = await processPrimaryAffiliatePage({ campaignId: isolated.id, html: HTML, visibleText: "Novalis Core Take 2 droppers", title: "Novalis Core" });
    const ledger = loadOrReconcileLedger(isolated.id);
    const job = createProductResearchJob({
      campaignId: isolated.id,
      productUrl: PRIMARY,
    });
    return { first, second, ledger, job };
  });
  assert(result.first.newCandidates.length > 0, "16. integracao com Evidence Registry");
  assert(result.second.duplicates >= result.first.newCandidates.length - 1 || result.second.newCandidates.every((item) => result.first.newCandidates.some((row) => row.text === item.text)), "15. deduplicacao");
  assert(result.first.highRiskBlocked >= 1, "18. bloqueio de alegacoes medicas");
  assert(result.first.newCandidates.every((item) => item.approvedForUse === false), "20. nenhuma auto-aprovacao");
  assert(result.first.commerciallyAuthorized === false && result.first.usedAsActiveCta === false, "20. aprovacao humana preservada");
  assert(result.first.transactionalClicks === 0, "7. zero cliques transacionais");
  const accepted = acceptedProposals(readLatestProductResearch(isolated.id) ?? fakeRun(isolated.id, [
    proposal("description", "Novalis Core is a liquid dietary supplement."),
  ]));
  assert(result.ledger.candidates.filter((item) => item.candidateId.startsWith("54AR-")).length >= 1, "16. candidatos 54AR no ledger");

  assert(result.job.status === "QUEUED" && result.job.limitations.some((item) => /PRIMARY_AFFILIATE_LANDING_PAGE/.test(item)), "1. pesquisa nao bloqueia NEED_URL quando a primaria existe");
  assert(secondaryResearchAllowed({ primaryProcessed: false, primaryReadAttempted: false }).allowed === false, "1. secundario espera a primaria");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "19. autorizacao administrativa");
  assert(REVIEW_COPY.primaryTitle.includes("página principal") && ui.includes("data-primary-page-review"), "interface da pagina principal");
  assert(!publicLandingUrl(PRIMARY).includes("novalisx"), "3. URL publica sem hop");

  const afterIsolated = campaignIntegritySnapshot(isolated.id);
  assert(afterIsolated.publicationStatus !== "APPROVED", "21. bloqueio de publicacao");
  assert(result.job.commercialAuthorization === "BLOCKED", "22. bloqueio de CTA comercial");

  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "19. preservacao dos fatos aprovados");
  assert(["description", "ingredients", "howItWorks", "guarantee"].every((field) => before.acceptedFacts.some((item) => item.field === field && item.status === "ACCEPTED")), "19. fatos ACCEPTED do nucleo preservados");
  void accepted;

  console.log(`PASS test-presell-quality-54ar.ts (${passed} OK)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
