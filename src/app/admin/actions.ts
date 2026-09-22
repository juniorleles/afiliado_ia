"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createCampaign,
  deleteCampaign as deleteCampaignRecord,
  duplicateCampaign,
  getCampaignById,
  publishCampaign,
  unpublishCampaign,
  updateCampaign,
  SlugTakenError,
  type CampaignInput,
} from "@/lib/campaigns";
import { tryPublish } from "@/lib/publication";
import { validateSlug } from "@/lib/slug";
import { reconstructPageBody, applyPageEdits, parsePresellPage, serializePresellPage, SECTION_IDS } from "@/lib/presell-page";

export type FormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof CampaignInput, string>>;
  values?: CampaignInput;
};

export type PublishFormState = {
  error?: string;
  needsConfirmation?: boolean;
};

function readInput(formData: FormData): CampaignInput {
  const headScriptRaw = String(formData.get("headScript") ?? "").trim();
  const adHeadlineRaw = String(formData.get("adHeadline") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim();
  const subheadline = String(formData.get("subheadline") ?? "").trim();
  let body = String(formData.get("body") ?? "").trim();
  let pageComposition = String(formData.get("pageComposition") ?? "").trim() || null;
  const parsed = parsePresellPage(pageComposition);
  if (parsed) {
    const hasVisibility = SECTION_IDS.some((id) => formData.has(`sectionVisible_${id}`));
    const visibility: Partial<Record<(typeof SECTION_IDS)[number], boolean>> = {};
    if (hasVisibility) {
      for (const id of SECTION_IDS) visibility[id] = formData.get(`sectionVisible_${id}`) === "1";
    }
    const edited = applyPageEdits(parsed, {
      headline,
      subheadline,
      ctaLabel,
      visibility: hasVisibility ? visibility : undefined,
    });
    pageComposition = serializePresellPage(edited);
    body = reconstructPageBody(edited);
  }
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    headline,
    body,
    ctaLabel,
    affiliateUrl: String(formData.get("affiliateUrl") ?? "").trim(),
    headScript: headScriptRaw.length > 0 ? headScriptRaw : null,
    adHeadline: adHeadlineRaw.length > 0 ? adHeadlineRaw : null,
    pageTemplate: String(formData.get("pageTemplate") ?? "").trim() || null,
    pageComposition,
    productImageSrc: String(formData.get("productImageSrc") ?? "").trim() || null,
    productImageProvenance: String(formData.get("productImageProvenance") ?? "").trim() || null,
    subheadline: subheadline || null,
    sourceFactsJson: String(formData.get("sourceFactsJson") ?? "").trim() || null,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateInput(input: CampaignInput): FormState | null {
  const fieldErrors: FormState["fieldErrors"] = {};

  if (!input.name) fieldErrors.name = "Nome é obrigatório.";
  const slugError = validateSlug(input.slug);
  if (slugError) fieldErrors.slug = slugError;
  if (!input.headline) fieldErrors.headline = "Headline is required (English copy).";
  if (!input.body) fieldErrors.body = "Body is required (English copy).";
  if (!input.ctaLabel) fieldErrors.ctaLabel = "CTA label is required (English copy).";
  if (!input.affiliateUrl) {
    fieldErrors.affiliateUrl = "URL de afiliado é obrigatória.";
  } else if (!isHttpUrl(input.affiliateUrl)) {
    fieldErrors.affiliateUrl = "Use uma URL http(s) válida.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Corrija os campos abaixo antes de salvar.", fieldErrors, values: input };
  }
  return null;
}

export async function createCampaignAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const input = readInput(formData);
  const invalid = validateInput(input);
  if (invalid) return invalid;

  try {
    createCampaign(input);
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return {
        error: err.message,
        fieldErrors: { slug: err.message },
        values: input,
      };
    }
    throw err;
  }

  redirect("/admin");
}

export async function updateCampaignAction(
  id: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const input = readInput(formData);
  const invalid = validateInput(input);
  if (invalid) return invalid;

  const existing = getCampaignById(id);
  const wasPublished = existing?.publicationStatus === "published";

  try {
    updateCampaign(id, input);
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return {
        error: err.message,
        fieldErrors: { slug: err.message },
        values: input,
      };
    }
    throw err;
  }

  if (wasPublished) {
    redirect("/admin?notice=moved-to-draft");
  }
  redirect("/admin");
}

export async function deleteCampaignAction(id: number): Promise<void> {
  await requireAdmin();
  deleteCampaignRecord(id);
  redirect("/admin");
}

export async function duplicateCampaignAction(id: number): Promise<void> {
  await requireAdmin();
  const copy = duplicateCampaign(id);
  // Vai direto pra edição da cópia, não pra listagem — o usuário quase
  // sempre vai querer ajustar algo (headline, URL de afiliado) antes de
  // publicar, então poupa 1 clique. A cópia sempre nasce DRAFT.
  redirect(`/admin/${copy.id}/edit`);
}

export async function publishCampaignAction(
  id: number,
  _prev: PublishFormState,
  formData: FormData,
): Promise<PublishFormState> {
  await requireAdmin();
  const campaign = getCampaignById(id);
  if (!campaign) {
    return { error: "Campaign not found." };
  }

  const confirmWarnings = String(formData.get("confirmWarnings") ?? "") === "1";
  const verdict = tryPublish(campaign, confirmWarnings);
  if (!verdict.ok) {
    return { error: verdict.error, needsConfirmation: verdict.needsConfirmation };
  }

  publishCampaign(id);
  redirect("/admin?notice=published");
}

export async function unpublishCampaignAction(id: number): Promise<void> {
  await requireAdmin();
  unpublishCampaign(id);
  redirect("/admin?notice=unpublished");
}
