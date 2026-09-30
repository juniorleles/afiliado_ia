"use server";

import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import {
  OVERRIDE_FIELDS,
  isOverrideField,
  resetAllManualOverrides,
  resetManualOverride,
  resetManualOverrides,
  saveManualOverride,
  validateOverrideValue,
  type OverrideField,
} from "@/lib/manual-overrides";
import { isPresentationField, prepareOverrideForSave } from "@/lib/editor-layers";
import { recordManualEdit, recordResetToImporter, restoreRevision } from "@/lib/evidence-manager";
import { resetPresentationField, savePresentationField } from "@/lib/presentation-overrides";

function editorPath(campaignId: number, query = ""): string {
  return `/admin/product-editor/${campaignId}${query}`;
}

function requireCampaign(campaignId: number) {
  if (!Number.isInteger(campaignId) || campaignId < 1) notFound();
  const campaign = getCampaignById(campaignId);
  if (!campaign) notFound();
  return campaign;
}

export async function saveManualOverrideAction(formData: FormData): Promise<EditorStayResult> {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  requireCampaign(campaignId);
  const field = String(formData.get("field") ?? "");
  if (!isOverrideField(field)) return failed(formData, campaignId, "Unknown field");
  const raw = String(formData.get("value") ?? "");
  let parsed: unknown = raw;
  if (field !== "productName" && field !== "manufacturer" && field !== "description" && field !== "cta" && field !== "trackingUrl") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return failed(formData, campaignId, "Could not read this field");
    }
  }
  const prepared = prepareOverrideForSave(field, parsed);
  if (!prepared.ok) return failed(formData, campaignId, prepared.message);
  const value = validateOverrideValue(field, prepared.value);
  if (value === null) return failed(formData, campaignId, "This field could not be saved");
  saveManualOverride(campaignId, field, value);
  recordManualEdit({
    campaignId,
    field,
    value,
    reason: reasonFrom(formData),
  });
  return saved(formData, campaignId, field);
}

export async function resetManualOverrideAction(formData: FormData) {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  requireCampaign(campaignId);
  const field = String(formData.get("field") ?? "");
  if (!isOverrideField(field)) {
    redirect(editorPath(campaignId, "?error=Unknown+field"));
  }
  resetManualOverride(campaignId, field);
  const campaign = requireCampaign(campaignId);
  recordResetToImporter({
    campaignId,
    field,
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    reason: reasonFrom(formData),
  });
  redirect(editorPath(campaignId, `?reset=${field}`));
}

const SECTION_FIELDS: Record<string, OverrideField[]> = {
  identity: ["productName", "manufacturer", "description"],
  ingredients: ["ingredients"],
  features: ["features"],
  faq: ["faq"],
  usage: ["usage"],
  guarantee: ["guarantee"],
  warnings: ["warnings"],
  pricing: ["pricing"],
  offer: ["cta", "trackingUrl"],
};

export async function resetManualSectionAction(formData: FormData) {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  requireCampaign(campaignId);
  const section = String(formData.get("section") ?? "");
  const fields = SECTION_FIELDS[section];
  if (!fields) redirect(editorPath(campaignId, "?error=Unknown+section"));
  const campaign = requireCampaign(campaignId);
  resetManualOverrides(campaignId, fields);
  for (const field of fields) {
    recordResetToImporter({
      campaignId,
      field,
      sourceFactsJson: campaign.sourceFactsJson ?? null,
      affiliateUrl: campaign.affiliateUrl,
      ctaLabel: campaign.ctaLabel,
      reason: reasonFrom(formData),
    });
  }
  redirect(editorPath(campaignId, `?reset=${section}`));
}

export async function resetAllManualOverridesAction(formData: FormData) {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  const campaign = requireCampaign(campaignId);
  resetAllManualOverrides(campaignId);
  for (const field of OVERRIDE_FIELDS) {
    recordResetToImporter({
      campaignId,
      field,
      sourceFactsJson: campaign.sourceFactsJson ?? null,
      affiliateUrl: campaign.affiliateUrl,
      ctaLabel: campaign.ctaLabel,
      reason: reasonFrom(formData),
    });
  }
  redirect(editorPath(campaignId, "?reset=all"));
}

export async function restoreRevisionAction(formData: FormData) {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  const campaign = requireCampaign(campaignId);
  const field = String(formData.get("field") ?? "");
  const revision = Number(formData.get("revision"));
  if (!isOverrideField(field) || !Number.isInteger(revision) || revision < 1) {
    redirect(editorPath(campaignId, "?error=Unknown+revision"));
  }
  restoreRevision({
    campaignId,
    field,
    revision,
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    affiliateUrl: campaign.affiliateUrl,
    ctaLabel: campaign.ctaLabel,
    reason: reasonFrom(formData),
  });
  redirect(editorPath(campaignId, `?saved=${field}`));
}

function reasonFrom(formData: FormData): string | null {
  const reason = String(formData.get("reason") ?? "").trim();
  return reason || null;
}

export type EditorStayResult = { ok: true; notice: string } | { ok: false; error: string };

function stayRequested(formData: FormData): boolean {
  return formData.get("stay") === "1";
}

function saved(formData: FormData, campaignId: number, notice: string): EditorStayResult {
  if (stayRequested(formData)) return { ok: true, notice };
  redirect(editorPath(campaignId, `?saved=${encodeURIComponent(notice)}`));
}

function failed(formData: FormData, campaignId: number, error: string): EditorStayResult {
  if (stayRequested(formData)) return { ok: false, error };
  redirect(editorPath(campaignId, `?error=${encodeURIComponent(error)}`));
}

export async function savePresentationAction(formData: FormData): Promise<EditorStayResult> {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  requireCampaign(campaignId);
  const field = String(formData.get("field") ?? "");
  if (!isPresentationField(field)) return failed(formData, campaignId, "Unknown field");
  const result = savePresentationField({
    campaignId,
    field,
    raw: String(formData.get("value") ?? ""),
    section: String(formData.get("section") ?? field),
  });
  if (!result.ok) return failed(formData, campaignId, result.message);
  return saved(formData, campaignId, field);
}

export async function resetPresentationAction(formData: FormData) {
  await requireAdmin();
  const campaignId = Number(formData.get("campaignId"));
  requireCampaign(campaignId);
  const field = String(formData.get("field") ?? "");
  if (!isPresentationField(field)) redirect(editorPath(campaignId, "?error=Unknown+field"));
  resetPresentationField(campaignId, field, String(formData.get("section") ?? field));
  redirect(editorPath(campaignId, `?reset=${encodeURIComponent(field)}`));
}
