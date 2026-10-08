import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignForm } from "@/app/admin/campaign-form";
import { DeleteButton } from "@/app/admin/delete-button";
import { DuplicateButton } from "@/app/admin/duplicate-button";
import { UnpublishButton } from "@/app/admin/unpublish-button";
import { updateCampaignAction } from "@/app/admin/actions";
import { WorkspaceCrumbName, WorkspaceTabs } from "@/app/admin/[id]/edit/workspace-tabs";
import LandingPageBuilderPage from "@/app/admin/lp-builder/[campaignId]/page";
import LayoutBuilderPage from "@/app/admin/lp-layout/[campaignId]/page";
import MediaManagerPage from "@/app/admin/lp-media/[campaignId]/page";
import VersionHistoryPage from "@/app/admin/lp-versions/[campaignId]/page";
import VisualEditorPage from "@/app/admin/lp-visual/[campaignId]/page";
import ProductEditorPage from "@/app/admin/product-editor/[campaignId]/page";
import ProductHealthPage from "@/app/admin/product-health/[campaignId]/page";
import AnalyticsPage from "@/app/admin/[id]/analytics/page";
import LintPage from "@/app/admin/[id]/lint/page";
import PublishPage from "@/app/admin/[id]/publish/page";
import ValidationLabPage from "@/app/admin/validation/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCampaignById, type Campaign } from "@/lib/campaigns";
import { analyzeImportCompleteness } from "@/lib/completeness-engine";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { listPageVersions } from "@/lib/lp-builder/version-store";
import { parseCampaignFacts, withResolvedCampaign } from "@/lib/manual-overrides";
import { findingsByCategory, lintCampaign, type LintStatus } from "@/lib/policy-linter";
import { getLatestVisualQaReport } from "@/lib/visual-qa/store";

const TABS = ["visao", "landing", "produto", "validacao", "analytics", "publicacao", "historico"] as const;
type TabId = (typeof TABS)[number];

const LANDING_TOOLS = ["builder", "visual", "layout", "media", "versoes"] as const;
const PRODUCT_TOOLS = ["editor", "saude"] as const;
const VALIDATION_TOOLS = ["verificacao", "laboratorio"] as const;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tabOf(value: string | undefined): TabId {
  return TABS.includes(value as TabId) ? (value as TabId) : "visao";
}

function toolOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function workspaceHref(id: number, aba: TabId, ferramenta?: string) {
  const params = new URLSearchParams();
  if (aba !== "visao") params.set("aba", aba);
  if (ferramenta) params.set("ferramenta", ferramenta);
  const query = params.toString();
  return query ? `/admin/${id}/edit?${query}` : `/admin/${id}/edit`;
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

function policyLabel(gate: "READY" | "REVIEW_REQUIRED" | "BLOCKED") {
  if (gate === "READY") return "Pronta";
  if (gate === "BLOCKED") return "Bloqueada";
  return "Em revisão";
}

function policyTone(gate: "READY" | "REVIEW_REQUIRED" | "BLOCKED") {
  if (gate === "READY") return "success" as const;
  if (gate === "BLOCKED") return "danger" as const;
  return "review" as const;
}

function lintWord(status: LintStatus) {
  if (status === "pass") return "Aprovada";
  if (status === "warn") return "Atenção";
  return "Falha";
}

function Embed({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">{children}</div>;
}

export async function CampaignWorkspace({
  id,
  query,
}: {
  id: number;
  query: Record<string, string | string[] | undefined>;
}) {
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const aba = tabOf(one(query.aba));
  const facts = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
  const product = facts.productName.trim() || "Não observado";
  const brand = facts.manufacturer?.trim() || "Não observada";
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
  const googleAds = readIntegrationConfiguration().googleAds === "Connected" ? "Conectado" : "Não conectado";
  const adsConnected = googleAds === "Conectado";
  const campaignId = String(campaign.id);
  const params = Promise.resolve({ campaignId, id: campaignId });

  const tabs = [
    { id: "visao", href: workspaceHref(campaign.id, "visao"), label: "Visão geral" },
    { id: "landing", href: workspaceHref(campaign.id, "landing"), label: "Landing page" },
    { id: "produto", href: workspaceHref(campaign.id, "produto"), label: "Produto" },
    { id: "validacao", href: workspaceHref(campaign.id, "validacao"), label: "Validação" },
    { id: "analytics", href: workspaceHref(campaign.id, "analytics"), label: "Análises" },
    { id: "publicacao", href: workspaceHref(campaign.id, "publicacao"), label: "Publicação" },
    { id: "historico", href: workspaceHref(campaign.id, "historico"), label: "Histórico" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-ds-24 px-ds-16 py-ds-24">
      <WorkspaceCrumbName name={campaign.name} />
      <header className="flex flex-col gap-ds-16">
        <div className="flex flex-col gap-ds-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-h1">{campaign.name}</h1>
            <dl className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-caption text-muted-foreground">Produto</dt>
                <dd className="text-body">{product}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Marca</dt>
                <dd className="text-body">{brand}</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Status</dt>
                <dd className="mt-ds-4 flex flex-wrap gap-ds-8">
                  <Badge tone={published ? "success" : "warning"}>{published ? "Publicada" : "Rascunho"}</Badge>
                  <Badge tone={policyTone(lint.gate)}>{policyLabel(lint.gate)}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground">Última edição</dt>
                <dd className="text-body">{formatUpdated(campaign.updatedAt)}</dd>
              </div>
            </dl>
            <div className="mt-ds-12 max-w-md">
              <div className="mb-ds-4 flex items-center justify-between text-caption text-muted-foreground">
                <span>Conclusão</span>
                <span>{score}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={`Conclusão de ${campaign.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score}
                className="h-2 overflow-hidden rounded-ds-full bg-secondary"
              >
                <div className="h-full bg-primary" style={{ width: `${score}%` }} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-ds-8">
            <Button asChild>
              <Link href={workspaceHref(campaign.id, "publicacao")}>Publicar</Link>
            </Button>
            <DuplicateButton id={campaign.id} name={campaign.name} />
            <DeleteButton id={campaign.id} name={campaign.name} appearance="button" />
          </div>
        </div>
        <WorkspaceTabs label="Áreas da campanha" current={aba} items={tabs} labelledBy="workspace-tab" />
      </header>

      <div
        id="workspace-panel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${aba}`}
        tabIndex={0}
        className="flex flex-col gap-ds-16 outline-none focus-visible:shadow-ds-focus"
      >
        {aba === "visao" ? <Overview campaign={campaign} published={published} gateLabel={policyLabel(lint.gate)} score={score} googleAds={googleAds} updated={formatUpdated(campaign.updatedAt)} /> : null}
        {aba === "landing" ? <LandingTools campaignId={campaign.id} ferramenta={toolOf(one(query.ferramenta), LANDING_TOOLS, "builder")} params={params} /> : null}
        {aba === "produto" ? (
          <ProductTools
            campaignId={campaign.id}
            ferramenta={toolOf(one(query.ferramenta), PRODUCT_TOOLS, "editor")}
            params={params}
            query={query}
          />
        ) : null}
        {aba === "validacao" ? (
          <ValidationTools
            campaignId={campaign.id}
            ferramenta={toolOf(one(query.ferramenta), VALIDATION_TOOLS, "verificacao")}
            params={params}
            score={lint.score}
            gateLabel={policyLabel(lint.gate)}
          />
        ) : null}
        {aba === "analytics" ? (
          <Embed>
            <AnalyticsPage params={params} searchParams={Promise.resolve({ range: one(query.range) })} />
          </Embed>
        ) : null}
        {aba === "publicacao" ? (
          <PublicationPanel campaign={campaign} published={published} gateLabel={policyLabel(lint.gate)} googleAds={googleAds} adsConnected={adsConnected} params={params} />
        ) : null}
        {aba === "historico" ? (
          <Embed>
            <VersionHistoryPage params={params} />
          </Embed>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-ds-8 border-t border-border pt-ds-16" aria-label="Barra de ações">
        {published ? (
          <Button asChild variant="secondary"><Link href={`/p/${campaign.slug}`}>Ver página</Link></Button>
        ) : (
          <Button asChild variant="secondary"><Link href={`/admin/preview/${campaign.slug}`}>Prévia</Link></Button>
        )}
        <Button asChild variant="secondary"><Link href={workspaceHref(campaign.id, "validacao")}>Validação</Link></Button>
      </div>
    </div>
  );
}

function Overview({
  campaign,
  published,
  gateLabel,
  score,
  googleAds,
  updated,
}: {
  campaign: Campaign;
  published: boolean;
  gateLabel: string;
  score: number;
  googleAds: string;
  updated: string;
}) {
  let activity: { id: string; label: string }[] = [];
  try {
    activity = listPageVersions(campaign.id).slice(0, 5).map((version) => ({
      id: version.id,
      label: `Versão ${version.versionNumber} · ${version.action} · ${formatUpdated(version.createdAt)}${version.comment ? ` · ${version.comment}` : ""}`,
    }));
  } catch {
    activity = [];
  }

  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
        <Card><CardContent><p className="text-caption text-muted-foreground">Status</p><p className="mt-ds-4 text-h3">{published ? "Publicada" : "Rascunho"}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Publicação</p><p className="mt-ds-4 text-h3">{published ? "Pública" : "Rascunho"}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Conclusão</p><p className="mt-ds-4 text-h3">{score}%</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Política</p><p className="mt-ds-4 text-h3">{gateLabel}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Google Ads</p><p className="mt-ds-4 text-h3">{googleAds === "Conectado" ? "Conectado" : "Google Ads não conectado"}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Última edição</p><p className="mt-ds-4 text-h3">{updated}</p></CardContent></Card>
      </div>
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-h3">Atividade recente</h2>
        {activity.length === 0 ? (
          <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma versão gravada.</p>
        ) : (
          <ul className="mt-ds-8 flex flex-col gap-ds-8 text-body">
            {activity.map((item) => <li key={item.id}>{item.label}</li>)}
          </ul>
        )}
      </section>
      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="text-h3">Ações rápidas</h2>
        <div className="mt-ds-8 flex flex-wrap gap-ds-8">
          <Button asChild variant="secondary"><Link href={workspaceHref(campaign.id, "landing")}>Landing page</Link></Button>
          <Button asChild variant="secondary"><Link href={workspaceHref(campaign.id, "produto")}>Produto</Link></Button>
          <Button asChild variant="secondary"><Link href={workspaceHref(campaign.id, "validacao")}>Validação</Link></Button>
          <Button asChild variant="secondary"><Link href={workspaceHref(campaign.id, "analytics")}>Análises</Link></Button>
        </div>
      </section>
      <section aria-labelledby="edit-heading" className="rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
        <h2 id="edit-heading" className="mb-ds-12 text-h3">Editar campanha</h2>
        <CampaignForm
          action={updateCampaignAction.bind(null, campaign.id)}
          campaign={campaign}
          submitLabel="Salvar"
          unpublishOnSave={published}
        />
      </section>
    </div>
  );
}

function LandingTools({
  campaignId,
  ferramenta,
  params,
}: {
  campaignId: number;
  ferramenta: (typeof LANDING_TOOLS)[number];
  params: Promise<{ campaignId: string; id: string }>;
}) {
  const items = [
    { id: "builder", href: workspaceHref(campaignId, "landing", "builder"), label: "Conteúdo" },
    { id: "visual", href: workspaceHref(campaignId, "landing", "visual"), label: "Visual" },
    { id: "layout", href: workspaceHref(campaignId, "landing", "layout"), label: "Layout" },
    { id: "media", href: workspaceHref(campaignId, "landing", "media"), label: "Mídia" },
    { id: "versoes", href: workspaceHref(campaignId, "landing", "versoes"), label: "Versões" },
  ];
  return (
    <div className="flex flex-col gap-ds-16">
      <WorkspaceTabs label="Ferramentas da landing page" current={ferramenta} items={items} />
      <Embed>
        {ferramenta === "builder" ? <LandingPageBuilderPage params={params} /> : null}
        {ferramenta === "visual" ? <VisualEditorPage params={params} /> : null}
        {ferramenta === "layout" ? <LayoutBuilderPage params={params} /> : null}
        {ferramenta === "media" ? <MediaManagerPage params={params} /> : null}
        {ferramenta === "versoes" ? <VersionHistoryPage params={params} /> : null}
      </Embed>
    </div>
  );
}

function ProductTools({
  campaignId,
  ferramenta,
  params,
  query,
}: {
  campaignId: number;
  ferramenta: (typeof PRODUCT_TOOLS)[number];
  params: Promise<{ campaignId: string; id: string }>;
  query: Record<string, string | string[] | undefined>;
}) {
  const items = [
    { id: "editor", href: workspaceHref(campaignId, "produto", "editor"), label: "Editor" },
    { id: "saude", href: workspaceHref(campaignId, "produto", "saude"), label: "Saúde" },
  ];
  return (
    <div className="flex flex-col gap-ds-16">
      <WorkspaceTabs label="Ferramentas do produto" current={ferramenta} items={items} />
      <p className="text-body text-muted-foreground">
        Evidências, fatos observados e a recomendação de completude estão no editor. Os ativos e a saúde estão na leitura de saúde.
      </p>
      <div className="flex flex-wrap gap-ds-8">
        <Button asChild variant="secondary"><Link href={`/admin/product-evidence/${campaignId}`}>Exportar evidências</Link></Button>
      </div>
      <Embed>
        {ferramenta === "editor" ? (
          <ProductEditorPage
            params={params}
            searchParams={Promise.resolve({ saved: one(query.saved), reset: one(query.reset), error: one(query.error) })}
          />
        ) : (
          <ProductHealthPage params={params} />
        )}
      </Embed>
    </div>
  );
}

function ValidationTools({
  campaignId,
  ferramenta,
  params,
  score,
  gateLabel,
}: {
  campaignId: number;
  ferramenta: (typeof VALIDATION_TOOLS)[number];
  params: Promise<{ campaignId: string; id: string }>;
  score: number;
  gateLabel: string;
}) {
  const campaign = getCampaignById(campaignId);
  const groups = campaign ? findingsByCategory(lintCampaign(withResolvedCampaign(campaign))) : [];
  const links = groups.find((group) => group.category === "CTA_AND_LINKS");
  const report = campaign ? getLatestVisualQaReport(campaign.id) : null;
  const items = [
    { id: "verificacao", href: workspaceHref(campaignId, "validacao", "verificacao"), label: "Verificação" },
    { id: "laboratorio", href: workspaceHref(campaignId, "validacao", "laboratorio"), label: "Laboratório" },
  ];
  return (
    <div className="flex flex-col gap-ds-16">
      <Card>
        <CardContent>
          <p className="text-caption text-muted-foreground">Pontuação da verificação</p>
          <p className="mt-ds-4 text-h1">{score}</p>
          <p className="mt-ds-4 text-body text-muted-foreground">Política interna: {gateLabel}. Esta pontuação não é aprovação do Google Ads.</p>
        </CardContent>
      </Card>
      <dl className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-5">
        <div><dt className="text-caption text-muted-foreground">Links</dt><dd className="text-body">{links ? lintWord(links.worst) : "Sem leitura"}</dd></div>
        <div><dt className="text-caption text-muted-foreground">SEO</dt><dd className="text-body">Sem auditoria gravada</dd></div>
        <div><dt className="text-caption text-muted-foreground">HTML</dt><dd className="text-body">{report ? (report.technical.headingOrderOk ? "Ordem de títulos ok" : "Ordem de títulos com aviso") : "Sem auditoria gravada"}</dd></div>
        <div><dt className="text-caption text-muted-foreground">Desempenho</dt><dd className="text-body">{report ? "Lighthouse não executado" : "Sem auditoria gravada"}</dd></div>
        <div><dt className="text-caption text-muted-foreground">Acessibilidade</dt><dd className="text-body">{report ? `${report.technical.missingAlts} imagens sem texto alternativo` : "Sem auditoria gravada"}</dd></div>
      </dl>
      <WorkspaceTabs label="Ferramentas de validação" current={ferramenta} items={items} />
      <Embed>
        {ferramenta === "verificacao" ? <LintPage params={params} /> : <ValidationLabPage />}
      </Embed>
    </div>
  );
}

function PublicationPanel({
  campaign,
  published,
  gateLabel,
  googleAds,
  adsConnected,
  params,
}: {
  campaign: Campaign;
  published: boolean;
  gateLabel: string;
  googleAds: string;
  adsConnected: boolean;
  params: Promise<{ campaignId: string; id: string }>;
}) {
  return (
    <div className="flex flex-col gap-ds-16">
      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
        <Card><CardContent><p className="text-caption text-muted-foreground">Publicação</p><p className="mt-ds-4 text-h3">{published ? "Publicada" : "Rascunho"}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Google Ads</p><p className="mt-ds-4 text-h3">{adsConnected ? googleAds : "Google Ads não conectado"}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Aprovação</p><p className="mt-ds-4 text-h3">{gateLabel}</p><p className="mt-ds-4 text-caption text-muted-foreground">Aprovação interna. Não é aprovação do Google Ads.</p></CardContent></Card>
      </div>
      <div className="flex flex-wrap items-center gap-ds-8">
        <Button type="button" variant="secondary" disabled aria-describedby="ads-sync-note">Sincronizar</Button>
        {published ? <UnpublishButton id={campaign.id} name={campaign.name} appearance="button" /> : null}
      </div>
      <p id="ads-sync-note" className="text-body text-muted-foreground">
        {adsConnected ? "A conta está conectada. Esta tela não envia a campanha para o Google Ads." : "Google Ads não conectado"}
      </p>
      <Embed>
        <PublishPage params={params} />
      </Embed>
    </div>
  );
}
