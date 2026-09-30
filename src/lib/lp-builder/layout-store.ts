/**
 * Isolated layout override store.
 * Rows here are presentation structure. They are not ProductFacts or content overrides.
 */

import { getDb } from "@/lib/db";
import type { LayoutAssignment } from "@/lib/lp-builder/layout";

export type LayoutAuditRow = {
  id: number;
  campaignId: number;
  sectionKey: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  previousPosition: number | null;
  newPosition: number | null;
  visibilityChange: string | null;
};

type OverrideSql = {
  campaignId: number;
  sectionKey: string;
  sectionId: LayoutAssignment["sectionId"];
  visible: number;
  collapsed: number;
  sortOrder: number;
  priority: number;
  pinned: number;
  locked: number;
  futureCompatible: number;
  duplicated: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
};

function fromRow(row: OverrideSql): LayoutAssignment & { createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; version: number } {
  return {
    sectionKey: row.sectionKey,
    sectionId: row.sectionId,
    visible: row.visible === 1,
    collapsed: row.collapsed === 1,
    order: row.sortOrder,
    priority: row.priority,
    pinned: row.pinned === 1,
    locked: row.locked === 1,
    futureCompatible: row.futureCompatible === 1,
    duplicate: row.duplicated === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

export function listLayoutOverrides(campaignId: number): Array<LayoutAssignment & { createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; version: number }> {
  const rows = getDb().prepare(
    `SELECT campaignId, sectionKey, sectionId, visible, collapsed, sortOrder, priority, pinned, locked, futureCompatible, duplicated,
            createdAt, updatedAt, createdBy, updatedBy, version
     FROM lp_layout_overrides WHERE campaignId = ? ORDER BY sortOrder, sectionKey`,
  ).all(campaignId) as OverrideSql[];
  return rows.map(fromRow);
}

export function listLayoutAudit(campaignId: number): LayoutAuditRow[] {
  return getDb().prepare(
    `SELECT id, campaignId, sectionKey, createdAt, updatedAt, createdBy, updatedBy, version, previousPosition, newPosition, visibilityChange
     FROM lp_layout_audit WHERE campaignId = ? ORDER BY id DESC`,
  ).all(campaignId) as LayoutAuditRow[];
}

function insertAudit(row: Omit<LayoutAuditRow, "id">): void {
  getDb().prepare(
    `INSERT INTO lp_layout_audit (
       campaignId, sectionKey, createdAt, updatedAt, createdBy, updatedBy, version, previousPosition, newPosition, visibilityChange
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.campaignId, row.sectionKey, row.createdAt, row.updatedAt, row.createdBy, row.updatedBy, row.version, row.previousPosition, row.newPosition, row.visibilityChange);
}

export function replaceLayoutOverrides(input: {
  campaignId: number;
  previous: readonly LayoutAssignment[];
  next: readonly LayoutAssignment[];
  actor: string;
  at: string;
}): number {
  const db = getDb();
  const before = new Map(input.previous.map((row) => [row.sectionKey, row]));
  const after = new Map(input.next.map((row) => [row.sectionKey, row]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  const write = db.transaction(() => {
    let changes = 0;
    for (const key of keys) {
      const oldRow = before.get(key);
      const newRow = after.get(key);
      if (oldRow && newRow && JSON.stringify(oldRow) === JSON.stringify(newRow)) continue;
      const existing = db.prepare(
        `SELECT createdAt, createdBy, version, sortOrder, visible FROM lp_layout_overrides WHERE campaignId = ? AND sectionKey = ?`,
      ).get(input.campaignId, key) as { createdAt: string; createdBy: string; version: number; sortOrder: number; visible: number } | undefined;
      if (!newRow) {
        db.prepare(`DELETE FROM lp_layout_overrides WHERE campaignId = ? AND sectionKey = ?`).run(input.campaignId, key);
        insertAudit({
          campaignId: input.campaignId,
          sectionKey: key,
          createdAt: existing?.createdAt ?? input.at,
          updatedAt: input.at,
          createdBy: existing?.createdBy ?? input.actor,
          updatedBy: input.actor,
          version: (existing?.version ?? 0) + 1,
          previousPosition: existing?.sortOrder ?? oldRow?.order ?? null,
          newPosition: null,
          visibilityChange: "restored",
        });
        changes += 1;
        continue;
      }
      const version = (existing?.version ?? 0) + 1;
      db.prepare(
        `INSERT INTO lp_layout_overrides (
           campaignId, sectionKey, sectionId, visible, collapsed, sortOrder, priority, pinned, locked, futureCompatible, duplicated,
           createdAt, updatedAt, createdBy, updatedBy, version
         ) VALUES (${Array.from({ length: 16 }, () => "?").join(", ")})
         ON CONFLICT(campaignId, sectionKey) DO UPDATE SET
           sectionId = excluded.sectionId, visible = excluded.visible, collapsed = excluded.collapsed,
           sortOrder = excluded.sortOrder, priority = excluded.priority, pinned = excluded.pinned,
           locked = excluded.locked, futureCompatible = excluded.futureCompatible, duplicated = excluded.duplicated,
           updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy, version = excluded.version`,
      ).run(
        input.campaignId,
        newRow.sectionKey,
        newRow.sectionId,
        newRow.visible ? 1 : 0,
        newRow.collapsed ? 1 : 0,
        newRow.order,
        newRow.priority,
        newRow.pinned ? 1 : 0,
        newRow.locked ? 1 : 0,
        newRow.futureCompatible ? 1 : 0,
        newRow.duplicate ? 1 : 0,
        existing?.createdAt ?? input.at,
        input.at,
        existing?.createdBy ?? input.actor,
        input.actor,
        version,
      );
      const visibilityChange = oldRow && oldRow.visible !== newRow.visible ? (newRow.visible ? "shown" : "hidden") : newRow.visible ? "shown" : "hidden";
      insertAudit({
        campaignId: input.campaignId,
        sectionKey: key,
        createdAt: existing?.createdAt ?? input.at,
        updatedAt: input.at,
        createdBy: existing?.createdBy ?? input.actor,
        updatedBy: input.actor,
        version,
        previousPosition: existing?.sortOrder ?? oldRow?.order ?? null,
        newPosition: newRow.order,
        visibilityChange: oldRow && oldRow.visible === newRow.visible && oldRow.order !== newRow.order ? "" : visibilityChange,
      });
      changes += 1;
    }
    return changes;
  });
  return write();
}

export function deleteLayoutOverrides(input: { campaignId: number; sectionKey?: string; actor: string; at: string }): number {
  const rows = listLayoutOverrides(input.campaignId);
  if (rows.length === 0) return 0;
  const next = input.sectionKey ? rows.filter((row) => row.sectionKey !== input.sectionKey) : [];
  if (input.sectionKey && next.length === rows.length) return 0;
  return replaceLayoutOverrides({
    campaignId: input.campaignId,
    previous: rows,
    next,
    actor: input.actor,
    at: input.at,
  });
}
