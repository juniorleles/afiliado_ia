/**
 * Isolated visual theme store.
 * Rows here are presentation tokens. They are not ProductFacts or content overrides.
 */

import { getDb } from "@/lib/db";

export type ThemeOverrideRow = {
  campaignId: number;
  scope: "theme" | "section" | "component";
  targetId: string;
  token: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

export type ThemeAuditRow = {
  id: number;
  campaignId: number;
  scope: string;
  targetId: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  previousValue: string | null;
  newValue: string | null;
};

export function listThemeOverrides(campaignId: number): ThemeOverrideRow[] {
  return getDb().prepare(
    `SELECT campaignId, scope, targetId, token, value, createdAt, updatedAt, createdBy, updatedBy, version
     FROM lp_theme_overrides WHERE campaignId = ? ORDER BY scope, targetId, token`,
  ).all(campaignId) as ThemeOverrideRow[];
}

export function listThemeAudit(campaignId: number): ThemeAuditRow[] {
  return getDb().prepare(
    `SELECT id, campaignId, scope, targetId, token, createdAt, updatedAt, createdBy, updatedBy, version, previousValue, newValue
     FROM lp_theme_audit WHERE campaignId = ? ORDER BY id DESC`,
  ).all(campaignId) as ThemeAuditRow[];
}

function insertAudit(row: Omit<ThemeAuditRow, "id">): void {
  getDb().prepare(
    `INSERT INTO lp_theme_audit (
       campaignId, scope, targetId, token, createdAt, updatedAt, createdBy, updatedBy, version, previousValue, newValue
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.campaignId, row.scope, row.targetId, row.token, row.createdAt, row.updatedAt, row.createdBy, row.updatedBy, row.version, row.previousValue, row.newValue);
}

export function saveThemeToken(input: {
  campaignId: number;
  scope: ThemeOverrideRow["scope"];
  targetId: string;
  token: string;
  value: string;
  actor: string;
  at: string;
}): ThemeOverrideRow {
  const db = getDb();
  const existing = db.prepare(
    `SELECT value, createdAt, createdBy, version FROM lp_theme_overrides
     WHERE campaignId = ? AND scope = ? AND targetId = ? AND token = ?`,
  ).get(input.campaignId, input.scope, input.targetId, input.token) as { value: string; createdAt: string; createdBy: string; version: number } | undefined;
  const row: ThemeOverrideRow = {
    campaignId: input.campaignId,
    scope: input.scope,
    targetId: input.targetId,
    token: input.token,
    value: input.value,
    createdAt: existing?.createdAt ?? input.at,
    updatedAt: input.at,
    createdBy: existing?.createdBy ?? input.actor,
    updatedBy: input.actor,
    version: (existing?.version ?? 0) + 1,
  };
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO lp_theme_overrides (
         campaignId, scope, targetId, token, value, createdAt, updatedAt, createdBy, updatedBy, version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaignId, scope, targetId, token) DO UPDATE SET
         value = excluded.value,
         updatedAt = excluded.updatedAt,
         updatedBy = excluded.updatedBy,
         version = excluded.version`,
    ).run(row.campaignId, row.scope, row.targetId, row.token, row.value, row.createdAt, row.updatedAt, row.createdBy, row.updatedBy, row.version);
    insertAudit({
      campaignId: row.campaignId,
      scope: row.scope,
      targetId: row.targetId,
      token: row.token,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      version: row.version,
      previousValue: existing?.value ?? null,
      newValue: row.value,
    });
  });
  write();
  return row;
}

export function deleteThemeTokens(input: {
  campaignId: number;
  scope?: ThemeOverrideRow["scope"];
  targetId?: string;
  actor: string;
  at: string;
}): number {
  const db = getDb();
  const rows = db.prepare(
    `SELECT scope, targetId, token, value, createdAt, createdBy, version FROM lp_theme_overrides
     WHERE campaignId = ?
       AND (? IS NULL OR scope = ?)
       AND (? IS NULL OR targetId = ?)`,
  ).all(input.campaignId, input.scope ?? null, input.scope ?? null, input.targetId ?? null, input.targetId ?? null) as Array<{
    scope: string;
    targetId: string;
    token: string;
    value: string;
    createdAt: string;
    createdBy: string;
    version: number;
  }>;
  if (rows.length === 0) return 0;
  const write = db.transaction(() => {
    for (const row of rows) {
      db.prepare(
        `DELETE FROM lp_theme_overrides WHERE campaignId = ? AND scope = ? AND targetId = ? AND token = ?`,
      ).run(input.campaignId, row.scope, row.targetId, row.token);
      insertAudit({
        campaignId: input.campaignId,
        scope: row.scope,
        targetId: row.targetId,
        token: row.token,
        createdAt: row.createdAt,
        updatedAt: input.at,
        createdBy: row.createdBy,
        updatedBy: input.actor,
        version: row.version + 1,
        previousValue: row.value,
        newValue: null,
      });
    }
  });
  write();
  return rows.length;
}
