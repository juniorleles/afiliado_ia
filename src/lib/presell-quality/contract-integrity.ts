import { PRODUCT_CONTRACT_VERSION } from "@/lib/product-contract/types";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { readCandidateLedger } from "@/lib/presell-quality/candidate-ledger";
import { PRIMARY_SOURCE_AUTO_APPROVAL, PRIMARY_SOURCE_POLICY, PRIMARY_SOURCE_POLICY_VERSION } from "@/lib/presell-quality/primary-source-policy";
import { evaluateRegenerationGate } from "@/lib/presell-quality/regeneration-gate";
import { readEvidenceAudit } from "@/lib/presell-quality/review-decide";

const CORE_FIELDS = ["description", "ingredients", "howItWorks", "guarantee"] as const;
const MEDICAL_BLOCK =
  /medical or health claim|health, efficacy|expected-result language|not restated as a product fact/i;

export type ContractIntegrityReport = {
  campaignId: number;
  valid: boolean;
  contractVersion: typeof PRODUCT_CONTRACT_VERSION;
  runId: string | null;
  coreFacts: number;
  primaryAutoApprovedFacts: number;
  blockedMedicalClaims: number;
  coreFields: Array<{ field: string; present: boolean; value: string; sourceUrl: string | null }>;
  autoApproved: Array<{
    candidateId: string;
    actor: string;
    approvalOrigin: string | null;
    policyName: string | null;
    policyVersion: string | null;
    evidenceId: string | null;
    sourceUrl: string | null;
  }>;
  humanRejectsPreserved: string[];
  fakeHumanAccept: string[];
  referencesIntact: boolean;
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
  reasons: string[];
};

export function validatePersistedProductContract(campaignId: number, run?: ProductResearchRun | null): ContractIntegrityReport {
  const current = run === undefined ? readLatestProductResearch(campaignId) : run;
  const accepted = acceptedProposals(current);
  const coreFields = CORE_FIELDS.map((field) => {
    const item = accepted.find((row) => row.field === field);
    const value = (item?.currentValue || item?.suggestedValue || "").trim();
    return { field, present: Boolean(item && value), value, sourceUrl: item?.sourceUrl ?? null };
  });
  const faq = accepted.find((item) => item.field === "faq");
  const audit = readEvidenceAudit(campaignId);
  const ledger = readCandidateLedger(campaignId);
  const autoApproved = audit
    .filter((entry) => entry.decision === "ACCEPT" && entry.actor === PRIMARY_SOURCE_POLICY)
    .map((entry) => ({
      candidateId: entry.candidateId,
      actor: entry.actor,
      approvalOrigin: entry.approvalOrigin ?? null,
      policyName: entry.policyName ?? null,
      policyVersion: entry.policyVersion ?? null,
      evidenceId: entry.evidenceId ?? entry.candidateId,
      sourceUrl: entry.sourceUrl ?? null,
    }));
  const fakeHumanAccept = audit
    .filter(
      (entry) =>
        entry.decision === "ACCEPT" &&
        entry.actor === "HUMAN" &&
        autoApproved.some((item) => item.candidateId === entry.candidateId),
    )
    .map((entry) => entry.candidateId);
  const humanRejectsPreserved = audit.filter((entry) => entry.decision === "REJECT" && entry.actor === "HUMAN").map((entry) => entry.candidateId);
  const blockedMedicalClaims = (ledger?.candidates ?? []).filter((item) => MEDICAL_BLOCK.test(item.blockReason ?? "")).length;
  const evidenceIds = faq?.evidenceIds ?? [];
  const referencesIntact = evidenceIds.every(
    (id) =>
      autoApproved.some((item) => item.candidateId === id) &&
      Boolean(ledger?.candidates.some((item) => item.candidateId === id)),
  );
  const gate = evaluateRegenerationGate({ campaignId, run: current });
  const reasons: string[] = [];
  if (!current) reasons.push("No persisted research run.");
  if (coreFields.filter((item) => item.present).length !== 4) reasons.push("Core accepted facts are incomplete.");
  if (autoApproved.length < 1) reasons.push("No PRIMARY_SOURCE_POLICY auto-approvals were persisted.");
  if (fakeHumanAccept.length) reasons.push("Auto-approved facts were written as fake human accepts.");
  if (faq && evidenceIds.length && !referencesIntact) reasons.push("Auto-approved evidence references are not intact.");
  if ((current?.commercialAuthorization ?? "BLOCKED") !== "BLOCKED") reasons.push("Commercial authorization is not blocked.");
  if ((current?.publicationReadiness ?? "BLOCKED") !== "BLOCKED") reasons.push("Publication readiness is not blocked.");
  if (!gate.coreFactsPreserved) reasons.push("Regeneration gate lost core facts.");
  const valid = reasons.length === 0 && Boolean(current);
  return {
    campaignId,
    valid,
    contractVersion: PRODUCT_CONTRACT_VERSION,
    runId: current?.runId ?? null,
    coreFacts: coreFields.filter((item) => item.present).length,
    primaryAutoApprovedFacts: autoApproved.length,
    blockedMedicalClaims,
    coreFields,
    autoApproved,
    humanRejectsPreserved,
    fakeHumanAccept,
    referencesIntact: faq ? referencesIntact : true,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    reasons: valid
      ? [
          `Product contract version ${PRODUCT_CONTRACT_VERSION} is intact.`,
          `${autoApproved.length} operational facts remain approved by ${PRIMARY_SOURCE_AUTO_APPROVAL} v${PRIMARY_SOURCE_POLICY_VERSION}.`,
        ]
      : reasons,
  };
}
