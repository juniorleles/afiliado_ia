/**
 * Isolated media library and assignment store.
 * Rows here are presentation assets. They are not ProductFacts or content overrides.
 */

import { getDb } from "@/lib/db";
import type { MediaFields, MediaOrigin, MediaRole } from "@/lib/lp-builder/media";

export type MediaLibraryRow = MediaFields & {
  campaignId: number;
  libraryId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

export type MediaOverrideRow = {
  campaignId: number;
  slotId: string;
  libraryId: string | null;
  removed: boolean;
  reason: string;
  fields: MediaFields;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

export type MediaAuditRow = {
  id: number;
  campaignId: number;
  slotId: string;
  libraryId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  originalAsset: string | null;
  replacementAsset: string | null;
  reason: string;
};

type StoredFields = {
  name: string;
  src: string;
  alt: string;
  caption: string;
  decorative: number;
  role: string;
  origin: string;
  source: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string;
  crop: string;
  rotation: number;
  sortOrder: number;
};

function fieldsFrom(row: StoredFields): MediaFields {
  return {
    name: row.name,
    src: row.src,
    alt: row.alt,
    caption: row.caption,
    decorative: row.decorative === 1,
    role: row.role as MediaRole,
    origin: row.origin as MediaOrigin,
    source: row.source,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    format: row.format,
    crop: row.crop,
    rotation: row.rotation,
    order: row.sortOrder,
  };
}

const FIELD_COLUMNS = `name, src, alt, caption, decorative, role, origin, source, width, height, bytes, format, crop, rotation, sortOrder`;

export function listMediaLibrary(campaignId: number): MediaLibraryRow[] {
  const rows = getDb().prepare(
    `SELECT campaignId, libraryId, ${FIELD_COLUMNS}, createdAt, updatedAt, createdBy, updatedBy, version
     FROM lp_media_library WHERE campaignId = ? ORDER BY sortOrder, name`,
  ).all(campaignId) as Array<StoredFields & { campaignId: number; libraryId: string; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; version: number }>;
  return rows.map((row) => ({
    campaignId: row.campaignId,
    libraryId: row.libraryId,
    ...fieldsFrom(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  }));
}

export function listMediaOverrides(campaignId: number): MediaOverrideRow[] {
  const rows = getDb().prepare(
    `SELECT campaignId, slotId, libraryId, removed, reason, ${FIELD_COLUMNS}, createdAt, updatedAt, createdBy, updatedBy, version
     FROM lp_media_overrides WHERE campaignId = ? ORDER BY sortOrder, slotId`,
  ).all(campaignId) as Array<StoredFields & {
    campaignId: number;
    slotId: string;
    libraryId: string | null;
    removed: number;
    reason: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
    version: number;
  }>;
  return rows.map((row) => ({
    campaignId: row.campaignId,
    slotId: row.slotId,
    libraryId: row.libraryId,
    removed: row.removed === 1,
    reason: row.reason,
    fields: fieldsFrom(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  }));
}

export function listMediaAudit(campaignId: number): MediaAuditRow[] {
  return getDb().prepare(
    `SELECT id, campaignId, slotId, libraryId, createdAt, updatedAt, createdBy, updatedBy, version, originalAsset, replacementAsset, reason
     FROM lp_media_audit WHERE campaignId = ? ORDER BY id DESC`,
  ).all(campaignId) as MediaAuditRow[];
}

function insertAudit(row: Omit<MediaAuditRow, "id">): void {
  getDb().prepare(
    `INSERT INTO lp_media_audit (
       campaignId, slotId, libraryId, createdAt, updatedAt, createdBy, updatedBy, version, originalAsset, replacementAsset, reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.campaignId, row.slotId, row.libraryId, row.createdAt, row.updatedAt, row.createdBy, row.updatedBy, row.version, row.originalAsset, row.replacementAsset, row.reason);
}

function bindFields(fields: MediaFields): unknown[] {
  return [
    fields.name,
    fields.src,
    fields.alt,
    fields.caption,
    fields.decorative ? 1 : 0,
    fields.role,
    fields.origin,
    fields.source,
    fields.width,
    fields.height,
    fields.bytes,
    fields.format,
    fields.crop,
    fields.rotation,
    fields.order,
  ];
}

export function saveMediaLibraryItem(input: {
  campaignId: number;
  libraryId: string;
  fields: MediaFields;
  actor: string;
  at: string;
  reason: string;
}): MediaLibraryRow {
  const db = getDb();
  const existing = db.prepare(
    `SELECT src, createdAt, createdBy, version FROM lp_media_library WHERE campaignId = ? AND libraryId = ?`,
  ).get(input.campaignId, input.libraryId) as { src: string; createdAt: string; createdBy: string; version: number } | undefined;
  const version = (existing?.version ?? 0) + 1;
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO lp_media_library (
         campaignId, libraryId, ${FIELD_COLUMNS}, createdAt, updatedAt, createdBy, updatedBy, version
       ) VALUES (${Array.from({ length: 22 }, () => "?").join(", ")})
       ON CONFLICT(campaignId, libraryId) DO UPDATE SET
         name = excluded.name, src = excluded.src, alt = excluded.alt, caption = excluded.caption,
         decorative = excluded.decorative, role = excluded.role, origin = excluded.origin, source = excluded.source,
         width = excluded.width, height = excluded.height, bytes = excluded.bytes, format = excluded.format,
         crop = excluded.crop, rotation = excluded.rotation, sortOrder = excluded.sortOrder,
         updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy, version = excluded.version`,
    ).run(input.campaignId, input.libraryId, ...bindFields(input.fields), existing?.createdAt ?? input.at, input.at, existing?.createdBy ?? input.actor, input.actor, version);
    insertAudit({
      campaignId: input.campaignId,
      slotId: input.libraryId,
      libraryId: input.libraryId,
      createdAt: existing?.createdAt ?? input.at,
      updatedAt: input.at,
      createdBy: existing?.createdBy ?? input.actor,
      updatedBy: input.actor,
      version,
      originalAsset: existing?.src ?? null,
      replacementAsset: input.fields.src,
      reason: input.reason,
    });
  });
  write();
  return {
    campaignId: input.campaignId,
    libraryId: input.libraryId,
    ...input.fields,
    createdAt: existing?.createdAt ?? input.at,
    updatedAt: input.at,
    createdBy: existing?.createdBy ?? input.actor,
    updatedBy: input.actor,
    version,
  };
}

export function saveMediaOverride(input: {
  campaignId: number;
  slotId: string;
  libraryId?: string | null;
  removed: boolean;
  reason: string;
  fields: MediaFields;
  actor: string;
  at: string;
  originalAsset?: string | null;
}): MediaOverrideRow {
  const db = getDb();
  const existing = db.prepare(
    `SELECT src, createdAt, createdBy, version FROM lp_media_overrides WHERE campaignId = ? AND slotId = ?`,
  ).get(input.campaignId, input.slotId) as { src: string; createdAt: string; createdBy: string; version: number } | undefined;
  const version = (existing?.version ?? 0) + 1;
  const libraryId = input.libraryId ?? null;
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO lp_media_overrides (
         campaignId, slotId, libraryId, removed, reason, ${FIELD_COLUMNS}, createdAt, updatedAt, createdBy, updatedBy, version
       ) VALUES (${Array.from({ length: 25 }, () => "?").join(", ")})
       ON CONFLICT(campaignId, slotId) DO UPDATE SET
         libraryId = excluded.libraryId, removed = excluded.removed, reason = excluded.reason,
         name = excluded.name, src = excluded.src, alt = excluded.alt, caption = excluded.caption,
         decorative = excluded.decorative, role = excluded.role, origin = excluded.origin, source = excluded.source,
         width = excluded.width, height = excluded.height, bytes = excluded.bytes, format = excluded.format,
         crop = excluded.crop, rotation = excluded.rotation, sortOrder = excluded.sortOrder,
         updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy, version = excluded.version`,
    ).run(
      input.campaignId,
      input.slotId,
      libraryId,
      input.removed ? 1 : 0,
      input.reason,
      ...bindFields(input.fields),
      existing?.createdAt ?? input.at,
      input.at,
      existing?.createdBy ?? input.actor,
      input.actor,
      version,
    );
    insertAudit({
      campaignId: input.campaignId,
      slotId: input.slotId,
      libraryId,
      createdAt: existing?.createdAt ?? input.at,
      updatedAt: input.at,
      createdBy: existing?.createdBy ?? input.actor,
      updatedBy: input.actor,
      version,
      originalAsset: input.originalAsset ?? existing?.src ?? null,
      replacementAsset: input.removed ? null : input.fields.src,
      reason: input.reason,
    });
  });
  write();
  return {
    campaignId: input.campaignId,
    slotId: input.slotId,
    libraryId,
    removed: input.removed,
    reason: input.reason,
    fields: input.fields,
    createdAt: existing?.createdAt ?? input.at,
    updatedAt: input.at,
    createdBy: existing?.createdBy ?? input.actor,
    updatedBy: input.actor,
    version,
  };
}

export function deleteMediaOverrides(input: {
  campaignId: number;
  slotIds?: readonly string[];
  actor: string;
  at: string;
  reason: string;
}): number {
  const db = getDb();
  const rows = db.prepare(
    `SELECT slotId, libraryId, src, createdAt, createdBy, version FROM lp_media_overrides WHERE campaignId = ?`,
  ).all(input.campaignId) as Array<{ slotId: string; libraryId: string | null; src: string; createdAt: string; createdBy: string; version: number }>;
  const chosen = input.slotIds ? rows.filter((row) => input.slotIds?.includes(row.slotId)) : rows;
  if (chosen.length === 0) return 0;
  const write = db.transaction(() => {
    for (const row of chosen) {
      db.prepare(`DELETE FROM lp_media_overrides WHERE campaignId = ? AND slotId = ?`).run(input.campaignId, row.slotId);
      insertAudit({
        campaignId: input.campaignId,
        slotId: row.slotId,
        libraryId: row.libraryId,
        createdAt: row.createdAt,
        updatedAt: input.at,
        createdBy: row.createdBy,
        updatedBy: input.actor,
        version: row.version + 1,
        originalAsset: row.src,
        replacementAsset: null,
        reason: input.reason,
      });
    }
  });
  write();
  return chosen.length;
}
