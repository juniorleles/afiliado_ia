import { acceptedProposals } from "@/lib/product-research/approved-facts";
import type { ProductResearchField, ProductResearchRun } from "@/lib/product-research/types";
import { PRODUCT_RESEARCH_FIELDS } from "@/lib/product-research/types";
import { triageFactCandidate } from "@/lib/presell-quality/fact-triage";
import type { LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import type { SourceIdentityRecord, SourceIdentityState } from "@/lib/presell-quality/source-identity";
import { sellerReviewAllowed, type CommercialRelation } from "@/lib/presell-quality/commercial-graph";

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
}): PreparedReviewCandidate {
  const accepted = acceptedProposals(input.run);
  const acceptedTexts = accepted.map((item) => item.currentValue || item.suggestedValue);
  const triage = triageFactCandidate({
    candidate: {
      field: input.candidate.field,
      text: input.candidate.extractedValue,
      sourceUrl: input.candidate.sourceUrl,
      sourceClass: input.candidate.sourceClass,
      excerpt: input.candidate.originalExcerpt,
      collectedAt: input.candidate.collectedAt,
      verification: input.candidate.verification,
      usable: input.candidate.usable,
      approvedForUse: false,
      blockReason: input.candidate.blockReason,
      duplicateOf: input.candidate.duplicateOf,
    },
    acceptedTexts,
    officialHosts: input.officialHosts,
  });
  const identity = input.identity;
  const identityState = identity?.state ?? "UNRESOLVED";
  const identityConfirmed = Boolean(identity?.confirmedByHuman);
  const excerptOk = Boolean(input.candidate.originalExcerpt && input.candidate.extractedValue && triage.excerptSupportsCandidate);
  const acceptedField = accepted.find((item) => item.field === input.candidate.field);
  const sameText = acceptedTexts.some((text) => text.replace(/\s+/g, " ").trim().toLowerCase() === input.candidate.extractedValue.replace(/\s+/g, " ").trim().toLowerCase());
  const contractField = isProductResearchField(input.candidate.field) ? input.candidate.field : null;
  const rejected = input.rejectedIds?.has(input.candidate.candidateId);

  let state: ReviewPrepState = "INSUFFICIENT_EVIDENCE";
  let blocker = "The excerpt is too weak for a concrete human decision.";
  if (rejected) {
    state = "REJECTED";
    blocker = "A human already rejected this candidate.";
  } else if (sameText || triage.nextState === "DUPLICATE_EXISTING_FACT") {
    state = sameText && acceptedField ? "ALREADY_ACCEPTED" : "DUPLICATE";
    blocker = "This text is already accepted or duplicated.";
  } else if (triage.medicalOrPromotional || MEDICAL_FIELDS.has(input.candidate.field) && triage.triageClass === "HEALTH_OR_EFFICACY_CLAIM") {
    state = "HIGH_RISK_CLAIM";
    blocker = "Medical or efficacy language cannot be approved without independent evidence.";
  } else if (!excerptOk || triage.triageClass === "INSUFFICIENT_EVIDENCE") {
    state = "INSUFFICIENT_EVIDENCE";
    blocker = triage.notes[0] || "Insufficient evidence excerpt.";
  } else if (identityState === "CONTRADICTED") {
    state = "INSUFFICIENT_EVIDENCE";
    blocker = "Source identity is contradicted.";
  } else if (identity?.role === "CLONE") {
    state = "SOURCE_IDENTITY_UNRESOLVED";
    blocker = "Lookalike hosts stay unresolved. Domain resemblance is not ownership.";
  } else {
    const sellerGate = sellerReviewAllowed({
      field: input.candidate.field,
      host: input.candidate.sourceHost,
      relations: input.relations ?? [],
      identityRole: identity?.role,
    });
    const manufacturerBypass = identity?.role === "MANUFACTURER";
    if (!sellerGate.allowed && !manufacturerBypass) {
      state = "SOURCE_IDENTITY_UNRESOLVED";
      blocker = sellerGate.reason;
    } else if (!contractField) {
      state = "INSUFFICIENT_EVIDENCE";
      blocker = "This operational note has no Product Contract field. Do not invent a field.";
    } else if (acceptedField && acceptedField.status === "ACCEPTED") {
      state = "ALREADY_ACCEPTED";
      blocker = `Field ${input.candidate.field} is already accepted. Overwrite requires an explicit confirm.`;
    } else {
      state = "READY_FOR_REVIEW";
      blocker = sellerGate.allowed ? sellerGate.reason : "";
    }
  }

  const availableActions: ReviewAction[] = ["REVIEW_EVIDENCE"];
  if (state === "SOURCE_IDENTITY_UNRESOLVED") availableActions.push("CONFIRM_SOURCE_IDENTITY", "REJECT_CANDIDATE");
  if (state === "INSUFFICIENT_EVIDENCE") availableActions.push("REQUEST_NEW_EVIDENCE", "REJECT_CANDIDATE");
  if (state === "HIGH_RISK_CLAIM") availableActions.push("REJECT_CANDIDATE", "REQUEST_NEW_EVIDENCE");
  if (state === "DUPLICATE" || state === "ALREADY_ACCEPTED") availableActions.push("MARK_DUPLICATE");
  if (state === "READY_FOR_REVIEW") availableActions.push("ACCEPT_ELIGIBLE_FACT", "REJECT_CANDIDATE");

  return {
    candidateId: input.candidate.candidateId,
    campaignId: input.candidate.campaignId,
    version: input.candidate.version,
    field: input.candidate.field,
    extractedValue: input.candidate.extractedValue,
    originalExcerpt: input.candidate.originalExcerpt,
    sourceUrl: input.candidate.sourceUrl,
    sourceHost: input.candidate.sourceHost,
    sourceClass: input.candidate.sourceClass,
    sourceIdentity: identityState,
    sourceRole: identity?.role ?? "UNKNOWN",
    evidenceReference: input.candidate.evidenceReference,
    riskClass: triage.triageClass,
    state,
    eligible: state === "READY_FOR_REVIEW",
    availableActions,
    blocker,
    identityConfirmed,
    contractField,
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
