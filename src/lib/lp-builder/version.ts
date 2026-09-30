/**
 * Landing-page version model.
 * A version stores builder overrides only. The generated page is not part of this module.
 */

export const VERSION_STATUSES = ["current", "published", "draft", "archived"] as const;

export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const OVERRIDE_TYPES = ["content", "theme", "media", "layout", "visibility", "component"] as const;

export type OverrideType = (typeof OVERRIDE_TYPES)[number];

export const CHANGE_KINDS = ["added", "removed", "modified", "moved", "hidden", "restored"] as const;

export type ChangeKind = (typeof CHANGE_KINDS)[number];

export type ContentOverrideSnap = { fieldId: string; sectionId: string; value: string };

export type ThemeOverrideSnap = { scope: "theme" | "section" | "component"; targetId: string; token: string; value: string };

export type MediaOverrideSnap = {
  slotId: string;
  libraryId: string | null;
  removed: boolean;
  name: string;
  src: string;
  alt: string;
  caption: string;
  decorative: boolean;
  role: string;
  origin: string;
  source: string;
  crop: string;
  rotation: number;
  order: number;
};

export type MediaLibrarySnap = { libraryId: string; name: string; src: string; alt: string; role: string; origin: string };

export type LayoutOverrideSnap = {
  sectionKey: string;
  sectionId: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
  priority: number;
  pinned: boolean;
  locked: boolean;
  futureCompatible: boolean;
  duplicate: boolean;
};

export type VersionSnapshot = {
  content: ContentOverrideSnap[];
  theme: ThemeOverrideSnap[];
  media: MediaOverrideSnap[];
  library: MediaLibrarySnap[];
  layout: LayoutOverrideSnap[];
};

export type VersionChange = {
  overrideType: OverrideType;
  section: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  kind: ChangeKind;
};

export type VersionRef = {
  id: string;
  versionNumber: number;
  parentId: string | null;
};

export function emptySnapshot(): VersionSnapshot {
  return { content: [], theme: [], media: [], library: [], layout: [] };
}

export function isVersionStatus(value: string): value is VersionStatus {
  return (VERSION_STATUSES as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

export function validateSnapshot(raw: unknown): { ok: true; snapshot: VersionSnapshot } | { ok: false; error: string } {
  const record = asRecord(raw);
  if (!record) return { ok: false, error: "Corrupted version." };
  const contentRaw = record.content;
  const themeRaw = record.theme;
  const mediaRaw = record.media;
  const libraryRaw = record.library;
  const layoutRaw = record.layout;
  if (!Array.isArray(contentRaw) || !Array.isArray(themeRaw) || !Array.isArray(mediaRaw) || !Array.isArray(libraryRaw) || !Array.isArray(layoutRaw)) {
    return { ok: false, error: "Corrupted version." };
  }
  const content: ContentOverrideSnap[] = [];
  for (const item of contentRaw) {
    const row = asRecord(item);
    const fieldId = text(row?.fieldId)?.trim() ?? "";
    const sectionId = text(row?.sectionId)?.trim() ?? "";
    const value = text(row?.value);
    if (!fieldId || !sectionId || value === null) return { ok: false, error: "Broken content reference." };
    content.push({ fieldId, sectionId, value });
  }
  if (!unique(content.map((item) => item.fieldId))) return { ok: false, error: "Duplicate content id." };
  const theme: ThemeOverrideSnap[] = [];
  for (const item of themeRaw) {
    const row = asRecord(item);
    const scope = text(row?.scope);
    const targetId = text(row?.targetId)?.trim() ?? "";
    const token = text(row?.token)?.trim() ?? "";
    const value = text(row?.value);
    if ((scope !== "theme" && scope !== "section" && scope !== "component") || !targetId || !token || value === null) {
      return { ok: false, error: "Broken theme reference." };
    }
    theme.push({ scope, targetId, token, value });
  }
  if (!unique(theme.map((item) => `${item.scope}:${item.targetId}:${item.token}`))) return { ok: false, error: "Duplicate theme id." };
  const media: MediaOverrideSnap[] = [];
  for (const item of mediaRaw) {
    const row = asRecord(item);
    const slotId = text(row?.slotId)?.trim() ?? "";
    if (!slotId || typeof row?.removed !== "boolean" || text(row?.src) === null) return { ok: false, error: "Broken media reference." };
    media.push({
      slotId,
      libraryId: text(row.libraryId),
      removed: row.removed,
      name: text(row.name) ?? "",
      src: text(row.src) ?? "",
      alt: text(row.alt) ?? "",
      caption: text(row.caption) ?? "",
      decorative: Boolean(row.decorative),
      role: text(row.role) ?? "heroImage",
      origin: text(row.origin) ?? "saved",
      source: text(row.source) ?? "",
      crop: text(row.crop) ?? "",
      rotation: Number.isFinite(row.rotation) ? Number(row.rotation) : 0,
      order: Number.isFinite(row.order) ? Number(row.order) : 0,
    });
  }
  if (!unique(media.map((item) => item.slotId))) return { ok: false, error: "Duplicate media id." };
  const library: MediaLibrarySnap[] = [];
  for (const item of libraryRaw) {
    const row = asRecord(item);
    const libraryId = text(row?.libraryId)?.trim() ?? "";
    if (!libraryId || text(row?.src) === null) return { ok: false, error: "Broken media reference." };
    library.push({
      libraryId,
      name: text(row?.name) ?? libraryId,
      src: text(row?.src) ?? "",
      alt: text(row?.alt) ?? "",
      role: text(row?.role) ?? "heroImage",
      origin: text(row?.origin) ?? "saved",
    });
  }
  if (!unique(library.map((item) => item.libraryId))) return { ok: false, error: "Duplicate media id." };
  const layout: LayoutOverrideSnap[] = [];
  for (const item of layoutRaw) {
    const row = asRecord(item);
    const sectionKey = text(row?.sectionKey)?.trim() ?? "";
    const sectionId = text(row?.sectionId)?.trim() ?? "";
    if (!sectionKey || !sectionId || typeof row?.visible !== "boolean") return { ok: false, error: "Broken layout reference." };
    layout.push({
      sectionKey,
      sectionId,
      visible: row.visible,
      collapsed: Boolean(row.collapsed),
      order: Number.isFinite(row.order) ? Number(row.order) : 0,
      priority: Number.isFinite(row.priority) ? Number(row.priority) : 0,
      pinned: Boolean(row.pinned),
      locked: Boolean(row.locked),
      futureCompatible: Boolean(row.futureCompatible),
      duplicate: Boolean(row.duplicate),
    });
  }
  if (!unique(layout.map((item) => item.sectionKey))) return { ok: false, error: "Duplicate layout id." };
  return { ok: true, snapshot: { content, theme, media, library, layout } };
}

export function validateParentChain(versions: readonly VersionRef[]): { ok: true } | { ok: false; error: string } {
  const byId = new Map(versions.map((version) => [version.id, version]));
  if (byId.size !== versions.length) return { ok: false, error: "Duplicate version id." };
  const numbers = versions.map((version) => version.versionNumber);
  if (!unique(numbers.map(String))) return { ok: false, error: "Duplicate version number." };
  for (const version of versions) {
    const seen = new Set<string>();
    let cursor: VersionRef | undefined = version;
    while (cursor) {
      if (seen.has(cursor.id)) return { ok: false, error: "Invalid parent chain." };
      seen.add(cursor.id);
      if (!cursor.parentId) break;
      const parent = byId.get(cursor.parentId);
      if (!parent) return { ok: false, error: "Broken parent reference." };
      if (parent.versionNumber >= cursor.versionNumber) return { ok: false, error: "Invalid parent chain." };
      cursor = parent;
    }
  }
  return { ok: true };
}

function layoutValue(row: LayoutOverrideSnap): string {
  return JSON.stringify({ collapsed: row.collapsed, priority: row.priority, pinned: row.pinned, locked: row.locked, futureCompatible: row.futureCompatible, duplicate: row.duplicate });
}

export function compareSnapshots(before: VersionSnapshot, after: VersionSnapshot): VersionChange[] {
  const changes: VersionChange[] = [];
  const beforeContent = new Map(before.content.map((item) => [item.fieldId, item]));
  const afterContent = new Map(after.content.map((item) => [item.fieldId, item]));
  for (const [fieldId, item] of afterContent) {
    const previous = beforeContent.get(fieldId);
    if (!previous) changes.push({ overrideType: "content", section: item.sectionId, field: fieldId, oldValue: null, newValue: item.value, kind: "added" });
    else if (previous.value !== item.value) changes.push({ overrideType: "content", section: item.sectionId, field: fieldId, oldValue: previous.value, newValue: item.value, kind: "modified" });
  }
  for (const [fieldId, item] of beforeContent) {
    if (!afterContent.has(fieldId)) changes.push({ overrideType: "content", section: item.sectionId, field: fieldId, oldValue: item.value, newValue: null, kind: "removed" });
  }
  const beforeTheme = new Map(before.theme.map((item) => [`${item.scope}:${item.targetId}:${item.token}`, item]));
  const afterTheme = new Map(after.theme.map((item) => [`${item.scope}:${item.targetId}:${item.token}`, item]));
  for (const [key, item] of afterTheme) {
    const previous = beforeTheme.get(key);
    const overrideType: OverrideType = item.scope === "component" ? "component" : "theme";
    if (!previous) changes.push({ overrideType, section: item.targetId, field: item.token, oldValue: null, newValue: item.value, kind: "added" });
    else if (previous.value !== item.value) changes.push({ overrideType, section: item.targetId, field: item.token, oldValue: previous.value, newValue: item.value, kind: "modified" });
  }
  for (const [key, item] of beforeTheme) {
    if (!afterTheme.has(key)) changes.push({ overrideType: item.scope === "component" ? "component" : "theme", section: item.targetId, field: item.token, oldValue: item.value, newValue: null, kind: "removed" });
  }
  const beforeMedia = new Map(before.media.map((item) => [item.slotId, item]));
  const afterMedia = new Map(after.media.map((item) => [item.slotId, item]));
  for (const [slotId, item] of afterMedia) {
    const previous = beforeMedia.get(slotId);
    const nextValue = item.removed ? "" : item.src;
    if (!previous) changes.push({ overrideType: "media", section: slotId, field: "src", oldValue: null, newValue: nextValue, kind: "added" });
    else if ((previous.removed ? "" : previous.src) !== nextValue || previous.alt !== item.alt) {
      changes.push({ overrideType: "media", section: slotId, field: "src", oldValue: previous.removed ? "" : previous.src, newValue: nextValue, kind: "modified" });
    }
  }
  for (const [slotId, item] of beforeMedia) {
    if (!afterMedia.has(slotId)) changes.push({ overrideType: "media", section: slotId, field: "src", oldValue: item.removed ? "" : item.src, newValue: null, kind: "removed" });
  }
  const beforeLayout = new Map(before.layout.map((item) => [item.sectionKey, item]));
  const afterLayout = new Map(after.layout.map((item) => [item.sectionKey, item]));
  for (const [key, item] of afterLayout) {
    const previous = beforeLayout.get(key);
    if (!previous) {
      changes.push({ overrideType: item.visible ? "layout" : "visibility", section: item.sectionId, field: key, oldValue: null, newValue: layoutValue(item), kind: item.visible ? "added" : "hidden" });
      continue;
    }
    if (previous.visible !== item.visible) {
      changes.push({ overrideType: "visibility", section: item.sectionId, field: key, oldValue: String(previous.visible), newValue: String(item.visible), kind: item.visible ? "restored" : "hidden" });
    }
    if (previous.order !== item.order) {
      changes.push({ overrideType: "layout", section: item.sectionId, field: "order", oldValue: String(previous.order), newValue: String(item.order), kind: "moved" });
    }
    if (layoutValue(previous) !== layoutValue(item)) {
      changes.push({ overrideType: "layout", section: item.sectionId, field: key, oldValue: layoutValue(previous), newValue: layoutValue(item), kind: "modified" });
    }
  }
  for (const [key, item] of beforeLayout) {
    if (!afterLayout.has(key)) changes.push({ overrideType: "layout", section: item.sectionId, field: key, oldValue: layoutValue(item), newValue: null, kind: "removed" });
  }
  return changes;
}

export function affectedSections(changes: readonly VersionChange[]): string[] {
  return [...new Set(changes.map((change) => change.section))].sort();
}

export function overrideCount(snapshot: VersionSnapshot): number {
  return snapshot.content.length + snapshot.theme.length + snapshot.media.length + snapshot.library.length + snapshot.layout.length;
}

export function sameSnapshot(left: VersionSnapshot, right: VersionSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
