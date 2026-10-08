import type { ReactNode } from "react";
import Link from "next/link";
import AnalyticsPage from "@/app/admin/[id]/analytics/page";
import LintPage from "@/app/admin/[id]/lint/page";
import ValidationLabPage from "@/app/admin/validation/page";
import { WorkspaceTabs } from "@/app/admin/[id]/edit/workspace-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { formatCtr } from "@/lib/analytics";
import { getCampaignAnalytics } from "@/lib/analytics-store";
import type { Campaign } from "@/lib/campaigns";
import { listPageVersions } from "@/lib/lp-builder/version-store";
import { CATEGORY_LABELS, type LintCategory, type LintResult, type LintRuleFinding, type LintStatus } from "@/lib/policy-linter";
import { listValidationRuns } from "@/lib/validation/store";
import { getLatestVisualQaReport } from "@/lib/visual-qa/store";
import type { VisualQaFinding, VisualQaReport } from "@/lib/visual-qa/types";

export const QUALITY_TOOL_IDS = ["painel", "verificacao", "laboratorio", "analytics"] as const;
export type QualityTool = (typeof QUALITY_TOOL_IDS)[number];

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

function toolHref(id: number, ferramenta: QualityTool) {
  return `/admin/${id}/edit?aba=validacao&ferramenta=${ferramenta}`;
}

function lintWord(status: LintStatus) {
  if (status === "pass") return "Aprovada";
  if (status === "warn") return "Atenção";
  return "Falha";
}

function lintTone(status: LintStatus) {
  if (status === "pass") return "success" as const;
  if (status === "warn") return "warning" as const;
  return "danger" as const;
}

function displayScore(findings: Array<{ status: string }>) {
  if (findings.length === 0) return "—";
  const points = findings.reduce((sum, finding) => {
    if (finding.status === "pass") return sum + 1;
    if (finding.status === "warn") return sum + 0.4;
    return sum;
  }, 0);
  return String(Math.round((points / findings.length) * 100));
}

function worstOf(findings: LintRuleFinding[]): LintStatus {
  if (findings.some((finding) => finding.status === "fail")) return "fail";
  if (findings.some((finding) => finding.status === "warn")) return "warn";
  return "pass";
}

function warningCount(findings: LintRuleFinding[]) {
  const count = findings.filter((finding) => finding.status !== "pass").length;
  return count === 0 ? "Nenhum aviso" : `${count} aviso${count === 1 ? "" : "s"}`;
}

function Embed({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">{children}</div>;
}

type IssueLevel = "critico" | "alto" | "medio" | "baixo";

type Issue = {
  id: string;
  level: IssueLevel;
  description: string;
  recommendation: string;
  area: string;
  href: string;
};

const LEVELS: Array<{ id: IssueLevel; label: string }> = [
  { id: "critico", label: "Crítico" },
  { id: "alto", label: "Alto" },
  { id: "medio", label: "Médio" },
  { id: "baixo", label: "Baixo" },
];

function lintIssues(findings: LintRuleFinding[], href: string): Issue[] {
  return findings
    .filter((finding) => finding.status !== "pass")
    .map((finding) => ({
      id: finding.ruleId,
      level: finding.status === "fail" && finding.blocking ? "critico" : finding.status === "fail" ? "alto" : "medio",
      description: finding.message,
      recommendation: finding.suggestion?.trim() || "Sem recomendação gravada",
      area: CATEGORY_LABELS[finding.category],
      href,
    }));
}

function visualIssues(report: VisualQaReport | null, href: string): Issue[] {
  if (!report) return [];
  const seen = new Set<string>();
  const rows = [...report.deterministicFindings, ...report.visualFindings, ...report.highPriority];
  const issues: Issue[] = [];
  rows.forEach((finding, index) => {
    const key = `${finding.category}|${finding.severity}|${finding.viewport}|${finding.description}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      id: `visual-${index}`,
      level: visualLevel(finding),
      description: finding.description,
      recommendation: finding.suggestedPresentationFix?.trim() || "Sem recomendação gravada",
      area: finding.category,
      href,
    });
  });
  return issues;
}

function visualLevel(finding: VisualQaFinding): IssueLevel {
  if (finding.severity === "HIGH") return "alto";
  if (finding.severity === "WARNING") return "medio";
  return "baixo";
}

function categoryFindings(findings: LintRuleFinding[], category: LintCategory) {
  return findings.filter((finding) => finding.category === category);
}

export function QualityCenter({
  campaign,
  product,
  lint,
  gateLabel,
  adsConnected,
  ferramenta,
  params,
  query,
}: {
  campaign: Campaign;
  product: string;
  lint: LintResult;
  gateLabel: string;
  adsConnected: boolean;
  ferramenta: QualityTool;
  params: Promise<{ campaignId: string; id: string }>;
  query: Record<string, string | string[] | undefined>;
}) {
  const published = campaign.publicationStatus === "published";
  const scoreTone = lint.gate === "READY" ? "text-success" : lint.gate === "BLOCKED" ? "text-danger" : "text-warning";
  const readiness = lint.gate === "READY" ? "Pronta para publicação" : lint.gate === "BLOCKED" ? "Bloqueada" : "Revisão necessária";
  const report = readReport(campaign.id);
  const runs = readRuns(campaign.id);
  const lastValidation = report?.createdAt || runs[0]?.createdAt || "";
  const policyHref = toolHref(campaign.id, "verificacao");
  const previewHref = `/admin/preview/${campaign.slug}`;
  const issues = [...lintIssues(lint.findings, policyHref), ...visualIssues(report, previewHref)];

  return (
    <section aria-label="Central de qualidade" className="flex flex-col gap-ds-16">
      <header>
        <h2 className="text-h2">Central de qualidade</h2>
        <dl className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Campanha" value={campaign.name} />
          <Field label="Produto" value={product} />
          <div>
            <dt className="text-caption text-muted-foreground">Pontuação geral</dt>
            <dd className={`text-h1 ${scoreTone}`}>{lint.score}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Publicação</dt>
            <dd className="mt-ds-4"><Badge tone={published ? "success" : "warning"}>{published ? "Publicada" : "Rascunho"}</Badge></dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Política</dt>
            <dd className="mt-ds-4"><Badge tone={lint.gate === "READY" ? "success" : lint.gate === "BLOCKED" ? "danger" : "review"}>{gateLabel}</Badge></dd>
          </div>
          <Field label="Última validação" value={lastValidation ? formatUpdated(lastValidation) : "Não registrada"} />
        </dl>
      </header>

      <Card>
        <CardContent>
          <p className="text-caption text-muted-foreground">Pontuação de qualidade</p>
          <p className={`mt-ds-4 text-h1 ${scoreTone}`} aria-label={`Pontuação de qualidade ${lint.score} de 100`}>{lint.score}</p>
          <p className="mt-ds-4 text-h3">{readiness}</p>
          <p className="mt-ds-4 text-body text-muted-foreground">Avaliação interna do verificador de política. Não é aprovação do Google Ads.</p>
        </CardContent>
      </Card>

      <WorkspaceTabs
        label="Áreas da qualidade"
        current={ferramenta}
        labelledBy="quality-tab"
        items={[
          { id: "painel", href: toolHref(campaign.id, "painel"), label: "Painel" },
          { id: "verificacao", href: policyHref, label: "Política" },
          { id: "laboratorio", href: toolHref(campaign.id, "laboratorio"), label: "Laboratório" },
          { id: "analytics", href: toolHref(campaign.id, "analytics"), label: "Análises" },
        ]}
      />

      {ferramenta === "painel" ? (
        <Dashboard
          campaign={campaign}
          lint={lint}
          report={report}
          runs={runs}
          issues={issues}
          adsConnected={adsConnected}
          policyHref={policyHref}
          previewHref={previewHref}
        />
      ) : null}
      {ferramenta === "verificacao" ? (
        <Embed>
          <LintPage params={params} searchParams={Promise.resolve({ embedded: "studio" })} />
        </Embed>
      ) : null}
      {ferramenta === "laboratorio" ? (
        <Embed>
          <ValidationLabPage />
        </Embed>
      ) : null}
      {ferramenta === "analytics" ? (
        <Embed>
          <AnalyticsPage params={params} searchParams={Promise.resolve({ range: one(query.range) })} />
        </Embed>
      ) : null}
    </section>
  );
}

function Dashboard({
  campaign,
  lint,
  report,
  runs,
  issues,
  adsConnected,
  policyHref,
  previewHref,
}: {
  campaign: Campaign;
  lint: LintResult;
  report: VisualQaReport | null;
  runs: Array<{ id: string; createdAt: string; status: string; notes: string }>;
  issues: Issue[];
  adsConnected: boolean;
  policyHref: string;
  previewHref: string;
}) {
  const findings = lint.findings;
  const links = categoryFindings(findings, "CTA_AND_LINKS");
  const content = categoryFindings(findings, "CONTENT_QUALITY");
  const ads = categoryFindings(findings, "AD_LANDING_CONSISTENCY");
  const mediaHref = `/admin/${campaign.id}/edit?aba=landing&ferramenta=media`;
  const analytics = readAnalytics(campaign.id);
  const versions = readVersions(campaign.id);

  return (
    <div className="flex flex-col gap-ds-16">
      <section aria-labelledby="quality-categories">
        <h3 id="quality-categories" className="text-h3">Categorias</h3>
        <div className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
          <CategoryCard
            id="qualidade-politica"
            title="Política"
            status={lint.gate === "READY" ? "Aprovada" : lint.gate === "BLOCKED" ? "Falha" : "Atenção"}
            tone={lint.gate === "READY" ? "success" : lint.gate === "BLOCKED" ? "danger" : "warning"}
            score={String(lint.score)}
            warnings={warningCount(findings)}
            href={policyHref}
          />
          <CategoryCard
            id="qualidade-seo"
            title="SEO"
            status="Sem auditoria gravada"
            tone="neutral"
            score="—"
            warnings="Sem auditoria gravada"
            href={`/admin/${campaign.id}/edit?aba=landing`}
          />
          <CategoryCard
            id="qualidade-html"
            title="HTML"
            status={report ? (report.technical.headingOrderOk ? "Ordem de títulos ok" : "Ordem de títulos com aviso") : "Sem auditoria gravada"}
            tone={report ? (report.technical.headingOrderOk ? "success" : "warning") : "neutral"}
            score="—"
            warnings={report ? (report.technical.headingOrderOk ? "Nenhum aviso" : "Ordem de títulos com aviso") : "Sem auditoria gravada"}
            href={previewHref}
          />
          <CategoryCard
            id="qualidade-desempenho"
            title="Desempenho"
            status={report ? "Lighthouse não executado" : "Sem auditoria gravada"}
            tone="neutral"
            score="—"
            warnings={report ? "Lighthouse não executado" : "Sem auditoria gravada"}
            href={previewHref}
          />
          <CategoryCard
            id="qualidade-acessibilidade"
            title="Acessibilidade"
            status={report ? (report.technical.missingAlts === 0 ? "Texto alternativo presente" : "Atenção") : "Sem auditoria gravada"}
            tone={report ? (report.technical.missingAlts === 0 ? "success" : "warning") : "neutral"}
            score="—"
            warnings={report ? `${report.technical.missingAlts} imagens sem texto alternativo` : "Sem auditoria gravada"}
            href={previewHref}
          />
          <CategoryCard
            id="qualidade-links"
            title="Links"
            status={links.length === 0 ? "Sem leitura" : lintWord(worstOf(links))}
            tone={links.length === 0 ? "neutral" : lintTone(worstOf(links))}
            score={displayScore(links)}
            warnings={links.length === 0 ? "Sem leitura" : warningCount(links)}
            href={policyHref}
          />
          <CategoryCard
            id="qualidade-midia"
            title="Mídia"
            status={report ? mediaStatus(report) : "Sem auditoria gravada"}
            tone={report && mediaWarnings(report) === 0 ? "success" : report ? "warning" : "neutral"}
            score="—"
            warnings={report ? (mediaWarnings(report) === 0 ? "Nenhum aviso" : `${mediaWarnings(report)} avisos`) : "Sem auditoria gravada"}
            href={previewHref}
          />
          <CategoryCard
            id="qualidade-ativos"
            title="Ativos"
            status={assetStatus(campaign.productAssetStatus)}
            tone={campaign.productAssetStatus === "READY" ? "success" : "neutral"}
            score="—"
            warnings={campaign.productAssetStatus === "READY" ? "Nenhum aviso" : campaign.productAssetStatus?.trim() ? "Status observado do ativo" : "Não observado"}
            href={mediaHref}
          />
          <CategoryCard
            id="qualidade-conteudo"
            title="Conteúdo"
            status={content.length === 0 ? "Sem leitura" : lintWord(worstOf(content))}
            tone={content.length === 0 ? "neutral" : lintTone(worstOf(content))}
            score={displayScore(content)}
            warnings={content.length === 0 ? "Sem leitura" : warningCount(content)}
            href={policyHref}
          />
          <CategoryCard
            id="qualidade-ads"
            title="Google Ads"
            status={ads.length === 0 ? "Sem leitura" : lintWord(worstOf(ads))}
            tone={ads.length === 0 ? "neutral" : lintTone(worstOf(ads))}
            score={displayScore(ads)}
            warnings={[ads.length === 0 ? "Sem leitura" : warningCount(ads), adsConnected ? "" : "Google Ads não conectado"].filter(Boolean).join(" · ")}
            href={policyHref}
          />
        </div>
      </section>

      <section aria-labelledby="quality-issues">
        <h3 id="quality-issues" className="text-h3">Problemas</h3>
        <div className="mt-ds-12 grid gap-ds-12 lg:grid-cols-2">
          {LEVELS.map((level) => {
            const rows = issues.filter((issue) => issue.level === level.id);
            return (
              <Card key={level.id}>
                <CardContent>
                  <h4 className="text-h3">{level.label}</h4>
                  {rows.length === 0 ? (
                    <p className="mt-ds-8 text-body text-muted-foreground">Nenhum problema neste nível.</p>
                  ) : (
                    <ul className="mt-ds-8 flex flex-col gap-ds-12">
                      {rows.map((issue) => (
                        <li key={issue.id} className="border-t border-border pt-ds-12 first:border-t-0 first:pt-0">
                          <p className="text-body">{issue.description}</p>
                          <p className="mt-ds-4 text-caption text-muted-foreground">Recomendação: {issue.recommendation}</p>
                          <p className="mt-ds-4 text-caption text-muted-foreground">Área: {issue.area}</p>
                          <Button asChild variant="secondary" className="mt-ds-8">
                            <Link href={issue.href}>Abrir área</Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="quality-analytics">
        <h3 id="quality-analytics" className="text-h3">Análises</h3>
        <div className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard subject="CTR" value={analytics ? formatCtr(analytics.ctr) : "n/a"} period="Sessões de CTA / sessões da presell" />
          <MetricCard subject="Conversões" value={analytics ? String(analytics.sales) : "n/a"} period="Vendas atribuídas" />
          <MetricCard subject="Tráfego" value={analytics ? String(analytics.visits) : "n/a"} period="Visitas" />
        </div>
        <div className="mt-ds-12">
          <Button asChild variant="secondary"><Link href={toolHref(campaign.id, "analytics")}>Abrir análises</Link></Button>
        </div>
      </section>

      <section aria-labelledby="quality-history">
        <h3 id="quality-history" className="text-h3">Histórico de validação</h3>
        {runs.length === 0 ? (
          <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma run desta campanha.</p>
        ) : (
          <ol className="mt-ds-8 flex flex-col gap-ds-8">
            {runs.slice(0, 8).map((run) => (
              <li key={run.id}>
                <Card>
                  <CardContent>
                    <p className="text-body">{formatUpdated(run.createdAt)}</p>
                    <p className="mt-ds-4 text-caption text-muted-foreground">Resultado: {run.status}</p>
                    <p className="mt-ds-4 text-caption text-muted-foreground">Usuário: Não registrado</p>
                    <Button asChild variant="secondary" className="mt-ds-8">
                      <Link href={`/admin/validation/${run.id}`}>Abrir run</Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-ds-12">
          <Button asChild variant="secondary"><Link href={toolHref(campaign.id, "laboratorio")}>Abrir laboratório</Link></Button>
        </div>
      </section>

      <section aria-labelledby="quality-timeline">
        <h3 id="quality-timeline" className="text-h3">Linha do tempo da campanha</h3>
        {versions.length === 0 ? (
          <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma versão gravada.</p>
        ) : (
          <ol className="mt-ds-8 flex flex-col gap-ds-8 text-body">
            {versions.map((version) => (
              <li key={version.id}>{`Versão ${version.versionNumber} · ${version.action} · ${formatUpdated(version.createdAt)}${version.comment ? ` · ${version.comment}` : ""}`}</li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="quality-actions">
        <h3 id="quality-actions" className="text-h3">Ações</h3>
        <div className="mt-ds-8 flex flex-wrap gap-ds-8">
          <Button asChild><Link href={toolHref(campaign.id, "laboratorio")}>Executar validação</Link></Button>
          <Button asChild variant="secondary"><Link href={policyHref}>Verificação de política</Link></Button>
          <Button asChild variant="secondary"><Link href={`/admin/${campaign.id}/lint`}>Relatório</Link></Button>
          <Button asChild variant="secondary"><Link href={`/admin/${campaign.id}/edit`}>Abrir campanha</Link></Button>
        </div>
      </section>
    </div>
  );
}

function CategoryCard({
  id,
  title,
  status,
  tone,
  score,
  warnings,
  href,
}: {
  id: string;
  title: string;
  status: string;
  tone: "success" | "warning" | "danger" | "review" | "neutral";
  score: string;
  warnings: string;
  href: string;
}) {
  return (
    <Card id={id}>
      <CardContent>
        <div className="flex items-start justify-between gap-ds-8">
          <h4 className="text-h3">{title}</h4>
          <Badge tone={tone}>{status}</Badge>
        </div>
        <p className="mt-ds-8 text-caption text-muted-foreground">Pontuação</p>
        <p className="text-h2">{score}</p>
        <p className="mt-ds-4 text-caption text-muted-foreground">Avisos</p>
        <p className="text-body">{warnings}</p>
        <Button asChild variant="secondary" className="mt-ds-8">
          <Link href={href}>Abrir</Link>
        </Button>
      </CardContent>
    </Card>
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

function mediaWarnings(report: VisualQaReport) {
  return [...report.deterministicFindings, ...report.visualFindings].filter((finding) => finding.category === "imagery").length;
}

function mediaStatus(report: VisualQaReport) {
  return mediaWarnings(report) === 0 ? "Sem achados de mídia" : "Atenção";
}

function assetStatus(status: string | null | undefined) {
  if (status === "READY") return "Pronto";
  const text = status?.trim();
  return text ? text : "Não observado";
}

function readReport(campaignId: number) {
  try {
    return getLatestVisualQaReport(campaignId);
  } catch {
    return null;
  }
}

function readRuns(campaignId: number) {
  try {
    return listValidationRuns()
      .filter((run) => run.products.some((product) => product.campaignId === campaignId))
      .map((run) => ({ id: run.id, createdAt: run.createdAt, status: run.status, notes: run.notes }));
  } catch {
    return [];
  }
}

function readAnalytics(campaignId: number) {
  try {
    const stats = getCampaignAnalytics(campaignId, "all");
    return { ctr: stats.ctr, sales: stats.commerce.sales, visits: stats.visits };
  } catch {
    return null;
  }
}

function readVersions(campaignId: number) {
  try {
    return listPageVersions(campaignId).slice(0, 8);
  } catch {
    return [];
  }
}
