import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GoogleAdsPublishPage from "@/app/admin/[id]/google-ads/page";
import LintPage from "@/app/admin/[id]/lint/page";
import { GenerationHistory } from "@/app/admin/landing-pages/[id]/generation-history";
import { LandingSummary } from "@/app/admin/landing-pages/[id]/landing-summary";
import { LANDING_VERSION_LABEL, LandingVersionBar } from "@/app/admin/landing-pages/[id]/landing-version-bar";
import LandingPageBuilderPage from "@/app/admin/lp-builder/[campaignId]/page";
import MediaManagerPage from "@/app/admin/lp-media/[campaignId]/page";
import VersionHistoryPage from "@/app/admin/lp-versions/[campaignId]/page";
import PreviewPage from "@/app/admin/preview/[slug]/page";
import { WorkspaceTabs } from "@/app/admin/[id]/edit/workspace-tabs";
import { PageTemplate } from "@/components/layout/page-template";
import { readCampaignBrief, LANGUAGES, labelFor } from "@/lib/campaign-brief";
import { getCampaignById } from "@/lib/campaigns";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";
import { analyzeImportCompleteness } from "@/lib/completeness-engine";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { campaignHasLanding, landingTitle } from "@/lib/landing-catalog";
import { listLandingGenerations } from "@/lib/landing-generation-history";
import { readGoogleAdsPublication } from "@/lib/integrations/google-ads-publish/store";
import { parseCampaignFacts, withResolvedCampaign } from "@/lib/manual-overrides";
import { lintCampaign } from "@/lib/policy-linter";

type TabId = "previa" | "builder" | "seo" | "assets" | "validacao" | "google-ads" | "historico";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "previa", label: "Prévia" },
  { id: "builder", label: "Builder" },
  { id: "seo", label: "SEO" },
  { id: "assets", label: "Assets" },
  { id: "validacao", label: "Validação" },
  { id: "google-ads", label: "Google Ads" },
  { id: "historico", label: "Histórico" },
];

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function tabFrom(query: Record<string, string | string[] | undefined>): TabId {
  const raw = Array.isArray(query.aba) ? query.aba[0] : query.aba;
  if (raw === "midia") return "assets";
  if (TABS.some((tab) => tab.id === raw)) return raw as TabId;
  if (query.orcamento || query.aviso || query.idioma || query.pais || query.lance || query.parceiros) return "google-ads";
  return "previa";
}

function policyLabel(gate: "READY" | "REVIEW_REQUIRED" | "BLOCKED") {
  if (gate === "READY") return "Pronta";
  if (gate === "BLOCKED") return "Bloqueada";
  return "Em revisão";
}

function formatGenerated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign && campaignHasLanding(campaign) ? landingTitle(campaign) : "Landing page" };
}

export default async function LandingPageScreen({ params, searchParams }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign || !campaignHasLanding(campaign)) notFound();
  const query = await searchParams;
  const current = tabFrom(query);
  const brief = readCampaignBrief(campaign.id);
  const facts = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
  const language = brief ? labelFor(LANGUAGES, brief.language) : "Não informado";
  const published = campaign.publicationStatus === "published";
  const lint = lintCampaign(withResolvedCampaign(campaign));
  const completeness = analyzeImportCompleteness({
    facts,
    headline: campaign.headline,
    imageUrl: campaign.productImageSrc || facts.productImageUrl,
    imageProvenance: campaign.productImageProvenance || facts.productImageProvenance,
    visualAssetCount: campaign.productAssetStatus === "READY" ? 1 : 0,
  });
  const score = Math.max(0, Math.min(100, Math.round(completeness.score)));
  const connected = readIntegrationConfiguration().googleAds === "Connected";
  const adsPublication = readGoogleAdsPublication(campaign.id);
  const googleAds = adsPublication ? "Pausada" : connected ? "Não enviada" : "Não conectado";
  const strategy = readStoredStrategyDecision(campaign.id)?.recommendedApproach ?? "Não disponível";
  const campaignId = String(campaign.id);
  const embedded = Promise.resolve({ embedded: "studio" });
  const toolParams = Promise.resolve({ campaignId, id: campaignId });

  return (
    <PageTemplate
      title={landingTitle(campaign)}
      description={campaign.name}
      primaryAction={null}
    >
      <div className="flex flex-col gap-ds-16">
        <LandingVersionBar />
        <WorkspaceTabs
          label="Landing page"
          current={current}
          labelledBy="landing-tab"
          items={TABS.map((tab) => ({
            id: tab.id,
            label: tab.label,
            href: `/admin/landing-pages/${campaign.id}?aba=${tab.id}`,
          }))}
        />
        <div className="grid items-start gap-ds-16 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div id="workspace-panel" role="tabpanel" aria-labelledby={`landing-tab-${current}`} className="min-w-0">
            {current === "previa" ? (
              <div className="min-h-[calc(100vh-12rem)] rounded-ds-md border border-border">
                <PreviewPage params={Promise.resolve({ slug: campaign.slug })} searchParams={Promise.resolve({ embedded: "studio" })} />
              </div>
            ) : null}
            {current === "builder" ? (
              <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
                <LandingPageBuilderPage params={toolParams} searchParams={embedded} />
              </div>
            ) : null}
            {current === "seo" ? (
              <div className="rounded-ds-md border border-border bg-card p-ds-24">
                <h2 className="text-h3">SEO</h2>
                <p className="mt-ds-12 text-body text-muted-foreground">Sem auditoria gravada.</p>
                <dl className="mt-ds-24 flex flex-col gap-ds-16">
                  <div>
                    <dt className="text-caption text-muted-foreground">Título da página</dt>
                    <dd className="text-body">{campaign.headline.trim() || "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted-foreground">Subtítulo</dt>
                    <dd className="text-body">{campaign.subheadline?.trim() || "Não informado"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {current === "assets" ? (
              <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
                <MediaManagerPage params={toolParams} searchParams={embedded} />
              </div>
            ) : null}
            {current === "validacao" ? (
              <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
                <LintPage params={Promise.resolve({ id: campaignId })} searchParams={embedded} />
              </div>
            ) : null}
            {current === "google-ads" ? (
              <GoogleAdsPublishPage params={Promise.resolve({ id: campaignId })} searchParams={searchParams} />
            ) : null}
            {current === "historico" ? (
              <div className="flex flex-col gap-ds-16">
                <GenerationHistory records={listLandingGenerations(campaign.id)} />
                <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
                  <VersionHistoryPage params={toolParams} searchParams={embedded} />
                </div>
              </div>
            ) : null}
          </div>
          <aside className="xl:sticky xl:top-ds-24" aria-label="Resumo da landing">
            <LandingSummary
              status={policyLabel(lint.gate)}
              language={language}
              version={LANDING_VERSION_LABEL}
              strategy={strategy}
              product={facts.productName.trim() || brief?.productName || "Não informado"}
              generatedAt={formatGenerated(campaign.updatedAt)}
              score={`${score}%`}
              googleAds={googleAds}
              publication={published ? "Publicada" : "Rascunho"}
            />
          </aside>
        </div>
      </div>
    </PageTemplate>
  );
}
