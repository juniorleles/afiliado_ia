import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decideProductResearchFields } from "@/lib/product-research/review";
import { readLatestProductResearch, readProductResearchRun, writeProductResearchRun } from "@/lib/product-research/store";
import type { FieldProposal, ProductResearchField, ProductResearchRun } from "@/lib/product-research/types";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import type { LedgerCandidate } from "@/lib/presell-quality/candidate-ledger";
import { writeCandidateLedger, type CandidateLedger } from "@/lib/presell-quality/candidate-ledger";
import { prepareReviewCandidate, type PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";
import type { SourceIdentityRecord } from "@/lib/presell-quality/source-identity";
import type { CommercialRelation } from "@/lib/presell-quality/commercial-graph";

export type EvidenceDecision = "ACCEPT" | "REJECT" | "REQUEST_NEW_EVIDENCE" | "MARK_DUPLICATE";

export type EvidenceAuditEntry = {
  at: string;
  campaignId: number;
  candidateId: string;
  version: number;
  decision: EvidenceDecision;
  actor: "HUMAN";
  eligible: boolean;
  resultingState: string;
  notes: string[];
};

export type EvidenceDecisionResult = {
  ok: boolean;
  reason: string;
  prepared: PreparedReviewCandidate;
  run: ProductResearchRun | null;
  contractChanged: boolean;
  regenerationRequired: boolean;
  audit: EvidenceAuditEntry;
};

export function evidenceReviewAuthGate(input: { required: boolean; sessionValid: boolean }): { allowed: boolean; reason: string } {
  if (input.required && !input.sessionValid) return { allowed: false, reason: "UNAUTHORIZED" };
  return { allowed: true, reason: "Authorized." };
}

function auditFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "review-audit.json");
}

export function readEvidenceAudit(campaignId: number): EvidenceAuditEntry[] {
  if (!existsSync(auditFile(campaignId))) return [];
  try {
    return JSON.parse(readFileSync(auditFile(campaignId), "utf8")) as EvidenceAuditEntry[];
  } catch {
    return [];
  }
}

export function appendEvidenceAudit(entry: EvidenceAuditEntry): EvidenceAuditEntry {
  const list = [...readEvidenceAudit(entry.campaignId), entry];
  mkdirSync(path.dirname(auditFile(entry.campaignId)), { recursive: true });
  writeFileSync(auditFile(entry.campaignId), `${JSON.stringify(list, null, 2)}\n`);
  return entry;
}

function proposalFromCandidate(candidate: LedgerCandidate, field: ProductResearchField): FieldProposal {
  return {
    field,
    currentValue: "",
    suggestedValue: candidate.extractedValue,
    status: "SELLER_STATED",
    evidenceIds: [candidate.evidenceReference],
    sourceUrl: candidate.sourceUrl || null,
    sourceClass: candidate.sourceClass,
    verification: "SELLER_STATED",
    restriction: "PUBLISHABLE",
    collectedAt: candidate.collectedAt,
    eligibleForBatch: false,
    notes: [`Promoted from candidate ${candidate.candidateId}. Seller-stated until independently verified.`],
    evidenceIncomplete: false,
    evidenceExcerpt: candidate.originalExcerpt,
    originalText: candidate.originalExcerpt,
    proposalKind: "EXTRACTED",
  };
}

export function decideEvidenceCandidate(input: {
  campaignId: number;
  runId?: string;
  candidate: LedgerCandidate;
  ledger: CandidateLedger;
  run: ProductResearchRun | null;
  identity?: SourceIdentityRecord | null;
  relations?: CommercialRelation[];
  decision: EvidenceDecision;
  expectedVersion: number;
  rejectedIds?: Set<string>;
  officialHosts?: string[];
  confirmOverwrite?: boolean;
}): EvidenceDecisionResult {
  const prepared = prepareReviewCandidate({
    candidate: input.candidate,
    run: input.run,
    identity: input.identity,
    relations: input.relations,
    rejectedIds: input.rejectedIds,
    officialHosts: input.officialHosts,
  });
  const auditBase = {
    at: new Date().toISOString(),
    campaignId: input.campaignId,
    candidateId: input.candidate.candidateId,
    version: input.candidate.version,
    decision: input.decision,
    actor: "HUMAN" as const,
    eligible: prepared.eligible,
  };

  if (input.expectedVersion !== input.candidate.version) {
    const audit = appendEvidenceAudit({ ...auditBase, resultingState: prepared.state, notes: ["VERSION_CONFLICT"] });
    return { ok: false, reason: "VERSION_CONFLICT", prepared, run: input.run, contractChanged: false, regenerationRequired: false, audit };
  }
  if (input.decision === "ACCEPT") {
    if (!prepared.eligible || !prepared.availableActions.includes("ACCEPT_ELIGIBLE_FACT")) {
      const audit = appendEvidenceAudit({ ...auditBase, resultingState: prepared.state, notes: ["INELIGIBLE_ACCEPT"] });
      return { ok: false, reason: "INELIGIBLE_ACCEPT", prepared, run: input.run, contractChanged: false, regenerationRequired: false, audit };
    }
    if (prepared.state === "HIGH_RISK_CLAIM") {
      const audit = appendEvidenceAudit({ ...auditBase, resultingState: prepared.state, notes: ["MEDICAL_BLOCKED"] });
      return { ok: false, reason: "MEDICAL_BLOCKED", prepared, run: input.run, contractChanged: false, regenerationRequired: false, audit };
    }
    if (!prepared.contractField) {
      const audit = appendEvidenceAudit({ ...auditBase, resultingState: prepared.state, notes: ["NO_CONTRACT_FIELD"] });
      return { ok: false, reason: "NO_CONTRACT_FIELD", prepared, run: input.run, contractChanged: false, regenerationRequired: false, audit };
    }
    if (!input.run) {
      const audit = appendEvidenceAudit({ ...auditBase, resultingState: prepared.state, notes: ["RUN_MISSING"] });
      return { ok: false, reason: "RUN_MISSING", prepared, run: null, contractChanged: false, regenerationRequired: false, audit };
    }
    const existing = input.run.proposals.find((item) => item.field === prepared.contractField);
    if (existing?.status === "ACCEPTED" && !input.confirmOverwrite) {
      const audit = appendEvidenceAudit({ ...auditBase, resultingState: "ALREADY_ACCEPTED", notes: ["OVERWRITE_REQUIRED"] });
      return { ok: false, reason: "OVERWRITE_REQUIRED", prepared, run: input.run, contractChanged: false, regenerationRequired: false, audit };
    }
    const promoted = proposalFromCandidate(input.candidate, prepared.contractField);
    const proposals = input.run.proposals.map((item) => (item.field === prepared.contractField ? { ...promoted, currentValue: item.currentValue } : item));
    if (!proposals.some((item) => item.field === prepared.contractField)) proposals.push(promoted);
    const staged = writeProductResearchRun({ ...input.run, proposals });
    const next = decideProductResearchFields({
      campaignId: input.campaignId,
      runId: staged.runId,
      fields: [prepared.contractField],
      action: "ACCEPT",
      confirmOverwrite: input.confirmOverwrite,
    });
    writeCandidateLedger({ ...input.ledger, regenerationRequired: true });
    const audit = appendEvidenceAudit({ ...auditBase, resultingState: "ACCEPTED", notes: ["Accepted as seller-stated via existing field review."] });
    return { ok: true, reason: "ACCEPTED", prepared, run: next, contractChanged: true, regenerationRequired: true, audit };
  }

  const rejectedIds = new Set(input.rejectedIds);
  if (input.decision === "REJECT" || input.decision === "MARK_DUPLICATE" || input.decision === "REQUEST_NEW_EVIDENCE") {
    rejectedIds.add(input.candidate.candidateId);
    const audit = appendEvidenceAudit({
      ...auditBase,
      resultingState: input.decision === "REJECT" ? "REJECTED" : input.decision,
      notes: [input.decision],
    });
    return { ok: true, reason: input.decision, prepared: { ...prepared, state: input.decision === "REJECT" ? "REJECTED" : prepared.state, eligible: false }, run: input.run, contractChanged: false, regenerationRequired: false, audit };
  }

  const audit = appendEvidenceAudit({ ...auditBase, resultingState: prepared.state, notes: ["UNSUPPORTED_DECISION"] });
  return { ok: false, reason: "UNSUPPORTED_DECISION", prepared, run: input.run, contractChanged: false, regenerationRequired: false, audit };
}

export function latestRun(campaignId: number, runId?: string): ProductResearchRun | null {
  if (runId) return readProductResearchRun(campaignId, runId);
  return readLatestProductResearch(campaignId);
}
