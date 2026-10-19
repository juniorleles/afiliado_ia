"use server";

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { factsForMarketResearch, presentMarketResearch, recommendFromResearch, type MarketResearchScreen } from "@/lib/campaign-market";
import { analyzeMarketIntelligence } from "@/lib/market-intelligence/analyze";
import { writeStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import { refreshLandingBlueprint } from "@/lib/landing-blueprint/refresh";
import { refreshLandingDocument } from "@/lib/landing-composer/refresh";
import { refreshGoogleAdsPackage } from "@/lib/google-ads-generation/refresh";
import { refreshLandingQuality } from "@/lib/landing-quality/refresh";
import { refreshGeneratedSections } from "@/lib/section-generation/refresh";
import { refreshStrategyDecision } from "@/lib/strategy-decision/refresh";
import { getCampaignById } from "@/lib/campaigns";
import { MAX_MARKET_SEARCH_QUERIES, runMarketResearch } from "@/lib/market-research/research";
import { flattenMarketQueries } from "@/lib/market-research/queries";
import { beginMarketRun, finishMarketRun, marketRunIsActive, noteMarketDetail, noteMarketQuery, readMarketRun, type MarketRunProgress } from "@/lib/market-research/run-progress";
import { readStoredMarketResearch, writeStoredMarketResearch } from "@/lib/market-research/store";
import { enrichMarketResearch } from "@/lib/market-research/page-enrichment";
import { rateLimit } from "@/lib/rate-limit";

export type MarketRunSnapshot = MarketRunProgress & { elapsedMs: number };

export async function readCampaignMarketResearchProgress(campaignId: number): Promise<MarketRunSnapshot | null> {
  await requireAdmin();
  return readMarketRun(campaignId);
}

export async function runCampaignMarketResearch(campaignId: number): Promise<{ ok: true; screen: MarketResearchScreen } | { ok: false; message: string }> {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) notFound();
  const campaign = getCampaignById(campaignId);
  if (!campaign) notFound();
  if (marketRunIsActive(campaignId)) {
    return { ok: false, message: "A pesquisa já está em andamento." };
  }
  const limited = rateLimit("market-research", 8, 60_000);
  if (!limited.ok) return { ok: false, message: "Muitas pesquisas em seguida. Espere um momento e tente novamente." };

  const brief = readCampaignBrief(campaignId);
  const facts = factsForMarketResearch(campaign, brief);
  const started = Date.now();
  beginMarketRun(campaignId, flattenMarketQueries(facts, MAX_MARKET_SEARCH_QUERIES).length);
  try {
    const previous = readStoredMarketResearch(campaignId);
    const report = await runMarketResearch({
      facts,
      onProgress: (event) => {
        noteMarketQuery(campaignId, {
          query: event.query,
          provider: event.provider,
          resultCount: event.resultCount,
          queryDurationMs: event.durationMs,
        });
      },
    });
    const enriched = await enrichMarketResearch(report, {
      previous: previous?.report ?? null,
      onPage: (info) => noteMarketDetail(campaignId, `Lendo ${info.domain}`),
    });
    const durationMs = Date.now() - started;
    writeStoredMarketResearch(campaignId, enriched, durationMs);
    writeStoredMarketAnalysis(campaignId, analyzeMarketIntelligence(enriched, recommendFromResearch(facts, enriched)));
    refreshStrategyDecision(campaignId);
    refreshLandingBlueprint(campaignId);
    refreshGeneratedSections(campaignId);
    refreshLandingDocument(campaignId);
    refreshLandingQuality(campaignId);
    refreshGoogleAdsPackage(campaignId);
    finishMarketRun(campaignId, "done");
    return { ok: true, screen: presentMarketResearch(campaign, brief, enriched, durationMs) };
  } catch (err) {
    const message = err instanceof Error && err.message.trim() ? err.message : "A pesquisa de mercado não foi concluída.";
    finishMarketRun(campaignId, "error", message);
    return { ok: false, message };
  }
}
