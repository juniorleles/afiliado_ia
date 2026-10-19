"use server";

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById } from "@/lib/campaigns";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";

async function campaignOrNotFound(campaignId: number) {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) notFound();
  const campaign = getCampaignById(campaignId);
  if (!campaign) notFound();
  return campaign;
}

export async function loadProductFactsForGeneration(campaignId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const campaign = await campaignOrNotFound(campaignId);
  if (campaign.publicationStatus === "published") {
    return { ok: false, message: "Uma campanha publicada não recebe uma landing page por este caminho." };
  }
  const brief = readCampaignBrief(campaignId);
  const facts = resolveProductFacts(
    parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
    listManualOverrides(campaignId),
  );
  if (!facts.productName.trim()) facts.productName = brief?.productName?.trim() || campaign.name;
  return { ok: true };
}

export async function loadMarketIntelligenceForGeneration(campaignId: number): Promise<{ ok: true }> {
  const campaign = await campaignOrNotFound(campaignId);
  readStoredMarketResearch(campaign.id);
  return { ok: true };
}

export async function loadStrategyForGeneration(campaignId: number): Promise<{ ok: true }> {
  const campaign = await campaignOrNotFound(campaignId);
  readStoredStrategyDecision(campaign.id);
  return { ok: true };
}
