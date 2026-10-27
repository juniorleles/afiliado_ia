"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateSandboxPresellAction, readSandboxPresellAction } from "@/app/admin/[id]/fatos/research-actions";
import { decorateDiscoveredAssets } from "@/lib/product-research/asset-display";
import { acceptedProposals, approvedContentStatus } from "@/lib/product-research/approved-facts";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import { indicatorsFromResearch } from "@/lib/product-research/indicators";
import type { ApprovedReviewGeneration } from "@/lib/lp-generator/from-approved-review";
import type { ProductResearchRun } from "@/lib/product-research/types";
import type { KnowledgeText } from "@/lib/product-knowledge";

const FACT_LABELS: Array<[string, string]> = [
  ["description", "Descrição"],
  ["ingredients", "Ingredientes"],
  ["benefits", "Benefícios"],
  ["howItWorks", "Modo de uso"],
  ["warnings", "Avisos"],
  ["pricing", "Preço"],
  ["guarantee", "Garantia"],
  ["manufacturer", "Fabricante"],
  ["faq", "FAQ"],
];

function statusLabel(status: ApprovedReviewGeneration["status"] | "READY" | "GENERATING" | null): string {
  if (status === "GENERATING") return "Gerando";
  if (status === "GENERATED") return "Gerado";
  if (status === "FAILED") return "Falha";
  if (status === "INSUFFICIENT_APPROVED_CONTENT") return "Dados insuficientes";
  if (status === "BLOCKED_QUALITY_GATE") return "Bloqueado por Quality Gate";
  return "Pronto para gerar rascunho";
}

export function PreviewStep({
  campaignId,
  run,
  knowledge,
}: {
  campaignId: number;
  run: ProductResearchRun | null;
  knowledge: KnowledgeText;
}) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [generation, setGeneration] = useState<ApprovedReviewGeneration | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const indicators = indicatorsFromResearch(run);
  const approvedFacts = acceptedProposals(run);
  const media = selectReviewMedia({
    assets: run?.discoveredAssets,
    productName: knowledge.brand || run?.productName || "Produto",
    campaignId,
  });
  const missing = FACT_LABELS.filter(([key]) => !approvedFacts.some((item) => item.field === key));
  const insufficientFacts = approvedFacts.length === 0;
  const thin = approvedContentStatus(run) === "INSUFFICIENT_APPROVED_CONTENT";
  const displayStatus = pending ? "GENERATING" : generation?.status ?? (insufficientFacts ? "INSUFFICIENT_APPROVED_CONTENT" : "READY");

  useEffect(() => {
    void readSandboxPresellAction({ campaignId }).then((next) => {
      if (next) setGeneration(next);
    });
  }, [campaignId]);

  function generate() {
    setError("");
    startTransition(async () => {
      try {
        const next = await generateSandboxPresellAction({ campaignId, runId: run?.runId });
        setGeneration(next);
        if (next.status === "FAILED") setError(next.errors.join(" ") || "A geração falhou.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível gerar a Pre-sell SANDBOX.");
      }
    });
  }

  const previewPath = generation?.previewPath ?? null;
  const realPage = Boolean(previewPath && generation?.record);

  return (
    <div id="etapa-previa" className="flex flex-col gap-ds-16" data-presell-status={displayStatus} data-hero-image-status={media.heroStatus}>
      <div className="flex flex-wrap items-center gap-ds-8">
        <Button type="button" onClick={generate} disabled={pending || insufficientFacts} data-generate-sandbox="">
          {pending ? "Gerando…" : "Gerar Pre-sell SANDBOX"}
        </Button>
        <Badge tone={displayStatus === "GENERATED" ? "success" : displayStatus === "FAILED" ? "danger" : "warning"}>
          {statusLabel(displayStatus)}
        </Badge>
        <button type="button" className={`rounded-md border px-3 py-2 text-sm ${viewport === "desktop" ? "border-foreground" : "border-border"}`} onClick={() => setViewport("desktop")}>
          Desktop
        </button>
        <button type="button" className={`rounded-md border px-3 py-2 text-sm ${viewport === "mobile" ? "border-foreground" : "border-border"}`} onClick={() => setViewport("mobile")}>
          Mobile
        </button>
        <Badge tone="danger">Commercial BLOCKED</Badge>
        <Badge tone="danger">Publication BLOCKED</Badge>
      </div>
      {error ? <Alert tone="danger" title="Falha na geração">{error}</Alert> : null}
      {insufficientFacts ? (
        <Alert tone="warning" title="INSUFFICIENT_APPROVED_CONTENT">
          Não há fatos aprovados. O gerador SANDBOX não inventa descrição, benefícios, preço ou garantia.
        </Alert>
      ) : thin ? (
        <Alert tone="warning" title="INSUFFICIENT_APPROVED_CONTENT">
          Os fatos aprovados não bastam para uma Pre-sell editorial completa. A prévia, se gerada, é parcial e honesta. Não está pronta para publicação.
        </Alert>
      ) : (
        <p className="text-body text-muted-foreground">{indicators.sandboxGenerationReadiness.note}</p>
      )}
      {media.heroStatus === "HERO_IMAGE_MISSING" ? (
        <Alert tone="warning" title="HERO_IMAGE_MISSING">
          Nenhuma imagem aprovada tem evidência de packshot do produto. Imagens de ingrediente ou banner não entram no Hero. O Renderer V4 usa o fallback editorial.
        </Alert>
      ) : null}
      {previewPath ? (
        <p className="text-body">
          <a href={previewPath} target="_blank" rel="noreferrer" className="underline" data-sandbox-preview-link="">
            Abrir prévia real do Renderer V4
          </a>
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">Nenhuma Pre-sell SANDBOX persistida para esta campanha.</p>
      )}
      <div className={`mx-auto w-full overflow-hidden rounded-ds-lg border border-border bg-background ${viewport === "mobile" ? "max-w-[390px]" : "max-w-[1440px]"}`} data-sandbox-preview>
        {realPage ? (
          <div className="p-ds-24" data-renderer-v4-frame="">
            <p className="text-caption text-muted-foreground">
              A página real foi gerada no Renderer V4. O painel admin não substitui esse render.
            </p>
            <p className="mt-ds-12 text-body">
              <a href={previewPath ?? undefined} target="_blank" rel="noreferrer" className="underline">
                Abrir visualização {viewport} na rota real
              </a>
            </p>
            <p className="mt-ds-8 text-caption text-muted-foreground">{previewPath}</p>
          </div>
        ) : (
          <div className="p-ds-24">
            <p className="text-caption text-muted-foreground">Prévia SANDBOX · Renderer V4 existente · CTA comercial desativado</p>
            <h2 className="mt-ds-8 text-h2">{knowledge.brand || "Produto"}</h2>
            <p className="mt-ds-16 text-caption text-muted-foreground">
              {media.approvedCount === 0
                ? "Nenhuma imagem aprovada para o rascunho."
                : `${media.approvedCount} imagem(ns) aprovada(s). ${media.usedCount} elegível(is) para uso. Hero: ${media.heroStatus}.`}
            </p>
            <div className="mt-ds-16 flex flex-col gap-ds-12">
              {approvedFacts.map((item) => (
                <section key={item.field}>
                  <h3 className="text-label">{item.field}</h3>
                  <p className="whitespace-pre-wrap text-body">{item.currentValue || item.suggestedValue}</p>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
      <section data-used-facts="">
        <h3 className="text-h3">Dados utilizados</h3>
        <ul className="mt-ds-8 grid gap-ds-8 text-body">
          {approvedFacts.length === 0 ? <li>Nenhum fato aprovado.</li> : null}
          {approvedFacts.map((item) => (
            <li key={item.field}>
              {item.field}: {(item.currentValue || item.suggestedValue).slice(0, 160)}
            </li>
          ))}
        </ul>
      </section>
      <section data-used-images="">
        <h3 className="text-h3">Imagens</h3>
        <p className="mt-ds-8 text-caption text-muted-foreground">
          Aprovadas {media.approvedCount} · Elegíveis {media.eligibleCount} · Utilizadas {media.usedCount}
        </p>
        <ul className="mt-ds-8 grid gap-ds-8 text-body">
          {media.approved.map((item) => (
            <li key={item.assetId} data-asset-id={item.assetId}>
              Aprovada · {item.galleryKind} · {item.role} {item.used ? "· usada" : ""}
            </li>
          ))}
          {media.excluded.map((item) => (
            <li key={`ex-${item.assetId}`}>
              Excluída da página · {item.galleryKind} · {item.exclusionReason ?? "NOT_ELIGIBLE_FOR_ROLE"}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-h3">Bloqueios restantes</h3>
        <ul className="mt-ds-8 grid gap-ds-8 text-body">
          <li>Autorização comercial: BLOCKED</li>
          <li>Publication readiness: BLOCKED</li>
          <li>Grounding: {run?.grounding ?? "NOT_EVALUATED"}</li>
          <li>Images pending: {decorateDiscoveredAssets(run?.discoveredAssets).filter((item) => item.status !== "USER_APPROVED" && item.status !== "REJECTED").length}</li>
          {generation?.errors.map((item) => <li key={item}>Erro: {item}</li>)}
          {missing.map(([key, label]) => <li key={key}>{label} ausente no contrato aprovado</li>)}
        </ul>
      </section>
    </div>
  );
}
