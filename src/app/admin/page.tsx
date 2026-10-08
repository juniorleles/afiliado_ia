import Link from "next/link";
import { CampaignBoard, type AdminCampaignCard } from "@/app/admin/campaign-board";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { SectionHeader } from "@/components/ui/section-header";
import { listCampaigns } from "@/lib/campaigns";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { lintCampaign } from "@/lib/policy-linter";
import { parseCampaignFacts, withResolvedCampaign } from "@/lib/manual-overrides";
import { analyzeImportCompleteness } from "@/lib/completeness-engine";
import { productionReadiness } from "@/lib/readiness";

const NOTICE: Record<string, string> = {
  published: "A campanha foi publicada. A página /p/[slug] está pública. Isto não é aprovação de uma plataforma de anúncios.",
  unpublished: "A campanha voltou a rascunho. A página pública agora responde 404. A prévia continua disponível.",
  "moved-to-draft": "A campanha voltou a rascunho porque o conteúdo publicado mudou. Verifique a política e publique de novo.",
};

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(now));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function healthLabel(value: string) {
  if (value === "READY") return "Pronto";
  if (value === "OPTIONAL") return "Opcional";
  return "Ausente";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const campaigns = listCampaigns();
  const noticeText = notice ? NOTICE[notice] : undefined;
  const config = readIntegrationConfiguration();
  const health = productionReadiness();
  const now = new Date();
  const rows = campaigns.map((campaign) => {
    const gate = lintCampaign(withResolvedCampaign(campaign)).gate;
    const published = campaign.publicationStatus === "published";
    const facts = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
    const completeness = analyzeImportCompleteness({
      facts,
      headline: campaign.headline,
      imageUrl: campaign.productImageSrc || facts.productImageUrl,
      imageProvenance: campaign.productImageProvenance || facts.productImageProvenance,
      visualAssetCount: campaign.productAssetStatus === "READY" ? 1 : 0,
    });
    return {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      product: facts.productName.trim() || "Não observado",
      brand: facts.manufacturer?.trim() || "Não observada",
      published,
      gate,
      completion: completeness.score,
      updatedAt: campaign.updatedAt,
    } satisfies AdminCampaignCard;
  });
  const drafts = rows.filter((row) => !row.published);
  const published = rows.filter((row) => row.published);
  const reviews = rows.filter((row) => row.gate === "REVIEW_REQUIRED");
  const latest = rows.slice(0, 5);

  return (
    <div className="ds-container flex flex-col gap-ds-32 py-ds-24">
      <header>
        <h1 className="text-h1">{greeting(now)}, João</h1>
        <p className="mt-ds-8 text-body text-muted-foreground">Painel da administração. As ferramentas técnicas ficam dentro de cada campanha.</p>
      </header>

      {noticeText ? (
        <p className="rounded-ds-md border border-border bg-card px-ds-16 py-ds-12 text-body" role="status">
          {noticeText}
        </p>
      ) : null}

      <section aria-labelledby="admin-metrics-heading">
        <SectionHeader id="admin-metrics-heading" title="Resumo" />
        <div className="mt-ds-16 grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard subject="Campanhas" value={String(rows.length)} period="Nesta instalação" />
          <MetricCard subject="Rascunhos" value={String(drafts.length)} period="Ainda não publicadas" />
          <MetricCard subject="Publicadas" value={String(published.length)} period="Páginas públicas" />
          <MetricCard subject="Revisão necessária" value={String(reviews.length)} period="Política" />
          <MetricCard subject="Google Ads" value={config.googleAds === "Connected" ? "Conectado" : "Não conectado"} period="Conta" />
          <MetricCard subject="SearchApi" value={config.searchApi === "SET" ? "Configurado" : "Ausente"} period="Pesquisa" />
          <MetricCard subject="Saúde do sistema" value={healthLabel(health.DATABASE)} period="Banco de dados" />
        </div>
      </section>

      <section aria-labelledby="quick-actions-heading">
        <SectionHeader id="quick-actions-heading" title="Ações rápidas" />
        <div className="mt-ds-16 flex flex-wrap gap-ds-8">
          <Button asChild variant="secondary"><Link href="#campanhas">Campanhas</Link></Button>
          <Button asChild variant="secondary"><Link href="#analises">Análises</Link></Button>
        </div>
      </section>

      <div className="grid gap-ds-16 lg:grid-cols-2">
        <section aria-labelledby="latest-heading">
          <Card>
            <CardContent>
              <h2 id="latest-heading" className="text-h3">Últimas campanhas</h2>
              {latest.length === 0 ? <p className="mt-ds-12 text-body text-muted-foreground">Nenhuma campanha gravada.</p> : (
                <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                  {latest.map((campaign) => (
                    <li key={campaign.id} className="flex items-center justify-between gap-ds-12">
                      <Link href={`/admin/${campaign.id}/edit`}>{campaign.name}</Link>
                      <Badge tone={campaign.published ? "success" : "warning"}>{campaign.published ? "Publicada" : "Rascunho"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
        <section aria-labelledby="reviews-heading">
          <Card>
            <CardContent>
              <h2 id="reviews-heading" className="text-h3">Revisões pendentes</h2>
              {reviews.length === 0 ? <p className="mt-ds-12 text-body text-muted-foreground">Nenhuma campanha aguarda revisão.</p> : (
                <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                  {reviews.map((campaign) => (
                    <li key={campaign.id}><Link href={`/admin/${campaign.id}/lint`}>{campaign.name}</Link></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section id="campanhas" className="flex flex-col gap-ds-16" aria-labelledby="campaign-list-heading">
        <SectionHeader id="campaign-list-heading" title="Campanhas" description="Nome, produto, estado e as ações principais. As ferramentas técnicas ficam em Mais." />
        <div id="landing-pages" />
        <div id="produtos" />
        <div id="analises" />
        <CampaignBoard
          campaigns={rows}
          googleAds={config.googleAds === "Connected" ? "Conectado" : "Não conectado"}
        />
      </section>
    </div>
  );
}
