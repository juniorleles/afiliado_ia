"use server";

import { notFound, redirect } from "next/navigation";
import { generateVariantsAction } from "@/app/admin/generate/actions";
import { requireAdmin } from "@/lib/admin-auth";
import { ANTHROPIC_MODEL } from "@/lib/ai/generate-variants";
import { LANGUAGES, labelFor, readCampaignBrief } from "@/lib/campaign-brief";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import { decisionShell } from "@/lib/strategy-decision/decide";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";
import { getCampaignById, updateCampaign, type Campaign } from "@/lib/campaigns";
import { recordLandingGeneration } from "@/lib/landing-generation-history";
import { listManualOverrides, parseCampaignFacts, resolveProductFacts } from "@/lib/manual-overrides";
import { composePresellPage, reconstructPageBody, serializePresellPage, type PageTemplateId } from "@/lib/presell-page";

function strategyPage(id: number, error: string): string {
  return `/admin/${id}/estrategia?erro=${error}`;
}

function templateFor(approach: string): PageTemplateId {
  if (approach === "BUYER_GUIDE") return "BUYER_GUIDE";
  if (approach === "EDUCATIONAL") return "EDITORIAL";
  return "REVIEW";
}

export type LandingGenerationRunResult =
  | { ok: true; landingId: number }
  | { ok: false; code: "bloqueada" | "geracao" | "publicada"; message: string };

const FAILURE_MESSAGE = "A landing page não foi gerada. Nada foi salvo.";

function generationFailure(error?: string): Extract<LandingGenerationRunResult, { ok: false }> {
  if (error === "Too many generation requests.") {
    return { ok: false, code: "geracao", message: "Muitas gerações em seguida. Espere um momento e tente novamente." };
  }
  return { ok: false, code: "geracao", message: error?.trim() || FAILURE_MESSAGE };
}

function generationContext(campaign: Campaign) {
  const brief = readCampaignBrief(campaign.id);
  return {
    brief,
    strategy: readStoredStrategyDecision(campaign.id)?.recommendedApproach ?? "Não disponível",
    language: brief ? labelFor(LANGUAGES, brief.language) : "Não informado",
  };
}

function modelUsed(variant: { generationRoute?: string; generationMethod?: string; anthropicCalls?: number } | undefined): string {
  if (!variant) return "Não utilizado";
  const route = variant.generationRoute ?? variant.generationMethod;
  if (route === "MODEL" || (variant.anthropicCalls ?? 0) > 0) return ANTHROPIC_MODEL;
  if (route === "DETERMINISTIC_THIN") return "Determinístico";
  return "Não informado";
}

export async function runCampaignLandingGeneration(campaignId: number): Promise<LandingGenerationRunResult> {
  await requireAdmin();
  if (!Number.isInteger(campaignId) || campaignId < 1) notFound();
  const campaign = getCampaignById(campaignId);
  if (!campaign) notFound();
  const started = Date.now();
  const context = generationContext(campaign);
  const remember = (result: "success" | "error", error: string | null, model: string) => {
    recordLandingGeneration({
      campaignId,
      createdAt: new Date().toISOString(),
      strategy: context.strategy,
      language: context.language,
      model,
      durationMs: Date.now() - started,
      result,
      error,
    });
  };
  if (campaign.publicationStatus === "published") {
    const message = "Uma campanha publicada não recebe uma landing page por este caminho.";
    remember("error", message, "Não utilizado");
    return { ok: false, code: "publicada", message };
  }

  const facts = resolveProductFacts(
    parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
    listManualOverrides(campaignId),
  );
  if (!facts.productName.trim()) facts.productName = context.brief?.productName?.trim() || campaign.name;

  const storedResearch = readStoredMarketResearch(campaignId);
  const decision = readStoredStrategyDecision(campaignId);
  if (!decision) {
    const failure = generationFailure("Não há uma decisão de estratégia salva. Salve os fatos ou conclua uma pesquisa antes de gerar.");
    remember("error", failure.message, "Não utilizado");
    return failure;
  }
  let generated;
  try {
    generated = await generateVariantsAction({
      productName: facts.productName,
      sourceUrl: facts.sourceUrl || undefined,
      facts,
      affiliateUrl: campaign.affiliateUrl,
      targetApproach: decisionShell(decision.approachId),
      strategyDecision: decision,
      marketResearch: storedResearch?.report,
    });
  } catch (err) {
    const failure = generationFailure(err instanceof Error ? err.message : undefined);
    remember("error", failure.message, "Não utilizado");
    return failure;
  }
  if (!generated.ok) {
    const failure = generationFailure(generated.error);
    remember("error", failure.message, "Não utilizado");
    return failure;
  }

  const variant = generated.variants[0];
  const model = modelUsed(variant);
  if (!variant || variant.finalGate === "BLOCKED") {
    const message = "A IA não possui informações suficientes para gerar uma Landing Page confiável. Complete os Fatos do Produto antes de continuar.";
    remember("error", message, model);
    return {
      ok: false,
      code: "bloqueada",
      message,
    };
  }

  const page = composePresellPage({
    variant,
    facts,
    template: templateFor(variant.approach),
  });
  const headline = page.hero.headline.trim();
  const body = reconstructPageBody(page).trim();
  const ctaLabel = page.ctaLabel.trim();
  if (!headline || !body || !ctaLabel) {
    const failure = generationFailure();
    remember("error", failure.message, model);
    return failure;
  }

  updateCampaign(campaignId, {
    name: campaign.name,
    slug: campaign.slug,
    headline,
    body,
    ctaLabel,
    affiliateUrl: campaign.affiliateUrl,
    headScript: campaign.headScript ?? null,
    adHeadline: campaign.adHeadline ?? null,
    pageTemplate: page.template,
    pageComposition: serializePresellPage(page),
    productImageSrc: page.hero.image.src || null,
    productImageProvenance: page.hero.image.provenance,
    subheadline: page.hero.subheadline,
    sourceFactsJson: campaign.sourceFactsJson ?? null,
    designPlanJson: campaign.designPlanJson,
    visualTheme: campaign.visualTheme,
    designVersion: campaign.designVersion,
  });

  remember("success", null, model);
  return { ok: true, landingId: campaignId };
}

export async function generateCampaignLandingAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("campaignId"));
  const result = await runCampaignLandingGeneration(id);
  if (!result.ok) {
    if (result.code === "bloqueada") redirect(`/admin/${id}/bloqueada`);
    redirect(strategyPage(id, result.code === "publicada" ? "publicada" : "geracao"));
  }
  redirect(`/admin/landing-pages?selecionada=${result.landingId}`);
}
