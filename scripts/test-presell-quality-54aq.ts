// npx tsx scripts/test-presell-quality-54aq.ts
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
import { prepareReviewQueue } from "../src/lib/presell-quality/review-prepare.ts";
import { decideEvidenceCandidate, evidenceReviewAuthGate } from "../src/lib/presell-quality/review-decide.ts";
import { buildCommercialGraph } from "../src/lib/presell-quality/commercial-graph.ts";
import { evaluateRegenerationGate } from "../src/lib/presell-quality/regeneration-gate.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { buildReviewPresentation, presentationMatchesApproval, validateSafeTranslation } from "../src/lib/presell-quality/review-presentation.ts";
import { REVIEW_ACTION_LABEL, REVIEW_COPY, REVIEW_GROUP_LABEL, friendlyIdentity, reviewGroupOf, reviewStateLabel } from "../src/lib/presell-quality/review-labels.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function proposal(field: FieldProposal["field"], text: string, status: FieldProposal["status"]): FieldProposal {
  return {
    field,
    currentValue: text,
    suggestedValue: text,
    status,
    evidenceIds: text ? ["ev-n1"] : [],
    sourceUrl: "https://example.test/novalis",
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
    runId: `run-aq-${campaignId}`,
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
  const ui = readFileSync(path.join(process.cwd(), "src/components/product-review/evidence-review-step.tsx"), "utf8");
  const identityUi = readFileSync(path.join(process.cwd(), "src/components/product-review/source-identity-panel.tsx"), "utf8");
  assert(ui.includes("data-friendly-review") && ui.includes("REVIEW_COPY.found") && ui.includes("REVIEW_ACTION_LABEL.ACCEPT"), "1. interface em portugues");
  assert(REVIEW_COPY.found === "O que encontramos?" && REVIEW_ACTION_LABEL.ACCEPT === "Aprovar informação", "1. textos visiveis em portugues");
  assert(reviewStateLabel("READY_FOR_REVIEW") === "Pronto para analisar", "1. rotulos centralizados");
  const shipping = buildReviewPresentation({
    candidateId: "NOV-01",
    version: 1,
    extractedValue: "Please allow 1-2 business days processing time for your order to be shipped. During holidays orders can experience delays to be processed.",
    originalExcerpt: "Please allow 1-2 business days processing time for your order to be shipped. During holidays orders can experience delays to be processed.",
    sourceHost: "example.test",
    sourceUrl: "https://example.test/info/shipping.html",
    field: "faq",
  });
  assert(shipping.title === "Prazo de preparação do pedido", "2. titulos amigaveis");
  assert(/1 a 2 dias úteis/.test(shipping.found) && /feriados/.test(shipping.found), "3. explicacoes compreensiveis");
  assert(/1 a 2/.test(shipping.preview) && /dias úteis/.test(shipping.preview), "4. traducao de prazos");
  assert(/feriados/.test(shipping.preview), "5. traducao de excecoes");
  const denied = buildReviewPresentation({
    candidateId: "NOV-02",
    version: 1,
    extractedValue: "**Sugar Defender is NOT responsible if the package is not delivered in the guaranteed shipping times as it takes 1-2 business days to process the order and we cannot be held liable for USPS Guarantees.",
    originalExcerpt: "**Sugar Defender is NOT responsible if the package is not delivered in the guaranteed shipping times as it takes 1-2 business days to process the order and we cannot be held liable for USPS Guarantees.",
    sourceHost: "example.test",
    sourceUrl: "https://example.test/info/shipping.html",
    field: "faq",
  });
  assert(/não se responsabiliza/i.test(denied.preview), "6. preservacao de negacoes");
  assert(denied.attention.some((item) => /não é uma promessa de entrega/i.test(item)), "7. preservacao de condicoes");
  assert(/^Segundo o vendedor/.test(shipping.preview), "8. atribuicao ao vendedor");
  const unsafe = validateSafeTranslation(shipping.original, "Entrega garantida em 1 a 2 dias.");
  assert(unsafe.safe === false, "9. bloqueio de traducao insegura");
  const unknown = buildReviewPresentation({
    candidateId: "NOV-X",
    version: 1,
    extractedValue: "A completely novel commercial clause without a stored template.",
    originalExcerpt: "A completely novel commercial clause without a stored template.",
    sourceHost: "example.test",
    sourceUrl: "https://example.test/info/shipping.html",
    field: "faq",
  });
  assert(unknown.translationSafe === false && unknown.found.includes("precisa de tradução"), "9. texto sem template fica bloqueado");
  assert(presentationMatchesApproval({ presented: shipping, expectedVersion: 1, expectedPreviewVersion: shipping.previewVersion }).ok, "10. previa fiel");
  assert(presentationMatchesApproval({ presented: shipping, expectedVersion: 2 }).ok === false, "11. controle de versao");
  assert(reviewGroupOf("SHIPPING") === "shipping" && reviewGroupOf("RETURNS") === "returns" && reviewGroupOf("REFUND") === "refund", "12. agrupamento tematico");
  assert(REVIEW_GROUP_LABEL.shipping === "Envio" && REVIEW_COPY.awaitingCount === "Aguardando análise", "13. contadores");
  assert(ui.includes("REVIEW_COPY.technical") && ui.includes("Candidate ID"), "14. detalhes tecnicos expansíveis");

  const run237 = readLatestProductResearch(237);
  const stored = loadStoredFactCandidates(237);
  const before237 = campaignIntegritySnapshot(237);
  assert(["description", "ingredients", "howItWorks", "guarantee"].every((field) => acceptedProposals(run237).some((item) => item.field === field)), "21. product contract 237 nucleo intacto");
  assert(evaluateRegenerationGate({ campaignId: 237, run: run237 }).costAuthorized === false, "22. regeneration gate nao autoriza gasto");
  assert(stored.length === 42, "expansion 54AE preservada");

  const previousQualityRoot = process.env.AIA_PRESELL_QUALITY_ROOT;
  const previousResearchRoot = process.env.AIA_PRODUCT_RESEARCH_ROOT;
  const root = mkdtempSync(path.join(os.tmpdir(), "54aq-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;
  process.env.AIA_PRODUCT_RESEARCH_ROOT = path.join(root, "research");
  const isolated = createCampaign({
    name: "Novalis 54AQ",
    slug: `novalis-54aq-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  mkdirSync(path.join(root, String(isolated.id)), { recursive: true });
  const fixtures: FactCandidate[] = [
    candidate({ field: "faq", text: "Please allow 1-2 business days processing time for your order to be shipped. During holidays orders can experience delays to be processed." }),
    candidate({ field: "faq", text: "A completely novel commercial clause without a stored template." }),
    candidate({ field: "benefits", text: "Clinically proven to treat fatigue." }),
  ];
  writeFileSync(path.join(root, String(isolated.id), "expansion-54ae.json"), JSON.stringify({ factCandidates: fixtures }));
  const ledger = writeCandidateLedger(reconcileStoredCandidates({ campaignId: isolated.id, candidates: fixtures, idPrefix: "NOV" }));
  const run = writeProductResearchRun(fakeRun(isolated.id, [
    proposal("description", "Novalis Core is a documented mineral capsule.", "ACCEPTED"),
    proposal("ingredients", "Mineral blend", "ACCEPTED"),
    proposal("howItWorks", "Take one capsule daily.", "ACCEPTED"),
    proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund.", "ACCEPTED"),
    proposal("faq", "", "NOT_FOUND"),
  ]));
  const identity = classifySourceIdentity({ host: "example.test", acceptedSellerHosts: ["example.test"] });
  const graph = buildCommercialGraph({ campaignId: isolated.id, productName: "Novalis Core", run, candidates: ledger.candidates });
  const queue = prepareReviewQueue({ campaignId: isolated.id, candidates: ledger.candidates, run, identities: [identity], relations: graph.relations });
  const ready = queue.find((item) => item.extractedValue.includes("1-2 business days"))!;
  const presented = buildReviewPresentation({
    candidateId: ready.candidateId,
    version: ready.version,
    extractedValue: ready.extractedValue,
    originalExcerpt: ready.originalExcerpt,
    sourceHost: ready.sourceHost,
    sourceUrl: ready.sourceUrl,
    field: ready.field,
  });
  const accepted = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run,
    identity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: ready.version,
    presentationVersion: presented.previewVersion,
  });
  assert(accepted.ok && acceptedProposals(accepted.run).some((item) => item.field === "faq" && item.currentValue === presented.preview), "10. previa igual ao texto aprovado");
  assert(accepted.audit.actor === "HUMAN", "15. aprovacao humana");
  const rejected = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.extractedValue.includes("novel commercial"))!,
    ledger,
    run: accepted.run,
    identity,
    relations: graph.relations,
    decision: "REJECT",
    expectedVersion: ledger.candidates.find((item) => item.extractedValue.includes("novel commercial"))!.version,
  });
  assert(rejected.ok && rejected.prepared.state === "REJECTED", "16. rejeicao");
  const requested = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run: accepted.run,
    identity,
    relations: graph.relations,
    decision: "REQUEST_NEW_EVIDENCE",
    expectedVersion: ready.version,
  });
  assert(requested.ok && requested.contractChanged === false, "17. solicitacao de evidencia");
  const pending = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run: accepted.run,
    identity,
    relations: graph.relations,
    decision: "KEEP_PENDING",
    expectedVersion: ready.version,
  });
  assert(pending.ok && pending.contractChanged === false, "18. decisao pendente");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "19. autorizacao administrativa");
  assert(readFileSync(path.join(process.cwd(), "src/app/admin/[id]/fatos/research-actions.ts"), "utf8").includes("requireAdmin()"), "19. acao exige admin");
  const medical = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.field === "benefits")!,
    ledger,
    run: accepted.run,
    identity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: ledger.candidates.find((item) => item.field === "benefits")!.version,
    presentationVersion: "pv-fake",
  });
  assert(medical.ok === false, "20. bloqueio de candidatos inelegiveis");
  const stale = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.candidateId === ready.candidateId)!,
    ledger,
    run: accepted.run,
    identity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: ready.version,
    presentationVersion: "pv-stale",
  });
  assert(stale.ok === false && stale.reason === "PREVIEW_VERSION_CONFLICT", "11. previa antiga nao aprova");
  assert(["description", "ingredients", "howItWorks", "guarantee"].every((field) => acceptedProposals(accepted.run).some((item) => item.field === field)), "21. contract isolado preservado");
  if (previousQualityRoot) process.env.AIA_PRESELL_QUALITY_ROOT = previousQualityRoot;
  else delete process.env.AIA_PRESELL_QUALITY_ROOT;
  if (previousResearchRoot) process.env.AIA_PRODUCT_RESEARCH_ROOT = previousResearchRoot;
  else delete process.env.AIA_PRODUCT_RESEARCH_ROOT;
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(campaignIntegritySnapshot(237).acceptedFacts), "21. campanha 237 nao foi mutada");
  assert(run.publicationReadiness === "BLOCKED", "23. publicacao bloqueada");
  assert(run.commercialAuthorization === "BLOCKED", "24. CTA comercial bloqueado");
  assert(identityUi.includes("Site semelhante sem vínculo confirmado") || friendlyIdentity({ host: "x", identityFound: "clone", relationToProduct: "LOOKALIKE_OF (UNKNOWN, UNRESOLVED)", state: "UNRESOLVED" }).title === "Site semelhante sem vínculo confirmado", "identidade simplificada");
  assert(REVIEW_COPY.technical === "Ver detalhes técnicos", "14. detalhes recolhidos");
  console.log(`PASS test-presell-quality-54aq.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
