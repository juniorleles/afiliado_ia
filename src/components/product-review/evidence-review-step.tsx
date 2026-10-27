"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";

const STATE_LABEL: Record<string, string> = {
  READY_FOR_REVIEW: "Pronto para revisão",
  SOURCE_IDENTITY_UNRESOLVED: "Identidade da fonte pendente",
  INSUFFICIENT_EVIDENCE: "Evidência insuficiente",
  HIGH_RISK_CLAIM: "Alegação de alto risco",
  DUPLICATE: "Duplicado",
  ALREADY_ACCEPTED: "Já aprovado",
  REJECTED: "Rejeitado",
};

function toneFor(state: string): "success" | "warning" | "review" | "danger" | "info" | "neutral" {
  if (state === "READY_FOR_REVIEW") return "review";
  if (state === "ALREADY_ACCEPTED") return "success";
  if (state === "HIGH_RISK_CLAIM" || state === "REJECTED") return "danger";
  if (state === "SOURCE_IDENTITY_UNRESOLVED") return "warning";
  return "neutral";
}

export function EvidenceReviewStep({
  summary,
  acceptedCount,
  gapsReady,
  lastReviewAt,
  queue,
  busy,
  onDecide,
  onConfirmIdentity,
}: {
  summary: { total: number; readyForReview: number; identityUnresolved: number; highRisk: number };
  acceptedCount: number;
  gapsReady: number;
  lastReviewAt: string | null;
  queue: PreparedReviewCandidate[];
  busy: boolean;
  onDecide: (candidateId: string, version: number, decision: "ACCEPT" | "REJECT") => void;
  onConfirmIdentity: (host: string) => void;
}) {
  return (
    <div id="etapa-evidencias" className="flex flex-col gap-ds-24" data-evidence-review>
      <section className="grid gap-ds-12 md:grid-cols-3">
        <p className="text-body">Candidatos: {summary.total}</p>
        <p className="text-body">Fatos aprovados: {acceptedCount}</p>
        <p className="text-body">Prontos para revisão: {summary.readyForReview}</p>
        <p className="text-body">Fontes não verificadas: {summary.identityUnresolved}</p>
        <p className="text-body">Alegações de alto risco: {summary.highRisk}</p>
        <p className="text-body">Lacunas com ação humana: {gapsReady}</p>
        <p className="text-caption text-muted-foreground md:col-span-3">Última revisão: {lastReviewAt || "Nenhuma"}</p>
      </section>
      <section className="flex flex-col gap-ds-16">
        {queue.length === 0 ? <p className="text-body text-muted-foreground">Nenhum candidato armazenado para esta campanha.</p> : null}
        {queue.map((item) => (
          <article key={item.candidateId} className="rounded-ds-md border border-border p-ds-16" data-candidate-id={item.candidateId} data-review-state={item.state}>
            <div className="flex flex-wrap items-center justify-between gap-ds-8">
              <h3 className="text-label">{item.field} · {item.candidateId}</h3>
              <Badge tone={toneFor(item.state)}>{STATE_LABEL[item.state] ?? item.state}</Badge>
            </div>
            <p className="mt-ds-12 whitespace-pre-wrap text-body">{item.extractedValue}</p>
            <p className="mt-ds-8 text-caption text-muted-foreground">Fonte: {item.sourceHost || "desconhecida"} · {item.sourceClass} · identidade {item.sourceIdentity} ({item.sourceRole})</p>
            <p className="mt-ds-4 break-all text-caption text-muted-foreground">URL: {item.sourceUrl || "—"}</p>
            <p className="mt-ds-8 text-body">Trecho original: {item.originalExcerpt}</p>
            <p className="mt-ds-8 text-caption">Risco: {item.riskClass}</p>
            <p className="mt-ds-4 text-caption">{item.blocker || "Este candidato pode ser decidido com o material apresentado."}</p>
            <div className="mt-ds-12 flex flex-wrap gap-ds-8">
              {item.availableActions.includes("CONFIRM_SOURCE_IDENTITY") ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onConfirmIdentity(item.sourceHost)}>
                  Confirmar identidade da fonte
                </Button>
              ) : null}
              {item.availableActions.includes("ACCEPT_ELIGIBLE_FACT") ? (
                <Button type="button" size="sm" disabled={busy || !item.eligible} onClick={() => onDecide(item.candidateId, item.version, "ACCEPT")}>
                  Aprovar fato elegível
                </Button>
              ) : null}
              {item.availableActions.includes("REJECT_CANDIDATE") ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REJECT")}>
                  Rejeitar
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
