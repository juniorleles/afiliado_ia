import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceTabs } from "@/app/admin/[id]/edit/workspace-tabs";
import { MarketIntelligenceRun } from "@/components/campaign-wizard/market-intelligence-run";
import { LandingBlueprintPanel } from "@/components/campaign-wizard/landing-blueprint-panel";
import { LandingComposerPanel } from "@/components/campaign-wizard/landing-composer-panel";
import { GoogleAdsPackagePanel } from "@/components/campaign-wizard/google-ads-package-panel";
import { LandingQualityPanel } from "@/components/campaign-wizard/landing-quality-panel";
import { MarketPatterns } from "@/components/campaign-wizard/market-patterns";
import { StrategyDecisionPanel } from "@/components/campaign-wizard/strategy-decision-panel";
import { WizardSection } from "@/components/campaign-wizard/wizard-section";
import { PageTemplate } from "@/components/layout/page-template";
import { presentMarketResearch } from "@/lib/campaign-market";
import { getCampaignById } from "@/lib/campaigns";
import { CAMPAIGN_GOALS, COUNTRIES, LANGUAGES, MARKETPLACES, labelFor, readCampaignBrief } from "@/lib/campaign-brief";
import { readStoredMarketAnalysis } from "@/lib/market-intelligence/store";
import { readStoredMarketResearch } from "@/lib/market-research/store";
import { readStoredLandingBlueprint } from "@/lib/landing-blueprint/store";
import { readStoredLandingDocument } from "@/lib/landing-composer/store";
import { readStoredGoogleAdsPackage } from "@/lib/google-ads-generation/store";
import { readStoredAutoFixHistory, readStoredLandingQuality } from "@/lib/landing-quality/store";
import { readStoredGeneratedSections } from "@/lib/section-generation/store";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign ? `Inteligência de mercado · ${campaign.name}` : "Inteligência de mercado" };
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{value || "Não informado"}</dd>
    </div>
  );
}

export default async function CampaignResearchPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const brief = readCampaignBrief(id);
  const stored = readStoredMarketResearch(id);
  const initial = stored ? presentMarketResearch(campaign, brief, stored.report, stored.durationMs) : null;
  const query = await searchParams;
  const aba = query.aba === "padroes" ? "padroes" : query.aba === "decisao" ? "decisao" : query.aba === "blueprint" ? "blueprint" : query.aba === "composer" ? "composer" : query.aba === "qualidade" ? "qualidade" : query.aba === "anuncios" ? "anuncios" : "relatorio";

  return (
    <PageTemplate
      title="Inteligência de mercado"
      description="Relatório executivo e padrões calculados sobre a pesquisa já salva."
      primaryAction={null}
    >
      <div className="flex flex-col gap-ds-32">
        <WizardSection id="inteligencia-resumo" title="Resumo">
          <dl className="grid gap-ds-16 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryItem label="Produto" value={brief?.productName || "Não informado"} />
            <SummaryItem label="Marketplace" value={brief ? labelFor(MARKETPLACES, brief.marketplace) : "Não informado"} />
            <SummaryItem label="Idioma" value={brief ? labelFor(LANGUAGES, brief.language) : "Não informado"} />
            <SummaryItem label="País" value={brief ? labelFor(COUNTRIES, brief.country) : "Não informado"} />
            <SummaryItem label="Categoria" value={brief?.category || "Não informada"} />
            <SummaryItem label="Marca" value={brief?.brand || "Não informada"} />
            <SummaryItem label="Objetivo" value={brief ? labelFor(CAMPAIGN_GOALS, brief.goal) : "Não informado"} />
          </dl>
        </WizardSection>

        <WorkspaceTabs
          label="Inteligência de mercado"
          current={aba}
          labelledBy="inteligencia"
          items={[
            { id: "relatorio", href: `/admin/${campaign.id}/research`, label: "Relatório" },
            { id: "padroes", href: `/admin/${campaign.id}/research?aba=padroes`, label: "Padrões do Mercado" },
            { id: "decisao", href: `/admin/${campaign.id}/research?aba=decisao`, label: "Decisão da IA" },
            { id: "blueprint", href: `/admin/${campaign.id}/research?aba=blueprint`, label: "Blueprint" },
            { id: "composer", href: `/admin/${campaign.id}/research?aba=composer`, label: "Composer" },
            { id: "qualidade", href: `/admin/${campaign.id}/research?aba=qualidade`, label: "Qualidade" },
            { id: "anuncios", href: `/admin/${campaign.id}/research?aba=anuncios`, label: "Google Ads" },
          ]}
        />
        <div id="workspace-panel" role="tabpanel" aria-labelledby={`inteligencia-${aba}`}>
          {aba === "anuncios" ? (
            <GoogleAdsPackagePanel bundle={readStoredGoogleAdsPackage(id)} />
          ) : aba === "qualidade" ? (
            <LandingQualityPanel quality={readStoredLandingQuality(id)} history={readStoredAutoFixHistory(id)} />
          ) : aba === "composer" ? (
            <LandingComposerPanel document={readStoredLandingDocument(id)} />
          ) : aba === "blueprint" ? (
            <LandingBlueprintPanel blueprint={readStoredLandingBlueprint(id)} generated={readStoredGeneratedSections(id)} />
          ) : aba === "decisao" ? (
            <StrategyDecisionPanel decision={readStoredStrategyDecision(id)} />
          ) : aba === "padroes" ? (
            <MarketPatterns analysis={readStoredMarketAnalysis(id)} />
          ) : (
            <MarketIntelligenceRun
              campaignId={campaign.id}
              backHref={`/admin/${campaign.id}/fatos`}
              strategyHref={`/admin/${campaign.id}/estrategia`}
              initial={initial}
            />
          )}
        </div>
      </div>
    </PageTemplate>
  );
}
