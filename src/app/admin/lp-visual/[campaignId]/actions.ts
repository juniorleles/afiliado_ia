"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { validateThemeTarget, validateThemeValue } from "@/lib/lp-builder/theme";
import { deleteThemeTokens, listThemeAudit, saveThemeToken, type ThemeAuditRow } from "@/lib/lp-builder/theme-store";

async function campaignOrError(campaignId: number) {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) return { ok: false as const, error: "Unknown campaign." };
  const campaign = getCampaignById(campaignId);
  if (!campaign) return { ok: false as const, error: "Unknown campaign." };
  return { ok: true as const, campaign };
}

export async function saveThemeTokenAction(input: {
  campaignId: number;
  scope: "theme" | "section" | "component";
  targetId: string;
  token: string;
  value: string;
}): Promise<{ ok: true; value: string; audit: ThemeAuditRow } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  const target = validateThemeTarget(input);
  if (!target.ok) return target;
  const validated = validateThemeValue(target.token, input.value);
  if (!validated.ok) return validated;
  saveThemeToken({
    campaignId: loaded.campaign.id,
    scope: input.scope,
    targetId: input.targetId,
    token: target.token,
    value: validated.value,
    actor: "admin",
    at: new Date().toISOString(),
  });
  const audit = listThemeAudit(loaded.campaign.id)[0];
  if (!audit) return { ok: false, error: "The theme edit was not recorded." };
  return { ok: true, value: validated.value, audit };
}

export async function resetThemeAction(input: {
  campaignId: number;
  scope?: "theme" | "section" | "component";
  targetId?: string;
}): Promise<{ ok: true; audit: ThemeAuditRow | null } | { ok: false; error: string }> {
  const loaded = await campaignOrError(input.campaignId);
  if (!loaded.ok) return loaded;
  if (input.scope && input.targetId) {
    const target = validateThemeTarget({ scope: input.scope, targetId: input.targetId, token: "colors.primary" });
    if (!target.ok && input.scope !== "theme") return { ok: false, error: "Broken theme reference." };
  }
  deleteThemeTokens({
    campaignId: loaded.campaign.id,
    scope: input.scope,
    targetId: input.targetId,
    actor: "admin",
    at: new Date().toISOString(),
  });
  return { ok: true, audit: listThemeAudit(loaded.campaign.id)[0] ?? null };
}
