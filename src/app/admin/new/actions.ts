"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createCampaignDraftFromBrief,
  parseCampaignBriefForm,
  type CampaignBriefDraft,
  type CampaignBriefField,
} from "@/lib/campaign-brief";

export type WizardFormState = {
  error?: string;
  fieldErrors?: Partial<Record<CampaignBriefField, string>>;
  values?: CampaignBriefDraft;
};

export async function startCampaignWizardAction(_prev: WizardFormState, formData: FormData): Promise<WizardFormState> {
  await requireAdmin();
  const parsed = parseCampaignBriefForm(formData);
  if (!parsed.brief) {
    return {
      error: "Complete os dados que faltam antes de continuar.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.draft,
    };
  }

  const campaign = createCampaignDraftFromBrief(parsed.draft.name, parsed.brief);
  redirect(`/admin/${campaign.id}/fatos`);
}
