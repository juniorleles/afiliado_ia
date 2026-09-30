"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import {
  emptyMediaFields,
  isMediaOrigin,
  isMediaRole,
  isMediaSlotId,
  type MediaFields,
  type MediaRole,
} from "@/lib/lp-builder/media";
import {
  deleteMediaOverrides,
  listMediaAudit,
  listMediaOverrides,
  saveMediaLibraryItem,
  saveMediaOverride,
  type MediaAuditRow,
  type MediaLibraryRow,
  type MediaOverrideRow,
} from "@/lib/lp-builder/media-store";

async function campaignOrError(campaignId: number) {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) return { ok: false as const, error: "Unknown campaign." };
  const campaign = getCampaignById(campaignId);
  if (!campaign) return { ok: false as const, error: "Unknown campaign." };
  return { ok: true as const, campaign };
}

function cleanFields(fields: MediaFields, fallbackRole: MediaRole): MediaFields {
  const role = isMediaRole(fields.role) ? fields.role : fallbackRole;
  const base = emptyMediaFields(role, Number.isFinite(fields.order) ? fields.order : 0);
  return {
    ...base,
    name: String(fields.name ?? base.name).slice(0, 160),
    src: String(fields.src ?? ""),
    alt: String(fields.alt ?? "").slice(0, 300),
    caption: String(fields.caption ?? "").slice(0, 500),
    decorative: Boolean(fields.decorative),
    role,
    origin: isMediaOrigin(fields.origin) ? fields.origin : base.origin,
    source: String(fields.source ?? base.source).slice(0, 500),
    width: Number.isFinite(fields.width) ? fields.width : null,
    height: Number.isFinite(fields.height) ? fields.height : null,
    bytes: Number.isFinite(fields.bytes) ? fields.bytes : null,
    format: String(fields.format ?? "").slice(0, 32),
    crop: String(fields.crop ?? "").slice(0, 120),
    rotation: Number.isFinite(fields.rotation) ? fields.rotation : 0,
    order: Number.isFinite(fields.order) ? fields.order : 0,
  };
}

export async function saveMediaAction(input: {
  campaignId: number;
  slotId: string;
  libraryId?: string | null;
  removed: boolean;
  reason: string;
  fields: MediaFields;
  originalAsset?: string | null;
}): Promise<{ ok: true; row: MediaOverrideRow; audit: MediaAuditRow } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  if (!isMediaSlotId(input.slotId)) return { ok: false, error: "Unknown media slot." };
  const role = isMediaRole(input.fields.role) ? input.fields.role : "heroImage";
  saveMediaOverride({
    campaignId: loaded.campaign.id,
    slotId: input.slotId,
    libraryId: input.libraryId,
    removed: input.removed,
    reason: input.reason.trim() || (input.removed ? "remove" : "replace"),
    fields: cleanFields(input.fields, role),
    actor: "admin",
    at: new Date().toISOString(),
    originalAsset: input.originalAsset,
  });
  const audit = listMediaAudit(loaded.campaign.id)[0];
  const saved = listMediaOverrides(loaded.campaign.id).find((item) => item.slotId === input.slotId);
  if (!audit || !saved) return { ok: false, error: "The media edit was not recorded." };
  return { ok: true, row: saved, audit };
}

export async function saveLibraryAction(input: {
  campaignId: number;
  libraryId: string;
  fields: MediaFields;
  reason: string;
}): Promise<{ ok: true; row: MediaLibraryRow; audit: MediaAuditRow } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  if (!isMediaSlotId(input.libraryId)) return { ok: false, error: "Unknown library asset." };
  const role = isMediaRole(input.fields.role) ? input.fields.role : "heroImage";
  const row = saveMediaLibraryItem({
    campaignId: loaded.campaign.id,
    libraryId: input.libraryId,
    fields: cleanFields(input.fields, role),
    actor: "admin",
    at: new Date().toISOString(),
    reason: input.reason.trim() || "save",
  });
  const audit = listMediaAudit(loaded.campaign.id)[0];
  if (!audit) return { ok: false, error: "The library edit was not recorded." };
  return { ok: true, row, audit };
}

export async function resetMediaAction(input: {
  campaignId: number;
  slotIds?: string[];
  reason: string;
}): Promise<{ ok: true; audit: MediaAuditRow | null } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  if (input.slotIds && input.slotIds.some((slotId) => !isMediaSlotId(slotId))) return { ok: false, error: "Unknown media slot." };
  deleteMediaOverrides({
    campaignId: loaded.campaign.id,
    slotIds: input.slotIds,
    actor: "admin",
    at: new Date().toISOString(),
    reason: input.reason.trim() || "reset",
  });
  return { ok: true, audit: listMediaAudit(loaded.campaign.id)[0] ?? null };
}
