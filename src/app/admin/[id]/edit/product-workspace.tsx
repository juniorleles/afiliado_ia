import type { ReactNode } from "react";
import Link from "next/link";
import MediaManagerPage from "@/app/admin/lp-media/[campaignId]/page";
import ProductEditorPage from "@/app/admin/product-editor/[campaignId]/page";
import ProductHealthPage from "@/app/admin/product-health/[campaignId]/page";
import { ProductEvidenceList } from "@/app/admin/[id]/edit/product-evidence-list";
import { WorkspaceTabs } from "@/app/admin/[id]/edit/workspace-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { listCampaigns, type Campaign } from "@/lib/campaigns";
import { listFieldEvidence } from "@/lib/evidence-manager";
import { analyzeImportCompleteness } from "@/lib/completeness-engine";
import { loadResolvedProductFacts, listManualOverrides, parseCampaignFacts, withResolvedCampaign } from "@/lib/manual-overrides";
import { lintCampaign } from "@/lib/policy-linter";
import { analyzeProductCompleteness } from "@/lib/product-completeness";
import type { ProductFacts } from "@/lib/product-facts";

export const PRODUCT_TOOL_IDS = ["visao", "saude", "evidencias", "ativos", "comercial", "campanhas", "editor"] as const;
export type ProductTool = (typeof PRODUCT_TOOL_IDS)[number];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function href(id: number, ferramenta: ProductTool) {
  return `/admin/${id}/edit?aba=produto&ferramenta=${ferramenta}`;
}

function textOr(value: string | null | undefined, empty: string) {
  const text = value?.trim();
  return text ? text : empty;
}

function sourceHost(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function currentPrice(facts: ProductFacts | null) {
  const offer = facts?.offerFacts?.find((item) => item.totalPrice?.trim() || item.unitPrice?.trim());
  if (offer?.totalPrice?.trim()) return offer.totalPrice.trim();
  if (offer?.unitPrice?.trim()) return offer.unitPrice.trim();
  return textOr(facts?.pricingInformation, "Não observado");
}

function offerStatus(facts: ProductFacts | null) {
  const count = facts?.offerFacts?.length ?? 0;
  if (count === 1) return "1 oferta observada";
  if (count > 1) return `${count} ofertas observadas`;
  if (facts?.pricingInformation?.trim()) return "Preço em texto";
  return "Não observada";
}

function sameProduct(left: string, right: string) {
  return left.trim().toLocaleLowerCase("pt-BR") === right.trim().toLocaleLowerCase("pt-BR");
}

function Embed({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">{children}</div>;
}

export function ProductWorkspace({
  campaign,
  gateLabel,
  score,
  ferramenta,
  params,
  query,
}: {
  campaign: Campaign;
  gateLabel: string;
  score: number;
  ferramenta: ProductTool;
  params: Promise<{ campaignId: string; id: string }>;
  query: Record<string, string | string[] | undefined>;
}) {
  const facts = loadResolvedProductFacts(campaign);
  const product = textOr(facts?.productName, "Não observado");
  const brand = textOr(facts?.manufacturer, "Não observada");
  const price = currentPrice(facts);
  const related = listCampaigns().filter((item) => sameProduct(loadResolvedProductFacts(item)?.productName ?? "", facts?.productName ?? ""));
  const sources = uniqueSources(facts);
  const landingHref = `/admin/${campaign.id}/edit?aba=landing`;
  const studioQuery = Promise.resolve({ embedded: "studio" });

  return (
    <section aria-label="Espaço do produto" className="flex flex-col gap-ds-16">
      <header>
        <h2 className="text-h2">{product}</h2>
        <dl className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Marca" value={brand} />
          <Field label="Categoria" value="Não observada" />
          <Field label="Preço atual" value={price} />
          <Field label="Oferta" value={offerStatus(facts)} />
          <Field label="Confiança" value={`${score}%`} />
          <Field label="Última atualização" value={formatUpdated(campaign.updatedAt)} />
          <Field label="Campanhas" value={String(Math.max(related.length, 1))} />
        </dl>
      </header>
      <WorkspaceTabs
        label="Áreas do produto"
        current={ferramenta}
        labelledBy="product-tab"
        items={[
          { id: "visao", href: href(campaign.id, "visao"), label: "Visão geral" },
          { id: "saude", href: href(campaign.id, "saude"), label: "Saúde" },
          { id: "evidencias", href: href(campaign.id, "evidencias"), label: "Evidências" },
          { id: "ativos", href: href(campaign.id, "ativos"), label: "Ativos" },
          { id: "comercial", href: href(campaign.id, "comercial"), label: "Comercial" },
          { id: "campanhas", href: href(campaign.id, "campanhas"), label: "Campanhas" },
          { id: "editor", href: href(campaign.id, "editor"), label: "Editor" },
        ]}
      />
      {ferramenta === "visao" ? <Overview facts={facts} product={product} brand={brand} price={price} sources={sources} landingHref={landingHref} campaign={campaign} /> : null}
      {ferramenta === "saude" ? <HealthPanel campaign={campaign} gateLabel={gateLabel} facts={facts} params={params} studioQuery={studioQuery} /> : null}
      {ferramenta === "evidencias" ? <EvidencePanel campaignId={campaign.id} landingHref={landingHref} /> : null}
      {ferramenta === "ativos" ? <AssetsPanel params={params} studioQuery={studioQuery} /> : null}
      {ferramenta === "comercial" ? <Commercial facts={facts} price={price} cta={campaign.ctaLabel} /> : null}
      {ferramenta === "campanhas" ? <RelatedCampaigns campaigns={related.length > 0 ? related : [campaign]} /> : null}
      {ferramenta === "editor" ? (
        <Embed>
          <ProductEditorPage
            params={params}
            searchParams={Promise.resolve({ saved: one(query.saved), reset: one(query.reset), error: one(query.error), embedded: "studio" })}
          />
        </Embed>
      ) : null}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}

function uniqueSources(facts: ProductFacts | null) {
  const urls = [
    facts?.sourceUrl,
    ...(facts?.sourceSnippets ?? []).map((item) => item.sourceUrl),
    ...(facts?.offerFacts ?? []).map((item) => item.sourceUrl),
  ];
  return [...new Set(urls.map((url) => (url ? sourceHost(url) : "")).filter(Boolean))];
}

function Overview({
  facts,
  product,
  brand,
  price,
  sources,
  landingHref,
  campaign,
}: {
  facts: ProductFacts | null;
  product: string;
  brand: string;
  price: string;
  sources: string[];
  landingHref: string;
  campaign: Campaign;
}) {
  const notes = [
    facts?.guaranteeInformation?.trim(),
    ...(facts?.offerFacts ?? []).map((item) => item.bonuses?.trim()),
    ...(facts?.shippingInformation ?? []).map((item) => item.statement?.trim()),
    ...(facts?.returnsInformation ?? []).map((item) => item.statement?.trim()),
  ].filter((item): item is string => Boolean(item));
  let recommendation = "Nenhuma recomendação gravada.";
  try {
    const report = analyzeImportCompleteness({
      facts: facts ?? parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl),
      headline: campaign.headline,
      imageUrl: campaign.productImageSrc || facts?.productImageUrl,
      imageProvenance: campaign.productImageProvenance || facts?.productImageProvenance,
      visualAssetCount: campaign.productAssetStatus === "READY" ? 1 : 0,
    });
    recommendation = report.priorityActions[0]?.text || report.recommendations[0]?.text || recommendation;
  } catch {
    recommendation = "Nenhuma recomendação gravada.";
  }

  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
        <Card><CardContent><p className="text-caption text-muted-foreground">Resumo</p><p className="mt-ds-4 text-body">{textOr(facts?.description, "Não observado")}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Marca</p><p className="mt-ds-4 text-body">{brand}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Categoria</p><p className="mt-ds-4 text-body">Não observada</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Preço atual</p><p className="mt-ds-4 text-body">{price}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Produto</p><p className="mt-ds-4 text-body">{product}</p></CardContent></Card>
      </div>
      <section aria-labelledby="sources-heading">
        <h3 id="sources-heading" className="text-h3">Fontes observadas</h3>
        {sources.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma fonte observada.</p> : (
          <ul className="mt-ds-8 flex flex-col gap-ds-8 text-body">{sources.map((source) => <li key={source}>{source}</li>)}</ul>
        )}
      </section>
      <section aria-labelledby="landing-heading">
        <h3 id="landing-heading" className="text-h3">Landing pages</h3>
        <div className="mt-ds-8">
          <Button asChild variant="secondary"><Link href={landingHref}>Abrir landing page</Link></Button>
        </div>
      </section>
      <section aria-labelledby="recommendation-heading">
        <h3 id="recommendation-heading" className="text-h3">Recomendação</h3>
        <p className="mt-ds-8 text-body">{recommendation}</p>
      </section>
      <section aria-labelledby="notes-heading">
        <h3 id="notes-heading" className="text-h3">Notas comerciais</h3>
        {notes.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma nota comercial observada.</p> : (
          <ul className="mt-ds-8 flex flex-col gap-ds-8 text-body">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
        )}
      </section>
    </div>
  );
}

function HealthPanel({
  campaign,
  gateLabel,
  facts,
  params,
  studioQuery,
}: {
  campaign: Campaign;
  gateLabel: string;
  facts: ProductFacts | null;
  params: Promise<{ campaignId: string; id: string }>;
  studioQuery: Promise<{ embedded: string }>;
}) {
  const report = healthReport(campaign);
  const warnings = report?.categories.find((item) => item.id === "warnings");
  const features = report?.categories.find((item) => item.id === "features");
  const confidence = facts?.confidence.productName ?? "Não observada";
  const warningsCount = facts?.importWarnings.length ?? 0;
  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard subject="Pontuação geral" value={report ? `${report.totalScore}%` : "Não observada"} />
        <MetricCard subject="Afirmações" value={features ? features.status : "Não observadas"} period="Recursos observados" />
        <MetricCard subject="Avisos" value={warnings ? warnings.status : "Não observados"} />
        <MetricCard subject="Conformidade" value={gateLabel} period="Política interna" />
        <MetricCard subject="Confiança da fonte" value={confidence} />
        <MetricCard subject="Nível de confiança" value={facts?.importQuality ?? "Não observada"} />
        <MetricCard subject="Risco" value={warningsCount === 0 ? "Nenhum aviso de importação" : `${warningsCount} avisos de importação`} />
        <MetricCard subject="Imagem" value={facts?.productImageProvenance ?? "Não observada"} period="Procedência observada" />
      </div>
      <Embed>
        <ProductHealthPage params={params} searchParams={studioQuery} />
      </Embed>
    </div>
  );
}

function healthReport(campaign: Campaign) {
  try {
    const resolved = withResolvedCampaign(campaign);
    const facts = loadResolvedProductFacts(campaign);
    const overrides = listManualOverrides(campaign.id);
    const manualEditedAt = overrides.reduce<string | null>((latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest), null);
    return analyzeProductCompleteness({
      facts,
      affiliateUrl: resolved.affiliateUrl,
      ctaLabel: resolved.ctaLabel,
      imageUrl: resolved.productImageSrc || facts?.productImageUrl || null,
      imageProvenance: resolved.productImageProvenance || facts?.productImageProvenance || null,
      trackingOrigin: overrides.some((row) => row.field === "trackingUrl") ? "MANUAL" : null,
      manualEditedAt,
    });
  } catch {
    return null;
  }
}

function EvidencePanel({ campaignId, landingHref }: { campaignId: number; landingHref: string }) {
  let rows: ReturnType<typeof listFieldEvidence> = [];
  try {
    rows = listFieldEvidence(campaignId);
  } catch {
    rows = [];
  }
  return (
    <div className="flex flex-col gap-ds-16">
      <Button asChild variant="secondary"><Link href={`/admin/product-evidence/${campaignId}`}>Exportar evidências</Link></Button>
      <Embed>
        <ProductEvidenceList campaignId={campaignId} landingHref={landingHref} rows={rows} />
      </Embed>
    </div>
  );
}

function AssetsPanel({
  params,
  studioQuery,
}: {
  params: Promise<{ campaignId: string; id: string }>;
  studioQuery: Promise<{ embedded: string }>;
}) {
  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
        <Card><CardContent><p className="text-caption text-muted-foreground">Imagens</p><p className="mt-ds-4 text-body">Hero, ingredientes, recursos, preço e encerramento no gerenciador.</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Logos</p><p className="mt-ds-4 text-body">Logo do rodapé no gerenciador.</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Ícones</p><p className="mt-ds-4 text-body">Ícone de recurso e ícone de CTA no gerenciador.</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Vídeos</p><p className="mt-ds-4 text-body">Nenhum vídeo observado.</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Downloads</p><p className="mt-ds-4 text-body">Nenhum download observado.</p></CardContent></Card>
      </div>
      <Embed>
        <MediaManagerPage params={params} searchParams={studioQuery} />
      </Embed>
    </div>
  );
}

function Commercial({ facts, price, cta }: { facts: ProductFacts | null; price: string; cta: string }) {
  const bonuses = [...new Set((facts?.offerFacts ?? []).map((item) => item.bonuses?.trim()).filter((item): item is string => Boolean(item)))];
  return (
    <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
      <Card><CardContent><p className="text-caption text-muted-foreground">Preço atual</p><p className="mt-ds-4 text-body">{price}</p></CardContent></Card>
      <Card><CardContent><p className="text-caption text-muted-foreground">Tipo de oferta</p><p className="mt-ds-4 text-body">{textOr(facts?.productFormat?.value || facts?.offerFacts?.[0]?.packageName, "Não observado")}</p></CardContent></Card>
      <Card><CardContent><p className="text-caption text-muted-foreground">Upsells</p><p className="mt-ds-4 text-body">Não observado</p></CardContent></Card>
      <Card><CardContent><p className="text-caption text-muted-foreground">Downsells</p><p className="mt-ds-4 text-body">Não observado</p></CardContent></Card>
      <Card><CardContent><p className="text-caption text-muted-foreground">Bônus</p><p className="mt-ds-4 text-body">{bonuses.length > 0 ? bonuses.join(" · ") : "Não observado"}</p></CardContent></Card>
      <Card><CardContent><p className="text-caption text-muted-foreground">Chamada para ação</p><p className="mt-ds-4 text-body">{textOr(cta, "Não observada")}</p></CardContent></Card>
      <Card><CardContent><p className="text-caption text-muted-foreground">Funis conhecidos</p><p className="mt-ds-4 text-body">Não observado</p></CardContent></Card>
    </div>
  );
}

function RelatedCampaigns({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <ul className="flex flex-col gap-ds-12">
      {campaigns.map((item) => {
        const published = item.publicationStatus === "published";
        let gate = "Em revisão";
        try {
          const result = lintCampaign(withResolvedCampaign(item));
          gate = result.gate === "READY" ? "Pronta" : result.gate === "BLOCKED" ? "Bloqueada" : "Em revisão";
        } catch {
          gate = "Não observada";
        }
        return (
          <li key={item.id}>
            <Card>
              <CardContent>
                <div className="flex flex-col gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-h3">{item.name}</h3>
                    <div className="mt-ds-8 flex flex-wrap gap-ds-8">
                      <Badge tone={published ? "success" : "warning"}>{published ? "Publicada" : "Rascunho"}</Badge>
                      <Badge tone={gate === "Pronta" ? "success" : gate === "Bloqueada" ? "danger" : "review"}>{gate}</Badge>
                    </div>
                  </div>
                  <Button asChild>
                    <Link href={`/admin/${item.id}/edit`} aria-label={`Abrir campanha ${item.name}`}>Abrir campanha</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
