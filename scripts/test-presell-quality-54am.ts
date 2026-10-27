// npx tsx scripts/test-presell-quality-54am.ts
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
import { classifySourceIdentity, confirmSourceIdentity } from "../src/lib/presell-quality/source-identity.ts";
import { prepareReviewCandidate, prepareReviewQueue, reviewSummary } from "../src/lib/presell-quality/review-prepare.ts";
import { decideEvidenceCandidate, evidenceReviewAuthGate, readEvidenceAudit } from "../src/lib/presell-quality/review-decide.ts";
import { buildContentGapReport } from "../src/lib/presell-quality/content-gap-report.ts";
import { buildEvidenceInventory } from "../src/lib/presell-quality/evidence-inventory.ts";
import { mapContentGapsToCandidates } from "../src/lib/presell-quality/content-gap-map.ts";

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
    runId: `run-am-${campaignId}`,
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

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const stored = loadStoredFactCandidates(237);
  assert(stored.length === 42, "1. carregamento dos candidatos");
  const realLedger = reconcileStoredCandidates({ campaignId: 237, candidates: stored });
  assert(realLedger.preservedCount === 42 && realLedger.candidates.length === 42, "2. preservacao dos 42 registros");
  assert(realLedger.candidates.every((item) => item.approvedForUse === false), "2. nenhum candidato entra aprovado");
  const dup = reconcileStoredCandidates({
    campaignId: 1,
    idPrefix: "NOV",
    candidates: [candidate({ field: "warnings", text: "Same line." }), candidate({ field: "warnings", text: "Same line." })],
  });
  assert(dup.candidates[1]?.duplicateOf === "NOV-01", "3. deduplicacao segura");

  const root = mkdtempSync(path.join(os.tmpdir(), "54am-"));
  process.env.AIA_PRESELL_QUALITY_ROOT = root;
  process.env.AIA_PRODUCT_RESEARCH_ROOT = path.join(root, "research");
  const isolated = createCampaign({
    name: "Novalis 54AM",
    slug: `novalis-54am-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  mkdirSync(path.join(root, String(isolated.id)), { recursive: true });
  const fixtures: FactCandidate[] = [
    candidate({ field: "warnings", text: "Do not exceed the labeled serving." }),
    candidate({ field: "benefits", text: "Clinically proven to treat fatigue.", usable: false, blockReason: "Medical or health claim is not restated as a product fact." }),
    candidate({ field: "description", text: "Novalis Core is a documented mineral capsule." }),
    candidate({ field: "warnings", text: "Do not exceed the labeled serving." }),
  ];
  writeFileSync(path.join(root, String(isolated.id), "expansion-54ae.json"), JSON.stringify({ factCandidates: fixtures }));
  const ledger = writeCandidateLedger(reconcileStoredCandidates({ campaignId: isolated.id, candidates: fixtures, idPrefix: "NOV" }));
  const run = writeProductResearchRun(fakeRun(isolated.id, [
    proposal("description", "Novalis Core is a documented mineral capsule.", "ACCEPTED"),
    proposal("warnings", "", "NOT_FOUND"),
  ]));
  const official = classifySourceIdentity({ host: "example.test", officialHosts: ["example.test"] });
  const unresolved = classifySourceIdentity({ host: "sugardefender.com", acceptedSellerHosts: ["sugardefender.com"] });
  assert(official.state === "VERIFIED" && official.role === "MANUFACTURER", "5. identidade oficial verificada");
  assert(unresolved.state === "PARTIALLY_SUPPORTED" && unresolved.role === "SELLER_OR_AFFILIATE", "5. identidade nao verificada como fabricante");
  const queue = prepareReviewQueue({
    campaignId: isolated.id,
    candidates: ledger.candidates,
    run,
    identities: [official],
    officialHosts: ["example.test"],
  });
  const summary = reviewSummary(queue);
  assert(queue[0]?.riskClass === "DESCRIPTIVE_LOW_RISK" || queue[0]?.state === "READY_FOR_REVIEW", "4. classificacao de risco");
  assert(queue.some((item) => item.state === "HIGH_RISK_CLAIM"), "8. bloqueio de alegacoes medicas");
  assert(queue.some((item) => item.state === "DUPLICATE" || item.state === "ALREADY_ACCEPTED"), "3. duplicata na fila");
  assert(summary.total === 4, "6. preparacao de fila");
  const eligible = queue.find((item) => item.field === "warnings" && item.extractedValue.includes("Do not exceed"));
  assert(eligible?.eligible === true && eligible.availableActions.includes("ACCEPT_ELIGIBLE_FACT"), "7. elegibilidade");
  assert(!queue.find((item) => item.state === "HIGH_RISK_CLAIM")?.availableActions.includes("ACCEPT_ELIGIBLE_FACT"), "7. inelegivel sem botao de aprovacao");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: false }).allowed === false, "9. autenticacao");
  assert(evidenceReviewAuthGate({ required: true, sessionValid: true }).allowed === true, "10. autorizacao");

  const medical = ledger.candidates.find((item) => item.field === "benefits")!;
  const blocked = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: medical,
    ledger,
    run,
    identity: official,
    decision: "ACCEPT",
    expectedVersion: medical.version,
    officialHosts: ["example.test"],
  });
  assert(blocked.ok === false && blocked.reason === "INELIGIBLE_ACCEPT", "13. tentativa de aprovacao inelegivel");
  const stale = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates[0]!,
    ledger,
    run,
    identity: official,
    decision: "ACCEPT",
    expectedVersion: 99,
    officialHosts: ["example.test"],
  });
  assert(stale.ok === false && stale.reason === "VERSION_CONFLICT", "14. conflito de versao");

  const accepted = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: ledger.candidates[0]!,
    ledger,
    run,
    identity: official,
    decision: "ACCEPT",
    expectedVersion: 1,
    officialHosts: ["example.test"],
  });
  assert(accepted.ok && accepted.contractChanged && accepted.regenerationRequired, "11. aprovacao valida");
  assert(accepted.run?.proposals.find((item) => item.field === "warnings")?.status === "ACCEPTED", "16. atualizacao do Product Contract");
  assert(acceptedProposals(accepted.run).some((item) => item.field === "description"), "18. preservacao dos fatos existentes");
  const rejected = decideEvidenceCandidate({
    campaignId: isolated.id,
    candidate: medical,
    ledger,
    run: accepted.run,
    identity: official,
    decision: "REJECT",
    expectedVersion: medical.version,
    officialHosts: ["example.test"],
  });
  assert(rejected.ok && rejected.reason === "REJECT", "12. rejeicao valida");
  const audit = readEvidenceAudit(isolated.id);
  assert(audit.some((item) => item.decision === "ACCEPT") && audit.some((item) => item.notes.includes("INELIGIBLE_ACCEPT")), "15. auditoria");
  assert(accepted.regenerationRequired === true, "17. invalidacao de derivados");

  const identityPending = prepareReviewCandidate({
    candidate: ledger.candidates[0]!,
    run,
    identity: { ...unresolved, confirmedByHuman: false },
  });
  assert(identityPending.state === "SOURCE_IDENTITY_UNRESOLVED" && !identityPending.availableActions.includes("ACCEPT_ELIGIBLE_FACT"), "5. identidade pendente nao aprova");
  confirmSourceIdentity({
    campaignId: isolated.id,
    host: "example.test",
    state: "PARTIALLY_SUPPORTED",
    documentation: "Seller label page already used for accepted facts.",
  });
  const inventory = buildEvidenceInventory({ campaignId: isolated.id, run: accepted.run, candidates: fixtures, officialHosts: ["example.test"] });
  const mapped = mapContentGapsToCandidates({ gaps: buildContentGapReport({ inventory }).gaps, queue });
  assert(mapped.length >= 7, "lacunas mapeadas");
  assert(accepted.run?.publicationReadiness === "BLOCKED" && accepted.run.commercialAuthorization === "BLOCKED", "19. bloqueio de publicacao");
  assert(accepted.run?.commercialAuthorization === "BLOCKED", "20. bloqueio de CTA comercial");

  const before237 = campaignIntegritySnapshot(237);
  reconcileStoredCandidates({ campaignId: 237, candidates: stored });
  const after237 = campaignIntegritySnapshot(237);
  assert(JSON.stringify(before237.acceptedFacts) === JSON.stringify(after237.acceptedFacts), "18. campanha 237 nao e mutada");
  assert(readFileSync(path.join(process.cwd(), "src/app/admin/[id]/fatos/research-actions.ts"), "utf8").includes("requireAdmin()"), "10. acao exige admin");
  assert(readFileSync(path.join(process.cwd(), "src/components/product-review/evidence-review-step.tsx"), "utf8").includes("data-evidence-review"), "interface de revisao presente");

  console.log(`PASS test-presell-quality-54am.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
