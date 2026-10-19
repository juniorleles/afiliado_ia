"use server";

import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { knowledgeChecks, knowledgePercent, parseKnowledgeForm, readKnowledgeText, saveProductKnowledge } from "@/lib/product-knowledge";
import { refreshLandingBlueprint } from "@/lib/landing-blueprint/refresh";
import { refreshLandingDocument } from "@/lib/landing-composer/refresh";
import { refreshGoogleAdsPackage } from "@/lib/google-ads-generation/refresh";
import { refreshLandingQuality } from "@/lib/landing-quality/refresh";
import { refreshGeneratedSections } from "@/lib/section-generation/refresh";
import { refreshStrategyDecision } from "@/lib/strategy-decision/refresh";

function page(id: number, query = ""): string {
  return `/admin/${id}/fatos${query}`;
}

export async function saveProductFactsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("campaignId"));
  if (!Number.isInteger(id) || id < 1 || !getCampaignById(id)) notFound();
  const parsed = parseKnowledgeForm(formData);
  if ("error" in parsed) {
    const retorno = formData.get("retorno") === "estrategia" ? "&retorno=estrategia" : "";
    redirect(page(id, `?erro=${parsed.error}${retorno}`));
  }
  saveProductKnowledge(id, parsed.text);
  refreshStrategyDecision(id);
  refreshLandingBlueprint(id);
  refreshGeneratedSections(id);
  refreshLandingDocument(id);
  refreshLandingQuality(id);
  refreshGoogleAdsPackage(id);
  const backToStrategy = formData.get("retorno") === "estrategia";
  if (formData.get("intent") === "research" && !backToStrategy) redirect(`/admin/${id}/research`);
  if (backToStrategy) {
    const saved = getCampaignById(id);
    if (!saved) notFound();
    const checks = knowledgeChecks(readKnowledgeText(saved, readCampaignBrief(id)).text);
    if (knowledgePercent(checks) === 100) redirect(`/admin/${id}/estrategia`);
    redirect(page(id, "?retorno=estrategia&aviso=incompleto"));
  }
  redirect(page(id, "?aviso=salvo"));
}
