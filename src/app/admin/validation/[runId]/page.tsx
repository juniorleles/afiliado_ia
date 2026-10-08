import Link from "next/link";
import { notFound } from "next/navigation";
import { createValidationRunAction, listDraftsForValidation } from "@/app/admin/validation/actions";
import { PrintReport } from "@/app/admin/validation/print-report";
import { AddProductForms } from "@/app/admin/validation/run-forms";
import { HumanReviewForm } from "@/app/admin/validation/human-review-form";
import {
  brandFromFacts,
  formatUpdated,
  gateTone,
  policyShare,
  publicationPhrase,
  scoreClass,
} from "@/app/admin/validation/validation-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCampaignById } from "@/lib/campaigns";
import { readIntegrationConfiguration } from "@/lib/console/configuration";
import { recommendedLpPreviewPath } from "@/lib/strategy/preview";
import { GENERICITY_FINDINGS } from "@/lib/validation/genericity";
import { getValidationRun, listValidationCandidates, listValidationRuns } from "@/lib/validation/store";
import type { ValidationCandidate, ValidationFailure } from "@/lib/validation/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function createRun() {
  "use server";
  await createValidationRunAction("Local validation lab");
}

function shotSrc(rel: string | null): string | null {
  if (!rel) return null;
  return `/admin/validation/artifact?path=${encodeURIComponent(rel)}`;
}

function issueLevel(failure: ValidationFailure) {
  if (failure.type === "POLICY_BLOCK" || failure.type === "GROUNDING_FAILURE") return "critico";
  if (failure.type === "IMPORT_FAILURE" || failure.type === "ASSET_FAILURE" || failure.type === "GENERATION_FAILURE" || failure.type === "PERFORMANCE_FAILURE") return "alto";
  if (failure.type === "VISUAL_FAILURE" || failure.type === "MOBILE_FAILURE") return "medio";
  return "baixo";
}

export default async function ValidationRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = getValidationRun(runId);
  if (!run) notFound();
  const candidates = listValidationCandidates(runId);
  const drafts = await listDraftsForValidation();
  const product = run.products[0] ?? null;
  const candidate = product
    ? candidates.find((item) => item.strategyMeta?.recommended && item.productKey === product.key)
      || candidates.find((item) => item.productKey === product.key)
      || null
    : candidates[0] ?? null;
  const campaign = product?.campaignId ? getCampaignById(product.campaignId) : null;
  const gate = run.status === "FAILED" ? "FAILED" : candidate?.contentQa.finalGate || "";
  const score = run.summary
    ? policyShare(run.summary.POLICY_READY_COUNT, run.summary.POLICY_REVIEW_COUNT, run.summary.POLICY_BLOCKED_COUNT)
    : "—";
  const tone = gateTone(gate);
  const brand = brandFromFacts(candidate?.factsJson);
  const adsConnected = readIntegrationConfiguration().googleAds === "Connected";
  const landingHref = candidate ? recommendedLpPreviewPath(candidate.productName, candidate.id) : null;
  const history = listValidationRuns().filter((item) => item.products.some((entry) => entry.name === product?.name) || item.id === run.id);

  return (
    <section aria-label="Relatório de validação" className="ds-container flex flex-col gap-ds-24 py-ds-24">
      <header>
        <h1 className="text-h1">{product?.name || "Validação"}</h1>
        <dl className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Campanha" value={campaign?.name || "Não associada"} />
          <Field label="Produto" value={product?.name || "Nenhum produto"} />
          <Field label="Marca" value={brand} />
          <Field label="Data" value={formatUpdated(run.createdAt)} />
          <div>
            <dt className="text-caption text-muted-foreground">Pontuação geral</dt>
            <dd className={`text-h1 ${scoreClass(tone)}`}>{score}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Prontidão</dt>
            <dd className="mt-ds-4"><Badge tone={tone}>{publicationPhrase(gate)}</Badge></dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent><p className="text-caption text-muted-foreground">Pontuação geral</p><p className={`mt-ds-4 text-h2 ${scoreClass(tone)}`}>{score}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Publicação</p><p className="mt-ds-4 text-h3">{publicationPhrase(gate)}</p><p className="mt-ds-4 text-caption text-muted-foreground">Gate interno gravado. Não é aprovação do Google Ads.</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Confiança</p><p className="mt-ds-4 text-h3">{product?.STRATEGY_CONFIDENCE || "Não registrada"}</p></CardContent></Card>
        <Card><CardContent><p className="text-caption text-muted-foreground">Recomendação</p><p className="mt-ds-4 text-body">{product?.STRATEGY_RATIONALE || product?.RECOMMENDED_STRATEGY || "Não registrada"}</p></CardContent></Card>
      </div>

      <section aria-labelledby="validation-results">
        <h2 id="validation-results" className="text-h3">Resultados</h2>
        <div className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
          <ResultCard title="Política" status={publicationPhrase(candidate?.contentQa.policyGate || gate)} tone={gateTone(candidate?.contentQa.policyGate || gate)} score={score} warnings={warningText(candidate?.contentQa.warnings.length ?? 0)} recommendation={candidate?.contentQa.warnings[0] || "Sem recomendação gravada"} />
          <ResultCard title="SEO" status="Sem auditoria gravada" tone="neutral" score="—" warnings="Sem auditoria gravada" recommendation="Sem recomendação gravada" />
          <ResultCard title="HTML" status="Sem auditoria gravada" tone="neutral" score="—" warnings="Sem auditoria gravada" recommendation="Sem recomendação gravada" />
          <ResultCard title="Desempenho" status={candidate?.performance?.lighthouseUsed ? "Lighthouse gravado" : "Lighthouse não executado"} tone="neutral" score={candidate?.performance?.lighthousePerformance != null ? String(candidate.performance.lighthousePerformance) : "—"} warnings={candidate?.performance?.regressionFlags.length ? candidate.performance.regressionFlags.join(", ") : "Lighthouse não executado"} recommendation="Sem recomendação gravada" />
          <ResultCard title="Acessibilidade" status="Sem auditoria gravada" tone="neutral" score="—" warnings="Sem auditoria gravada" recommendation="Sem recomendação gravada" />
          <ResultCard title="Mídia" status={candidate ? visualLabel(candidate.visualQa.status) : "Sem auditoria gravada"} tone={candidate?.visualQa.status === "PASS" ? "success" : candidate?.visualQa.status === "UNAVAILABLE" || !candidate ? "neutral" : "warning"} score="—" warnings={candidate ? `${candidate.visualQa.warningCount} avisos` : "Sem auditoria gravada"} recommendation={candidate?.visualQa.actionCodes[0] || "Sem recomendação gravada"} />
          <ResultCard title="Ativos" status={candidate ? (candidate.assetQa.packshotFound ? "Packshot observado" : "Packshot não observado") : "Sem auditoria gravada"} tone={candidate?.assetQa.packshotFound ? "success" : "neutral"} score="—" warnings={candidate ? `${candidate.assetQa.rejectedAssetCount} rejeitados` : "Sem auditoria gravada"} recommendation="Sem recomendação gravada" />
          <ResultCard title="Evidências" status={groundingLabel(candidate?.contentQa.groundingStatus)} tone={candidate?.contentQa.groundingStatus === "GROUNDED" ? "success" : candidate?.contentQa.groundingStatus === "UNGROUNDED" ? "danger" : "neutral"} score="—" warnings={warningText(candidate?.contentQa.blockingRules.length ?? 0)} recommendation="Sem recomendação gravada" />
          <ResultCard title="Landing page" status={landingHref ? "Prévia disponível" : "Prévia não gravada"} tone={landingHref ? "success" : "neutral"} score="—" warnings={landingHref ? "Prévia interna" : "Prévia não gravada"} recommendation="Sem recomendação gravada" />
          <ResultCard title="Google Ads" status={adsConnected ? "Conectado" : "Google Ads não conectado"} tone={adsConnected ? "success" : "warning"} score="—" warnings={adsConnected ? "Nenhuma sincronização gravada" : "Google Ads não conectado"} recommendation="Não exibido" />
        </div>
      </section>

      <Issues candidate={candidate} />

      <section aria-labelledby="validation-publication">
        <h2 id="validation-publication" className="text-h3">Publicação</h2>
        <p className={`mt-ds-8 text-h2 ${scoreClass(tone)}`}>{publicationPhrase(gate)}</p>
      </section>

      <section aria-labelledby="validation-history">
        <h2 id="validation-history" className="text-h3">Histórico</h2>
        <ol className="mt-ds-8 flex flex-col gap-ds-8">
          {history.slice(0, 8).map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent>
                  <p className="text-body">{formatUpdated(item.createdAt)}</p>
                  <p className="mt-ds-4 text-caption text-muted-foreground">
                    Pontuação: {item.summary ? policyShare(item.summary.POLICY_READY_COUNT, item.summary.POLICY_REVIEW_COUNT, item.summary.POLICY_BLOCKED_COUNT) : "—"}
                  </p>
                  <p className="mt-ds-4 text-caption text-muted-foreground">Usuário: Não registrado</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="validation-actions">
        <h2 id="validation-actions" className="text-h3">Ações</h2>
        <div className="mt-ds-8 flex flex-wrap gap-ds-8">
          <form action={createRun}><Button type="submit">Executar novamente</Button></form>
          {campaign ? <Button asChild variant="secondary"><Link href={`/admin/${campaign.id}/edit`}>Abrir campanha</Link></Button> : <Button type="button" variant="secondary" disabled>Abrir campanha</Button>}
          {landingHref ? <Button asChild variant="secondary"><Link href={landingHref}>Abrir landing page</Link></Button> : <Button type="button" variant="secondary" disabled>Abrir landing page</Button>}
          <PrintReport />
          <Button asChild variant="secondary"><Link href={`/admin/validation/${run.id}/compare`}>Comparar</Link></Button>
          <Button asChild variant="secondary"><Link href="/admin/validation">Validações</Link></Button>
        </div>
      </section>

      <details className="rounded-ds-md border border-border p-ds-16">
        <summary className="cursor-pointer text-body">Ferramentas do laboratório</summary>
        <div className="mt-ds-12 overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
          <AddProductForms runId={run.id} drafts={drafts} productKeys={run.products.map((item) => item.key)} />
          <section className="mt-6 space-y-4">
            {candidates.map((item) => {
              const desktop = shotSrc(item.desktopScreenshot);
              const mobile = shotSrc(item.mobileScreenshot);
              return (
                <article key={item.id} className="rounded-md border border-zinc-800 p-4">
                  <p className="font-medium">{item.productName} · {item.approach}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-zinc-500">Desktop 1440</p>
                      {desktop ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={desktop} alt="" className="mt-1 max-h-56 w-full rounded border border-zinc-800 object-cover object-top" />
                      ) : <p className="text-xs text-zinc-600">sem screenshot</p>}
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Mobile 390</p>
                      {mobile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mobile} alt="" className="mt-1 max-h-56 w-full rounded border border-zinc-800 object-cover object-top" />
                      ) : <p className="text-xs text-zinc-600">sem screenshot</p>}
                    </div>
                  </div>
                  <HumanReviewForm candidateId={item.id} current={item.humanReview} notes={item.humanNotes} />
                </article>
              );
            })}
          </section>
          <details className="mt-4 text-sm text-zinc-400">
            <summary className="cursor-pointer text-zinc-200">Genericity findings</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {GENERICITY_FINDINGS.map((item) => (
                <li key={item.id}><span className="text-zinc-200">{item.area}:</span> {item.observation}</li>
              ))}
            </ul>
          </details>
        </div>
      </details>
    </section>
  );
}

function Issues({ candidate }: { candidate: ValidationCandidate | null }) {
  const groups = [
    { id: "critico", label: "Crítico" },
    { id: "alto", label: "Alto" },
    { id: "medio", label: "Médio" },
    { id: "baixo", label: "Baixo" },
  ] as const;
  const issues = [
    ...(candidate?.failures ?? []).map((failure) => ({
      id: `${failure.type}-${failure.message}`,
      level: issueLevel(failure),
      description: failure.message,
      recommendation: "Sem recomendação gravada",
      area: failure.stage,
    })),
    ...(candidate?.contentQa.warnings ?? []).map((warning, index) => ({
      id: `warn-${index}`,
      level: "medio" as const,
      description: warning,
      recommendation: "Sem recomendação gravada",
      area: "Política",
    })),
  ];
  return (
    <section aria-labelledby="validation-issues">
      <h2 id="validation-issues" className="text-h3">Problemas</h2>
      <div className="mt-ds-12 grid gap-ds-12 lg:grid-cols-2">
        {groups.map((group) => {
          const rows = issues.filter((issue) => issue.level === group.id);
          return (
            <Card key={group.id}>
              <CardContent>
                <h3 className="text-h3">{group.label}</h3>
                {rows.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Nenhum problema neste nível.</p> : (
                  <ul className="mt-ds-8 flex flex-col gap-ds-12">
                    {rows.map((issue) => (
                      <li key={issue.id}>
                        <p className="text-body">{issue.description}</p>
                        <p className="mt-ds-4 text-caption text-muted-foreground">Recomendação: {issue.recommendation}</p>
                        <p className="mt-ds-4 text-caption text-muted-foreground">Área: {issue.area}</p>
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
  );
}

function ResultCard({
  title,
  status,
  tone,
  score,
  warnings,
  recommendation,
}: {
  title: string;
  status: string;
  tone: "success" | "warning" | "danger" | "neutral";
  score: string;
  warnings: string;
  recommendation: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-ds-8">
          <h3 className="text-h3">{title}</h3>
          <Badge tone={tone}>{status}</Badge>
        </div>
        <p className="mt-ds-8 text-caption text-muted-foreground">Pontuação</p>
        <p className="text-h2">{score}</p>
        <p className="mt-ds-4 text-caption text-muted-foreground">Avisos</p>
        <p className="text-body">{warnings}</p>
        <p className="mt-ds-4 text-caption text-muted-foreground">Recomendação</p>
        <p className="text-body">{recommendation}</p>
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

function warningText(count: number) {
  if (count === 0) return "Nenhum aviso";
  return `${count} aviso${count === 1 ? "" : "s"}`;
}

function visualLabel(status: string) {
  if (status === "PASS") return "Aprovada";
  if (status === "REVIEW_REQUIRED") return "Revisão necessária";
  if (status === "UNAVAILABLE") return "Sem auditoria gravada";
  return status;
}

function groundingLabel(status: string | undefined) {
  if (status === "GROUNDED") return "Fundamentada";
  if (status === "REVIEW_REQUIRED") return "Revisão necessária";
  if (status === "UNGROUNDED") return "Sem fundamento";
  return "Sem auditoria gravada";
}
