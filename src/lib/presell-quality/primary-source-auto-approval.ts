import { publicLandingUrl, readPrimaryAffiliatePage, sameLandingPage } from "@/lib/campaign-sources/primary-page";
import { writeCandidateLedger, type LedgerCandidate, type CandidateLedger } from "@/lib/presell-quality/candidate-ledger";
import type { CommercialRelation } from "@/lib/presell-quality/commercial-graph";
import type { PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";
import { decideEvidenceCandidate, readEvidenceAudit, type EvidenceAuditEntry } from "@/lib/presell-quality/review-decide";
import { buildReviewPresentation } from "@/lib/presell-quality/review-presentation";
import type { SourceIdentityRecord } from "@/lib/presell-quality/source-identity";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { PRIMARY_SOURCE_POLICY } from "@/lib/presell-quality/primary-source-policy";

export { PRIMARY_SOURCE_AUTO_APPROVAL, PRIMARY_SOURCE_POLICY, PRIMARY_SOURCE_POLICY_VERSION } from "@/lib/presell-quality/primary-source-policy";

export type PrimaryAutoApprovalDecision = {
  allowed: boolean;
  reason: string;
  reasonPt: string;
};

export function policyApprovedCandidateIds(audit: EvidenceAuditEntry[]): Set<string> {
  return new Set(
    audit
      .filter((item) => item.actor === PRIMARY_SOURCE_POLICY && item.decision === "ACCEPT" && item.resultingState === "ACCEPTED")
      .map((item) => item.candidateId),
  );
}

export function evaluatePrimarySourceAutoApproval(input: {
  candidate: LedgerCandidate;
  prepared: PreparedReviewCandidate;
  registeredUrl: string | null;
  registeredHost: string | null;
}): PrimaryAutoApprovalDecision {
  const registeredUrl = input.registeredUrl ? publicLandingUrl(input.registeredUrl) : "";
  const sourceUrl = publicLandingUrl(input.candidate.sourceUrl || "");
  if (!registeredUrl || !sourceUrl) {
    return { allowed: false, reason: "Primary affiliate URL is not registered.", reasonPt: "A página comercial primária não está registrada." };
  }
  if (!sameLandingPage(sourceUrl, registeredUrl)) {
    return { allowed: false, reason: "Evidence was not extracted from the registered primary URL.", reasonPt: "Esta evidência não veio da página comercial registrada." };
  }
  const registeredHost = (input.registeredHost || "").toLowerCase();
  if (registeredHost && input.candidate.sourceHost.toLowerCase() !== registeredHost) {
    return { allowed: false, reason: "Source host was substituted for a different domain.", reasonPt: "A origem foi substituída por outro domínio." };
  }
  if (!input.candidate.originalExcerpt || !input.candidate.extractedValue) {
    return { allowed: false, reason: "Original extracted text is missing.", reasonPt: "O conteúdo original não está preservado." };
  }
  if (!input.candidate.evidenceReference) {
    return { allowed: false, reason: "Evidence ID is missing.", reasonPt: "A informação não possui rastreabilidade." };
  }
  if (input.prepared.state === "REJECTED") {
    return { allowed: false, reason: "A human already rejected this candidate.", reasonPt: "Esta informação já foi rejeitada e a decisão humana foi preservada." };
  }
  if (input.prepared.state === "HIGH_RISK_CLAIM" || input.prepared.riskClass === "HEALTH_OR_EFFICACY_CLAIM") {
    return { allowed: false, reason: "Medical or efficacy language cannot be auto-approved.", reasonPt: "Esta informação promete um resultado de saúde, mas ainda não temos comprovação suficiente." };
  }
  if (input.prepared.diagnosis?.semanticRelation === "CONTRADICTION") {
    return { allowed: false, reason: "Material contradiction requires human review.", reasonPt: "Esta informação entra em conflito com um fato já aceito e precisa de análise humana." };
  }
  if (input.prepared.diagnosis?.riskClass === "PROMOTIONAL") {
    return { allowed: false, reason: "Promotional language is not auto-approved.", reasonPt: "Esta informação é promocional. Não a transformamos em fato comprovado." };
  }
  if (!input.prepared.eligible || input.prepared.state !== "READY_FOR_REVIEW") {
    return { allowed: false, reason: input.prepared.blocker || "Candidate is not eligible for auto-approval.", reasonPt: input.prepared.blockerPt || "Esta informação ainda não pode ser utilizada." };
  }
  const presented = buildReviewPresentation({
    candidateId: input.candidate.candidateId,
    version: input.candidate.version,
    extractedValue: input.candidate.extractedValue,
    originalExcerpt: input.candidate.originalExcerpt,
    sourceHost: input.candidate.sourceHost,
    sourceUrl: input.candidate.sourceUrl,
    field: input.prepared.field,
    primaryAffiliate: true,
  });
  if (!presented.translationSafe || !presented.preview) {
    return { allowed: false, reason: presented.unsafeReason || "Portuguese preview is not faithful.", reasonPt: "A tradução não mantém exatamente o significado." };
  }
  return { allowed: true, reason: "Eligible primary-source operational fact.", reasonPt: "Informação operacional elegível da página principal." };
}

export function applyPrimarySourceAutoApproval(input: {
  campaignId: number;
  run: ProductResearchRun | null;
  ledger: CandidateLedger;
  queue: PreparedReviewCandidate[];
  identities: SourceIdentityRecord[];
  relations: CommercialRelation[];
  faqs?: Array<{ question: string; answer: string | null }>;
  registeredUrl?: string | null;
  registeredHost?: string | null;
}): {
  run: ProductResearchRun | null;
  ledger: CandidateLedger;
  approved: string[];
  skipped: Array<{ candidateId: string; reason: string; reasonPt: string }>;
  changed: boolean;
} {
  const page = readPrimaryAffiliatePage(input.campaignId);
  const registeredUrl = input.registeredUrl ?? page?.publicUrl ?? null;
  const registeredHost = input.registeredHost ?? page?.host ?? null;
  const already = policyApprovedCandidateIds(readEvidenceAudit(input.campaignId));
  const skipped: Array<{ candidateId: string; reason: string; reasonPt: string }> = [];
  const approved: string[] = [];
  let run = input.run;
  let ledger = input.ledger;
  const byId = new Map(input.ledger.candidates.map((item) => [item.candidateId, item]));
  const identityByHost = new Map(input.identities.map((item) => [item.host, item]));

  for (const prepared of input.queue) {
    const candidate = byId.get(prepared.candidateId);
    if (!candidate) continue;
    if (already.has(candidate.candidateId)) {
      skipped.push({ candidateId: candidate.candidateId, reason: "Already auto-approved by primary source policy.", reasonPt: "Já aprovada automaticamente pela política da página principal." });
      continue;
    }
    const verdict = evaluatePrimarySourceAutoApproval({
      candidate,
      prepared,
      registeredUrl,
      registeredHost,
    });
    if (!verdict.allowed) {
      skipped.push({ candidateId: candidate.candidateId, reason: verdict.reason, reasonPt: verdict.reasonPt });
      continue;
    }
    const presented = buildReviewPresentation({
      candidateId: candidate.candidateId,
      version: candidate.version,
      extractedValue: candidate.extractedValue,
      originalExcerpt: candidate.originalExcerpt,
      sourceHost: candidate.sourceHost,
      sourceUrl: candidate.sourceUrl,
      field: prepared.field,
      primaryAffiliate: true,
    });
    const result = decideEvidenceCandidate({
      campaignId: input.campaignId,
      candidate,
      ledger,
      run,
      identity: identityByHost.get(candidate.sourceHost) ?? null,
      relations: input.relations,
      decision: "ACCEPT",
      expectedVersion: candidate.version,
      primaryAffiliateHosts: registeredHost ? [registeredHost] : [],
      faqs: input.faqs,
      presentationVersion: presented.previewVersion,
      actor: PRIMARY_SOURCE_POLICY,
    });
    run = result.run;
    ledger = result.ok ? { ...ledger, regenerationRequired: true } : ledger;
    if (result.ok) approved.push(candidate.candidateId);
    else skipped.push({ candidateId: candidate.candidateId, reason: result.reason, reasonPt: "A aprovação automática foi recusada pelas validações de segurança." });
  }

  if (approved.length) writeCandidateLedger({ ...ledger, regenerationRequired: true });
  return { run, ledger, approved, skipped, changed: approved.length > 0 };
}
