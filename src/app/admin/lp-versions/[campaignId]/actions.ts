"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import {
  captureOverrideSnapshot,
  createPageVersion,
  listPageVersions,
  publishSnapshot,
  resetWorkingOverrides,
  restoreCurrentVersion,
  restorePreviousVersion,
  rollbackToVersion,
  setVersionAutosave,
  versionAutosaveEnabled,
  type PageVersion,
} from "@/lib/lp-builder/version-store";

export type VersionView = {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  comment: string;
  parentId: string | null;
  status: PageVersion["status"];
  action: string;
  affectedSections: string[];
  overrideCount: number;
  snapshot: PageVersion["snapshot"];
  changes: PageVersion["changes"];
};

function view(version: PageVersion): VersionView {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    comment: version.comment,
    parentId: version.parentId,
    status: version.status,
    action: version.action,
    affectedSections: version.affectedSections,
    overrideCount: version.overrideCount,
    snapshot: version.snapshot,
    changes: version.changes,
  };
}

async function ready(campaignId: number) {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) return { ok: false as const, error: "Unknown campaign." };
  const campaign = getCampaignById(campaignId);
  if (!campaign) return { ok: false as const, error: "Unknown campaign." };
  return { ok: true as const, campaign };
}

function payload(campaignId: number) {
  return {
    ok: true as const,
    versions: listPageVersions(campaignId).map(view),
    autosave: versionAutosaveEnabled(campaignId),
  };
}

export async function saveVersionAction(input: { campaignId: number; comment: string }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  const saved = createPageVersion({
    campaignId: loaded.campaign.id,
    snapshot: captureOverrideSnapshot(loaded.campaign.id),
    comment: input.comment.trim() || "Saved version",
    actor: "admin",
    at: new Date().toISOString(),
    action: "save",
    status: "current",
  });
  if (!saved.ok) return saved;
  return payload(loaded.campaign.id);
}

export async function autosaveVersionAction(input: { campaignId: number }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  if (!versionAutosaveEnabled(loaded.campaign.id)) return payload(loaded.campaign.id);
  const saved = createPageVersion({
    campaignId: loaded.campaign.id,
    snapshot: captureOverrideSnapshot(loaded.campaign.id),
    comment: "Autosave",
    actor: "admin",
    at: new Date().toISOString(),
    action: "autosave",
    status: "current",
    skipIfUnchanged: true,
  });
  if (!saved.ok) return saved;
  return payload(loaded.campaign.id);
}

export async function restoreVersionAction(input: { campaignId: number; versionId: string }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  const restored = rollbackToVersion({
    campaignId: loaded.campaign.id,
    versionId: input.versionId,
    actor: "admin",
    at: new Date().toISOString(),
  });
  if (!restored.ok) return restored;
  return payload(loaded.campaign.id);
}

export async function restoreCurrentAction(input: { campaignId: number }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  const restored = restoreCurrentVersion({ campaignId: loaded.campaign.id, actor: "admin", at: new Date().toISOString() });
  if (!restored.ok) return restored;
  return payload(loaded.campaign.id);
}

export async function restorePreviousAction(input: { campaignId: number }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  const restored = restorePreviousVersion({ campaignId: loaded.campaign.id, actor: "admin", at: new Date().toISOString() });
  if (!restored.ok) return restored;
  return payload(loaded.campaign.id);
}

export async function publishVersionAction(input: { campaignId: number; comment: string }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  const published = publishSnapshot({
    campaignId: loaded.campaign.id,
    actor: "admin",
    at: new Date().toISOString(),
    comment: input.comment.trim(),
  });
  if (!published.ok) return published;
  return payload(loaded.campaign.id);
}

export async function resetWorkingAction(input: { campaignId: number }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  const reset = resetWorkingOverrides({ campaignId: loaded.campaign.id, actor: "admin", at: new Date().toISOString() });
  if (!reset.ok) return reset;
  return payload(loaded.campaign.id);
}

export async function setAutosaveAction(input: { campaignId: number; enabled: boolean }): Promise<
  { ok: true; versions: VersionView[]; autosave: boolean } | { ok: false; error: string }
> {
  const loaded = await ready(input.campaignId);
  if (!loaded.ok) return loaded;
  setVersionAutosave(loaded.campaign.id, input.enabled);
  return payload(loaded.campaign.id);
}
