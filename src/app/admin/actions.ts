"use server";

import { redirect } from "next/navigation";
import {
  createCampaign,
  deleteCampaign as deleteCampaignRecord,
  updateCampaign,
  SlugTakenError,
  type CampaignInput,
} from "@/lib/campaigns";
import { validateSlug } from "@/lib/slug";

export type FormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof CampaignInput, string>>;
  values?: CampaignInput;
};

function readInput(formData: FormData): CampaignInput {
  return {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    headline: String(formData.get("headline") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    ctaLabel: String(formData.get("ctaLabel") ?? "").trim(),
    affiliateUrl: String(formData.get("affiliateUrl") ?? "").trim(),
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
  const input = readInput(formData);
  const invalid = validateInput(input);
  if (invalid) return invalid;

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

  redirect("/admin");
}

export async function deleteCampaignAction(id: number): Promise<void> {
  deleteCampaignRecord(id);
  redirect("/admin");
}
