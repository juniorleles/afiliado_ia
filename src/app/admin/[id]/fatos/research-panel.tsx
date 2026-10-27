"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideProductFactsResearchAction, executeProductFactsResearchAction, readProductFactsResearchAction, startProductFactsResearchAction } from "@/app/admin/[id]/fatos/research-actions";
import { WizardSection } from "@/components/campaign-wizard/wizard-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayFieldStatus } from "@/lib/product-research/indicators";
import type { FieldProposal, ProductResearchField, ProductResearchRun } from "@/lib/product-research/types";

const LABELS: Record<ProductResearchField, string> = {
  description: "Descrição",
  ingredients: "Ingredientes",
  benefits: "Benefícios",
  howItWorks: "Modo de uso",
  warnings: "Avisos",
  pricing: "Preço",
  guarantee: "Garantia",
  manufacturer: "Fabricante",
  faq: "FAQ",
  images: "Imagens",
  videos: "Vídeos",
};

function toneFor(status: string): "success" | "warning" | "review" | "danger" | "info" | "neutral" {
  if (status === "ACCEPTED" || status === "COMPLETED" || status === "PASS") return "success";
  if (status === "NEED_URL" || status === "FAILED" || status === "BLOCKED" || status === "REJECTED") return "danger";
  if (status === "RESEARCHING" || status === "QUEUED") return "info";
  if (status === "CONFLICTING" || status === "UNVERIFIED") return "warning";
  if (status === "FOUND_REVIEW_REQUIRED" || status === "SELLER_STATED") return "review";
  return "neutral";
}

function FieldCard({
  item,
  busy,
  researched,
  onDecide,
}: {
  item: FieldProposal;
  busy: boolean;
  researched: boolean;
  onDecide: (field: ProductResearchField, action: "ACCEPT" | "REJECT") => void;
}) {
  const status = displayFieldStatus({ researched, status: item.status });
  return (
    <article className="rounded-ds-md border border-border p-ds-16">
      <div className="flex flex-wrap items-center justify-between gap-ds-8">
        <h3 className="text-label">{LABELS[item.field]}</h3>
        <Badge tone={toneFor(item.status)}>{status}</Badge>
      </div>
      <dl className="mt-ds-12 grid gap-ds-12">
        <div>
          <dt className="text-caption text-muted-foreground">Valor atual</dt>
          <dd className="whitespace-pre-wrap text-body">{item.currentValue || "Vazio"}</dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">Valor sugerido</dt>
          <dd className="whitespace-pre-wrap text-body">{item.suggestedValue || "Sem evidência suficiente"}</dd>
        </div>
        <div className="grid gap-ds-8 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-muted-foreground">Fonte</dt>
            <dd className="break-all text-body">{item.sourceUrl || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Classificação da fonte</dt>
            <dd className="text-body">{item.sourceType || item.sourceClass || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Evidência</dt>
            <dd className="text-body">
              {item.evidenceIds.join(", ") || "EVIDENCE_INCOMPLETE"}
              {item.evidenceExcerpt ? ` — ${item.evidenceExcerpt}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Coletado em</dt>
            <dd className="text-body">{item.collectedAt || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Status</dt>
            <dd className="text-body">{item.verification || item.status}</dd>
          </div>
        </div>
      </dl>
      {item.notes.length ? <p className="mt-ds-8 text-caption text-muted-foreground">{item.notes[0]}</p> : null}
      <div className="mt-ds-12 flex flex-wrap gap-ds-8">
        <Button type="button" size="sm" disabled={busy || !item.suggestedValue || item.evidenceIncomplete || !item.evidenceIds.length} onClick={() => onDecide(item.field, "ACCEPT")}>
          Aceitar
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy || item.status === "NOT_FOUND"} onClick={() => onDecide(item.field, "REJECT")}>
          Rejeitar
        </Button>
      </div>
    </article>
  );
}

export function ProductResearchPanel({
  campaignId,
  initial,
  defaultProductUrl,
  defaultAffiliateResourceUrl = "",
}: {
  campaignId: number;
  initial: ProductResearchRun | null;
  defaultProductUrl: string;
  defaultAffiliateResourceUrl?: string;
}) {
  const router = useRouter();
  const [run, setRun] = useState<ProductResearchRun | null>(initial);
  const [productUrl, setProductUrl] = useState(defaultProductUrl);
  const [affiliateResourceUrl, setAffiliateResourceUrl] = useState(defaultAffiliateResourceUrl);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRun((current) => {
      if (!initial) return current;
      if (!current) return initial;
      if (initial.runId !== current.runId) return initial;
      if (initial.coverageTotal !== current.coverageTotal || initial.reviewAccepted !== current.reviewAccepted) return initial;
      return current;
    });
  }, [initial]);

  useEffect(() => {
    if (!run || (run.status !== "QUEUED" && run.status !== "RESEARCHING")) return;
    const timer = window.setInterval(() => {
      void readProductFactsResearchAction({ campaignId, runId: run.runId }).then((next) => {
        if (next) setRun(next);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [campaignId, run]);

  function start() {
    setError("");
    startTransition(async () => {
      try {
        const created = await startProductFactsResearchAction({ campaignId, productUrl, affiliateResourceUrl });
        setRun(created);
        if (created.status === "QUEUED" || created.status === "RESEARCHING") {
          const finished = await executeProductFactsResearchAction({ campaignId, runId: created.runId });
          setRun(finished);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível iniciar a pesquisa.");
      }
    });
  }

  function decide(fields: ProductResearchField[], action: "ACCEPT" | "REJECT") {
    if (!run) return;
    startTransition(async () => {
      try {
        setRun(await decideProductFactsResearchAction({ campaignId, runId: run.runId, fields, action }));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível registrar a decisão.");
      }
    });
  }

  const researched = Boolean(run && run.status !== "NOT_RESEARCHED" && run.status !== "NEED_URL" && run.status !== "QUEUED" && run.status !== "RESEARCHING");
  const found = run?.proposals.filter((item) => item.suggestedValue.trim()) ?? [];
  const pendingFields = run?.proposals.filter((item) => !item.suggestedValue.trim() || item.status === "CONFLICTING" || item.status === "UNVERIFIED") ?? [];
  const batch = found.filter((item) => item.eligibleForBatch && item.status !== "ACCEPTED").map((item) => item.field);
  const busy = pending || run?.status === "QUEUED" || run?.status === "RESEARCHING";

  return (
    <div className="flex flex-col gap-ds-32">
      <WizardSection id="pesquisa-automatica" title="Pesquisa automática">
        <p className="text-body text-muted-foreground">
          Reutiliza o pipeline de pesquisa do laboratório. O resultado é uma proposta revisável e não altera fatos já aprovados.
        </p>
        <div className="grid gap-ds-16 lg:grid-cols-2">
          <div className="flex flex-col gap-ds-8">
            <Label htmlFor="research-product-url">Página de vendas</Label>
            <Input
              id="research-product-url"
              value={productUrl}
              onChange={(event) => setProductUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex flex-col gap-ds-8">
            <Label htmlFor="research-affiliate-resource-url">Página de recursos para afiliados</Label>
            <Input
              id="research-affiliate-resource-url"
              value={affiliateResourceUrl}
              onChange={(event) => setAffiliateResourceUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>
          <p className="text-caption text-muted-foreground lg:col-span-2">
            Basta uma fonte elegível. Checkout e HopLink não são pesquisados. Destino autorizado não é preenchido automaticamente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-ds-12">
          <Button type="button" onClick={start} disabled={busy}>
            Pesquisar fatos automaticamente
          </Button>
          {run ? <Badge tone={toneFor(run.status)}>{run.status}</Badge> : <Badge tone="neutral">NOT_RESEARCHED</Badge>}
          {run?.finishedAt ? <p className="text-caption text-muted-foreground">Última pesquisa: {run.finishedAt}</p> : null}
        </div>
        {run?.stage && run.status === "RESEARCHING" ? <p className="text-caption">Etapa: {run.stage}</p> : null}
        {error ? <Alert tone="danger" title="Pesquisa interrompida">{error}</Alert> : null}
        {run?.status === "NEED_URL" ? <Alert tone="warning" title="URL necessária">{run.seedRejection}</Alert> : null}
        {run?.status === "FAILED" || run?.status === "TIMED_OUT" ? <Alert tone="danger" title="Pesquisa sem resultado">{run.error}</Alert> : null}
        {run?.limitations.length ? <p className="text-caption text-muted-foreground">{run.limitations[0]}</p> : null}
      </WizardSection>

      {run?.campaignSources?.length ? (
        <WizardSection id="fontes-classificadas" title="Fontes classificadas">
          <ul className="grid gap-ds-8">
            {run.campaignSources.map((item) => (
              <li key={item.sourceId} className="text-body">
                <Badge tone={item.sourceStatus === "CHECKOUT_SUSPECTED" || item.sourceStatus === "BLOCKED" ? "danger" : "neutral"}>
                  {item.sourceStatus}
                </Badge>{" "}
                {item.sourceType} — {item.originalUrl}
              </li>
            ))}
          </ul>
        </WizardSection>
      ) : null}

      {run?.affiliatePolicy ? (
        <WizardSection id="regras-afiliado" title="Regras para afiliados">
          <p className="text-caption text-muted-foreground">
            UNKNOWN não significa permitido. Este contrato não autoriza publicação comercial.
          </p>
          <dl className="grid gap-ds-12 sm:grid-cols-2">
            {(
              [
                ["Brand bidding", run.affiliatePolicy.brandBiddingPolicy.verdict],
                ["Paid search", run.affiliatePolicy.paidSearchPolicy.verdict],
                ["Direct linking", run.affiliatePolicy.directLinkingPolicy.verdict],
                ["Pre-sell", run.affiliatePolicy.presellPolicy.verdict],
              ] as const
            ).map(([label, verdict]) => (
              <div key={label}>
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="text-body">{verdict}</dd>
              </div>
            ))}
          </dl>
        </WizardSection>
      ) : null}

      {run?.discoveredAssets?.length ? (
        <WizardSection id="assets-descobertos" title="Assets descobertos">
          <p className="text-caption text-muted-foreground">Nenhuma imagem é aprovada automaticamente nem enviada ao Renderer V4.</p>
          <ul className="grid gap-ds-8">
            {run.discoveredAssets.map((item) => (
              <li key={item.assetUrl} className="break-all text-body">
                {item.status} — {item.assetType} — {item.assetUrl}
              </li>
            ))}
          </ul>
        </WizardSection>
      ) : null}

      <WizardSection id="cobertura-revisao" title="Cobertura e revisão">
        <dl className="grid gap-ds-16 sm:grid-cols-3">
          <div>
            <dt className="text-caption text-muted-foreground">Research Coverage</dt>
            <dd className="text-h3">{run ? `${run.coverageTotal}/${run.coverageMax}` : "0/100"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Review Completion</dt>
            <dd className="text-h3">{run && run.reviewTotal ? Math.round((run.reviewAccepted / run.reviewTotal) * 100) : 0}%</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Publication Readiness</dt>
            <dd className="text-h3">{run?.publicationReadiness ?? "BLOCKED"}</dd>
          </div>
        </dl>
        <p className="text-caption text-muted-foreground">
          Cobertura alta não autoriza comércio. {run?.publicationReason ?? "A aprovação de publicação continua humana."}
        </p>
        <div className="flex flex-wrap gap-ds-8">
          <Badge tone={toneFor(run?.grounding ?? "NOT_EVALUATED")}>Grounding {run?.grounding ?? "NOT_EVALUATED"}</Badge>
          <Badge tone={toneFor(run?.neutrality ?? "NOT_EVALUATED")}>Neutrality {run?.neutrality ?? "NOT_EVALUATED"}</Badge>
          <Badge tone={toneFor(run?.contentQuality ?? "NOT_EVALUATED")}>Quality {run?.contentQuality ?? "NOT_EVALUATED"}</Badge>
          <Badge tone="danger">Commercial BLOCKED</Badge>
        </div>
      </WizardSection>

      <WizardSection id="informacoes-encontradas" title="Informações encontradas">
        {found.length === 0 ? (
          <p className="text-body text-muted-foreground">Nenhuma proposta revisável ainda.</p>
        ) : (
          <div className="flex flex-col gap-ds-16">
            {batch.length > 0 ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => decide(batch, "ACCEPT")}>
                Aceitar elegíveis
              </Button>
            ) : null}
            {found.map((item) => (
              <FieldCard key={item.field} item={item} busy={busy} researched={researched} onDecide={(field, action) => decide([field], action)} />
            ))}
          </div>
        )}
      </WizardSection>

      <WizardSection id="informacoes-pendentes" title="Informações pendentes">
        {pendingFields.length === 0 ? (
          <p className="text-body text-muted-foreground">Não há lacunas registradas nesta pesquisa.</p>
        ) : (
          <ul className="grid gap-ds-8">
            {pendingFields.map((item) => (
              <li key={item.field} className="text-body">
                {LABELS[item.field]} — {displayFieldStatus({ researched, status: item.status })}
              </li>
            ))}
          </ul>
        )}
      </WizardSection>
    </div>
  );
}
