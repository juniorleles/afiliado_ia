import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const REGENERATION_GATE_READY = "APPROVED_FACTS_READY_FOR_REGENERATION" as const;
export const REGENERATION_GATE_WAITING = "AWAITING_HUMAN_REVIEW" as const;
export type RegenerationGateStatus = typeof REGENERATION_GATE_READY | typeof REGENERATION_GATE_WAITING;

const CORE_FIELDS = ["description", "ingredients", "howItWorks", "guarantee"] as const;

export type ContractSnapshot = {
  at: string;
  reason: string;
  accepted: Array<{ field: string; value: string; sourceUrl: string | null; verification: string | null }>;
};

export type RegenerationGate = {
  ready: boolean;
  status: RegenerationGateStatus;
  newAcceptedFacts: number;
  coreFactsPreserved: boolean;
  sourcesPreserved: boolean;
  blockingContradiction: boolean;
  policyRespected: boolean;
  costAuthorized: false;
  reasons: string[];
  baselineAccepted: string[];
  currentAccepted: string[];
};

function snapshotFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "contract-snapshots.json");
}

export function readContractSnapshots(campaignId: number): ContractSnapshot[] {
  if (!existsSync(snapshotFile(campaignId))) return [];
  try {
    return JSON.parse(readFileSync(snapshotFile(campaignId), "utf8")) as ContractSnapshot[];
  } catch {
    return [];
  }
}

export function snapshotProductContract(input: {
  campaignId: number;
  run: ProductResearchRun | null;
  reason: string;
}): ContractSnapshot {
  const accepted = acceptedProposals(input.run).map((item) => ({
    field: item.field,
    value: item.currentValue || item.suggestedValue,
    sourceUrl: item.sourceUrl,
    verification: item.verification,
  }));
  const snapshot: ContractSnapshot = {
    at: new Date().toISOString(),
    reason: input.reason,
    accepted,
  };
  const list = [...readContractSnapshots(input.campaignId), snapshot];
  mkdirSync(path.dirname(snapshotFile(input.campaignId)), { recursive: true });
  writeFileSync(snapshotFile(input.campaignId), `${JSON.stringify(list, null, 2)}\n`);
  return snapshot;
}

export function evaluateRegenerationGate(input: {
  campaignId: number;
  run?: ProductResearchRun | null;
  baselineFields?: string[];
}): RegenerationGate {
  const run = input.run === undefined ? readLatestProductResearch(input.campaignId) : input.run;
  const accepted = acceptedProposals(run);
  const currentAccepted = accepted.map((item) => item.field);
  const baseline = input.baselineFields ?? [...CORE_FIELDS];
  const newAcceptedFacts = accepted.filter((item) => !baseline.includes(item.field)).length;
  const coreFactsPreserved = CORE_FIELDS.every((field) => accepted.some((item) => item.field === field && (item.currentValue || item.suggestedValue)));
  const sourcesPreserved = accepted.every((item) => Boolean(item.sourceUrl) && item.verification === "SELLER_STATED");
  const blockingContradiction = accepted.some((item) => item.restriction === "BLOCKED");
  const policyRespected = accepted.every((item) => item.field !== "benefits" && item.field !== "pricing" && item.field !== "manufacturer")
    && (run?.commercialAuthorization ?? "BLOCKED") === "BLOCKED"
    && (run?.publicationReadiness ?? "BLOCKED") === "BLOCKED";
  const reasons: string[] = [];
  if (newAcceptedFacts < 1) reasons.push("No new human-approved facts beyond the existing Product Contract.");
  if (!coreFactsPreserved) reasons.push("Core accepted facts are missing.");
  if (!sourcesPreserved) reasons.push("An accepted fact lost its source or seller attribution.");
  if (blockingContradiction) reasons.push("A blocking contradiction remains on an accepted fact.");
  if (!policyRespected) reasons.push("Content or publication policy is not satisfied.");
  reasons.push("Fact approval is not spend authorization.");
  const ready = newAcceptedFacts >= 1 && coreFactsPreserved && sourcesPreserved && !blockingContradiction && policyRespected;
  return {
    ready,
    status: ready ? REGENERATION_GATE_READY : REGENERATION_GATE_WAITING,
    newAcceptedFacts,
    coreFactsPreserved,
    sourcesPreserved,
    blockingContradiction,
    policyRespected,
    costAuthorized: false,
    reasons,
    baselineAccepted: baseline,
    currentAccepted,
  };
}
