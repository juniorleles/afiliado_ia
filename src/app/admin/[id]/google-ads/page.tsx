import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageTemplate } from "@/components/layout/page-template";
import { getCampaignById } from "@/lib/campaigns";
import { readGoogleAdsAccounts } from "@/lib/integrations/google-ads-oauth/store";
import {
  SAFE_COUNTRIES,
  SAFE_LANGUAGES,
  existingAssets,
  existingDescriptions,
  existingHeadlines,
  existingKeywords,
  validateSafePlan,
} from "@/lib/integrations/google-ads-publish/plan";
import { readGoogleAdsPublication } from "@/lib/integrations/google-ads-publish/store";
import { publishSafeCampaignAction } from "./actions";

export const metadata: Metadata = { title: "Publicar no Google Ads" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent><p className="text-body">{value}</p></CardContent>
    </Card>
  );
}

export default async function GoogleAdsPublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const campaignId = Number(id);
  const campaign = Number.isInteger(campaignId) ? getCampaignById(campaignId) : undefined;
  if (!campaign) notFound();
  const query = await searchParams;
  const text = (key: string, fallback: string) => {
    const value = query[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };
  const budget = Number(text("orcamento", "10"));
  const languageId = text("idioma", "1000");
  const countryId = text("pais", "2840");
  const bidding = text("lance", "MANUAL_CPC");
  const searchPartners = text("parceiros", "0") === "1";
  const account = readGoogleAdsAccounts().find((item) => item.selected) ?? null;
  const validated = validateSafePlan({
    campaign,
    account,
    budget: Number.isFinite(budget) ? budget : 0,
    languageId,
    countryId,
    searchPartners,
    bidding,
  });
  const publication = readGoogleAdsPublication(campaign.id);
  const headlines = existingHeadlines(campaign);
  const descriptions = existingDescriptions(campaign);
  const keywords = existingKeywords(campaign);
  const assets = existingAssets(campaign);
  const aviso = text("aviso", "");
  const publish = publishSafeCampaignAction.bind(null, campaign.id);
  return (
    <PageTemplate
      title="Publicar no Google Ads"
      description="Campanha de pesquisa. Todos os recursos nascem pausados e não podem veicular."
      primaryAction={<div className="flex flex-wrap gap-ds-8"><Button asChild variant="secondary"><Link href="/admin/google-ads/operacoes">Operações</Link></Button><Button asChild variant="secondary"><Link href={`/admin/${campaign.id}/edit?aba=publicacao`}>Voltar à campanha</Link></Button></div>}
    >
      <section aria-label="Assistente de publicação no Google Ads" className="flex flex-col gap-ds-24">
        {aviso === "pausada" ? <Alert tone="success" title="Campanha pausada">Os identificadores foram gravados. Nada ficou elegível para veicular.</Alert> : null}
        {aviso === "bloqueado" ? <Alert tone="warning" title="Publicação bloqueada">A prévia ainda tem pendências.</Alert> : null}
        {aviso === "recusada" ? <Alert tone="danger" title="Publicação recusada">O Google Ads não confirmou uma campanha pausada sem veiculação.</Alert> : null}
        <div className="grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Campanha" value={campaign.name} />
          <Field label="Conta do Google Ads" value={account?.accountName || account?.customerId || "Nenhuma conta ativa"} />
          <Field label="Landing page" value={validated.plan?.finalUrl || "Não publicada"} />
          <Field label="Orçamento diário" value={Number.isFinite(budget) && budget > 0 ? String(budget) : "Não informado"} />
          <Field label="Idioma" value={SAFE_LANGUAGES.find((item) => item.id === languageId)?.label || "Não escolhido"} />
          <Field label="País" value={SAFE_COUNTRIES.find((item) => item.id === countryId)?.label || "Não escolhido"} />
          <Field label="Rede" value={searchPartners ? "Pesquisa do Google e parceiros" : "Pesquisa do Google"} />
          <Field label="Status" value="Pausada" />
        </div>
        <form method="get" className="grid grid-cols-1 gap-ds-16 sm:grid-cols-2">
          <label className="text-body">Orçamento diário
            <input className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="orcamento" type="number" min="0.01" step="0.01" defaultValue={Number.isFinite(budget) ? budget : ""} required />
          </label>
          <label className="text-body">Idioma
            <select className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="idioma" defaultValue={languageId}>
              {SAFE_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="text-body">País
            <select className="mt-ds-4 w-full rounded-ds-sm border border-input bg-card px-ds-12 py-ds-8" name="pais" defaultValue={countryId}>
              {SAFE_COUNTRIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <fieldset className="text-body">
            <legend>Lance</legend>
            <label className="mt-ds-8 block"><input type="radio" name="lance" value="MANUAL_CPC" defaultChecked={bidding === "MANUAL_CPC"} /> CPC manual</label>
            <label className="mt-ds-8 block"><input type="radio" name="lance" value="MAXIMIZE_CLICKS" defaultChecked={bidding === "MAXIMIZE_CLICKS"} /> Maximizar cliques</label>
          </fieldset>
          <label className="text-body sm:col-span-2"><input type="checkbox" name="parceiros" value="1" defaultChecked={searchPartners} /> Incluir parceiros de pesquisa</label>
          <Button type="submit" variant="secondary">Atualizar prévia</Button>
        </form>
        <section aria-labelledby="previa-anuncio">
          <h2 id="previa-anuncio" className="text-h3">Prévia</h2>
          <p className="mt-ds-8 text-body text-muted-foreground">Títulos, descrições, palavras e ativos saem do que já está gravado. O grupo e o anúncio ficam pausados.</p>
          <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Títulos</CardTitle><Badge tone={headlines.length >= 3 ? "success" : "warning"}>{headlines.length >= 3 ? "Prontos" : "Insuficientes"}</Badge></CardHeader>
              <CardContent><ul className="flex flex-col gap-ds-8 text-body">{headlines.map((item) => <li key={item}>{item}</li>)}{headlines.length === 0 ? <li>Nenhum título dentro do limite.</li> : null}</ul></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Descrições</CardTitle><Badge tone={descriptions.length >= 2 ? "success" : "warning"}>{descriptions.length >= 2 ? "Prontas" : "Insuficientes"}</Badge></CardHeader>
              <CardContent><ul className="flex flex-col gap-ds-8 text-body">{descriptions.map((item) => <li key={item}>{item}</li>)}{descriptions.length === 0 ? <li>Nenhuma descrição dentro do limite.</li> : null}</ul></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Palavras-chave</CardTitle></CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-ds-8 text-body">
                  {keywords.map((item) => <li key={`${item.negative}-${item.matchType}-${item.text}`}>{item.negative ? "Negativa" : item.matchType} · {item.text}</li>)}
                  {keywords.length === 0 ? <li>Nenhuma palavra do Opportunity Engine foi encontrada nesta campanha.</li> : null}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Ativos</CardTitle></CardHeader>
              <CardContent className="text-body">
                <p>Sitelinks {assets.sitelinks.length}</p>
                <p>Frases de destaque {assets.callouts.length}</p>
                <p>Snippets estruturados {assets.snippets.length}</p>
              </CardContent>
            </Card>
          </div>
        </section>
        {validated.issues.length > 0 ? (
          <Alert tone="warning" title="Pendências">
            {validated.issues.join(" ")}
          </Alert>
        ) : null}
        <form action={publish} className="flex flex-wrap gap-ds-8">
          <input type="hidden" name="customerId" value={account?.customerId ?? ""} />
          <input type="hidden" name="budget" value={Number.isFinite(budget) ? String(budget) : ""} />
          <input type="hidden" name="language" value={languageId} />
          <input type="hidden" name="country" value={countryId} />
          <input type="hidden" name="bidding" value={bidding} />
          {searchPartners ? <input type="hidden" name="partners" value="on" /> : null}
          <Button type="submit" disabled={validated.issues.length > 0 || publication !== null}>Publicar pausada</Button>
        </form>
        <section aria-labelledby="detalhe-google">
          <h2 id="detalhe-google" className="text-h3">Detalhe da campanha</h2>
          {publication ? (
            <div className="mt-ds-16 grid grid-cols-1 gap-ds-16 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="ID da campanha no Google" value={publication.googleCampaignId || "Não observado"} />
              <Field label="Data da publicação" value={new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(publication.publishedAt))} />
              <Field label="Status" value="Pausada" />
              <Field label="Conta" value={publication.customerId} />
              <Field label="Orçamento" value={String(publication.budgetMicros / 1_000_000)} />
              <Field label="Tipo" value="Pesquisa" />
              <Field label="Palavras" value={String(publication.keywordResourceNames.length)} />
              <Field label="Anúncios" value={publication.adIds.join(", ") || "Não observados"} />
              <Field label="Ativos" value={String(publication.assetResourceNames.length)} />
              <Field label="Impressões" value={publication.impressions === null ? "Não observadas" : String(publication.impressions)} />
              <Field label="Cliques" value={publication.clicks === null ? "Não observados" : String(publication.clicks)} />
              <Field label="Custo" value={publication.costMicros === null ? "Não observado" : String(publication.costMicros / 1_000_000)} />
            </div>
          ) : (
            <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma campanha pausada foi gravada.</p>
          )}
        </section>
      </section>
    </PageTemplate>
  );
}
