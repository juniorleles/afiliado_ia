"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceIdentityPanel } from "@/components/product-review/source-identity-panel";
import type { PreparedReviewCandidate } from "@/lib/presell-quality/review-prepare";
import type { SourceIdentityPanelRow } from "@/lib/presell-quality/commercial-graph";
import { buildOperationalReviewCard } from "@/lib/presell-quality/operational-theme";

type RegenerationGateView = {
  ready: boolean;
  status: "APPROVED_FACTS_READY_FOR_REGENERATION" | "AWAITING_HUMAN_REVIEW";
};

const STATE_LABEL: Record<string, string> = {
  READY_FOR_REVIEW: "Pronto para revisão",
  SOURCE_IDENTITY_UNRESOLVED: "Identidade da fonte pendente",
  INSUFFICIENT_EVIDENCE: "Evidência insuficiente",
  HIGH_RISK_CLAIM: "Alegação de alto risco",
  DUPLICATE: "Duplicado",
  ALREADY_ACCEPTED: "Já aprovado",
  REJECTED: "Rejeitado",
};

const THEME_LABEL: Record<string, string> = {
  SHIPPING: "Envio",
  DELIVERY: "Entrega",
  RETURNS: "Devolução",
  REFUND: "Reembolso",
  COMMERCIAL_TERMS: "Condições comerciais",
  QUANTITY: "Quantidade",
  PRODUCT_FORMAT: "Formato",
  SELLER_CONTACT: "Contato",
  OTHER: "Outro assunto operacional",
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
  identityPanel,
  verifiedSellerRelationships,
  verifiedManufacturerRelationships,
  partiallySupportedRelationships,
  unresolvedRelationships,
  regenerationGate,
  busy,
  onDecide,
  onConfirmIdentity,
  onRejectRelation,
  onRequestEvidence,
}: {
  summary: { total: number; readyForReview: number; identityUnresolved: number; insufficientEvidence: number; highRisk: number };
  acceptedCount: number;
  gapsReady: number;
  lastReviewAt: string | null;
  queue: PreparedReviewCandidate[];
  identityPanel: SourceIdentityPanelRow[];
  verifiedSellerRelationships: number;
  verifiedManufacturerRelationships: number;
  partiallySupportedRelationships: number;
  unresolvedRelationships: number;
  regenerationGate?: RegenerationGateView | null;
  busy: boolean;
  onDecide: (candidateId: string, version: number, decision: "ACCEPT" | "REJECT" | "REQUEST_NEW_EVIDENCE" | "KEEP_PENDING") => void;
  onConfirmIdentity: (host: string, scope: "SELLER" | "AFFILIATE") => void;
  onRejectRelation: (relationId: string) => void;
  onRequestEvidence: (host: string) => void;
}) {
  const cards = [...queue].sort((left, right) => Number(right.eligible) - Number(left.eligible)).map((item) => ({
    item,
    card: buildOperationalReviewCard(item),
  }));
  const clusterCount = cards.reduce<Record<string, number>>((acc, row) => {
    acc[row.card.clusterKey] = (acc[row.card.clusterKey] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div id="etapa-evidencias" className="flex flex-col gap-ds-24" data-evidence-review data-operational-review>
      <section className="grid gap-ds-12 md:grid-cols-3">
        <p className="text-body">Candidatos: {summary.total}</p>
        <p className="text-body">Fatos aprovados: {acceptedCount}</p>
        <p className="text-body">Desbloqueados para revisão: {summary.readyForReview}</p>
        <p className="text-body">Ainda pendentes de identidade: {summary.identityUnresolved}</p>
        <p className="text-body">Exigem evidência adicional: {summary.insufficientEvidence}</p>
        <p className="text-body">Alegações de alto risco: {summary.highRisk}</p>
        <p className="text-body">Lacunas com ação humana: {gapsReady}</p>
        <p className="text-caption text-muted-foreground md:col-span-3">Última revisão: {lastReviewAt || "Nenhuma"}</p>
      </section>
      <section className="rounded-ds-md border border-border p-ds-16" data-regeneration-gate={regenerationGate?.status ?? "AWAITING_HUMAN_REVIEW"}>
        <p className="text-label">Regeneração da Pre-sell</p>
        <p className="mt-ds-8 text-body">{regenerationGate?.status ?? "AWAITING_HUMAN_REVIEW"}</p>
        <p className="mt-ds-8 text-caption text-muted-foreground">
          {regenerationGate?.ready
            ? "Novos fatos aprovados estão prontos para um plano de geração. Aprovação de fatos não autoriza gasto com IA."
            : "Nenhum fato operacional novo foi aprovado por um administrador. A página não será regenerada nesta execução."}
        </p>
      </section>
      <SourceIdentityPanel
        rows={identityPanel}
        verifiedSellerRelationships={verifiedSellerRelationships}
        verifiedManufacturerRelationships={verifiedManufacturerRelationships}
        partiallySupportedRelationships={partiallySupportedRelationships}
        unresolvedRelationships={unresolvedRelationships}
        busy={busy}
        onConfirm={onConfirmIdentity}
        onReject={onRejectRelation}
        onRequestEvidence={onRequestEvidence}
      />
      <section className="flex flex-col gap-ds-16">
        {queue.length === 0 ? <p className="text-body text-muted-foreground">Nenhum candidato armazenado para esta campanha.</p> : null}
        {summary.readyForReview > 0 ? <p className="text-label" data-ready-highlight>Candidatos prontos para revisão: {summary.readyForReview}</p> : null}
        {cards.map(({ item, card }) => (
          <article key={item.candidateId} className={`rounded-ds-md border p-ds-16 ${item.eligible ? "border-primary" : "border-border"}`} data-candidate-id={item.candidateId} data-review-state={item.state} data-ready={item.eligible ? "true" : "false"} data-theme={card.theme}>
            <div className="flex flex-wrap items-center justify-between gap-ds-8">
              <h3 className="text-label">{card.title} · {item.candidateId}</h3>
              <Badge tone={toneFor(item.state)}>{STATE_LABEL[item.state] ?? item.state}</Badge>
            </div>
            <p className="mt-ds-8 text-caption">{THEME_LABEL[card.theme] ?? card.theme}{clusterCount[card.clusterKey] > 1 ? ` · ${clusterCount[card.clusterKey]} candidatos no mesmo tema` : ""}</p>
            <p className="mt-ds-12 text-body">{card.summary}</p>
            <p className="mt-ds-8 whitespace-pre-wrap text-body">{item.extractedValue}</p>
            <p className="mt-ds-8 text-caption text-muted-foreground">Fonte: {item.sourceHost || "desconhecida"} · {item.sourceClass} · declaração {card.declarationType} · identidade {item.sourceIdentity} ({item.sourceRole})</p>
            <p className="mt-ds-4 break-all text-caption text-muted-foreground">URL: {item.sourceUrl || "—"}</p>
            <p className="mt-ds-8 text-body">Trecho original: {item.originalExcerpt}</p>
            <p className="mt-ds-8 text-caption">Condições: {card.conditions.join(" ")}</p>
            <p className="mt-ds-8 text-caption">Risco: {item.riskClass}</p>
            <p className="mt-ds-4 text-caption">Uso na página: {card.pageUse}</p>
            <p className="mt-ds-4 text-caption">Estado de aprovação: {STATE_LABEL[item.state] ?? item.state}</p>
            <p className="mt-ds-4 text-caption">{item.blocker || "Este candidato pode ser decidido com o material apresentado."}</p>
            <div className="mt-ds-12 flex flex-wrap gap-ds-8">
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
              {item.availableActions.includes("REQUEST_NEW_EVIDENCE") ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "REQUEST_NEW_EVIDENCE")}>
                  Pedir evidência adicional
                </Button>
              ) : null}
              {item.availableActions.includes("KEEP_PENDING") ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(item.candidateId, item.version, "KEEP_PENDING")}>
                  Manter pendente
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
