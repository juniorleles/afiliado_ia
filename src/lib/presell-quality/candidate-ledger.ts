import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import type { FactCandidate } from "@/lib/presell-quality/recovery";
import { readOperationalCandidates } from "@/lib/presell-quality/operational-extract";

export const CANDIDATE_LEDGER_VERSION = 1 as const;

export type StoredFactCandidate = FactCandidate & { candidateId?: string };

function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

function keyOf(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function expansionFileOf(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "expansion-54ae.json");
}

export function loadStoredFactCandidates(campaignId: number): StoredFactCandidate[] {
  const file = expansionFileOf(campaignId);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { factCandidates?: StoredFactCandidate[] };
    return (raw.factCandidates ?? []).map((item) => ({
      field: item.field,
      text: item.text,
      sourceUrl: item.sourceUrl,
      sourceClass: item.sourceClass,
      excerpt: item.excerpt,
      collectedAt: item.collectedAt,
      verification: item.verification,
      usable: Boolean(item.usable),
      approvedForUse: false,
      blockReason: item.blockReason,
      duplicateOf: item.duplicateOf ?? null,
      candidateId: item.candidateId,
    }));
  } catch {
    return [];
  }
}

export type LedgerCandidate = {
  candidateId: string;
  campaignId: number;
  version: number;
  field: string;
  extractedValue: string;
  originalExcerpt: string;
  sourceUrl: string;
  sourceHost: string;
  sourceClass: string;
  evidenceReference: string;
  collectedAt: string | null;
  verification: string | null;
  usable: boolean;
  approvedForUse: false;
  blockReason: string | null;
  duplicateOf: string | null;
  originalIndex: number;
};

export type CandidateLedger = {
  version: typeof CANDIDATE_LEDGER_VERSION;
  campaignId: number;
  sourceFile: string;
  candidates: LedgerCandidate[];
  preservedCount: number;
  regenerationRequired: false | true;
};

export function reconcileStoredCandidates(input: {
  campaignId: number;
  candidates?: FactCandidate[];
  idPrefix?: string;
}): CandidateLedger {
  const sourceFile = expansionFileOf(input.campaignId);
  const loaded: StoredFactCandidate[] = input.candidates ?? loadStoredFactCandidates(input.campaignId);
  const seen = new Map<string, string>();
  const candidates = loaded.map((item, index) => {
    const candidateId = item.candidateId && /^54A[EO]-\d+/.test(item.candidateId)
      ? item.candidateId
      : `${input.idPrefix ?? "54AE"}-${String(index + 1).padStart(2, "0")}`;
    const key = `${item.field}|${keyOf(item.text)}`;
    const duplicateOf = seen.get(key) ?? item.duplicateOf;
    if (!seen.has(key)) seen.set(key, candidateId);
    return {
      candidateId,
      campaignId: input.campaignId,
      version: 1,
      field: item.field,
      extractedValue: item.text,
      originalExcerpt: item.excerpt || item.text,
      sourceUrl: item.sourceUrl ? sanitizeSharedUrl(item.sourceUrl) : "",
      sourceHost: hostOf(item.sourceUrl),
      sourceClass: item.sourceClass || "UNKNOWN",
      evidenceReference: candidateId,
      collectedAt: item.collectedAt,
      verification: item.verification,
      usable: item.usable,
      approvedForUse: false as const,
      blockReason: item.blockReason,
      duplicateOf: duplicateOf && duplicateOf !== candidateId ? duplicateOf : null,
      originalIndex: index,
    };
  });
  return {
    version: CANDIDATE_LEDGER_VERSION,
    campaignId: input.campaignId,
    sourceFile,
    candidates,
    preservedCount: loaded.length,
    regenerationRequired: false,
  };
}

function ledgerFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "candidate-ledger.json");
}

export function readCandidateLedger(campaignId: number): CandidateLedger | null {
  const file = ledgerFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CandidateLedger;
  } catch {
    return null;
  }
}

export function writeCandidateLedger(ledger: CandidateLedger): CandidateLedger {
  mkdirSync(path.dirname(ledgerFile(ledger.campaignId)), { recursive: true });
  writeFileSync(ledgerFile(ledger.campaignId), `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

function keyOfCandidate(field: string, text: string): string {
  return `${field}|${keyOf(text)}`;
}

export function loadOrReconcileLedger(campaignId: number, idPrefix?: string): CandidateLedger {
  const stored = [
    ...loadStoredFactCandidates(campaignId),
    ...readOperationalCandidates(campaignId).map((item) => ({
      field: item.field,
      text: item.text,
      sourceUrl: item.sourceUrl,
      sourceClass: item.sourceClass,
      excerpt: item.excerpt,
      collectedAt: item.collectedAt,
      verification: item.verification,
      usable: Boolean(item.usable),
      approvedForUse: false as const,
      blockReason: item.blockReason,
      duplicateOf: item.duplicateOf,
      candidateId: item.candidateId,
    })),
  ];
  const existing = readCandidateLedger(campaignId);
  if (!existing) return writeCandidateLedger(reconcileStoredCandidates({ campaignId, candidates: stored, idPrefix }));
  const seen = new Set(existing.candidates.map((item) => keyOfCandidate(item.field, item.extractedValue)));
  const extras = stored.filter((item) => !seen.has(keyOfCandidate(item.field, item.text)));
  const staleOperational = existing.candidates.filter((item) => item.candidateId.startsWith("54AO-") && !stored.some((row) => keyOfCandidate(row.field, row.text) === keyOfCandidate(item.field, item.extractedValue)));
  if (!extras.length && !staleOperational.length) return existing;
  const merged = reconcileStoredCandidates({
    campaignId,
    candidates: [
      ...existing.candidates
        .filter((item) => !item.candidateId.startsWith("54AO-") || stored.some((row) => row.candidateId === item.candidateId))
        .map((item) => ({
        field: item.field,
        text: item.extractedValue,
        sourceUrl: item.sourceUrl,
        sourceClass: item.sourceClass,
        excerpt: item.originalExcerpt,
        collectedAt: item.collectedAt,
        verification: item.verification,
        usable: item.usable,
        approvedForUse: false as const,
        blockReason: item.blockReason,
        duplicateOf: item.duplicateOf,
        candidateId: item.candidateId,
      })),
      ...extras,
    ],
    idPrefix,
  });
  return writeCandidateLedger({ ...merged, regenerationRequired: existing.regenerationRequired });
}
