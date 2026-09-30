import { getDb } from "@/lib/db";
import { OVERRIDE_FIELDS, resetManualOverride, saveManualOverride, type OverrideField } from "@/lib/manual-overrides";
import type { ProductFacts, SourceFact } from "@/lib/product-facts";

/**
 * Append-only evidence and audit metadata for editor fields.
 * ProductFacts values and resolveProductFacts stay unchanged.
 */

export const EVIDENCE_ORIGINS = [
  "IMPORTER",
  "MANUAL",
  "OFFICIAL_SITE",
  "RESEARCH",
  "OCR",
  "JSON_LD",
  "IMAGE",
  "PDF",
  "API",
  "UNKNOWN",
] as const;

export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export const AUDIT_OPERATIONS = ["CREATE", "UPDATE", "DELETE", "RESET", "IMPORT_REFRESH"] as const;

export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];

export type EvidenceStatus = "CURRENT" | "HISTORICAL" | "RECORDED";

const AUTO_ORIGINS = new Set<EvidenceOrigin>(["IMPORTER", "OFFICIAL_SITE", "OCR", "JSON_LD", "IMAGE", "PDF", "API"]);
const LOW_CONFIDENCE = new Set(["HEURISTIC_EXTRACTION", "AI_SOURCE_CLASSIFICATION", "UNKNOWN", "NOT_FOUND"]);

export type EvidenceSource = {
  sourceUrl: string | null;
  section: string | null;
  domPath: string | null;
  snippet: string | null;
  screenshotRef: string | null;
  importSession: string | null;
};

export type FactRevision = EvidenceSource & {
  campaignId: number;
  field: OverrideField;
  revision: number;
  origin: EvidenceOrigin;
  confidence: string;
  status: EvidenceStatus;
  valueJson: string;
  capturedAt: string;
  capturedBy: string;
  lastModified: string;
  reason: string | null;
  operation: AuditOperation;
  operatorName: string;
};

export type AuditEntry = {
  campaignId: number;
  field: string;
  at: string;
  userName: string;
  operation: AuditOperation;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  revision: number | null;
};

export type FieldEvidence = {
  field: OverrideField;
  origin: EvidenceOrigin;
  confidence: string;
  capturedAt: string;
  capturedBy: string;
  lastModified: string;
  revision: number;
  status: EvidenceStatus;
  source: EvidenceSource;
  revisions: FactRevision[];
};

type StoredOverride = { field: OverrideField; value: unknown; updatedAt: string };

const CONFIDENCE_FIELD: Partial<Record<OverrideField, keyof ProductFacts["confidence"]>> = {
  productName: "productName",
  manufacturer: "manufacturer",
  description: "description",
  ingredients: "ingredientsOrComponents",
  features: "features",
  usage: "usageInformation",
  warnings: "cautions",
  pricing: "pricingInformation",
  guarantee: "guaranteeInformation",
};

const SNIPPET_FIELD: Partial<Record<OverrideField, string>> = {
  productName: "productName",
  manufacturer: "manufacturer",
  description: "description",
  ingredients: "ingredientsOrComponents",
  features: "features",
  usage: "usageInformation",
  warnings: "cautions",
  pricing: "pricingInformation",
  guarantee: "guaranteeInformation",
  faq: "faq",
};

export function ensureEvidenceBaseline(input: {
  campaignId: number;
  sourceFactsJson: string | null;
  affiliateUrl: string;
  ctaLabel: string;
  createdAt: string;
  overrides: StoredOverride[];
}): void {
  const facts = parseFacts(input.sourceFactsJson);
  const capturedAt = input.createdAt || new Date().toISOString();
  for (const field of OVERRIDE_FIELDS) {
    if (latestRevision(input.campaignId, field)) continue;
    const imported = projectField(facts, field, input.affiliateUrl, input.ctaLabel);
    const source = sourceFor(facts, field, capturedAt);
    appendRevision({
      campaignId: input.campaignId,
      field,
      origin: originFor(confidenceFor(facts, field, imported), false),
      confidence: confidenceFor(facts, field, imported),
      value: imported,
      source,
      capturedAt: source.importSession ? capturedAt : capturedAt,
      capturedBy: "importer",
      operation: "CREATE",
      operatorName: "importer",
      reason: null,
      makeCurrent: true,
    });
    const override = input.overrides.find((row) => row.field === field);
    if (!override) continue;
    if (stable(override.value) === stable(imported)) continue;
    appendRevision({
      campaignId: input.campaignId,
      field,
      origin: "MANUAL",
      confidence: "MANUAL",
      value: override.value,
      source,
      capturedAt: override.updatedAt,
      capturedBy: "operator",
      operation: "UPDATE",
      operatorName: "operator",
      reason: "Existing manual override",
      makeCurrent: true,
    });
  }
}

export function recordSourcedEvidence(input: {
  campaignId: number;
  field: OverrideField;
  origin: EvidenceOrigin;
  confidence: string;
  value: unknown;
  reason: string | null;
  source?: Partial<EvidenceSource>;
  operatorName?: string;
}): void {
  const current = latestCurrent(input.campaignId, input.field);
  appendRevision({
    campaignId: input.campaignId,
    field: input.field,
    origin: input.origin,
    confidence: input.confidence,
    value: input.value,
    source: { ...emptySource(), ...current ? sourceOf(current) : {}, ...input.source },
    capturedAt: current?.capturedAt ?? new Date().toISOString(),
    capturedBy: input.operatorName ?? "operator",
    operation: current ? "UPDATE" : "CREATE",
    operatorName: input.operatorName ?? "operator",
    reason: input.reason,
    makeCurrent: true,
  });
}

export function recordManualEdit(input: {
  campaignId: number;
  field: OverrideField;
  value: unknown;
  reason: string | null;
  operatorName?: string;
}): void {
  const current = latestCurrent(input.campaignId, input.field);
  const oldValue = current?.valueJson ?? null;
  const next = stable(input.value);
  if (oldValue === next && current?.origin === "MANUAL") return;
  const empty = isEmptyValue(input.value);
  const operation: AuditOperation = empty && oldValue && !isEmptyJson(oldValue) ? "DELETE" : current ? "UPDATE" : "CREATE";
  appendRevision({
    campaignId: input.campaignId,
    field: input.field,
    origin: "MANUAL",
    confidence: "MANUAL",
    value: input.value,
    source: current ? sourceOf(current) : emptySource(),
    capturedAt: current?.capturedAt ?? new Date().toISOString(),
    capturedBy: current?.capturedBy ?? "operator",
    operation,
    operatorName: input.operatorName ?? "operator",
    reason: input.reason,
    makeCurrent: true,
  });
}

export function recordResetToImporter(input: {
  campaignId: number;
  field: OverrideField;
  sourceFactsJson: string | null;
  affiliateUrl: string;
  ctaLabel: string;
  reason: string | null;
  operatorName?: string;
}): void {
  const facts = parseFacts(input.sourceFactsJson);
  const imported = projectField(facts, input.field, input.affiliateUrl, input.ctaLabel);
  const current = latestCurrent(input.campaignId, input.field);
  appendRevision({
    campaignId: input.campaignId,
    field: input.field,
    origin: "IMPORTER",
    confidence: confidenceFor(facts, input.field, imported),
    value: imported,
    source: sourceFor(facts, input.field, current?.capturedAt ?? new Date().toISOString()),
    capturedAt: current?.capturedAt ?? new Date().toISOString(),
    capturedBy: "importer",
    operation: "RESET",
    operatorName: input.operatorName ?? "operator",
    reason: input.reason,
    makeCurrent: true,
  });
}

export function recordImportRefresh(campaignId: number, previousJson: string | null, nextJson: string | null): void {
  const previous = parseFacts(previousJson);
  const next = parseFacts(nextJson);
  const row = getDb()
    .prepare("SELECT affiliateUrl, ctaLabel, createdAt FROM campaigns WHERE id = ?")
    .get(campaignId) as { affiliateUrl: string; ctaLabel: string; createdAt: string } | undefined;
  const affiliateUrl = row?.affiliateUrl ?? "";
  const ctaLabel = row?.ctaLabel ?? "";
  const capturedAt = new Date().toISOString();
  for (const field of OVERRIDE_FIELDS) {
    if (field === "cta" || field === "trackingUrl") continue;
    const before = projectField(previous, field, affiliateUrl, ctaLabel);
    const after = projectField(next, field, affiliateUrl, ctaLabel);
    if (stable(before) === stable(after)) continue;
    const existing = latestRevision(campaignId, field);
    const current = latestCurrent(campaignId, field);
    const manualHolds = current?.origin === "MANUAL";
    if (!existing) {
      appendRevision({
        campaignId,
        field,
        origin: originFor(confidenceFor(next, field, after), false),
        confidence: confidenceFor(next, field, after),
        value: after,
        source: sourceFor(next, field, row?.createdAt ?? capturedAt),
        capturedAt,
        capturedBy: "importer",
        operation: "CREATE",
        operatorName: "importer",
        reason: null,
        makeCurrent: true,
      });
      continue;
    }
    appendRevision({
      campaignId,
      field,
      origin: "IMPORTER",
      confidence: confidenceFor(next, field, after),
      value: after,
      source: sourceFor(next, field, capturedAt),
      capturedAt,
      capturedBy: "importer",
      operation: "IMPORT_REFRESH",
      operatorName: "importer",
      reason: null,
      makeCurrent: !manualHolds,
    });
  }
}

export function restoreRevision(input: {
  campaignId: number;
  field: OverrideField;
  revision: number;
  sourceFactsJson: string | null;
  affiliateUrl: string;
  ctaLabel: string;
  reason: string | null;
  operatorName?: string;
}): void {
  const target = getRevision(input.campaignId, input.field, input.revision);
  if (!target) throw new Error("Revision not found.");
  const facts = parseFacts(input.sourceFactsJson);
  const imported = projectField(facts, input.field, input.affiliateUrl, input.ctaLabel);
  const restored = JSON.parse(target.valueJson) as unknown;
  const operatorName = input.operatorName ?? "operator";
  const reason = input.reason || `Restored revision ${target.revision}`;
  if (stable(restored) === stable(imported)) {
    resetManualOverride(input.campaignId, input.field);
    appendRevision({
      campaignId: input.campaignId,
      field: input.field,
      origin: "IMPORTER",
      confidence: confidenceFor(facts, input.field, imported),
      value: imported,
      source: sourceOf(target),
      capturedAt: target.capturedAt,
      capturedBy: target.capturedBy,
      operation: "RESET",
      operatorName,
      reason,
      makeCurrent: true,
    });
    return;
  }
  saveManualOverride(input.campaignId, input.field, restored);
  appendRevision({
    campaignId: input.campaignId,
    field: input.field,
    origin: "MANUAL",
    confidence: "MANUAL",
    value: restored,
    source: sourceOf(target),
    capturedAt: target.capturedAt,
    capturedBy: target.capturedBy,
    operation: "UPDATE",
    operatorName,
    reason,
    makeCurrent: true,
  });
}

export function listFieldEvidence(campaignId: number): FieldEvidence[] {
  return OVERRIDE_FIELDS.map((field) => {
    const revisions = listRevisions(campaignId, field);
    const current = revisions.find((revision) => revision.status === "CURRENT") ?? revisions.at(-1) ?? null;
    if (!current) {
      return {
        field,
        origin: "UNKNOWN" as const,
        confidence: "UNKNOWN",
        capturedAt: "",
        capturedBy: "",
        lastModified: "",
        revision: 0,
        status: "CURRENT" as const,
        source: emptySource(),
        revisions,
      };
    }
    return {
      field,
      origin: current.origin,
      confidence: current.confidence,
      capturedAt: current.capturedAt,
      capturedBy: current.capturedBy,
      lastModified: current.lastModified,
      revision: current.revision,
      status: current.status,
      source: sourceOf(current),
      revisions,
    };
  });
}

export function evidenceOriginPercents(campaignId: number): { auto: number; manual: number; unknown: number; research: number } {
  const current = listFieldEvidence(campaignId).filter((field) => field.revision > 0);
  const total = current.length;
  if (total === 0) return { auto: 0, manual: 0, unknown: 0, research: 0 };
  const counts = { auto: 0, manual: 0, unknown: 0, research: 0 };
  for (const field of current) {
    if (field.origin === "MANUAL") counts.manual += 1;
    else if (field.origin === "UNKNOWN") counts.unknown += 1;
    else if (field.origin === "RESEARCH") counts.research += 1;
    else if (AUTO_ORIGINS.has(field.origin)) counts.auto += 1;
    else counts.unknown += 1;
  }
  const keys = ["auto", "manual", "unknown", "research"] as const;
  const floors = keys.map((key) => Math.floor((counts[key] / total) * 100));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);
  const fractions = keys
    .map((key, index) => ({ index, fraction: (counts[key] / total) * 100 - floors[index]! }))
    .sort((left, right) => right.fraction - left.fraction);
  for (const item of fractions) {
    if (remainder <= 0) break;
    floors[item.index] = (floors[item.index] ?? 0) + 1;
    remainder -= 1;
  }
  return { auto: floors[0] ?? 0, manual: floors[1] ?? 0, unknown: floors[2] ?? 0, research: floors[3] ?? 0 };
}

export type EvidenceFilter = "all" | "importer" | "manual" | "research" | "low" | "recent";

export function matchesEvidenceFilter(evidence: FieldEvidence, filter: EvidenceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "importer") return evidence.origin === "IMPORTER";
  if (filter === "manual") return evidence.origin === "MANUAL";
  if (filter === "research") return evidence.origin === "RESEARCH";
  if (filter === "low") return LOW_CONFIDENCE.has(evidence.confidence);
  return evidence.revision > 1;
}

export function exportAudit(campaignId: number): {
  campaignId: number;
  exportedAt: string;
  revisions: FactRevision[];
  auditLog: AuditEntry[];
} {
  const revisions = getDb()
    .prepare(
      `SELECT * FROM fact_revisions WHERE campaignId = ? ORDER BY field, revision`,
    )
    .all(campaignId)
    .map(mapRevision);
  const auditLog = getDb()
    .prepare(`SELECT * FROM fact_audit_log WHERE campaignId = ? ORDER BY id`)
    .all(campaignId)
    .map(mapAudit);
  return { campaignId, exportedAt: new Date().toISOString(), revisions, auditLog };
}

export function isEvidenceOrigin(value: string): value is EvidenceOrigin {
  return (EVIDENCE_ORIGINS as readonly string[]).includes(value);
}

function appendRevision(input: {
  campaignId: number;
  field: OverrideField;
  origin: EvidenceOrigin;
  confidence: string;
  value: unknown;
  source: EvidenceSource;
  capturedAt: string;
  capturedBy: string;
  operation: AuditOperation;
  operatorName: string;
  reason: string | null;
  makeCurrent: boolean;
}): FactRevision {
  const now = new Date().toISOString();
  const valueJson = stable(input.value);
  const previous = latestCurrent(input.campaignId, input.field);
  if (input.makeCurrent) {
    getDb()
      .prepare(`UPDATE fact_revisions SET status = 'HISTORICAL' WHERE campaignId = ? AND field = ? AND status = 'CURRENT'`)
      .run(input.campaignId, input.field);
  }
  const revision = nextRevision(input.campaignId, input.field);
  const status: EvidenceStatus = input.makeCurrent ? "CURRENT" : "RECORDED";
  getDb()
    .prepare(
      `INSERT INTO fact_revisions (
        campaignId, field, revision, origin, confidence, status, valueJson,
        sourceUrl, sourceSection, sourceDomPath, evidenceSnippet, screenshotRef, importSession,
        capturedAt, capturedBy, lastModified, reason, operation, operatorName
      ) VALUES (
        @campaignId, @field, @revision, @origin, @confidence, @status, @valueJson,
        @sourceUrl, @sourceSection, @sourceDomPath, @evidenceSnippet, @screenshotRef, @importSession,
        @capturedAt, @capturedBy, @lastModified, @reason, @operation, @operatorName
      )`,
    )
    .run({
      campaignId: input.campaignId,
      field: input.field,
      revision,
      origin: input.origin,
      confidence: input.confidence,
      status,
      valueJson,
      sourceUrl: input.source.sourceUrl,
      sourceSection: input.source.section,
      sourceDomPath: input.source.domPath,
      evidenceSnippet: input.source.snippet,
      screenshotRef: input.source.screenshotRef,
      importSession: input.source.importSession,
      capturedAt: input.capturedAt,
      capturedBy: input.capturedBy,
      lastModified: now,
      reason: input.reason,
      operation: input.operation,
      operatorName: input.operatorName,
    });
  getDb()
    .prepare(
      `INSERT INTO fact_audit_log (campaignId, field, at, userName, operation, oldValue, newValue, reason, revision)
       VALUES (@campaignId, @field, @at, @userName, @operation, @oldValue, @newValue, @reason, @revision)`,
    )
    .run({
      campaignId: input.campaignId,
      field: input.field,
      at: now,
      userName: input.operatorName,
      operation: input.operation,
      oldValue: previous?.valueJson ?? null,
      newValue: valueJson,
      reason: input.reason,
      revision,
    });
  const stored = getRevision(input.campaignId, input.field, revision);
  if (!stored) throw new Error("Evidence revision was not stored.");
  return stored;
}

function nextRevision(campaignId: number, field: string): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(MAX(revision), 0) AS revision FROM fact_revisions WHERE campaignId = ? AND field = ?`)
    .get(campaignId, field) as { revision: number };
  return row.revision + 1;
}

function latestRevision(campaignId: number, field: string): FactRevision | null {
  const row = getDb()
    .prepare(`SELECT * FROM fact_revisions WHERE campaignId = ? AND field = ? ORDER BY revision DESC LIMIT 1`)
    .get(campaignId, field);
  return row ? mapRevision(row) : null;
}

function latestCurrent(campaignId: number, field: string): FactRevision | null {
  const row = getDb()
    .prepare(`SELECT * FROM fact_revisions WHERE campaignId = ? AND field = ? AND status = 'CURRENT' ORDER BY revision DESC LIMIT 1`)
    .get(campaignId, field);
  return row ? mapRevision(row) : null;
}

function getRevision(campaignId: number, field: string, revision: number): FactRevision | null {
  const row = getDb()
    .prepare(`SELECT * FROM fact_revisions WHERE campaignId = ? AND field = ? AND revision = ?`)
    .get(campaignId, field, revision);
  return row ? mapRevision(row) : null;
}

function listRevisions(campaignId: number, field: string): FactRevision[] {
  return getDb()
    .prepare(`SELECT * FROM fact_revisions WHERE campaignId = ? AND field = ? ORDER BY revision`)
    .all(campaignId, field)
    .map(mapRevision);
}

function mapRevision(row: unknown): FactRevision {
  const record = row as Record<string, unknown>;
  return {
    campaignId: Number(record.campaignId),
    field: String(record.field) as OverrideField,
    revision: Number(record.revision),
    origin: String(record.origin) as EvidenceOrigin,
    confidence: String(record.confidence),
    status: String(record.status) as EvidenceStatus,
    valueJson: String(record.valueJson),
    sourceUrl: textOrNull(record.sourceUrl),
    section: textOrNull(record.sourceSection),
    domPath: textOrNull(record.sourceDomPath),
    snippet: textOrNull(record.evidenceSnippet),
    screenshotRef: textOrNull(record.screenshotRef),
    importSession: textOrNull(record.importSession),
    capturedAt: String(record.capturedAt),
    capturedBy: String(record.capturedBy),
    lastModified: String(record.lastModified),
    reason: textOrNull(record.reason),
    operation: String(record.operation) as AuditOperation,
    operatorName: String(record.operatorName),
  };
}

function mapAudit(row: unknown): AuditEntry {
  const record = row as Record<string, unknown>;
  return {
    campaignId: Number(record.campaignId),
    field: String(record.field),
    at: String(record.at),
    userName: String(record.userName),
    operation: String(record.operation) as AuditOperation,
    oldValue: textOrNull(record.oldValue),
    newValue: textOrNull(record.newValue),
    reason: textOrNull(record.reason),
    revision: record.revision == null ? null : Number(record.revision),
  };
}

function sourceOf(revision: FactRevision): EvidenceSource {
  return {
    sourceUrl: revision.sourceUrl,
    section: revision.section,
    domPath: revision.domPath,
    snippet: revision.snippet,
    screenshotRef: revision.screenshotRef,
    importSession: revision.importSession,
  };
}

function emptySource(): EvidenceSource {
  return { sourceUrl: null, section: null, domPath: null, snippet: null, screenshotRef: null, importSession: null };
}

function parseFacts(json: string | null): ProductFacts | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ProductFacts;
  } catch {
    return null;
  }
}

function projectField(facts: ProductFacts | null, field: OverrideField, affiliateUrl: string, ctaLabel: string): unknown {
  if (field === "cta") return ctaLabel ?? "";
  if (field === "trackingUrl") return affiliateUrl ?? "";
  if (!facts) return field === "ingredients" || field === "features" || field === "warnings" || field === "faq" || field === "usage" ? [] : "";
  switch (field) {
    case "productName":
      return facts.productName ?? "";
    case "manufacturer":
      return facts.manufacturer ?? "";
    case "description":
      return facts.description ?? "";
    case "ingredients":
      return facts.ingredientsOrComponents ?? [];
    case "features":
      return facts.features ?? [];
    case "warnings":
      return facts.cautions ?? [];
    case "usage":
      return facts.usageInformation ?? [];
    case "guarantee":
      return facts.guaranteeInformation ?? "";
    case "pricing":
      return { pricingInformation: facts.pricingInformation ?? "", offerFacts: facts.offerFacts ?? [] };
    case "faq":
      return (facts.sourceSnippets ?? [])
        .filter((snippet) => snippet.field === "faq")
        .map((snippet) => ({ question: snippet.question ?? "", answer: snippet.text ?? "" }));
    default:
      return "";
  }
}

function confidenceFor(facts: ProductFacts | null, field: OverrideField, value: unknown): string {
  if (field === "cta" || field === "trackingUrl") return String(value ?? "").trim() ? "DIRECT_SOURCE" : "NOT_FOUND";
  if (!facts) return "UNKNOWN";
  if (field === "faq") {
    const found = (facts.sourceSnippets ?? []).filter((snippet) => snippet.field === "faq");
    if (found.length === 0) return "NOT_FOUND";
    const kinds = [...new Set(found.map((snippet) => snippet.confidence))];
    return kinds.length === 1 ? kinds[0] : kinds.sort().join("+");
  }
  const key = CONFIDENCE_FIELD[field];
  if (!key) return "UNKNOWN";
  return facts.confidence?.[key] ?? "UNKNOWN";
}

function originFor(confidence: string, manual: boolean): EvidenceOrigin {
  if (manual || confidence === "MANUAL") return "MANUAL";
  if (!confidence || confidence === "UNKNOWN") return "UNKNOWN";
  return "IMPORTER";
}

function sourceFor(facts: ProductFacts | null, field: OverrideField, capturedAt: string): EvidenceSource {
  const snippetField = SNIPPET_FIELD[field];
  const snippet = (facts?.sourceSnippets ?? []).find((item) => item.field === snippetField) ?? null;
  const session = (facts?.sourceSnippets ?? []).map((item) => item.retrievedAt?.trim() ?? "").filter(Boolean).sort().at(-1) ?? null;
  return {
    sourceUrl: snippet?.sourceUrl || facts?.sourceUrl || null,
    section: snippet?.sourceUnit ?? null,
    domPath: domPathOf(snippet),
    snippet: snippet?.text ?? null,
    screenshotRef: null,
    importSession: session || (facts?.sourceUrl ? capturedAt : null),
  };
}

function domPathOf(snippet: SourceFact | null): string | null {
  const location = snippet?.sourceLocation?.trim() ?? "";
  if (!location) return null;
  if (location.includes(">") || location.includes("#") || location.startsWith(".") || location.startsWith("/")) return location;
  return null;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isEmptyJson(value: string): boolean {
  try {
    return isEmptyValue(JSON.parse(value) as unknown);
  } catch {
    return value.trim().length === 0;
  }
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}
