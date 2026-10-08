"use server";

import { redirect } from "next/navigation";
import { getCampaignById } from "@/lib/campaigns";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { readGoogleAdsAccounts } from "@/lib/integrations/google-ads-oauth/store";
import { validateSafePlan } from "@/lib/integrations/google-ads-publish/plan";
import { publishPausedSearchCampaign } from "@/lib/integrations/google-ads-publish/publish";

export async function publishSafeCampaignAction(campaignId: number, formData: FormData): Promise<void> {
  const page = `/admin/${campaignId}/google-ads`;
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(page)}`);
  const campaign = getCampaignById(campaignId);
  if (!campaign) redirect("/admin");
  const customerId = String(formData.get("customerId") ?? "");
  const account = readGoogleAdsAccounts().find((item) => item.customerId === customerId && item.selected) ?? null;
  const budget = Number(String(formData.get("budget") ?? ""));
  const languageId = String(formData.get("language") ?? "");
  const countryId = String(formData.get("country") ?? "");
  const bidding = String(formData.get("bidding") ?? "");
  const searchPartners = formData.get("partners") === "on";
  const validated = validateSafePlan({ campaign, account, budget, languageId, countryId, searchPartners, bidding });
  const query = new URLSearchParams({
    orcamento: String(formData.get("budget") ?? ""),
    idioma: languageId,
    pais: countryId,
    lance: bidding,
    parceiros: searchPartners ? "1" : "0",
  });
  if (!validated.plan) {
    query.set("aviso", "bloqueado");
    redirect(`${page}?${query.toString()}`);
  }
  const published = await publishPausedSearchCampaign(validated.plan);
  query.set("aviso", published.ok ? "pausada" : "recusada");
  redirect(`${page}?${query.toString()}`);
}
