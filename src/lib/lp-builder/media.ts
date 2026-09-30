/**
 * Media assignment engine.
 * Generated assets, then media overrides, then the effective asset.
 * Facts, copy, theme, and layout are not part of this module.
 */

import {
  createOverrideAudit,
  resolveLandingPage,
  type LandingPageDocument,
  type LandingPageTheme,
} from "@/lib/lp-builder/index";

export const MEDIA_ROLES = [
  "heroImage",
  "heroBackground",
  "ingredientImage",
  "featureImage",
  "featureIcon",
  "guaranteeBadge",
  "pricingImage",
  "bonusImage",
  "footerLogo",
  "ctaIcon",
  "trustBadge",
  "sectionIllustration",
  "closingHero",
] as const;

export type MediaRole = (typeof MEDIA_ROLES)[number];

export const MEDIA_ORIGINS = ["generated", "imported", "uploaded", "saved", "ai"] as const;

export type MediaOrigin = (typeof MEDIA_ORIGINS)[number];

export const MEDIA_SECTIONS: Record<MediaRole, string> = {
  heroImage: "hero",
  heroBackground: "hero",
  ingredientImage: "ingredients",
  featureImage: "features",
  featureIcon: "features",
  guaranteeBadge: "guarantee",
  pricingImage: "pricing",
  bonusImage: "bonus",
  footerLogo: "footer",
  ctaIcon: "cta",
  trustBadge: "trust",
  sectionIllustration: "illustration",
  closingHero: "closing",
};

export const MEDIA_LABELS: Record<MediaRole, string> = {
  heroImage: "Hero image",
  heroBackground: "Hero background",
  ingredientImage: "Ingredient image",
  featureImage: "Feature image",
  featureIcon: "Feature icon",
  guaranteeBadge: "Guarantee badge",
  pricingImage: "Pricing image",
  bonusImage: "Bonus image",
  footerLogo: "Footer logo",
  ctaIcon: "CTA icon",
  trustBadge: "Trust badge",
  sectionIllustration: "Section illustration",
  closingHero: "Closing hero",
};

const SUPPORTED_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"]);
const LARGE_IMAGE_BYTES = 1_500_000;

export type MediaFields = {
  name: string;
  src: string;
  alt: string;
  caption: string;
  decorative: boolean;
  role: MediaRole;
  origin: MediaOrigin;
  source: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string;
  crop: string;
  rotation: number;
  order: number;
};

export type MediaSlot = {
  id: string;
  section: string;
  role: MediaRole;
  label: string;
  generated: MediaFields;
};

export type MediaAssignment = {
  slotId: string;
  removed: boolean;
  reason: string;
  fields: MediaFields;
};

export type MediaWarning = {
  slotId: string;
  code:
    | "broken-url"
    | "missing-asset"
    | "unsupported-format"
    | "duplicate-assignment"
    | "large-image"
    | "image-dimensions"
    | "missing-alt";
  message: string;
};

export type ResolvedMediaSlot = {
  slot: MediaSlot;
  origin: MediaOrigin;
  source: string;
  override: MediaAssignment | null;
  effective: MediaFields;
  warnings: MediaWarning[];
};

export type MediaSlotSeed = {
  id: string;
  section?: string;
  role: MediaRole;
  label?: string;
  src?: string;
  alt?: string;
  name?: string;
  caption?: string;
  decorative?: boolean;
  origin?: MediaOrigin;
  source?: string;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  format?: string;
  crop?: string;
  rotation?: number;
  order?: number;
};

export type MediaDraft = {
  removed?: boolean;
  reason?: string;
  fields?: Partial<MediaFields>;
};

const EMPTY_THEME: LandingPageTheme = { colors: {}, typography: {}, spacing: {} };

export function isMediaRole(value: string): value is MediaRole {
  return (MEDIA_ROLES as readonly string[]).includes(value);
}

export function isMediaOrigin(value: string): value is MediaOrigin {
  return (MEDIA_ORIGINS as readonly string[]).includes(value);
}

export function isMediaSlotId(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9_-]+)?$/.test(value);
}

export function emptyMediaFields(role: MediaRole, order = 0): MediaFields {
  return {
    name: MEDIA_LABELS[role],
    src: "",
    alt: "",
    caption: "",
    decorative: false,
    role,
    origin: "generated",
    source: "generated",
    width: null,
    height: null,
    bytes: null,
    format: "",
    crop: "",
    rotation: 0,
    order,
  };
}

export function mediaFormat(src: string): string {
  const value = src.trim();
  const data = value.match(/^data:image\/([a-z0-9.+-]+)/i);
  if (data) {
    const subtype = data[1].toLowerCase();
    if (subtype === "svg+xml") return "svg";
    return subtype.split("+")[0] ?? "";
  }
  const path = value.split("?")[0]?.split("#")[0] ?? "";
  const ext = path.includes(".") ? path.split(".").pop()?.toLowerCase() ?? "" : "";
  return ext;
}

export function mediaUrlIssue(src: string): "missing" | "broken" | "format" | null {
  const value = src.trim();
  if (!value) return "missing";
  if (/[\s<>]/.test(value) || value.startsWith("javascript:") || value.startsWith("vbscript:")) return "broken";
  const data = value.match(/^data:image\/([a-z0-9.+-]+);/i);
  if (value.startsWith("data:")) {
    if (!data) return "broken";
    const format = mediaFormat(value);
    return SUPPORTED_FORMATS.has(format) ? null : "format";
  }
  if (value.startsWith("/")) {
    if (value.includes("..")) return "broken";
    const format = mediaFormat(value);
    if (format && !SUPPORTED_FORMATS.has(format)) return "format";
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "broken";
  } catch {
    return "broken";
  }
  const format = mediaFormat(value);
  if (!format || !SUPPORTED_FORMATS.has(format)) return "format";
  return null;
}

/** Presentation src. Unsafe schemes stay in the record and are not used as an image address. */
export function presentationSrc(src: string): string {
  const issue = mediaUrlIssue(src);
  if (issue === "missing" || issue === "broken") return "";
  return src.trim();
}

export function mediaWarnings(slotId: string, fields: MediaFields, peers: readonly MediaFields[]): MediaWarning[] {
  const warnings: MediaWarning[] = [];
  const issue = mediaUrlIssue(fields.src);
  if (issue === "missing") warnings.push({ slotId, code: "missing-asset", message: "This asset is missing." });
  if (issue === "broken") warnings.push({ slotId, code: "broken-url", message: "This asset URL cannot be displayed." });
  if (issue === "format") warnings.push({ slotId, code: "unsupported-format", message: "This image format is not supported." });
  if (!fields.decorative && !fields.alt.trim()) {
    warnings.push({ slotId, code: "missing-alt", message: "Alt text is missing." });
  }
  const bytes = fields.bytes ?? (fields.src.startsWith("data:") ? fields.src.length : null);
  if (bytes !== null && bytes > LARGE_IMAGE_BYTES) {
    warnings.push({ slotId, code: "large-image", message: "This image is larger than 1.5 MB." });
  }
  const width = fields.width;
  const height = fields.height;
  if ((width !== null && (width < 16 || width > 4000)) || (height !== null && (height < 16 || height > 4000))) {
    warnings.push({ slotId, code: "image-dimensions", message: "Image dimensions are outside 16–4000 pixels." });
  }
  const src = fields.src.trim();
  if (src && peers.some((peer) => peer.src.trim() === src)) {
    warnings.push({ slotId, code: "duplicate-assignment", message: "This asset is assigned more than once." });
  }
  return warnings;
}

function slotFromSeed(seed: MediaSlotSeed, order: number): MediaSlot {
  const role = seed.role;
  const generated = emptyMediaFields(role, seed.order ?? order);
  generated.name = seed.name?.trim() || seed.label?.trim() || MEDIA_LABELS[role];
  generated.src = seed.src ?? "";
  generated.alt = seed.alt ?? "";
  generated.caption = seed.caption ?? "";
  generated.decorative = seed.decorative ?? false;
  generated.origin = seed.origin ?? "generated";
  generated.source = seed.source?.trim() || generated.src || "generated";
  generated.width = seed.width ?? null;
  generated.height = seed.height ?? null;
  generated.bytes = seed.bytes ?? null;
  generated.format = seed.format || mediaFormat(generated.src);
  generated.crop = seed.crop ?? "";
  generated.rotation = seed.rotation ?? 0;
  return {
    id: seed.id,
    section: seed.section || MEDIA_SECTIONS[role],
    role,
    label: seed.label?.trim() || MEDIA_LABELS[role],
    generated,
  };
}

export function buildMediaSlots(seeds: readonly MediaSlotSeed[] = []): MediaSlot[] {
  const slots = seeds.filter((seed) => isMediaRole(seed.role) && isMediaSlotId(seed.id)).map((seed, index) => slotFromSeed(seed, index));
  const present = new Set(slots.map((slot) => slot.role));
  for (const role of MEDIA_ROLES) {
    if (present.has(role)) continue;
    slots.push(slotFromSeed({ id: role, role, label: MEDIA_LABELS[role] }, slots.length));
  }
  return slots.sort((a, b) => a.generated.order - b.generated.order || a.id.localeCompare(b.id));
}

function normalizeFields(base: MediaFields, patch: Partial<MediaFields> | undefined, role: MediaRole): MediaFields {
  const next: MediaFields = { ...base, ...patch, role: isMediaRole(patch?.role ?? "") ? (patch?.role as MediaRole) : role };
  next.name = String(next.name ?? "");
  next.src = String(next.src ?? "");
  next.alt = String(next.alt ?? "");
  next.caption = String(next.caption ?? "");
  next.decorative = Boolean(next.decorative);
  next.origin = isMediaOrigin(next.origin) ? next.origin : base.origin;
  next.source = String(next.source ?? "");
  next.format = String(next.format || mediaFormat(next.src));
  next.crop = String(next.crop ?? "");
  next.rotation = Number.isFinite(next.rotation) ? next.rotation : 0;
  next.order = Number.isFinite(next.order) ? next.order : base.order;
  next.width = next.width === null || next.width === undefined ? null : Number(next.width);
  next.height = next.height === null || next.height === undefined ? null : Number(next.height);
  next.bytes = next.bytes === null || next.bytes === undefined ? null : Number(next.bytes);
  if (next.width !== null && !Number.isFinite(next.width)) next.width = null;
  if (next.height !== null && !Number.isFinite(next.height)) next.height = null;
  if (next.bytes !== null && !Number.isFinite(next.bytes)) next.bytes = null;
  return next;
}

export function effectiveFields(slot: MediaSlot, assignment: MediaAssignment | null): MediaFields {
  if (!assignment) return slot.generated;
  const fields = normalizeFields(slot.generated, assignment.fields, slot.role);
  if (assignment.removed) return { ...fields, src: "", format: "" };
  return fields;
}

export function previewAssignments(
  slots: readonly MediaSlot[],
  saved: readonly MediaAssignment[],
  drafts: Readonly<Record<string, MediaDraft>>,
): MediaAssignment[] {
  const savedById = new Map(saved.map((row) => [row.slotId, row]));
  const assignments: MediaAssignment[] = [];
  for (const slot of slots) {
    const draft = drafts[slot.id];
    const stored = savedById.get(slot.id) ?? null;
    if (!draft && stored) assignments.push(stored);
    if (!draft) continue;
    const base = stored?.fields ?? slot.generated;
    assignments.push({
      slotId: slot.id,
      removed: draft.removed ?? stored?.removed ?? false,
      reason: draft.reason ?? stored?.reason ?? "preview",
      fields: normalizeFields(base, draft.fields, slot.role),
    });
  }
  for (const row of saved) {
    if (!slots.some((slot) => slot.id === row.slotId) && !drafts[row.slotId]) assignments.push(row);
  }
  return assignments;
}

export function resolveMedia(input: {
  content?: LandingPageDocument | null;
  slots: readonly MediaSlot[];
  assignments: readonly MediaAssignment[];
}): { slots: ResolvedMediaSlot[]; document: LandingPageDocument; warnings: MediaWarning[] } {
  const bySlot = new Map(input.assignments.map((row) => [row.slotId, row]));
  const resolved: ResolvedMediaSlot[] = input.slots.map((slot) => {
    const override = bySlot.get(slot.id) ?? null;
    const effective = effectiveFields(slot, override);
    return {
      slot,
      origin: effective.origin,
      source: effective.source,
      override,
      effective,
      warnings: [],
    };
  });
  for (const item of resolved) {
    const peers = resolved.filter((other) => other.slot.id !== item.slot.id).map((other) => other.effective);
    item.warnings = mediaWarnings(item.slot.id, item.effective, peers);
  }
  const generatedAssets = input.slots.map((slot) => ({ id: slot.id, src: slot.generated.src, alt: slot.generated.alt }));
  const content = input.content ? structuredClone(input.content) : null;
  const generatedDocument: LandingPageDocument = {
    sections: content?.sections ?? [],
    theme: content?.theme ?? EMPTY_THEME,
    assets: generatedAssets,
    layout: content?.layout ?? { width: "", alignment: "start" },
  };
  const assetOverrides = resolved.flatMap((item) => {
    if (item.effective.src === item.slot.generated.src && item.effective.alt === item.slot.generated.alt) return [];
    return [{
      ...createOverrideAudit({ actor: "admin", at: "1970-01-01T00:00:00.000Z", version: 1 }),
      assetId: item.slot.id,
      src: item.effective.src,
      alt: item.effective.alt,
    }];
  });
  const document = resolveLandingPage(generatedDocument, assetOverrides.length > 0 ? { assets: assetOverrides } : {});
  return { slots: resolved, document, warnings: resolved.flatMap((item) => item.warnings) };
}

export function reorderSlots(slots: readonly MediaSlot[], slotId: string, direction: -1 | 1): MediaSlot[] {
  const role = slots.find((slot) => slot.id === slotId)?.role;
  if (!role) return slots.map((slot) => ({ ...slot, generated: { ...slot.generated } }));
  const group = slots.filter((slot) => slot.role === role).sort((a, b) => a.generated.order - b.generated.order || a.id.localeCompare(b.id));
  const index = group.findIndex((slot) => slot.id === slotId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= group.length) return slots.map((slot) => ({ ...slot }));
  const reordered = [...group];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, moved);
  const order = new Map(reordered.map((slot, position) => [slot.id, position]));
  return slots.map((slot) => order.has(slot.id) ? { ...slot, generated: { ...slot.generated, order: order.get(slot.id) ?? slot.generated.order } } : slot);
}

export function duplicateFields(fields: MediaFields, name: string): MediaFields {
  return { ...fields, name: name.trim() || `${fields.name} copy`, origin: "saved", source: fields.source || fields.src || "saved" };
}
