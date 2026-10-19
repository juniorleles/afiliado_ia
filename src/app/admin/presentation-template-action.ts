"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById, setCampaignPresentationTemplate } from "@/lib/campaigns";

export async function setPresentationTemplateAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("campaignId"));
  if (!Number.isInteger(id) || id < 1) return;
  const campaign = getCampaignById(id);
  if (!campaign) return;
  const requested = String(formData.get("presentationTemplate") ?? "");
  const updated = setCampaignPresentationTemplate(id, requested === "PRODUCT_SHOWCASE_PREMIUM_V1" ? requested : null);
  revalidatePath(`/admin/preview/${updated.slug}`);
  revalidatePath(`/admin/lp-builder/${updated.id}`);
  revalidatePath(`/p/${updated.slug}`);
}
