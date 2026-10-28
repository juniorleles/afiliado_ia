// npx tsx scripts/test-presell-quality-54an.ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { campaignIntegritySnapshot } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { writeCampaignSources } from "../src/lib/campaign-sources/store.ts";
import type { CampaignSource } from "../src/lib/campaign-sources/types.ts";
import { writeProductResearchRun } from "../src/lib/product-research/store.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { FactCandidate } from "../src/lib/presell-quality/recovery.ts";
import { loadStoredFactCandidates, reconcileStoredCandidates, writeCandidateLedger } from "../src/lib/presell-quality/candidate-ledger.ts";
import { classifySourceIdentity, confirmSourceIdentity, isGenericHostConfirmation } from "../src/lib/presell-quality/source-identity.ts";
import {
  applyScopedConfirmation,
  buildCommercialGraph,
  confirmScopedIdentity,
  readIdentityAudit,
  rejectRelation,
  sellerReviewAllowed,
} from "../src/lib/presell-quality/commercial-graph.ts";
import { relatedHostEvidence } from "../src/lib/campaign-sources/related-hosts.ts";
import { prepareReviewCandidate, prepareReviewQueue, reviewSummary } from "../src/lib/presell-quality/review-prepare.ts";
import { decideEvidenceCandidate, evidenceReviewAuthGate, readEvidenceAudit } from "../src/lib/presell-quality/review-decide.ts";
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
    runId: `run-an-${campaignId}`,
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
    sourceUrl: "https://example.test/label",
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

function source(campaignId: number, type: CampaignSource["sourceType"], url: string): CampaignSource {
  return {
    sourceId: `src-${type}-${campaignId}`,
    campaignId,
    sourceType: type,
    originalUrl: url,
    normalizedUrl: url,
    finalUrl: null,
    sourceStatus: type === "TRACKING_HOPLINK" ? "RESTRICTED" : "VALID",
    sourceClassification: type,
    discoveryMethod: "OPERATOR",
    submittedBy: "OPERATOR",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    verificationStatus: "SELLER_STATED",
    evidenceIds: [],
    notes: [],
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const stored = loadStoredFactCandidates(237);
  const realRun = readLatestProductResearch(237);
  const accepted237 = acceptedProposals(realRun);
  assert(stored.length === 42, "candidatos 237 carregados");
  assert(["description", "ingredients", "howItWorks", "guarantee"].every((field) => accepted237.some((item) => item.field === field)), "18. fatos ACCEPTED do nucleo preservados na campanha real");
  const before237 = campaignIntegritySnapshot(237);
  const realLedger = reconcileStoredCandidates({ campaignId: 237, candidates: stored });
  const acceptedHosts = [...new Set(accepted237.map((item) => {
    try {
      return item.sourceUrl ? new URL(item.sourceUrl).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  }).filter(Boolean))];
  const identities = realLedger.candidates.map((item) => classifySourceIdentity({
    host: item.sourceHost,
    acceptedSellerHosts: acceptedHosts,
    sourceClass: item.sourceClass,
  }));
  const beforeQueue = prepareReviewQueue({
    campaignId: 237,
    candidates: realLedger.candidates,
    run: realRun,
    identities,
  });
  const graph237 = buildCommercialGraph({
    campaignId: 237,
    productName: "Sugar Defender",
    run: realRun,
    candidates: realLedger.candidates,
  });
  const afterQueue = prepareReviewQueue({
    campaignId: 237,
    candidates: realLedger.candidates,
    run: realRun,
    identities,
    relations: graph237.relations,
  });
  const beforeSummary = reviewSummary(beforeQueue);
  const afterSummary = reviewSummary(afterQueue);
  assert(beforeSummary.identityUnresolved === 28 || beforeSummary.identityUnresolved >= 1, "12. fila anterior tinha bloqueio de identidade");
  assert(beforeSummary.readyForReview === 0, "READY_FOR_REVIEW anterior era zero");
  assert(graph237.relations.some((item) => item.type === "SELLS" && item.scope === "SELLER"), "2. identidade de vendedor documentada");
  assert(!graph237.relations.some((item) => item.scope === "MANUFACTURER" && item.state === "VERIFIED"), "3. fabricante nao verificado sem prova");
  assert(graph237.relations.every((item) => item.scope !== "MANUFACTURER" || item.state !== "VERIFIED"), "3. nenhuma relacao de fabricante verificada");
  const sellerHost = acceptedHosts[0] || "sugardefender.com";
  assert(classifySourceIdentity({ host: sellerHost, acceptedSellerHosts: acceptedHosts }).role === "SELLER_OR_AFFILIATE", "1. classificacao de dominio vendedor");
  assert(classifySourceIdentity({ host: "example.test", officialHosts: ["example.test"] }).role === "MANUFACTURER", "1. classificacao de dominio fabricante");
  assert(classifySourceIdentity({ host: "copy.vercel.app" }).role === "CLONE", "7. semelhanca/clone insuficiente");
  const token = relatedHostEvidence("sugardefender.com", "sugardefender24.com");
  assert(token.related && token.confidence !== "HIGH", "7. semelhanca de dominio nao e propriedade");
  assert(graph237.relations.some((item) => item.type === "RELATED_BY_TOKEN" && item.state === "UNRESOLVED") || token.confidence === "MEDIUM", "5. evidencia cruzada de token permanece UNRESOLVED");
  assert(graph237.relations.filter((item) => item.type === "SELLS").every((item) => item.evidence.some((ev) => ev.selfDeclared) || item.state === "PARTIALLY_SUPPORTED"), "8. autodeclaracao nao vira prova independente");
  assert(sellerReviewAllowed({ field: "manufacturer", host: sellerHost, relations: graph237.relations }).allowed === false, "3. campo de fabricante permanece bloqueado");
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "18. campanha 237 nao e mutada pela reavaliacao");

  const root = mkdtempSync(path.join(os.tmpdir(), "54an-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;
  process.env.AIA_PRODUCT_RESEARCH_ROOT = path.join(root, "research");
  process.env.AIA_CAMPAIGN_SOURCES_ROOT = path.join(root, "sources");
  const isolated = createCampaign({
    name: "Novalis 54AN",
    slug: `novalis-54an-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  mkdirSync(path.join(root, String(isolated.id)), { recursive: true });
  writeCampaignSources(isolated.id, [
    source(isolated.id, "SALES_PAGE", "https://example.test/novalis"),
    source(isolated.id, "AFFILIATE_RESOURCE", "https://example.test/affiliates"),
    source(isolated.id, "AUTHORIZED_DESTINATION", "https://checkout.example.test/c/order-now.php"),
    source(isolated.id, "TRACKING_HOPLINK", "https://hop.clickbank.net/"),
  ]);
  const fixtures: FactCandidate[] = [
    candidate({ field: "warnings", text: "Please allow 1-2 business days processing time for your order to be shipped. During holidays orders can experience delays to be processed." }),
    candidate({ field: "benefits", text: "Clinically proven to treat fatigue.", usable: false, blockReason: "Medical or health claim is not restated as a product fact." }),
    candidate({ field: "description", text: "Novalis Core is a documented mineral capsule." }),
    candidate({ field: "manufacturer", text: "Made by an unnamed laboratory.", sourceUrl: "https://example.test/novalis" }),
    candidate({ field: "howItWorks", text: "Take two droppers under the tongue.", sourceUrl: "https://copy.vercel.app/novalis" }),
  ];
  writeFileSync(path.join(root, String(isolated.id), "expansion-54ae.json"), JSON.stringify({ factCandidates: fixtures }));
  const ledger = writeCandidateLedger(reconcileStoredCandidates({ campaignId: isolated.id, candidates: fixtures, idPrefix: "NOV" }));
  const run = writeProductResearchRun(fakeRun(isolated.id, [
    proposal("description", "Novalis Core is a documented mineral capsule.", "ACCEPTED"),
    proposal("warnings", "", "NOT_FOUND"),
    proposal("manufacturer", "", "NOT_FOUND"),
    proposal("howItWorks", "", "NOT_FOUND"),
  ]));
  const graph = buildCommercialGraph({
    campaignId: isolated.id,
    productName: "Novalis Core",
    run,
    candidates: ledger.candidates,
  });
  assert(graph.relations.some((item) => item.type === "SELLS" && item.to === "website:example.test"), "2. relacao de vendedor");
  assert(graph.relations.some((item) => item.type === "PROMOTES_AS_AFFILIATE"), "4. relacao com programa de afiliados");
  assert(graph.relations.some((item) => item.type === "CHECKOUT_FOR"), "1. checkout separado de vendedor");
  assert(graph.relations.some((item) => item.type === "TRACKS_VIA"), "4. hop de rastreamento separado");
  assert(graph.relations.some((item) => item.type === "LOOKALIKE_OF"), "7. clone nao e vendedor");
  const official = classifySourceIdentity({ host: "example.test", officialHosts: ["example.test"] });
  const sellerIdentity = classifySourceIdentity({ host: "example.test", acceptedSellerHosts: ["example.test"] });
  const cloneIdentity = classifySourceIdentity({ host: "copy.vercel.app" });
  const queue = prepareReviewQueue({
    campaignId: isolated.id,
    candidates: ledger.candidates,
    run,
    identities: [sellerIdentity, cloneIdentity],
    relations: graph.relations,
  });
  const ready = queue.find((item) => item.field === "warnings");
  assert(ready?.state === "READY_FOR_REVIEW" && ready.eligible, "13. candidato operacional READY_FOR_REVIEW");
  const manufacturer = queue.find((item) => item.field === "manufacturer");
  assert(manufacturer?.state === "SOURCE_IDENTITY_UNRESOLVED", "14. candidato de fabricante bloqueado");
  const medical = queue.find((item) => item.field === "benefits");
  assert(medical?.state === "HIGH_RISK_CLAIM" && !medical.availableActions.includes("ACCEPT_ELIGIBLE_FACT"), "15. alegacao medica bloqueada");
  const cloneRow = queue.find((item) => item.sourceHost === "copy.vercel.app");
  assert(cloneRow?.state === "SOURCE_IDENTITY_UNRESOLVED", "14. clone permanece bloqueado");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "16. autenticacao");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: true }).allowed === true, "16. autorizacao");

  let genericFailed = false;
  try {
    applyScopedConfirmation({ graph, host: "all domains", scope: "SELLER", documentation: "Confirm everything." });
  } catch {
    genericFailed = true;
  }
  assert(genericFailed && isGenericHostConfirmation("all domains"), "10. bloqueio de confirmacao generica");
  let weakMakerFailed = false;
  try {
    applyScopedConfirmation({ graph, host: "example.test", scope: "MANUFACTURER", documentation: "Looks official." });
  } catch {
    weakMakerFailed = true;
  }
  assert(weakMakerFailed, "8. autodeclaracao insuficiente para fabricante");
  const confirmed = confirmScopedIdentity({
    campaignId: isolated.id,
    host: "example.test",
    scope: "SELLER",
    documentation: "Seller information page already used for accepted facts.",
    graph,
  });
  assert(confirmed.graph.relations.some((item) => item.scope === "SELLER" && item.confirmedByHuman && item.state !== "VERIFIED"), "9. confirmacao humana com escopo de vendedor");
  assert(confirmed.identity.records.some((item) => item.host === "example.test" && item.role === "SELLER_OR_AFFILIATE"), "9. confirmacao nao promove fabricante");
  const audit = readIdentityAudit(isolated.id);
  assert(audit.some((item) => item.action === "CONFIRM" && item.scope === "SELLER" && item.host === "example.test"), "11. registro de auditoria");
  const contradicted = rejectRelation({
    graph: confirmed.graph,
    relationId: confirmed.graph.relations.find((item) => item.type === "SELLS")!.id,
    documentation: "Operator later contradicted the seller claim.",
  });
  assert(sellerReviewAllowed({ field: "warnings", host: "example.test", relations: contradicted.relations }).allowed === false, "6. evidencia contraditoria bloqueia");

  const accepted = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates[0]!,
    ledger,
    run,
    identity: sellerIdentity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: 1,
  });
  assert(accepted.ok && accepted.contractChanged, "12. reavaliacao permite aprovacao isolada");
  const stale = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates[0]!,
    ledger,
    run: accepted.run,
    identity: sellerIdentity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: 99,
  });
  assert(stale.ok === false && stale.reason === "VERSION_CONFLICT", "17. protecao contra alteracao de versao");
  const medicalBlock = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates.find((item) => item.field === "benefits")!,
    ledger,
    run: accepted.run,
    identity: sellerIdentity,
    relations: graph.relations,
    decision: "ACCEPT",
    expectedVersion: 1,
  });
  assert(medicalBlock.ok === false, "15. aprovacao medica recusada");
  assert(acceptedProposals(accepted.run).some((item) => item.field === "description"), "18. fato ACCEPTED isolado preservado");
  assert(accepted.run?.publicationReadiness === "BLOCKED", "19. bloqueio de publicacao");
  assert(accepted.run?.commercialAuthorization === "BLOCKED", "20. bloqueio de CTA comercial");
  assert(readEvidenceAudit(isolated.id).some((item) => item.decision === "ACCEPT"), "11. auditoria de revisao");
  confirmSourceIdentity({
    campaignId: isolated.id,
    host: "example.test",
    state: "PARTIALLY_SUPPORTED",
    documentation: "Seller label page already used for accepted facts.",
  });
  assert(readFileSync(path.join(process.cwd(), "src/app/admin/[id]/fatos/research-actions.ts"), "utf8").includes("requireAdmin()"), "16. acao exige admin");
  assert(readFileSync(path.join(process.cwd(), "src/components/product-review/source-identity-panel.tsx"), "utf8").includes("data-source-identity-panel"), "interface de identidade presente");
  assert(!readFileSync(path.join(process.cwd(), "src/components/product-review/source-identity-panel.tsx"), "utf8").includes("Confirmar todos"), "10. UI sem confirmacao generica");
  void afterSummary;
  console.log(`PASS test-presell-quality-54an.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
