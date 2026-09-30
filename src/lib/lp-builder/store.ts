/**
 * Isolated LP Builder override store.
 * Rows here are presentation text. They are not ProductFacts.
 */

import { getDb } from "@/lib/db";

export type BuilderOverrideRow = {
  campaignId: number;
  fieldId: string;
  sectionId: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

export type BuilderAuditRow = {
  id: number;
  campaignId: number;
  fieldId: string;
  sectionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  previousValue: string | null;
  newValue: string | null;
};

export function listBuilderOverrides(campaignId: number): BuilderOverrideRow[] {
  return getDb().prepare(
    `SELECT campaignId, fieldId, sectionId, value, createdAt, updatedAt, createdBy, updatedBy, version
     FROM lp_builder_overrides WHERE campaignId = ? ORDER BY fieldId`,
  ).all(campaignId) as BuilderOverrideRow[];
}

export function listBuilderAudit(campaignId: number): BuilderAuditRow[] {
  return getDb().prepare(
    `SELECT id, campaignId, fieldId, sectionId, createdAt, updatedAt, createdBy, updatedBy, version, previousValue, newValue
     FROM lp_builder_audit WHERE campaignId = ? ORDER BY id DESC`,
  ).all(campaignId) as BuilderAuditRow[];
}

export function saveBuilderOverride(input: {
  campaignId: number;
  fieldId: string;
  sectionId: string;
  value: string;
  previousValue: string | null;
  actor: string;
  at: string;
}): BuilderOverrideRow {
  const db = getDb();
  const existing = db.prepare(
    `SELECT createdAt, createdBy, version FROM lp_builder_overrides WHERE campaignId = ? AND fieldId = ?`,
  ).get(input.campaignId, input.fieldId) as { createdAt: string; createdBy: string; version: number } | undefined;
  const createdAt = existing?.createdAt ?? input.at;
  const createdBy = existing?.createdBy ?? input.actor;
  const version = (existing?.version ?? 0) + 1;
  const row: BuilderOverrideRow = {
    campaignId: input.campaignId,
    fieldId: input.fieldId,
    sectionId: input.sectionId,
    value: input.value,
    createdAt,
    updatedAt: input.at,
    createdBy,
    updatedBy: input.actor,
    version,
  };
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO lp_builder_overrides (
         campaignId, fieldId, sectionId, value, createdAt, updatedAt, createdBy, updatedBy, version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaignId, fieldId) DO UPDATE SET
         sectionId = excluded.sectionId,
         value = excluded.value,
         updatedAt = excluded.updatedAt,
         updatedBy = excluded.updatedBy,
         version = excluded.version`,
    ).run(row.campaignId, row.fieldId, row.sectionId, row.value, row.createdAt, row.updatedAt, row.createdBy, row.updatedBy, row.version);
    db.prepare(
      `INSERT INTO lp_builder_audit (
         campaignId, fieldId, sectionId, createdAt, updatedAt, createdBy, updatedBy, version, previousValue, newValue
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.campaignId, row.fieldId, row.sectionId, row.createdAt, row.updatedAt, row.createdBy, row.updatedBy, row.version, input.previousValue, row.value);
  });
  write();
  return row;
}

export function resetBuilderOverride(input: {
  campaignId: number;
  fieldId: string;
  actor: string;
  at: string;
}): BuilderAuditRow | null {
  const db = getDb();
  const existing = db.prepare(
    `SELECT campaignId, fieldId, sectionId, value, createdAt, createdBy, version
     FROM lp_builder_overrides WHERE campaignId = ? AND fieldId = ?`,
  ).get(input.campaignId, input.fieldId) as Pick<BuilderOverrideRow, "campaignId" | "fieldId" | "sectionId" | "value" | "createdAt" | "createdBy" | "version"> | undefined;
  if (!existing) return null;
  const version = existing.version + 1;
  const write = db.transaction(() => {
    db.prepare(`DELETE FROM lp_builder_overrides WHERE campaignId = ? AND fieldId = ?`).run(input.campaignId, input.fieldId);
    db.prepare(
      `INSERT INTO lp_builder_audit (
         campaignId, fieldId, sectionId, createdAt, updatedAt, createdBy, updatedBy, version, previousValue, newValue
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      existing.campaignId,
      existing.fieldId,
      existing.sectionId,
      existing.createdAt,
      input.at,
      existing.createdBy,
      input.actor,
      version,
      existing.value,
      null,
    );
  });
  write();
  return {
    id: 0,
    campaignId: existing.campaignId,
    fieldId: existing.fieldId,
    sectionId: existing.sectionId,
    createdAt: existing.createdAt,
    updatedAt: input.at,
    createdBy: existing.createdBy,
    updatedBy: input.actor,
    version,
    previousValue: existing.value,
    newValue: null,
  };
}
