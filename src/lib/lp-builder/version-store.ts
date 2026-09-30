/**
 * Landing-page version store.
 * Rows here are override snapshots. They are not ProductFacts.
 */

import { getDb } from "@/lib/db";
import { isLayoutKey, isLayoutSection, type LayoutAssignment } from "@/lib/lp-builder/layout";
import { listLayoutOverrides, replaceLayoutOverrides } from "@/lib/lp-builder/layout-store";
import { emptyMediaFields, isMediaRole, isMediaSlotId, type MediaFields } from "@/lib/lp-builder/media";
import { deleteMediaOverrides, listMediaLibrary, listMediaOverrides, saveMediaLibraryItem, saveMediaOverride } from "@/lib/lp-builder/media-store";
import { listBuilderOverrides, resetBuilderOverride, saveBuilderOverride } from "@/lib/lp-builder/store";
import { validateThemeTarget } from "@/lib/lp-builder/theme";
import { deleteThemeTokens, listThemeOverrides, saveThemeToken } from "@/lib/lp-builder/theme-store";
import {
  affectedSections,
  compareSnapshots,
  emptySnapshot,
  overrideCount,
  sameSnapshot,
  validateParentChain,
  validateSnapshot,
  type VersionChange,
  type VersionSnapshot,
  type VersionStatus,
} from "@/lib/lp-builder/version";

export type PageVersion = {
  id: string;
  campaignId: number;
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  comment: string;
  parentId: string | null;
  status: VersionStatus;
  action: string;
  affectedSections: string[];
  overrideCount: number;
  snapshot: VersionSnapshot;
  changes: VersionChange[];
};

type VersionRow = {
  id: string;
  campaignId: number;
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  comment: string;
  parentId: string | null;
  status: VersionStatus;
  action: string;
  affectedSections: string;
  overrideCount: number;
  snapshotJson: string;
  changesJson: string;
};

function readVersion(row: VersionRow): PageVersion | null {
  let snapshotRaw: unknown;
  let changesRaw: unknown;
  try {
    snapshotRaw = JSON.parse(row.snapshotJson);
    changesRaw = JSON.parse(row.changesJson);
  } catch {
    return null;
  }
  const parsed = validateSnapshot(snapshotRaw);
  if (!parsed.ok || !Array.isArray(changesRaw)) return null;
  return {
    id: row.id,
    campaignId: row.campaignId,
    versionNumber: row.versionNumber,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    comment: row.comment,
    parentId: row.parentId,
    status: row.status,
    action: row.action,
    affectedSections: JSON.parse(row.affectedSections) as string[],
    overrideCount: row.overrideCount,
    snapshot: parsed.snapshot,
    changes: changesRaw as VersionChange[],
  };
}

export function listPageVersions(campaignId: number): PageVersion[] {
  const rows = getDb().prepare(
    `SELECT id, campaignId, versionNumber, createdAt, createdBy, comment, parentId, status, action, affectedSections, overrideCount, snapshotJson, changesJson
     FROM lp_page_versions WHERE campaignId = ? ORDER BY versionNumber DESC`,
  ).all(campaignId) as VersionRow[];
  return rows.flatMap((row) => {
    const version = readVersion(row);
    return version ? [version] : [];
  });
}

export function captureOverrideSnapshot(campaignId: number): VersionSnapshot {
  return {
    content: listBuilderOverrides(campaignId).map((row) => ({ fieldId: row.fieldId, sectionId: row.sectionId, value: row.value })),
    theme: listThemeOverrides(campaignId).flatMap((row) => {
      if (row.scope !== "theme" && row.scope !== "section" && row.scope !== "component") return [];
      const target = validateThemeTarget({ scope: row.scope, targetId: row.targetId, token: row.token });
      if (!target.ok) return [];
      return [{ scope: row.scope, targetId: row.targetId, token: target.token, value: row.value }];
    }),
    media: listMediaOverrides(campaignId).map((row) => ({
      slotId: row.slotId,
      libraryId: row.libraryId,
      removed: row.removed,
      name: row.fields.name,
      src: row.fields.src,
      alt: row.fields.alt,
      caption: row.fields.caption,
      decorative: row.fields.decorative,
      role: row.fields.role,
      origin: row.fields.origin,
      source: row.fields.source,
      crop: row.fields.crop,
      rotation: row.fields.rotation,
      order: row.fields.order,
    })),
    library: listMediaLibrary(campaignId).map((row) => ({
      libraryId: row.libraryId,
      name: row.name,
      src: row.src,
      alt: row.alt,
      role: row.role,
      origin: row.origin,
    })),
    layout: listLayoutOverrides(campaignId).flatMap((row) => {
      if (!isLayoutKey(row.sectionKey) || !isLayoutSection(row.sectionId)) return [];
      return [{
        sectionKey: row.sectionKey,
        sectionId: row.sectionId,
        visible: row.visible,
        collapsed: row.collapsed,
        order: row.order,
        priority: row.priority,
        pinned: row.pinned,
        locked: row.locked,
        futureCompatible: row.futureCompatible,
        duplicate: row.duplicate,
      }];
    }),
  };
}

function currentOf(versions: readonly PageVersion[]): PageVersion | null {
  return versions.find((version) => version.status === "current") ?? null;
}

export function createPageVersion(input: {
  campaignId: number;
  snapshot: VersionSnapshot;
  comment: string;
  actor: string;
  at: string;
  action: string;
  status: VersionStatus;
  parentId?: string | null;
  skipIfUnchanged?: boolean;
}): { ok: true; version: PageVersion; skipped?: boolean } | { ok: false; error: string } {
  const parsed = validateSnapshot(input.snapshot);
  if (!parsed.ok) return parsed;
  const snapshot = parsed.snapshot;
  const references = snapshotReferences(snapshot);
  if (!references.ok) return references;
  const versions = listPageVersions(input.campaignId);
  const current = currentOf(versions);
  if (input.skipIfUnchanged && current && sameSnapshot(current.snapshot, snapshot)) {
    return { ok: true, version: current, skipped: true };
  }
  const parentId = input.parentId === undefined ? current?.id ?? null : input.parentId;
  const versionNumber = versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
  const id = `v-${input.campaignId}-${versionNumber}`;
  if (versions.some((version) => version.id === id || version.versionNumber === versionNumber)) {
    return { ok: false, error: "Duplicate version id." };
  }
  const parent = parentId ? versions.find((version) => version.id === parentId) ?? null : null;
  if (parentId && !parent) return { ok: false, error: "Broken parent reference." };
  const chain = validateParentChain([
    ...versions.map((version) => ({ id: version.id, versionNumber: version.versionNumber, parentId: version.parentId })),
    { id, versionNumber, parentId },
  ]);
  if (!chain.ok) return chain;
  const changes = compareSnapshots(parent?.snapshot ?? emptySnapshot(), snapshot);
  const version: PageVersion = {
    id,
    campaignId: input.campaignId,
    versionNumber,
    createdAt: input.at,
    createdBy: input.actor,
    comment: input.comment.slice(0, 500),
    parentId,
    status: input.status,
    action: input.action,
    affectedSections: affectedSections(changes),
    overrideCount: overrideCount(snapshot),
    snapshot,
    changes,
  };
  const db = getDb();
  const write = db.transaction(() => {
    if (input.status === "current") {
      db.prepare(`UPDATE lp_page_versions SET status = 'archived' WHERE campaignId = ? AND status = 'current'`).run(input.campaignId);
    }
    db.prepare(
      `INSERT INTO lp_page_versions (
         id, campaignId, versionNumber, createdAt, createdBy, comment, parentId, status, action, affectedSections, overrideCount, snapshotJson, changesJson
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      version.id,
      version.campaignId,
      version.versionNumber,
      version.createdAt,
      version.createdBy,
      version.comment,
      version.parentId,
      version.status,
      version.action,
      JSON.stringify(version.affectedSections),
      version.overrideCount,
      JSON.stringify(version.snapshot),
      JSON.stringify(version.changes),
    );
    const insertChange = db.prepare(
      `INSERT INTO lp_page_version_changes (
         versionId, campaignId, overrideType, section, field, oldValue, newValue, changeKind
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const change of version.changes) {
      insertChange.run(version.id, version.campaignId, change.overrideType, change.section, change.field, change.oldValue, change.newValue, change.kind);
    }
  });
  write();
  return { ok: true, version };
}

function snapshotReferences(snapshot: VersionSnapshot): { ok: true } | { ok: false; error: string } {
  for (const row of snapshot.content) {
    if (!/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/.test(row.fieldId) || !/^[a-z][a-zA-Z]*$/.test(row.sectionId)) {
      return { ok: false, error: "Broken content reference." };
    }
  }
  for (const row of snapshot.theme) {
    const target = validateThemeTarget({ scope: row.scope, targetId: row.targetId, token: row.token });
    if (!target.ok) return { ok: false, error: "Broken theme reference." };
  }
  for (const row of snapshot.media) {
    if (!isMediaSlotId(row.slotId)) return { ok: false, error: "Broken media reference." };
  }
  for (const row of snapshot.layout) {
    if (!isLayoutKey(row.sectionKey) || !isLayoutSection(row.sectionId)) return { ok: false, error: "Broken layout reference." };
  }
  return { ok: true };
}

function mediaFields(row: VersionSnapshot["media"][number]): MediaFields {
  const role = isMediaRole(row.role) ? row.role : "heroImage";
  return {
    ...emptyMediaFields(role, row.order),
    name: row.name,
    src: row.src,
    alt: row.alt,
    caption: row.caption,
    decorative: row.decorative,
    origin: row.origin === "generated" || row.origin === "imported" || row.origin === "uploaded" || row.origin === "saved" || row.origin === "ai" ? row.origin : "saved",
    source: row.source,
    crop: row.crop,
    rotation: row.rotation,
    format: "",
  };
}

export function applySnapshot(input: { campaignId: number; snapshot: VersionSnapshot; actor: string; at: string }): { ok: true } | { ok: false; error: string } {
  const parsed = validateSnapshot(input.snapshot);
  if (!parsed.ok) return parsed;
  const snapshot = parsed.snapshot;
  const references = snapshotReferences(snapshot);
  if (!references.ok) return references;
  const contentNow = listBuilderOverrides(input.campaignId);
  for (const row of snapshot.content) {
    const previous = contentNow.find((item) => item.fieldId === row.fieldId)?.value ?? null;
    saveBuilderOverride({
      campaignId: input.campaignId,
      fieldId: row.fieldId,
      sectionId: row.sectionId,
      value: row.value,
      previousValue: previous,
      actor: input.actor,
      at: input.at,
    });
  }
  for (const row of contentNow) {
    if (!snapshot.content.some((item) => item.fieldId === row.fieldId)) {
      resetBuilderOverride({ campaignId: input.campaignId, fieldId: row.fieldId, actor: input.actor, at: input.at });
    }
  }
  deleteThemeTokens({ campaignId: input.campaignId, actor: input.actor, at: input.at });
  for (const row of snapshot.theme) {
    saveThemeToken({
      campaignId: input.campaignId,
      scope: row.scope,
      targetId: row.targetId,
      token: row.token,
      value: row.value,
      actor: input.actor,
      at: input.at,
    });
  }
  deleteMediaOverrides({ campaignId: input.campaignId, actor: input.actor, at: input.at, reason: "restore-version" });
  for (const row of snapshot.media) {
    saveMediaOverride({
      campaignId: input.campaignId,
      slotId: row.slotId,
      libraryId: row.libraryId,
      removed: row.removed,
      reason: "restore-version",
      fields: mediaFields(row),
      actor: input.actor,
      at: input.at,
    });
  }
  const libraryIds = new Set(snapshot.library.map((item) => item.libraryId));
  const extras = listMediaLibrary(input.campaignId).filter((item) => !libraryIds.has(item.libraryId));
  if (extras.length > 0) {
    const db = getDb();
    const remove = db.transaction(() => {
      for (const item of extras) db.prepare(`DELETE FROM lp_media_library WHERE campaignId = ? AND libraryId = ?`).run(input.campaignId, item.libraryId);
    });
    remove();
  }
  for (const item of snapshot.library) {
    const role = isMediaRole(item.role) ? item.role : "heroImage";
    saveMediaLibraryItem({
      campaignId: input.campaignId,
      libraryId: item.libraryId,
      fields: {
        ...emptyMediaFields(role),
        name: item.name,
        src: item.src,
        alt: item.alt,
        origin: item.origin === "generated" || item.origin === "imported" || item.origin === "uploaded" || item.origin === "saved" || item.origin === "ai" ? item.origin : "saved",
        source: item.src,
      },
      actor: input.actor,
      at: input.at,
      reason: "restore-version",
    });
  }
  const layoutNext: LayoutAssignment[] = snapshot.layout.flatMap((row) => {
    if (!isLayoutSection(row.sectionId)) return [];
    return [{ ...row, sectionId: row.sectionId }];
  });
  const layoutPrevious: LayoutAssignment[] = listLayoutOverrides(input.campaignId).map((row) => ({
    sectionKey: row.sectionKey,
    sectionId: row.sectionId,
    visible: row.visible,
    collapsed: row.collapsed,
    order: row.order,
    priority: row.priority,
    pinned: row.pinned,
    locked: row.locked,
    futureCompatible: row.futureCompatible,
    duplicate: row.duplicate,
  }));
  replaceLayoutOverrides({
    campaignId: input.campaignId,
    previous: layoutPrevious,
    next: layoutNext,
    actor: input.actor,
    at: input.at,
  });
  return { ok: true };
}

export function rollbackToVersion(input: {
  campaignId: number;
  versionId: string;
  actor: string;
  at: string;
}): { ok: true; version: PageVersion } | { ok: false; error: string } {
  const versions = listPageVersions(input.campaignId);
  const target = versions.find((version) => version.id === input.versionId);
  if (!target) return { ok: false, error: "Broken parent reference." };
  const live = captureOverrideSnapshot(input.campaignId);
  const before = createPageVersion({
    campaignId: input.campaignId,
    snapshot: live,
    comment: "Snapshot before rollback",
    actor: input.actor,
    at: input.at,
    action: "before-rollback",
    status: "draft",
  });
  if (!before.ok) return before;
  const applied = applySnapshot({ campaignId: input.campaignId, snapshot: target.snapshot, actor: input.actor, at: input.at });
  if (!applied.ok) return applied;
  return createPageVersion({
    campaignId: input.campaignId,
    snapshot: target.snapshot,
    comment: `Restored version ${target.versionNumber}`,
    actor: input.actor,
    at: input.at,
    action: "rollback",
    status: "current",
    parentId: before.version.id,
  });
}

export function publishSnapshot(input: { campaignId: number; actor: string; at: string; comment: string }): { ok: true; published: PageVersion } | { ok: false; error: string } {
  const live = captureOverrideSnapshot(input.campaignId);
  const before = createPageVersion({
    campaignId: input.campaignId,
    snapshot: live,
    comment: input.comment || "Snapshot before publish",
    actor: input.actor,
    at: input.at,
    action: "before-publish",
    status: "draft",
  });
  if (!before.ok) return before;
  const published = createPageVersion({
    campaignId: input.campaignId,
    snapshot: live,
    comment: input.comment || "Published snapshot",
    actor: input.actor,
    at: input.at,
    action: "publish",
    status: "published",
    parentId: before.version.id,
  });
  if (!published.ok) return published;
  const working = createPageVersion({
    campaignId: input.campaignId,
    snapshot: live,
    comment: "Working copy",
    actor: input.actor,
    at: input.at,
    action: "save",
    status: "current",
    parentId: published.version.id,
  });
  if (!working.ok) return working;
  return { ok: true, published: published.version };
}

export function resetWorkingOverrides(input: { campaignId: number; actor: string; at: string }): { ok: true; version: PageVersion } | { ok: false; error: string } {
  const live = captureOverrideSnapshot(input.campaignId);
  const before = createPageVersion({
    campaignId: input.campaignId,
    snapshot: live,
    comment: "Snapshot before reset",
    actor: input.actor,
    at: input.at,
    action: "before-reset",
    status: "draft",
  });
  if (!before.ok) return before;
  const applied = applySnapshot({ campaignId: input.campaignId, snapshot: emptySnapshot(), actor: input.actor, at: input.at });
  if (!applied.ok) return applied;
  return createPageVersion({
    campaignId: input.campaignId,
    snapshot: emptySnapshot(),
    comment: "Working overrides cleared",
    actor: input.actor,
    at: input.at,
    action: "reset",
    status: "current",
    parentId: before.version.id,
  });
}

export function restoreCurrentVersion(input: {
  campaignId: number;
  actor: string;
  at: string;
}): { ok: true; version: PageVersion; unchanged?: boolean } | { ok: false; error: string } {
  const current = currentOf(listPageVersions(input.campaignId));
  if (!current) return { ok: false, error: "Broken parent reference." };
  const live = captureOverrideSnapshot(input.campaignId);
  if (sameSnapshot(live, current.snapshot)) return { ok: true, version: current, unchanged: true };
  return rollbackToVersion({ campaignId: input.campaignId, versionId: current.id, actor: input.actor, at: input.at });
}

export function restorePreviousVersion(input: {
  campaignId: number;
  actor: string;
  at: string;
}): { ok: true; version: PageVersion } | { ok: false; error: string } {
  const current = currentOf(listPageVersions(input.campaignId));
  if (!current?.parentId) return { ok: false, error: "Broken parent reference." };
  return rollbackToVersion({ campaignId: input.campaignId, versionId: current.parentId, actor: input.actor, at: input.at });
}

export function versionAutosaveEnabled(campaignId: number): boolean {
  const row = getDb().prepare(`SELECT autosave FROM lp_page_version_settings WHERE campaignId = ?`).get(campaignId) as { autosave: number } | undefined;
  return row?.autosave === 1;
}

export function setVersionAutosave(campaignId: number, enabled: boolean): void {
  getDb().prepare(
    `INSERT INTO lp_page_version_settings (campaignId, autosave) VALUES (?, ?)
     ON CONFLICT(campaignId) DO UPDATE SET autosave = excluded.autosave`,
  ).run(campaignId, enabled ? 1 : 0);
}

export function versionHistoryHealthy(campaignId: number): { ok: true } | { ok: false; error: string } {
  const versions = listPageVersions(campaignId);
  const chain = validateParentChain(versions.map((version) => ({ id: version.id, versionNumber: version.versionNumber, parentId: version.parentId })));
  if (!chain.ok) return chain;
  const currents = versions.filter((version) => version.status === "current");
  if (currents.length > 1) return { ok: false, error: "Duplicate version id." };
  return { ok: true };
}
