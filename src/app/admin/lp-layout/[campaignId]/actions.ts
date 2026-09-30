"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { isLayoutKey, isLayoutSection, type LayoutAssignment } from "@/lib/lp-builder/layout";
import { deleteLayoutOverrides, listLayoutAudit, listLayoutOverrides, replaceLayoutOverrides, type LayoutAuditRow } from "@/lib/lp-builder/layout-store";

async function campaignOrError(campaignId: number) {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) return { ok: false as const, error: "Unknown campaign." };
  const campaign = getCampaignById(campaignId);
  if (!campaign) return { ok: false as const, error: "Unknown campaign." };
  return { ok: true as const, campaign };
}

function clean(assignments: LayoutAssignment[]): LayoutAssignment[] {
  return assignments.filter((row) => isLayoutKey(row.sectionKey) && isLayoutSection(row.sectionId)).map((row) => ({
    sectionKey: row.sectionKey,
    sectionId: row.sectionId,
    visible: Boolean(row.visible),
    collapsed: Boolean(row.collapsed),
    order: Number.isFinite(row.order) ? row.order : 0,
    priority: Number.isFinite(row.priority) ? row.priority : 0,
    pinned: Boolean(row.pinned),
    locked: Boolean(row.locked),
    futureCompatible: Boolean(row.futureCompatible),
    duplicate: Boolean(row.duplicate),
  }));
}

export async function saveLayoutAction(input: {
  campaignId: number;
  assignments: LayoutAssignment[];
}): Promise<{ ok: true; audit: LayoutAuditRow | null } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  const previous = listLayoutOverrides(loaded.campaign.id).map((row) => ({
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
    campaignId: loaded.campaign.id,
    previous,
    next: clean(input.assignments),
    actor: "admin",
    at: new Date().toISOString(),
  });
  return { ok: true, audit: listLayoutAudit(loaded.campaign.id)[0] ?? null };
}

export async function resetLayoutAction(input: {
  campaignId: number;
  sectionKey?: string;
}): Promise<{ ok: true; audit: LayoutAuditRow | null } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  if (input.sectionKey && !isLayoutKey(input.sectionKey)) return { ok: false, error: "Unknown section." };
  deleteLayoutOverrides({
    campaignId: loaded.campaign.id,
    sectionKey: input.sectionKey,
    actor: "admin",
    at: new Date().toISOString(),
  });
  return { ok: true, audit: listLayoutAudit(loaded.campaign.id)[0] ?? null };
}
