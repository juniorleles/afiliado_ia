// npx tsx scripts/test-presell-quality-54ap.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { writeProductResearchRun } from "../src/lib/product-research/store.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";
import { loadStoredFactCandidates, reconcileStoredCandidates, writeCandidateLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { classifySourceIdentity } from "../src/lib/presell-quality/source-identity.ts";
import { prepareReviewCandidate, prepareReviewQueue } from "../src/lib/presell-quality/review-prepare.ts";
import { decideEvidenceCandidate, evidenceReviewAuthGate } from "../src/lib/presell-quality/review-decide.ts";
import { buildContentGapReport } from "../src/lib/presell-quality/content-gap-report.ts";
import { buildEvidenceInventory } from "../src/lib/presell-quality/evidence-inventory.ts";
import { mapContentGapsToCandidates } from "../src/lib/presell-quality/content-gap-map.ts";
import { candidateSupportsGap, classifyOperationalThemes, primaryOperationalTheme } from "../src/lib/presell-quality/operational-theme.ts";
import { evaluateRegenerationGate } from "../src/lib/presell-quality/regeneration-gate.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { buildCommercialGraph } from "../src/lib/presell-quality/commercial-graph.ts";

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
    runId: `run-ap-${campaignId}`,
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

function candidate(partial: Partial<FactCandidate> & { field: string; text: string }): FactCandidate {
  return {
    sourceUrl: "https://example.test/info/shipping.html",
    sourceClass: "SELLER",
    excerpt: partial.text,
    collectedAt: "2026-01-01T00:00:00.000Z",
    verification: "SELLER_STATED",
    usable: true,
    approvedForUse: false,
    blockReason: null,
    duplicateOf: null,
    ...partial,
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const run237 = readLatestProductResearch(237);
  const stored = loadStoredFactCandidates(237);
  const before237 = campaignIntegritySnapshot(237);
  assert(acceptedProposals(run237).length === 4, "17. quatro fatos ACCEPTED preservados");
  assert(["description", "ingredients", "howItWorks", "guarantee"].every((field) => acceptedProposals(run237).some((item) => item.field === field)), "18. product contract 237 intacto");
  assert(stored.length === 42, "1. expansion 54AE preservada");

  const shippingFaq = { field: "faq", extractedValue: "Please allow 1-2 business days processing time for your order to be shipped.", originalExcerpt: "Please allow 1-2 business days processing time." };
  const returnFaq = { field: "faq", extractedValue: "A return authorization must be requested and approved within 60 days of your date of purchase.", originalExcerpt: "A return authorization must be requested." };
  const refundFaq = { field: "faq", extractedValue: "If you are approved, then your refund will be processed to the original method of payment.", originalExcerpt: "refund will be processed" };
  const returnAddress = { field: "faq", extractedValue: "For your convenience, the return address is: 19655 E 35th Dr #100, Aurora CO 80011, USA", originalExcerpt: "return address" };
  const quantity = { field: "faq", extractedValue: "Each bottle contains 60 servings.", originalExcerpt: "Each bottle contains 60 servings." };
  const contact = { field: "faq", extractedValue: "Email support at support@example.test or call 555-0100.", originalExcerpt: "Email support at support@example.test" };
  assert(candidateSupportsGap("shipping", shippingFaq) && !candidateSupportsGap("quantity", shippingFaq), "2. FAQ de envio nao prova quantidade");
  assert(candidateSupportsGap("returnsProcess", returnFaq) && !candidateSupportsGap("sellerContact", returnFaq), "2. FAQ de devolucao nao prova contato");
  assert(candidateSupportsGap("returnsProcess", refundFaq) && !candidateSupportsGap("benefits", refundFaq), "2. reembolso nao prova beneficio");
  assert(!candidateSupportsGap("sellerContact", returnAddress), "2. endereco de devolucao nao e canal de contato");
  assert(candidateSupportsGap("quantity", quantity) && candidateSupportsGap("sellerContact", contact), "2. quantidade e contato exigem conteudo direto");
  assert(!classifyOperationalThemes("Include all bottles purchased empty, full or partially full.").includes("QUANTITY"), "2. bottles em devolucao nao e quantidade");
  assert(primaryOperationalTheme(shippingFaq.extractedValue, "faq") === "SHIPPING", "3. tema de envio");
  assert(primaryOperationalTheme(returnFaq.extractedValue, "faq") === "RETURNS", "3. tema de devolucao");

  const inventory = buildEvidenceInventory({
    campaignId: 237,
    run: run237,
    candidates: [
      candidate({ field: "faq", text: shippingFaq.extractedValue }),
      candidate({ field: "faq", text: returnFaq.extractedValue }),
      candidate({ field: "benefits", text: "Clinically proven to treat fatigue." }),
    ],
  });
  const mapped = mapContentGapsToCandidates({
    gaps: buildContentGapReport({ inventory }).gaps,
    queue: [
      { field: "faq", extractedValue: shippingFaq.extractedValue, originalExcerpt: shippingFaq.originalExcerpt, candidateId: "NOV-S", eligible: true, state: "READY_FOR_REVIEW" },
      { field: "faq", extractedValue: returnFaq.extractedValue, originalExcerpt: returnFaq.originalExcerpt, candidateId: "NOV-R", eligible: true, state: "READY_FOR_REVIEW" },
    ] as never,
  });
  const quantityGap = mapped.find((item) => item.field === "quantity")!;
  const contactGap = mapped.find((item) => item.field === "sellerContact")!;
  const shippingGap = mapped.find((item) => item.field === "shipping")!;
  const returnsGap = mapped.find((item) => item.field === "returnsProcess")!;
  const benefitsGap = mapped.find((item) => item.field === "benefits")!;
  assert(!quantityGap.relatedCandidateIds.length, "2. quantidade sem falso positivo");
  assert(!contactGap.relatedCandidateIds.length, "2. contato sem falso positivo");
  assert(shippingGap.relatedCandidateIds.includes("NOV-S"), "2. envio relaciona FAQ de envio");
  assert(returnsGap.relatedCandidateIds.includes("NOV-R"), "2. devolucao relaciona FAQ de devolucao");
  assert(!benefitsGap.relatedCandidateIds.length || benefitsGap.resolutionPossible === "BLOCKED", "13. beneficios medicos bloqueados");

  const waiting = evaluateRegenerationGate({ campaignId: 237, run: run237 });
  assert(waiting.status === "AWAITING_HUMAN_REVIEW" && waiting.ready === false, "6. gate aguarda revisao humana");
  assert(waiting.newAcceptedFacts === 0, "6. nenhum fato novo aprovado");
  assert(waiting.costAuthorized === false, "6. aprovacao nao e autorizacao de gasto");

  const previousQualityRoot = process.env.AIA_PRESELL_QUALITY_ROOT;
  const previousResearchRoot = process.env.AIA_PRODUCT_RESEARCH_ROOT;
  const root = mkdtempSync(path.join(os.tmpdir(), "54ap-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;
  process.env.AIA_PRODUCT_RESEARCH_ROOT = path.join(root, "research");
  const isolated = createCampaign({
    name: "Novalis 54AP",
    slug: `novalis-54ap-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  mkdirSync(path.join(root, String(isolated.id)), { recursive: true });
  const fixtures: FactCandidate[] = [
    candidate({ field: "faq", text: "Orders are processed within 24 hours after payment is confirmed." }),
    candidate({ field: "faq", text: "United States: Free, 5 - 7 working days." }),
    candidate({ field: "benefits", text: "Clinically proven to treat fatigue." }),
    candidate({ field: "manufacturer", text: "Made by Novalis Labs." }),
  ];
  writeFileSync(path.join(root, String(isolated.id), "expansion-54ae.json"), JSON.stringify({ factCandidates: fixtures }));
  const ledger = writeCandidateLedger(reconcileStoredCandidates({ campaignId: isolated.id, candidates: fixtures, idPrefix: "NOV" }));
  const run = writeProductResearchRun(fakeRun(isolated.id, [
    proposal("description", "Novalis Core is a documented mineral capsule.", "ACCEPTED"),
    proposal("ingredients", "Mineral blend", "ACCEPTED"),
    proposal("howItWorks", "Take one capsule daily.", "ACCEPTED"),
    proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund.", "ACCEPTED"),
    proposal("faq", "", "NOT_FOUND"),
    proposal("manufacturer", "", "NOT_FOUND"),
  ]));
  const identity = classifySourceIdentity({ host: "example.test", acceptedSellerHosts: ["example.test"] });
  const graph = buildCommercialGraph({ campaignId: isolated.id, productName: "Novalis Core", run, candidates: ledger.candidates });
  const queue = prepareReviewQueue({
    campaignId: isolated.id,
    candidates: ledger.candidates,
    run,
    identities: [identity],
    relations: graph.relations,
  });
  const ready = queue.find((item) => item.field === "faq" && item.eligible)!;
  assert(ready.state === "READY_FOR_REVIEW", "12. candidato operacional elegivel");
  assert(ready.availableActions.includes("KEEP_PENDING") && ready.availableActions.includes("REQUEST_NEW_EVIDENCE"), "4. acoes de revisao humana");
  assert(!queue.find((item) => item.field === "benefits")?.eligible, "13. alegacao medica bloqueada");
  assert(queue.find((item) => item.field === "manufacturer")?.state !== "READY_FOR_REVIEW", "14. fabricante nao verificado");

  const pending = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run,
    identity,
    relations: graph.relations,
    decision: "KEEP_PENDING",
    expectedVersion: ready.version,
  });
  assert(pending.ok && pending.contractChanged === false && pending.prepared.state === "READY_FOR_REVIEW", "4. manter pendente nao altera o contrato");
  const requested = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run,
    identity,
    relations: graph.relations,
    decision: "REQUEST_NEW_EVIDENCE",
    expectedVersion: ready.version,
  });
  assert(requested.ok && requested.prepared.eligible === true, "4. pedido de evidencia nao rejeita");

  const auto = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.field === "benefits")!,
    ledger,
    run,
    identity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: ledger.candidates.find((item) => item.field === "benefits")!.version,
  });
  assert(auto.ok === false, "5. nenhuma auto-aprovacao medica");

  const firstAccept = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run,
    identity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: ready.version,
  });
  assert(firstAccept.ok && firstAccept.contractChanged, "5. aceite humano isolado consolida FAQ");
  const afterFirst = acceptedProposals(firstAccept.run);
  assert(afterFirst.some((item) => item.field === "faq"), "5. FAQ operacional entra no contrato isolado");
  assert(["description", "ingredients", "howItWorks", "guarantee"].every((field) => afterFirst.some((item) => item.field === field && item.currentValue)), "5. fatos centrais preservados");

  const second = queue.find((item) => item.field === "faq" && item.candidateId !== ready.candidateId && item.eligible)!;
  const append = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === second.candidateId)!,
    ledger,
    run: firstAccept.run,
    identity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: second.version,
  });
  assert(append.ok, "5. segundo FAQ operacional e anexado");
  const faq = acceptedProposals(append.run).find((item) => item.field === "faq")!;
  assert(/24 horas/i.test(faq.currentValue) && /5 a 7 dias úteis/i.test(faq.currentValue), "5. consolidacao acumula textos");
  assert(acceptedProposals(append.run).find((item) => item.field === "description")?.currentValue === "Novalis Core is a documented mineral capsule.", "5. descricao nao foi sobrescrita");

  const readyGate = evaluateRegenerationGate({ campaignId: isolated.id, run: append.run });
  assert(readyGate.status === "APPROVED_FACTS_READY_FOR_REGENERATION" && readyGate.ready, "6. gate verdadeiro so apos aceite humano");
  assert(readyGate.costAuthorized === false, "6. gate nao autoriza gasto");

  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "16. autenticacao");
  assert(readFileSync(path.join(process.cwd(), "src/app/admin/[id]/fatos/research-actions.ts"), "utf8").includes("requireAdmin()"), "16. acao exige admin");
  const ui = readFileSync(path.join(process.cwd(), "src/components/product-review/evidence-review-step.tsx"), "utf8");
  assert(ui.includes("data-operational-review") && ui.includes("data-ready") && ui.includes("REVIEW_ACTION_LABEL.ACCEPT"), "15. interface operacional");
  assert(ui.includes("AWAITING_HUMAN_REVIEW") && !ui.includes("onClick={() => onDecide(item.candidateId, item.version, \"ACCEPT\")}") || ui.includes("disabled={busy || !item.eligible}"), "15. aprovacao so para elegiveis");
  assert(run.publicationReadiness === "BLOCKED", "19. publicacao bloqueada");
  assert(run.commercialAuthorization === "BLOCKED", "20. CTA comercial bloqueado");
  if (previousQualityRoot) process.env.AIA_PRESELL_QUALITY_ROOT = previousQualityRoot;
  else delete process.env.AIA_PRESELL_QUALITY_ROOT;
  if (previousResearchRoot) process.env.AIA_PRODUCT_RESEARCH_ROOT = previousResearchRoot;
  else delete process.env.AIA_PRODUCT_RESEARCH_ROOT;
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(campaignIntegritySnapshot(237).acceptedFacts), "18. campanha 237 nao foi mutada");
  console.log(`PASS test-presell-quality-54ap.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
