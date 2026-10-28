import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { ProductResearchField, ProductResearchRun } from "@/lib/product-research/types";
import { PRODUCT_RESEARCH_FIELDS } from "@/lib/product-research/types";
import { triageFactCandidate } from "@/lib/presell-quality/fact-triage";
import type { LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import type { SourceIdentityRecord, SourceIdentityState } from "@/lib/presell-quality/source-identity";
import { sellerReviewAllowed, type CommercialRelation } from "@/lib/presell-quality/commercial-graph";
import {
  diagnosePrimaryCandidate,
  isPrimaryAffiliateHost,
  type PrimaryCandidateDiagnosis,
} from "@/lib/presell-quality/primary-evidence-triage";
import { buildReviewPresentation } from "@/lib/presell-quality/review-presentation";
import { PRIMARY_SOURCE_POLICY } from "@/lib/presell-quality/primary-source-policy";

export const REVIEW_PREP_STATES = [
  "READY_FOR_REVIEW",
  "SOURCE_IDENTITY_UNRESOLVED",
  "INSUFFICIENT_EVIDENCE",
  "HIGH_RISK_CLAIM",
  "DUPLICATE",
  "ALREADY_ACCEPTED",
  "REJECTED",
] as const;
export type ReviewPrepState = (typeof REVIEW_PREP_STATES)[number];

export const REVIEW_ACTIONS = [
  "REVIEW_EVIDENCE",
  "CONFIRM_SOURCE_IDENTITY",
  "ACCEPT_ELIGIBLE_FACT",
  "REJECT_CANDIDATE",
  "REQUEST_NEW_EVIDENCE",
  "KEEP_PENDING",
  "MARK_DUPLICATE",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export type PreparedReviewCandidate = {
  candidateId: string;
  campaignId: number;
  version: number;
  field: string;
  extractedValue: string;
  originalExcerpt: string;
  sourceUrl: string;
  sourceHost: string;
  sourceClass: string;
  sourceIdentity: SourceIdentityState;
  sourceRole: SourceIdentityRecord["role"];
  evidenceReference: string;
  riskClass: string;
  state: ReviewPrepState;
  eligible: boolean;
  availableActions: ReviewAction[];
  blocker: string;
  identityConfirmed: boolean;
  contractField: ProductResearchField | null;
  primaryAffiliate: boolean;
  diagnosis: PrimaryCandidateDiagnosis | null;
  blockerPt: string;
  approvalOrigin: "HUMAN" | typeof PRIMARY_SOURCE_POLICY | null;
};

const MEDICAL_FIELDS = new Set(["benefits"]);

export function isProductResearchField(field: string): field is ProductResearchField {
  return (PRODUCT_RESEARCH_FIELDS as readonly string[]).includes(field);
}

export function prepareReviewCandidate(input: {
  candidate: LedgerCandidate;
  run: ProductResearchRun | null;
  identity?: SourceIdentityRecord | null;
  relations?: CommercialRelation[];
  rejectedIds?: Set<string>;
  officialHosts?: string[];
  primaryAffiliateHosts?: string[];
  faqs?: Array<{ question: string; answer: string | null }>;
  policyApprovedIds?: Set<string>;
}): PreparedReviewCandidate {
  const accepted = acceptedProposals(input.run);
  const acceptedTexts = accepted.map((item) => item.currentValue || item.suggestedValue);
  const primaryAffiliate = isPrimaryAffiliateHost(input.candidate.sourceHost, input.primaryAffiliateHosts);
  const diagnosis = primaryAffiliate || /^54AR-\d+/.test(input.candidate.candidateId)
    ? diagnosePrimaryCandidate({
      candidate: input.candidate,
      faqs: input.faqs,
      accepted: accepted.map((item) => ({ id: `accepted:${item.field}`, field: item.field, text: item.currentValue || item.suggestedValue })),
    })
    : null;
  const reviewField = diagnosis?.reviewField ?? input.candidate.field;
  const triage = triageFactCandidate({
    candidate: {
      field: reviewField,
      text: input.candidate.extractedValue,
      sourceUrl: input.candidate.sourceUrl,
      sourceClass: input.candidate.sourceClass,
      excerpt: input.candidate.originalExcerpt,
      collectedAt: input.candidate.collectedAt,
      verification: input.candidate.verification,
      usable: input.candidate.usable,
      approvedForUse: false,
      blockReason: diagnosis?.riskClass === "HIGH_RISK"
        ? "Medical or health claim is not restated as a product fact."
        : input.candidate.blockReason && /accepted fact/i.test(input.candidate.blockReason)
          ? null
          : input.candidate.blockReason,
      duplicateOf: input.candidate.duplicateOf,
    },
    acceptedTexts,
    officialHosts: input.officialHosts,
    primaryAffiliateHosts: input.primaryAffiliateHosts,
  });
  const identity = input.identity;
  const identityState = identity?.state ?? "UNRESOLVED";
  const identityConfirmed = Boolean(identity?.confirmedByHuman);
  const excerptOk = Boolean(input.candidate.originalExcerpt && input.candidate.extractedValue && triage.excerptSupportsCandidate);
  const acceptedField = accepted.find((item) => item.field === reviewField);
  const sameText = acceptedTexts.some((text) => text.replace(/\s+/g, " ").trim().toLowerCase() === input.candidate.extractedValue.replace(/\s+/g, " ").trim().toLowerCase());
  const contractField = isProductResearchField(reviewField) ? reviewField : null;
  const rejected = input.rejectedIds?.has(input.candidate.candidateId);
  const policyApproved = input.policyApprovedIds?.has(input.candidate.candidateId) ?? false;
  const medical = triage.medicalOrPromotional || diagnosis?.riskClass === "HIGH_RISK" || MEDICAL_FIELDS.has(reviewField) && triage.triageClass === "HEALTH_OR_EFFICACY_CLAIM";
  const promotional = diagnosis?.riskClass === "PROMOTIONAL";

  let state: ReviewPrepState = "INSUFFICIENT_EVIDENCE";
  let blocker = "The excerpt is too weak for a concrete human decision.";
  let blockerPt = "A evidência armazenada não é suficiente para uma decisão segura.";
  let approvalOrigin: PreparedReviewCandidate["approvalOrigin"] = null;
  if (rejected) {
    state = "REJECTED";
    blocker = "A human already rejected this candidate.";
    blockerPt = "Esta informação já foi rejeitada e a decisão humana foi preservada.";
  } else if (policyApproved) {
    state = "ALREADY_ACCEPTED";
    blocker = "Auto-approved by the registered primary affiliate page policy.";
    blockerPt = "Aprovado automaticamente — página principal";
    approvalOrigin = PRIMARY_SOURCE_POLICY;
  } else if (sameText || triage.nextState === "DUPLICATE_EXISTING_FACT" || diagnosis?.semanticRelation === "EXACT_DUPLICATE" || diagnosis?.semanticRelation === "SEMANTIC_EQUIVALENT") {
    state = sameText && acceptedField ? "ALREADY_ACCEPTED" : "DUPLICATE";
    blocker = "This text is already accepted or duplicated.";
    blockerPt = "Esta informação já foi analisada ou é equivalente a um fato já registrado.";
  } else if (medical) {
    state = "HIGH_RISK_CLAIM";
    blocker = "Medical or efficacy language cannot be approved without independent evidence.";
    blockerPt = diagnosis?.ineligibilityReasonPt || "Esta informação promete um resultado de saúde, mas ainda não temos comprovação suficiente.";
  } else if (promotional) {
    state = "INSUFFICIENT_EVIDENCE";
    blocker = diagnosis?.ineligibilityReason || "Promotional offer language is not restated as a proven fact.";
    blockerPt = diagnosis?.ineligibilityReasonPt || "Esta informação é promocional. Não a transformamos em fato comprovado.";
  } else if (diagnosis?.semanticRelation === "CONTRADICTION") {
    state = "INSUFFICIENT_EVIDENCE";
    blocker = diagnosis.ineligibilityReason || "New evidence contradicts an existing fact and needs a human conflict review.";
    blockerPt = diagnosis.ineligibilityReasonPt || "Esta informação entra em conflito com um fato já aceito e precisa de análise humana.";
  } else if (!excerptOk || triage.triageClass === "INSUFFICIENT_EVIDENCE") {
    state = "INSUFFICIENT_EVIDENCE";
    blocker = triage.notes[0] || "Insufficient evidence excerpt.";
    blockerPt = "A evidência armazenada não é suficiente para uma decisão segura.";
  } else if (identityState === "CONTRADICTED" && !primaryAffiliate) {
    state = "INSUFFICIENT_EVIDENCE";
    blocker = "Source identity is contradicted.";
    blockerPt = "Há uma decisão humana anterior sobre este site. Ela não é revertida automaticamente.";
  } else if (identity?.role === "CLONE") {
    state = "SOURCE_IDENTITY_UNRESOLVED";
    blocker = "Lookalike hosts stay unresolved. Domain resemblance is not ownership.";
    blockerPt = "Encontramos um site com nome parecido, mas isso não prova que ele pertença ao mesmo vendedor.";
  } else {
    const sellerGate = sellerReviewAllowed({
      field: reviewField,
      host: input.candidate.sourceHost,
      relations: input.relations ?? [],
      identityRole: identity?.role,
      primaryAffiliateHosts: input.primaryAffiliateHosts,
    });
    const manufacturerBypass = identity?.role === "MANUFACTURER";
    if (!sellerGate.allowed && !manufacturerBypass) {
      state = "SOURCE_IDENTITY_UNRESOLVED";
      blocker = sellerGate.reason;
      blockerPt = "A origem desta informação ainda não está comprovada o suficiente para o tipo de afirmação.";
    } else if (!contractField) {
      state = "INSUFFICIENT_EVIDENCE";
      blocker = "This operational note has no Product Contract field. Do not invent a field.";
      blockerPt = "Esta informação operacional não tem um campo do contrato do produto.";
    } else if (acceptedField && acceptedField.status === "ACCEPTED" && reviewField !== "faq") {
      state = "ALREADY_ACCEPTED";
      blocker = `Field ${reviewField} is already accepted. Overwrite requires an explicit confirm.`;
      blockerPt = "Este campo já foi aprovado. Sobrescrever exige uma confirmação explícita.";
    } else {
      const presented = buildReviewPresentation({
        candidateId: input.candidate.candidateId,
        version: input.candidate.version,
        extractedValue: input.candidate.extractedValue,
        originalExcerpt: input.candidate.originalExcerpt,
        sourceHost: input.candidate.sourceHost,
        sourceUrl: input.candidate.sourceUrl,
        field: reviewField,
        primaryAffiliate,
      });
      if (!presented.translationSafe) {
        state = "INSUFFICIENT_EVIDENCE";
        blocker = presented.unsafeReason || "The Portuguese preview is not safe to approve.";
        blockerPt = "Esta informação precisa de tradução antes da aprovação.";
      } else {
        state = "READY_FOR_REVIEW";
        blocker = sellerGate.allowed ? sellerGate.reason : "";
        blockerPt = "";
      }
    }
  }

  const availableActions: ReviewAction[] = ["REVIEW_EVIDENCE", "KEEP_PENDING"];
  if (state === "SOURCE_IDENTITY_UNRESOLVED") availableActions.push("CONFIRM_SOURCE_IDENTITY", "REJECT_CANDIDATE", "REQUEST_NEW_EVIDENCE");
  if (state === "INSUFFICIENT_EVIDENCE") availableActions.push("REQUEST_NEW_EVIDENCE", "REJECT_CANDIDATE");
  if (state === "HIGH_RISK_CLAIM") availableActions.push("REJECT_CANDIDATE", "REQUEST_NEW_EVIDENCE");
  if (state === "DUPLICATE" || state === "ALREADY_ACCEPTED") availableActions.push("MARK_DUPLICATE");
  if (state === "READY_FOR_REVIEW") availableActions.push("ACCEPT_ELIGIBLE_FACT", "REJECT_CANDIDATE", "REQUEST_NEW_EVIDENCE");

  return {
    candidateId: input.candidate.candidateId,
    campaignId: input.candidate.campaignId,
    version: input.candidate.version,
    field: reviewField,
    extractedValue: input.candidate.extractedValue,
    originalExcerpt: input.candidate.originalExcerpt,
    sourceUrl: input.candidate.sourceUrl,
    sourceHost: input.candidate.sourceHost,
    sourceClass: input.candidate.sourceClass,
    sourceIdentity: identityState,
    sourceRole: identity?.role ?? "UNKNOWN",
    evidenceReference: input.candidate.evidenceReference,
    riskClass: diagnosis?.riskClass === "HIGH_RISK" ? "HEALTH_OR_EFFICACY_CLAIM" : triage.triageClass,
    state,
    eligible: state === "READY_FOR_REVIEW",
    availableActions,
    blocker,
    identityConfirmed,
    contractField,
    primaryAffiliate,
    diagnosis,
    blockerPt,
    approvalOrigin,
  };
}

export function prepareReviewQueue(input: {
  campaignId: number;
  candidates: LedgerCandidate[];
  run: ProductResearchRun | null;
  identities?: SourceIdentityRecord[];
  relations?: CommercialRelation[];
  rejectedIds?: Set<string>;
  officialHosts?: string[];
  primaryAffiliateHosts?: string[];
  faqs?: Array<{ question: string; answer: string | null }>;
  policyApprovedIds?: Set<string>;
}): PreparedReviewCandidate[] {
  const byHost = new Map((input.identities ?? []).map((item) => [item.host, item]));
  return input.candidates.map((candidate) =>
    prepareReviewCandidate({
      candidate,
      run: input.run,
      identity: byHost.get(candidate.sourceHost) ?? null,
      relations: input.relations,
      rejectedIds: input.rejectedIds,
      officialHosts: input.officialHosts,
      primaryAffiliateHosts: input.primaryAffiliateHosts,
      faqs: input.faqs,
      policyApprovedIds: input.policyApprovedIds,
    }),
  );
}

export function reviewSummary(rows: PreparedReviewCandidate[]): {
  total: number;
  readyForReview: number;
  identityUnresolved: number;
  insufficientEvidence: number;
  highRisk: number;
  duplicates: number;
  alreadyAccepted: number;
  rejected: number;
} {
  return {
    total: rows.length,
    readyForReview: rows.filter((item) => item.state === "READY_FOR_REVIEW").length,
    identityUnresolved: rows.filter((item) => item.state === "SOURCE_IDENTITY_UNRESOLVED").length,
    insufficientEvidence: rows.filter((item) => item.state === "INSUFFICIENT_EVIDENCE").length,
    highRisk: rows.filter((item) => item.state === "HIGH_RISK_CLAIM").length,
    duplicates: rows.filter((item) => item.state === "DUPLICATE").length,
    alreadyAccepted: rows.filter((item) => item.state === "ALREADY_ACCEPTED").length,
    rejected: rows.filter((item) => item.state === "REJECTED").length,
  };
}
