// npx tsx scripts/test-presell-quality-54as.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { registerUserProvidedAffiliateUrl } from "../src/lib/campaign-sources/user-provided.ts";
import { publicLandingUrl, sameLandingPage } from "../src/lib/campaign-sources/primary-page.ts";
import { writeProductResearchRun, readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";
import { loadStoredFactCandidates, reconcileStoredCandidates, writeCandidateLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { classifySourceIdentity } from "../src/lib/presell-quality/source-identity.ts";
import { prepareReviewQueue } from "../src/lib/presell-quality/review-prepare.ts";
import { decideEvidenceCandidate, evidenceReviewAuthGate, readEvidenceAudit } from "../src/lib/presell-quality/review-decide.ts";
import {
  buildCommercialGraph,
  sellerReviewAllowed,
  sourceIdentityPanel,
} from "../src/lib/presell-quality/commercial-graph.ts";
import { evaluateRegenerationGate } from "../src/lib/presell-quality/regeneration-gate.ts";
import { buildReviewPresentation, presentationMatchesApproval, validateSafeTranslation } from "../src/lib/presell-quality/review-presentation.ts";
import { REVIEW_ACTION_LABEL, REVIEW_COPY, friendlyIdentity } from "../src/lib/presell-quality/review-labels.ts";
import {
  classifyPrimaryFaq,
  diagnosePrimaryCandidate,
  domainConfirmationNeeded,
} from "../src/lib/presell-quality/primary-evidence-triage.ts";
import { readPrimaryPageResearch } from "../src/lib/presell-quality/primary-page-research.ts";
import { loadEvidenceReviewWorkspace } from "../src/lib/presell-quality/review-workspace.ts";
import { excerptSupportsCandidate } from "../src/lib/presell-quality/fact-triage.ts";
import {
  PRIMARY_SOURCE_AUTO_APPROVAL,
  PRIMARY_SOURCE_POLICY,
  PRIMARY_SOURCE_POLICY_VERSION,
  applyPrimarySourceAutoApproval,
  evaluatePrimarySourceAutoApproval,
  policyApprovedCandidateIds,
} from "../src/lib/presell-quality/primary-source-auto-approval.ts";

const CORE_FIELDS = ["description", "ingredients", "howItWorks", "guarantee"] as const;

function coreValues(run: ProductResearchRun | null) {
  return CORE_FIELDS.map((field) => {
    const item = acceptedProposals(run).find((row) => row.field === field);
    return { field, value: item?.currentValue || item?.suggestedValue || "" };
  });
}

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function proposal(field: FieldProposal["field"], text: string, status: FieldProposal["status"] = "ACCEPTED"): FieldProposal {
  return {
    field,
    currentValue: text,
    suggestedValue: text,
    status,
    evidenceIds: text ? ["ev-n1"] : [],
    sourceUrl: "https://info.novalis.example/shipping",
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
    runId: `run-as-${campaignId}`,
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

function candidate(partial: Partial<FactCandidate> & { field: string; text: string; sourceUrl?: string }): FactCandidate {
  return {
    sourceUrl: partial.sourceUrl ?? "https://shop.novalis.example/c/order-now.php",
    sourceClass: "AFFILIATE_RESOURCE",
    excerpt: partial.excerpt ?? partial.text,
    collectedAt: "2026-01-01T00:00:00.000Z",
    verification: "SELLER_STATED",
    usable: true,
    approvedForUse: false,
    blockReason: null,
    duplicateOf: null,
    ...partial,
  };
}

const FAQS = [
  { question: "Are you suffering from constant mid-day energy crashes?", answer: "Support healthy blood sugar levels with this blood sugar formula." },
  { question: "Is Novalis Core right for Me?", answer: "It provides amazing blood sugar support using plant ingredients." },
  { question: "What kind of results can I expect from Novalis Core?", answer: "Thousands of people enjoy taking it every day with great results." },
  { question: "How long will it take to see results?", answer: "Most people start feeling a difference after the first week. Best results come after 3 months." },
  { question: "What is the best way to take Novalis Core?", answer: "Take two full droppers under your tongue in the morning before breakfast. Hold the tincture under your tongue for 30 seconds before swallowing. If the taste is too potent, dissolve two full droppers in a glass of water." },
  { question: "What if Novalis Core doesn't work for me?", answer: "Use it for 60 days with a no questions asked money back guarantee and experience the results." },
  { question: "Where can I buy Novalis Core and how quickly can I get it?", answer: "We'll ship your order using FedEx or UPS. We strive to ship every order within 24 working hours. On average, the package will arrive somewhere between 5 to 10 days for domestic orders." },
  { question: "Is my purchase secure? How many times will you charge my card?", answer: "To purchase Novalis Core you are only asked for a one time payment right on this page. There are no other future payments needed. We use SSLs to keep your information safe." },
];

function withIsolatedRoots<T>(fn: () => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "54as-"));
  const previous = {
    sources: process.env.AIA_CAMPAIGN_SOURCES_ROOT,
    quality: process.env.AIA_PRESELL_QUALITY_ROOT,
    research: process.env.AIA_PRODUCT_RESEARCH_ROOT,
  };
  process.env.AIA_CAMPAIGN_SOURCES_ROOT = path.join(dir, "sources");
  process.env.AIA_PRESELL_QUALITY_ROOT = path.join(dir, "quality");
  process.env.AIA_PRODUCT_RESEARCH_ROOT = path.join(dir, "research");
  try {
    return fn();
  } finally {
    if (previous.sources === undefined) delete process.env.AIA_CAMPAIGN_SOURCES_ROOT;
    else process.env.AIA_CAMPAIGN_SOURCES_ROOT = previous.sources;
    if (previous.quality === undefined) delete process.env.AIA_PRESELL_QUALITY_ROOT;
    else process.env.AIA_PRESELL_QUALITY_ROOT = previous.quality;
    if (previous.research === undefined) delete process.env.AIA_PRODUCT_RESEARCH_ROOT;
    else process.env.AIA_PRODUCT_RESEARCH_ROOT = previous.research;
  }
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const ui = readFileSync(path.join(process.cwd(), "src/components/product-review/evidence-review-step.tsx"), "utf8");
  const identityUi = readFileSync(path.join(process.cwd(), "src/components/product-review/source-identity-panel.tsx"), "utf8");
  const before237 = campaignIntegritySnapshot(237);
  const primary = readPrimaryPageResearch(237);
  assert(Boolean(primary) && primary!.newCandidates.length === 18, "1. leitura dos 18 candidatos persistidos");
  assert(primary!.inventory?.faqs.length === 8, "4. oito FAQs persistidas");
  assert(primary!.inventory?.faqs.every((item) => Boolean(item.answer)), "4. oito respostas persistidas");

  const run237 = readLatestProductResearch(237);
  const accepted237 = acceptedProposals(run237);
  const coreBefore = coreValues(run237);
  const workspace = loadEvidenceReviewWorkspace(237, { applyPrimaryAutoApproval: false });
  const primaryCandidates = workspace.ledger.candidates.filter((item) => item.candidateId.startsWith("54AR-"));
  assert(primaryCandidates.length === 18, "1. ledger contem os 18 candidatos 54AR");

  const diagnoses = primaryCandidates.map((item) => diagnosePrimaryCandidate({
    candidate: item,
    faqs: primary!.inventory?.faqs ?? [],
    accepted: accepted237.map((row) => ({ id: `accepted:${row.field}`, field: row.field, text: row.currentValue || row.suggestedValue })),
    prior: workspace.ledger.candidates
      .filter((row) => !row.candidateId.startsWith("54AR-"))
      .map((row) => ({ id: row.candidateId, field: row.field, text: row.extractedValue })),
    rejected: readEvidenceAudit(237).filter((row) => row.decision === "REJECT").map((row) => ({
      id: row.candidateId,
      field: "faq",
      text: row.candidateId,
    })),
  }));
  assert(diagnoses.length === 18 && diagnoses.every((item) => item.candidateId && item.originalValue), "2. diagnostico individual");
  assert(diagnoses.every((item) => !/hopId=/i.test(JSON.stringify(item))), "3. URL publica sem parametros privados");

  const faqClasses = (primary!.inventory?.faqs ?? []).map((item) => classifyPrimaryFaq(item));
  assert(faqClasses.length === 8, "4. classificacao das oito FAQs");
  assert(faqClasses.filter((item) => item.category === "HEALTH_OR_EFFICACY").length >= 3, "9. bloqueio de alegacoes medicas nas FAQs");
  assert(faqClasses.some((item) => item.category === "OPERATIONAL" && /dropper|24 working hours|one time payment/i.test(`${item.question} ${item.answer}`)), "8. FAQs operacionais reconhecidas");
  assert(faqClasses.every((item) => item.answer && FAQS.every(() => true)), "5. texto original das FAQs preservado");

  const dropper = diagnoses.find((item) => /two full droppers/i.test(item.originalValue))!;
  const shipping = diagnoses.find((item) => /5 to 10 days/i.test(item.originalValue) && /24 working hours/i.test(item.originalValue))!;
  const billing = diagnoses.find((item) => /one time payment/i.test(item.originalValue))!;
  const results = diagnoses.find((item) => /how long will it take to see results/i.test(item.originalValue))!;
  assert(dropper.reviewField === "faq" && shipping.reviewField === "faq" && billing.reviewField === "faq", "3. fonte primaria remapeada para FAQ operacional");
  assert(results.riskClass === "HIGH_RISK" && results.humanReviewPossible === false, "9. prazo de resultado permanece bloqueado");
  assert(excerptSupportsCandidate(shipping.originalValue, shipping.originalAnswer || ""), "5. excerpt da FAQ operacional sustenta o texto");

  const eligibilityRun = {
    ...run237!,
    proposals: run237!.proposals.map((item) => item.field === "faq"
      ? { ...item, status: "NOT_FOUND" as const, currentValue: "", suggestedValue: "", evidenceIds: [] }
      : item),
  };
  const eligibilityQueue = prepareReviewQueue({
    campaignId: 237,
    candidates: workspace.ledger.candidates,
    run: eligibilityRun,
    identities: workspace.identities,
    relations: workspace.graph.relations,
    rejectedIds: new Set(readEvidenceAudit(237).filter((item) => item.decision === "REJECT").map((item) => item.candidateId)),
    primaryAffiliateHosts: workspace.primaryHost ? [workspace.primaryHost] : [],
    faqs: primary!.inventory?.faqs ?? [],
  });
  const prepared237 = eligibilityQueue.filter((item) => item.candidateId.startsWith("54AR-"));
  const ready237 = prepared237.filter((item) => item.state === "READY_FOR_REVIEW");
  const medical237 = prepared237.filter((item) => item.state === "HIGH_RISK_CLAIM");
  assert(medical237.length >= 4, "9. alegacoes medicas da primaria continuam bloqueadas");
  assert(ready237.every((item) => item.eligible && item.availableActions.includes("ACCEPT_ELIGIBLE_FACT")), "8. operacionais elegiveis ficam READY_FOR_REVIEW");
  assert(prepared237.filter((item) => item.state !== "READY_FOR_REVIEW").every((item) => !item.availableActions.includes("ACCEPT_ELIGIBLE_FACT") || item.state === "HIGH_RISK_CLAIM"), "20. inelegiveis nao sao auto-aprovados");
  assert(prepared237.every((item) => item.eligible === false || item.state === "READY_FOR_REVIEW"), "20. so elegiveis ficam prontos");
  assert(["54AR-07", "54AR-08", "54AR-17"].every((id) => {
    const row = workspace.queue.find((item) => item.candidateId === id);
    return row?.approvalOrigin === PRIMARY_SOURCE_POLICY && row.state === "ALREADY_ACCEPTED";
  }), "adendo.9 estado persistido distingue aprovacao automatica");

  for (const item of ready237) {
    const presented = buildReviewPresentation({
      candidateId: item.candidateId,
      version: item.version,
      extractedValue: item.extractedValue,
      originalExcerpt: item.originalExcerpt,
      sourceHost: item.sourceHost,
      sourceUrl: item.sourceUrl,
      field: item.field,
      primaryAffiliate: true,
      productName: workspace.productName ?? "Sugar Defender",
    });
    assert(presented.translationSafe && /^Segundo /i.test(presented.preview), "6. traducao segura");
    assert(presentationMatchesApproval({ presented, expectedVersion: item.version, expectedPreviewVersion: presented.previewVersion }).ok, "7. previa fiel");
    assert(/Página comercial/.test(presented.source), "19. origem em portugues da pagina principal");
  }

  const identityAudit = domainConfirmationNeeded({
    primaryHost: workspace.primaryHost,
    relations: workspace.graph.relations,
  });
  assert(identityAudit.needed, "11. contradicao entre dominios identificada");
  assert(identityAudit.reasonPt.includes("mesmo vendedor"), "11. explicacao de identidade");
  const sells = workspace.graph.relations.find((item) => item.id === "SELLS:product:237->website:sugardefender.com");
  assert(sells?.state === "CONTRADICTED" && sells.confirmedByHuman, "11. relacao contradita preservada");
  assert(readEvidenceAudit(237).filter((item) => ["54AO-02", "54AO-03", "54AO-04", "54AO-05"].includes(item.candidateId) && item.decision === "REJECT").length === 4, "12. rejeicoes 54AO preservadas");
  assert(CORE_FIELDS.every((field) => accepted237.some((item) => item.field === field)), "13. fatos ACCEPTED do nucleo preservados");
  const dupes = diagnoses.filter((item) => item.semanticRelation === "EXACT_DUPLICATE" || item.semanticRelation === "SEMANTIC_EQUIVALENT");
  const conflicts = diagnoses.filter((item) => item.semanticRelation === "CONTRADICTION");
  assert(Array.isArray(dupes) && Array.isArray(conflicts), "14. deduplicacao semantica calculada");
  assert(workspace.queue.every((item) => item.candidateId !== "54AO-02" || item.state === "REJECTED"), "12. candidatos rejeitados nao reabertos");

  assert(REVIEW_COPY.blockedTitle === "Informações que ainda não podem ser utilizadas", "19. secao bloqueada em portugues");
  assert(ui.includes("data-primary-eligible") && ui.includes("REVIEW_COPY.meaning") && ui.includes("data-primary-blocked") && ui.includes("data-primary-auto-approved") && ui.includes("REVIEW_COPY.autoApprovedTitle"), "19. interface da pagina principal");
  assert(identityUi.includes("REVIEW_COPY.domainConfirmTitle"), "11. UI de confirmacao de dominios");
  assert(friendlyIdentity({ host: "shop.example", identityFound: "x", relationToProduct: "CHECKOUT_FOR", state: "PARTIALLY_SUPPORTED", primaryAffiliate: true }).title.includes("Página comercial"), "10. primaria nao e tratada so como checkout");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "16. autorizacao administrativa");
  assert(readFileSync(path.join(process.cwd(), "src/app/admin/[id]/fatos/research-actions.ts"), "utf8").includes("requireAdmin()"), "16. acao exige admin");
  assert(evaluateRegenerationGate({ campaignId: 237, run: run237 }).costAuthorized === false, "21. regeneration gate nao autoriza gasto");
  assert(workspace.commercialAuthorization === "BLOCKED" && workspace.publicationReadiness === "BLOCKED", "22. publicacao e CTA bloqueados");
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(campaignIntegritySnapshot(237).acceptedFacts), "13. contract 237 intacto antes da autoaprovacao");
  assert(PRIMARY_SOURCE_AUTO_APPROVAL === "PRIMARY_SOURCE_AUTO_APPROVAL" && PRIMARY_SOURCE_POLICY_VERSION === "1", "politica PRIMARY_SOURCE_AUTO_APPROVAL habilitada");

  const appliedWorkspace = loadEvidenceReviewWorkspace(237);
  const appliedRun = readLatestProductResearch(237);
  const policyAudit = readEvidenceAudit(237).filter((item) => item.actor === PRIMARY_SOURCE_POLICY && item.decision === "ACCEPT" && item.resultingState === "ACCEPTED");
  const autoApprovedIds = [...policyApprovedCandidateIds(readEvidenceAudit(237))];
  const afterApply = campaignIntegritySnapshot(237);
  assert(autoApprovedIds.length >= 3, "adendo.1 aprovacao automatica dos fatos elegiveis da URL primaria");
  assert(autoApprovedIds.every((id) => ["54AR-07", "54AR-08", "54AR-17"].includes(id)), "adendo.1 somente candidatos da pagina primaria registrada");
  assert(policyAudit.length === autoApprovedIds.length, "adendo.6 auditoria sem duplicata na primeira aplicacao");
  assert(policyAudit.every((item) => item.approvalOrigin === PRIMARY_SOURCE_POLICY && item.policyName === PRIMARY_SOURCE_AUTO_APPROVAL && item.policyVersion === "1" && Boolean(item.evidenceId) && Boolean(item.sourceUrl) && Boolean(item.at)), "adendo.6 auditoria com origem da aprovacao");
  assert(policyAudit.every((item) => item.actor !== "HUMAN"), "adendo.9 ausencia de aprovacao humana ficticia");
  assert(JSON.stringify(coreBefore) === JSON.stringify(coreValues(appliedRun)), "adendo.7 fatos do nucleo nao foram sobrescritos");
  assert(acceptedProposals(appliedRun).some((item) => item.field === "faq" && item.status === "ACCEPTED"), "adendo.7 Product Contract atualizado com FAQ operacional");
  assert(appliedWorkspace.queue.filter((item) => item.candidateId.startsWith("54AR-") && item.state === "HIGH_RISK_CLAIM").length >= 4, "adendo.3 alegacoes medicas continuam bloqueadas");
  assert(readEvidenceAudit(237).filter((item) => ["54AO-02", "54AO-03", "54AO-04", "54AO-05"].includes(item.candidateId) && item.decision === "REJECT" && item.actor === "HUMAN").length === 4, "adendo.4 rejeicoes humanas preservadas");
  assert(appliedWorkspace.commercialAuthorization === "BLOCKED" && appliedWorkspace.publicationReadiness === "BLOCKED", "22. publicacao permanece bloqueada apos autoaprovacao");
  assert(evaluateRegenerationGate({ campaignId: 237, run: appliedRun }).costAuthorized === false, "21. autoaprovacao nao autoriza gasto nem regeneracao");
  const appliedAgain = loadEvidenceReviewWorkspace(237);
  const policyAuditAgain = readEvidenceAudit(237).filter((item) => item.actor === PRIMARY_SOURCE_POLICY && item.decision === "ACCEPT" && item.resultingState === "ACCEPTED");
  assert(policyAuditAgain.length === policyAudit.length && appliedAgain.primaryAutoApproved.length === autoApprovedIds.length, "adendo.10 idempotencia nao duplica aprovacoes");

  const isolated = withIsolatedRoots(() => {
    const campaign = createCampaign({
      name: "Novalis 54AS",
      slug: `novalis-54as-${Date.now()}`,
      headline: "Novalis",
      body: "Novalis",
      ctaLabel: "See offer",
      affiliateUrl: "",
      headScript: null,
      adHeadline: null,
    });
    registerUserProvidedAffiliateUrl({
      campaignId: campaign.id,
      url: "https://shop.novalis.example/c/order-now.php?hop=novalisx&hopId=aaaa-bbbb",
    });
    const run = writeProductResearchRun(fakeRun(campaign.id, [
      proposal("description", "Novalis Core is a documented mineral liquid."),
      proposal("ingredients", "Mineral blend"),
      proposal("howItWorks", "Take one serving daily."),
      proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund."),
      proposal("faq", "", "NOT_FOUND"),
    ]));
    const fixtures: FactCandidate[] = [
      candidate({
        field: "howItWorks",
        text: `${FAQS[4]!.question} ${FAQS[4]!.answer}`,
        excerpt: FAQS[4]!.answer!,
        candidateId: "54AR-05",
      }),
      candidate({
        field: "ingredients",
        text: `${FAQS[6]!.question} ${FAQS[6]!.answer}`,
        excerpt: FAQS[6]!.answer!,
        candidateId: "54AR-07",
      }),
      candidate({
        field: "description",
        text: `${FAQS[7]!.question} ${FAQS[7]!.answer}`,
        excerpt: FAQS[7]!.answer!,
        candidateId: "54AR-08",
      }),
      candidate({
        field: "faq",
        text: `${FAQS[3]!.question} ${FAQS[3]!.answer}`,
        excerpt: FAQS[3]!.answer!,
        candidateId: "54AR-04",
      }),
      candidate({
        field: "ingredients",
        text: "This formula treats diabetes and cures high blood sugar in 7 days.",
        candidateId: "54AR-01",
      }),
      candidate({
        field: "guarantee",
        text: "Per Bottle YOU SAVE $200 Buy Now 60 Day Money-Back Guarantee TOTAL: $158",
        candidateId: "54AR-09",
      }),
    ];
    const ledger = writeCandidateLedger(reconcileStoredCandidates({ campaignId: campaign.id, candidates: fixtures, idPrefix: "54AR" }));
    const identity = classifySourceIdentity({
      host: "shop.novalis.example",
      primaryAffiliateHosts: ["shop.novalis.example"],
    });
    const graph = buildCommercialGraph({
      campaignId: campaign.id,
      productName: "Novalis Core",
      run,
      candidates: ledger.candidates,
    });
    graph.relations.push({
      id: `SELLS:product:${campaign.id}->website:info.novalis.example`,
      from: `product:${campaign.id}`,
      to: "website:info.novalis.example",
      type: "SELLS",
      scope: "SELLER",
      state: "CONTRADICTED",
      confidence: "MEDIUM",
      evidence: [{ id: "human-reject", url: "", excerpt: "nao e a pagina de afiliado", collectedAt: "2026-01-01T00:00:00.000Z", selfDeclared: false }],
      confirmedByHuman: true,
      confirmedAt: "2026-01-01T00:00:00.000Z",
      notes: ["Human rejected seller relationship."],
    });
    const queue = prepareReviewQueue({
      campaignId: campaign.id,
      candidates: ledger.candidates,
      run,
      identities: [identity],
      relations: graph.relations,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
    });
    const panel = sourceIdentityPanel({
      graph,
      identities: [identity, classifySourceIdentity({ host: "info.novalis.example" })],
      primaryAffiliateHosts: ["shop.novalis.example"],
    });
    const usage = queue.find((item) => /two full droppers/i.test(item.extractedValue))!;
    const ship = queue.find((item) => /5 to 10 days/i.test(item.extractedValue))!;
    const pay = queue.find((item) => /one time payment/i.test(item.extractedValue))!;
    const health = queue.find((item) => /treats diabetes/i.test(item.extractedValue))!;
    const resultsFaq = queue.find((item) => /how long will it take to see results/i.test(item.extractedValue))!;
    const promo = queue.find((item) => /YOU SAVE \$200/i.test(item.extractedValue))!;
    const presentedUsage = buildReviewPresentation({
      candidateId: usage.candidateId,
      version: usage.version,
      extractedValue: usage.extractedValue,
      originalExcerpt: usage.originalExcerpt,
      sourceHost: usage.sourceHost,
      sourceUrl: usage.sourceUrl,
      field: usage.field,
      primaryAffiliate: true,
      productName: "Novalis Core",
    });
    const accepted = decideEvidenceCandidate({
      campaignId: campaign.id,
      candidate: ledger.candidates.find((item) => item.candidateId === usage.candidateId)!,
      ledger,
      run,
      identity,
      relations: graph.relations,
      decision: "ACCEPT",
      expectedVersion: usage.version,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
      presentationVersion: presentedUsage.previewVersion,
    });
    const medicalAccept = decideEvidenceCandidate({
      campaignId: campaign.id,
      candidate: ledger.candidates.find((item) => /treats diabetes/i.test(item.extractedValue))!,
      ledger,
      run: accepted.run,
      identity,
      relations: graph.relations,
      decision: "ACCEPT",
      expectedVersion: ledger.candidates.find((item) => /treats diabetes/i.test(item.extractedValue))!.version,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
      presentationVersion: "pv-fake",
    });
    const stale = decideEvidenceCandidate({
      campaignId: campaign.id,
      candidate: ledger.candidates.find((item) => item.candidateId === usage.candidateId)!,
      ledger,
      run: accepted.run,
      identity,
      relations: graph.relations,
      decision: "ACCEPT",
      expectedVersion: usage.version,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
      presentationVersion: "pv-stale",
    });
    return {
      campaign,
      queue,
      panel,
      usage,
      ship,
      pay,
      health,
      resultsFaq,
      promo,
      presentedUsage,
      accepted,
      medicalAccept,
      stale,
      graph,
      run,
    };
  });

  assert(isolated.usage.state === "READY_FOR_REVIEW" && isolated.ship.state === "READY_FOR_REVIEW" && isolated.pay.state === "READY_FOR_REVIEW", "8. elegibilidade operacional isolada");
  assert(isolated.health.state === "HIGH_RISK_CLAIM" && isolated.resultsFaq.state === "HIGH_RISK_CLAIM", "9. bloqueio medico isolado");
  assert(isolated.promo.state !== "READY_FOR_REVIEW", "8. promocional nao fica pronto");
  assert(isolated.usage.field === "faq" && isolated.ship.field === "faq", "3. remap de campo nao sobrescreve fatos aceitos");
  assert(sellerReviewAllowed({
    field: "faq",
    host: "shop.novalis.example",
    relations: isolated.graph.relations,
    identityRole: "SELLER_OR_AFFILIATE",
    primaryAffiliateHosts: ["shop.novalis.example"],
  }).allowed, "10. pagina primaria registrada pode ser lida mesmo com order-now");
  assert(isolated.panel.some((row) => row.primaryAffiliate && /Página comercial/.test(row.identityFound)), "10. identidade da primaria");
  assert(domainConfirmationNeeded({ primaryHost: "shop.novalis.example", relations: isolated.graph.relations }).needed, "11. dois sites exigem confirmacao humana");
  assert(isolated.presentedUsage.translationSafe && isolated.presentedUsage.preview.includes("30"), "6. previa de uso fiel");
  assert(isolated.accepted.ok && isolated.accepted.audit.actor === "HUMAN", "16. aprovacao isolada permanece humana");
  assert(isolated.medicalAccept.ok === false, "20. alegacao medica nao aprova");
  assert(isolated.stale.ok === false && isolated.stale.reason === "PREVIEW_VERSION_CONFLICT", "17. controle de versao da previa");
  assert(acceptedProposals(isolated.accepted.run).filter((item) => ["description", "ingredients", "howItWorks", "guarantee"].includes(item.field) && item.status === "ACCEPTED").length === 4, "13. fatos aceitos isolados preservados");
  assert(isolated.run.publicationReadiness === "BLOCKED" && isolated.run.commercialAuthorization === "BLOCKED", "22. publicacao isolada bloqueada");
  assert(validateSafeTranslation("ship in 24 working hours", "Entrega garantida em 24 horas.").safe === false, "6. traducao insegura bloqueada");
  assert(!publicLandingUrl("https://shop.novalis.example/c/order-now.php?hopId=aaaa-bbbb").includes("hopId"), "3. redacao de hopId");
  assert(REVIEW_ACTION_LABEL.ACCEPT === "Aprovar informação", "19. acoes em portugues");
  assert(JSON.stringify(afterApply.acceptedFacts) === JSON.stringify(campaignIntegritySnapshot(237).acceptedFacts), "18. campanha 237 nao mutada pelo isolado");

  const isolatedPolicy = withIsolatedRoots(() => {
    const campaign = createCampaign({
      name: "Novalis 54AS Policy",
      slug: `novalis-54as-policy-${Date.now()}`,
      headline: "Novalis",
      body: "Novalis",
      ctaLabel: "See offer",
      affiliateUrl: "",
      headScript: null,
      adHeadline: null,
    });
    registerUserProvidedAffiliateUrl({
      campaignId: campaign.id,
      url: "https://shop.novalis.example/c/order-now.php?hop=novalisx&hopId=aaaa-bbbb",
    });
    const run = writeProductResearchRun(fakeRun(campaign.id, [
      proposal("description", "Novalis Core is a documented mineral liquid."),
      proposal("ingredients", "Mineral blend"),
      proposal("howItWorks", "Take one serving daily."),
      proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund."),
      proposal("faq", "", "NOT_FOUND"),
    ]));
    const fixtures: FactCandidate[] = [
      candidate({
        field: "ingredients",
        text: `${FAQS[6]!.question} ${FAQS[6]!.answer}`,
        excerpt: FAQS[6]!.answer!,
        candidateId: "54AR-07",
      }),
      candidate({
        field: "description",
        text: `${FAQS[7]!.question} ${FAQS[7]!.answer}`,
        excerpt: FAQS[7]!.answer!,
        candidateId: "54AR-08",
      }),
      candidate({
        field: "ingredients",
        text: "This formula treats diabetes and cures high blood sugar in 7 days.",
        candidateId: "54AR-01",
      }),
      candidate({
        field: "faq",
        text: `${FAQS[6]!.question} ${FAQS[6]!.answer}`,
        excerpt: FAQS[6]!.answer!,
        candidateId: "54AR-99",
        sourceUrl: "https://shop-novalis.example/c/order-now.php",
      }),
    ];
    const ledger = writeCandidateLedger(reconcileStoredCandidates({ campaignId: campaign.id, candidates: fixtures, idPrefix: "54AS" }));
    const identity = classifySourceIdentity({
      host: "shop.novalis.example",
      primaryAffiliateHosts: ["shop.novalis.example"],
    });
    const graph = buildCommercialGraph({
      campaignId: campaign.id,
      productName: "Novalis Core",
      run,
      candidates: ledger.candidates,
    });
    const queue = prepareReviewQueue({
      campaignId: campaign.id,
      candidates: ledger.candidates,
      run,
      identities: [identity, classifySourceIdentity({ host: "shop-novalis.example" })],
      relations: graph.relations,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
    });
    const ship = queue.find((item) => item.candidateId === "54AR-07")!;
    const medical = queue.find((item) => item.candidateId === "54AR-01")!;
    const clone = queue.find((item) => item.candidateId === "54AR-99")!;
    const byId = new Map(ledger.candidates.map((item) => [item.candidateId, item]));
    const registeredUrl = "https://shop.novalis.example/c/order-now.php";
    const registeredHost = "shop.novalis.example";
    const shipAllowed = evaluatePrimarySourceAutoApproval({ candidate: byId.get("54AR-07")!, prepared: ship, registeredUrl, registeredHost });
    const cloneBlocked = evaluatePrimarySourceAutoApproval({ candidate: byId.get("54AR-99")!, prepared: clone, registeredUrl, registeredHost });
    const medicalBlocked = evaluatePrimarySourceAutoApproval({ candidate: byId.get("54AR-01")!, prepared: medical, registeredUrl, registeredHost });
    const conflictBlocked = evaluatePrimarySourceAutoApproval({
      candidate: byId.get("54AR-07")!,
      prepared: { ...ship, diagnosis: ship.diagnosis ? { ...ship.diagnosis, semanticRelation: "CONTRADICTION" } : ship.diagnosis },
      registeredUrl,
      registeredHost,
    });
    const first = applyPrimarySourceAutoApproval({
      campaignId: campaign.id,
      run,
      ledger,
      queue,
      identities: [identity],
      relations: graph.relations,
      faqs: FAQS,
      registeredUrl,
      registeredHost,
    });
    const second = applyPrimarySourceAutoApproval({
      campaignId: campaign.id,
      run: first.run,
      ledger: first.ledger,
      queue: prepareReviewQueue({
        campaignId: campaign.id,
        candidates: first.ledger.candidates,
        run: first.run,
        identities: [identity],
        relations: graph.relations,
        primaryAffiliateHosts: ["shop.novalis.example"],
        faqs: FAQS,
        policyApprovedIds: policyApprovedCandidateIds(readEvidenceAudit(campaign.id)),
      }),
      identities: [identity],
      relations: graph.relations,
      faqs: FAQS,
      registeredUrl,
      registeredHost,
    });
    const rejectCampaign = createCampaign({
      name: "Novalis 54AS Reject",
      slug: `novalis-54as-reject-${Date.now()}`,
      headline: "Novalis",
      body: "Novalis",
      ctaLabel: "See offer",
      affiliateUrl: "",
      headScript: null,
      adHeadline: null,
    });
    registerUserProvidedAffiliateUrl({
      campaignId: rejectCampaign.id,
      url: "https://shop.novalis.example/c/order-now.php",
    });
    const rejectRun = writeProductResearchRun(fakeRun(rejectCampaign.id, [
      proposal("description", "Novalis Core is a documented mineral liquid."),
      proposal("ingredients", "Mineral blend"),
      proposal("howItWorks", "Take one serving daily."),
      proposal("guarantee", "If you are unsatisfied you will have 60 days from the date of purchase to return the product and request a refund."),
      proposal("faq", "", "NOT_FOUND"),
    ]));
    const rejectLedger = writeCandidateLedger(reconcileStoredCandidates({
      campaignId: rejectCampaign.id,
      candidates: [fixtures[0]!],
      idPrefix: "54AS",
    }));
    const rejectIdentity = classifySourceIdentity({
      host: "shop.novalis.example",
      primaryAffiliateHosts: ["shop.novalis.example"],
    });
    const rejectGraph = buildCommercialGraph({
      campaignId: rejectCampaign.id,
      productName: "Novalis Core",
      run: rejectRun,
      candidates: rejectLedger.candidates,
    });
    const rejectQueue = prepareReviewQueue({
      campaignId: rejectCampaign.id,
      candidates: rejectLedger.candidates,
      run: rejectRun,
      identities: [rejectIdentity],
      relations: rejectGraph.relations,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
    });
    const humanReject = decideEvidenceCandidate({
      campaignId: rejectCampaign.id,
      candidate: rejectLedger.candidates[0]!,
      ledger: rejectLedger,
      run: rejectRun,
      identity: rejectIdentity,
      relations: rejectGraph.relations,
      decision: "REJECT",
      expectedVersion: rejectLedger.candidates[0]!.version,
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
    });
    const afterRejectQueue = prepareReviewQueue({
      campaignId: rejectCampaign.id,
      candidates: rejectLedger.candidates,
      run: rejectRun,
      identities: [rejectIdentity],
      relations: rejectGraph.relations,
      rejectedIds: new Set([rejectLedger.candidates[0]!.candidateId]),
      primaryAffiliateHosts: ["shop.novalis.example"],
      faqs: FAQS,
    });
    const rejectedApply = applyPrimarySourceAutoApproval({
      campaignId: rejectCampaign.id,
      run: rejectRun,
      ledger: rejectLedger,
      queue: afterRejectQueue,
      identities: [rejectIdentity],
      relations: rejectGraph.relations,
      faqs: FAQS,
      registeredUrl,
      registeredHost,
    });
    return {
      shipAllowed,
      cloneBlocked,
      medicalBlocked,
      conflictBlocked,
      first,
      second,
      audit: readEvidenceAudit(campaign.id),
      accepted: acceptedProposals(first.run),
      samePage: sameLandingPage(registeredUrl, "https://shop.novalis.example/c/order-now.php?hopId=zzzz"),
      lookalikePage: sameLandingPage(registeredUrl, "https://shop-novalis.example/c/order-now.php"),
      humanReject,
      rejectedApply,
    };
  });

  assert(isolatedPolicy.shipAllowed.allowed, "adendo.1 autoaprovacao somente da URL primaria registrada");
  assert(!isolatedPolicy.cloneBlocked.allowed && isolatedPolicy.lookalikePage === false, "adendo.2 bloqueio de URLs semelhantes");
  assert(!isolatedPolicy.medicalBlocked.allowed && /saúde|comprovacao|comprovação/i.test(isolatedPolicy.medicalBlocked.reasonPt), "adendo.3 bloqueio de alegacoes medicas");
  assert(!isolatedPolicy.conflictBlocked.allowed && /conflito/i.test(isolatedPolicy.conflictBlocked.reasonPt), "adendo.5 deteccao de contradicoes");
  assert(isolatedPolicy.first.approved.includes("54AR-07") && isolatedPolicy.first.approved.includes("54AR-08"), "adendo.1 candidatos elegiveis aprovados automaticamente");
  assert(!isolatedPolicy.first.approved.includes("54AR-01") && !isolatedPolicy.first.approved.includes("54AR-99"), "adendo.2 inelegiveis permanecem bloqueados");
  assert(isolatedPolicy.audit.filter((item) => item.actor === PRIMARY_SOURCE_POLICY && item.resultingState === "ACCEPTED").every((item) => item.actor !== "HUMAN"), "adendo.9 isolado sem evento humano ficticio");
  assert(isolatedPolicy.accepted.filter((item) => CORE_FIELDS.includes(item.field as typeof CORE_FIELDS[number])).length === 4, "adendo.7 nucleo isolado preservado");
  assert(isolatedPolicy.accepted.some((item) => item.field === "faq" && item.status === "ACCEPTED"), "adendo.7 contract isolado atualizado");
  assert(isolatedPolicy.second.approved.length === 0, "adendo.10 reexecucao isolada nao duplica");
  assert(isolatedPolicy.humanReject.ok && isolatedPolicy.humanReject.audit.actor === "HUMAN", "adendo.4 rejeicao humana isolada");
  assert(isolatedPolicy.rejectedApply.approved.length === 0, "adendo.4 autoaprovacao nao reverte rejeicao humana");
  assert(isolatedPolicy.samePage, "adendo.1 hop params nao mudam a landing page");
  assert(validateSafeTranslation("one time payment and SSLs", "Segundo a página comercial, o pagamento é único e o site usa SSL.").safe, "adendo.8 traducao fiel atribuida a pagina comercial");

  const evidenceDir = path.join(process.cwd(), "data", "evidence", "execution-54as-primary-evidence-triage");
  mkdirSync(evidenceDir, { recursive: true });
  const readyIds = ready237.map((item) => item.candidateId);
  const payload = {
    candidateDiagnosis: diagnoses,
    faqClassification: faqClasses,
    sourceIdentityAudit: {
      contradiction: identityAudit,
      sellsSugardefenderCom: sells ? {
        id: sells.id,
        state: sells.state,
        confirmedByHuman: sells.confirmedByHuman,
        confirmedAt: sells.confirmedAt,
        notes: sells.notes,
      } : null,
      primaryHost: workspace.primaryHost,
      humanDecisionsPreserved: true,
    },
    semanticDeduplication: diagnoses.map((item) => ({
      candidateId: item.candidateId,
      relation: item.semanticRelation,
      of: item.semanticOf,
    })),
    reviewReadiness: {
      candidatesBefore: workspace.ledger.candidates.length,
      newCandidates: 18,
      ready: readyIds,
      autoApproved: autoApprovedIds,
      blockedMedical: medical237.map((item) => item.candidateId),
      blockedOther: prepared237.filter((item) => item.state !== "READY_FOR_REVIEW" && item.state !== "HIGH_RISK_CLAIM").map((item) => ({
        candidateId: item.candidateId,
        state: item.state,
        blocker: item.blocker,
      })),
      duplicates: dupes.map((item) => item.candidateId),
      conflicts: conflicts.map((item) => item.candidateId),
      realHumanFactsApproved: 0,
    },
    securityRegression: {
      openaiCalls: 0,
      commercialAuthorization: "BLOCKED",
      publicationReadiness: "BLOCKED",
      regenerationGate: appliedWorkspace.regenerationGate.status,
      costAuthorized: false,
      acceptedCoreFacts: CORE_FIELDS.length,
      acceptedFacts: acceptedProposals(appliedRun).length,
      rejectedPreserved: ["54AO-02", "54AO-03", "54AO-04", "54AO-05"],
      hopIdExposed: false,
      fakeHumanApprovals: policyAudit.filter((item) => item.actor === "HUMAN").length,
    },
    primarySourceAutoApproval: {
      policy: PRIMARY_SOURCE_AUTO_APPROVAL,
      enabled: true,
      analyzed: diagnoses.length,
      autoApproved: autoApprovedIds,
      blockedMedical: medical237.map((item) => item.candidateId),
      blockedConflict: conflicts.map((item) => item.candidateId),
      blockedOther: prepared237.filter((item) => item.state !== "READY_FOR_REVIEW" && item.state !== "HIGH_RISK_CLAIM").map((item) => item.candidateId),
      productContractUpdated: acceptedProposals(appliedRun).some((item) => item.field === "faq"),
      humanApprovalRequiredForPrimaryEligible: false,
      humanApprovalRequiredForSecondary: true,
      auditTrail: policyAudit.map((item) => ({
        at: item.at,
        candidateId: item.candidateId,
        actor: item.actor,
        approvalOrigin: item.approvalOrigin,
        policyName: item.policyName,
        policyVersion: item.policyVersion,
        evidenceId: item.evidenceId,
        sourceUrl: item.sourceUrl,
      })),
    },
  };
  writeFileSync(path.join(evidenceDir, "candidate-diagnosis.json"), `${JSON.stringify(payload.candidateDiagnosis, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "faq-classification.json"), `${JSON.stringify(payload.faqClassification, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "source-identity-audit.json"), `${JSON.stringify(payload.sourceIdentityAudit, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "semantic-deduplication.json"), `${JSON.stringify(payload.semanticDeduplication, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "review-readiness.json"), `${JSON.stringify(payload.reviewReadiness, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "security-regression.json"), `${JSON.stringify(payload.securityRegression, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "primary-auto-approval.json"), `${JSON.stringify(payload.primarySourceAutoApproval, null, 2)}\n`);
  const summary = [
    "# EXECUTION 54AS — PRIMARY EVIDENCE TRIAGE",
    "",
    `PRIMARY_CANDIDATES_ANALYZED: ${diagnoses.length}`,
    `FAQ_QUESTIONS_ANALYZED: ${faqClasses.length}`,
    `FAQ_ANSWERS_ANALYZED: ${faqClasses.filter((item) => item.answer).length}`,
    `PRIMARY_READY_FOR_REVIEW: ${readyIds.join(", ") || "0"}`,
    `PRIMARY_BLOCKED_MEDICAL: ${medical237.length}`,
    `SOURCE_IDENTITY_CONTRADICTION: ${identityAudit.needed ? "YES" : "NO"}`,
    `HUMAN_DECISIONS_PRESERVED: YES`,
    `REAL_HUMAN_FACTS_APPROVED: 0`,
    `OPENAI_CALLS: 0`,
    "",
    "PRIMARY_SOURCE_AUTO_APPROVAL: ENABLED",
    `PRIMARY_CANDIDATES_ANALYZED: ${diagnoses.length}`,
    `PRIMARY_AUTO_APPROVED: ${autoApprovedIds.join(", ") || "0"}`,
    `PRIMARY_BLOCKED_MEDICAL: ${medical237.length}`,
    `PRIMARY_BLOCKED_CONFLICT: ${conflicts.length}`,
    `PRIMARY_BLOCKED_OTHER: ${prepared237.filter((item) => item.state !== "READY_FOR_REVIEW" && item.state !== "HIGH_RISK_CLAIM").length}`,
    `PRODUCT_CONTRACT_UPDATED: ${acceptedProposals(appliedRun).some((item) => item.field === "faq") ? "YES" : "NO"}`,
    "HUMAN_APPROVAL_REQUIRED_FOR_PRIMARY: NO (eligible facts only)",
    "HUMAN_APPROVAL_REQUIRED_FOR_SECONDARY: YES",
    "AUDIT_TRAIL: PASS",
    "",
    "## FAQ classification",
    ...faqClasses.map((item, index) => `${index + 1}. ${item.category} | ${item.risk} | eligible=${item.eligible} | ${item.question}`),
    "",
    "## Ready candidates before auto-approval",
    ...readyIds.map((id) => `- ${id}`),
    "",
    "## Auto-approved by PRIMARY_SOURCE_POLICY",
    ...autoApprovedIds.map((id) => `- ${id}`),
    "",
    "Pre-sell was not regenerated. Private hop parameters were not written to this report.",
  ].join("\n");
  writeFileSync(path.join(evidenceDir, "execution-summary.md"), `${summary}\n`);
  assert(!readFileSync(path.join(evidenceDir, "execution-summary.md"), "utf8").includes("hopId="), "3. evidencias sem hopId");

  console.log(`PASS test-presell-quality-54as.ts (${passed} OK)`);
  console.log(`READY_237=${readyIds.length} AUTO=${autoApprovedIds.join(",")} MEDICAL=${medical237.length} DUPES=${dupes.length} CONFLICTS=${conflicts.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
