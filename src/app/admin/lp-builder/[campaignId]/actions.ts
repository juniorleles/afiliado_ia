"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { validateContentChange } from "@/lib/lp-builder/content";
import { listBuilderAudit, resetBuilderOverride, saveBuilderOverride, type BuilderAuditRow } from "@/lib/lp-builder/store";
import { builderEditorState } from "@/lib/lp-content-render";

export type BuilderActionResult = { ok: false; error: string } | { ok: true; value: string; audit: BuilderAuditRow };

async function campaignOrError(campaignId: number) {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) return { ok: false as const, error: "Unknown campaign." };
  const campaign = getCampaignById(campaignId);
  if (!campaign) return { ok: false as const, error: "Unknown campaign." };
  return { ok: true as const, campaign };
}

export async function saveBuilderFieldAction(input: {
  campaignId: number;
  fieldId: string;
  value: string;
}): Promise<BuilderActionResult> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  const { fields } = builderEditorState(loaded.campaign);
  const field = fields.find((item) => item.id === input.fieldId);
  if (!field) return { ok: false, error: "Unknown field." };
  const validated = validateContentChange(fields, field.id, input.value);
  if (!validated.ok) return validated;
  saveBuilderOverride({
    campaignId: loaded.campaign.id,
    fieldId: field.id,
    sectionId: field.section,
    value: validated.value,
    previousValue: field.override ?? field.generated,
    actor: "admin",
    at: new Date().toISOString(),
  });
  const audit = listBuilderAudit(loaded.campaign.id)[0];
  if (!audit) return { ok: false, error: "The edit was not recorded." };
  return { ok: true, value: validated.value, audit };
}

export async function resetBuilderFieldAction(input: {
  campaignId: number;
  fieldId: string;
}): Promise<{ ok: true; audit: BuilderAuditRow | null } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  const { fields } = builderEditorState(loaded.campaign);
  const field = fields.find((item) => item.id === input.fieldId);
  if (!field) return { ok: false, error: "Unknown field." };
  if (!field.modified) return { ok: true, audit: null };
  resetBuilderOverride({
    campaignId: loaded.campaign.id,
    fieldId: field.id,
    actor: "admin",
    at: new Date().toISOString(),
  });
  return { ok: true, audit: listBuilderAudit(loaded.campaign.id)[0] ?? null };
}
