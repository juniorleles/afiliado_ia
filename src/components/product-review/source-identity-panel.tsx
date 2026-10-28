"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { SourceIdentityPanelRow } from "@/lib/presell-quality/commercial-graph";
import { REVIEW_COPY, REVIEW_IDENTITY_STATE_LABEL, friendlyIdentity } from "@/lib/presell-quality/review-labels";

function toneFor(state: string): "success" | "warning" | "review" | "danger" | "info" | "neutral" {
  if (state === "VERIFIED") return "success";
  if (state === "PARTIALLY_SUPPORTED") return "review";
  if (state === "CONTRADICTED") return "danger";
  return "warning";
}

export function SourceIdentityPanel({
  rows,
  verifiedSellerRelationships,
  verifiedManufacturerRelationships,
  partiallySupportedRelationships,
  unresolvedRelationships,
  busy,
  onConfirm,
  onReject,
  onRequestEvidence,
}: {
  rows: SourceIdentityPanelRow[];
  verifiedSellerRelationships: number;
  verifiedManufacturerRelationships: number;
  partiallySupportedRelationships: number;
  unresolvedRelationships: number;
  busy: boolean;
  onConfirm: (host: string, scope: "SELLER" | "AFFILIATE") => void;
  onReject: (relationId: string) => void;
  onRequestEvidence: (host: string) => void;
}) {
  return (
    <section className="flex flex-col gap-ds-16" data-source-identity-panel>
      <div>
        <h2 className="text-label">{REVIEW_COPY.identityTitle}</h2>
        <p className="mt-ds-8 text-caption text-muted-foreground">{REVIEW_COPY.identityHelp}</p>
      </div>
      <div className="grid gap-ds-12 md:grid-cols-2">
        <p className="text-body">Sites de venda confirmados: {verifiedSellerRelationships}</p>
        <p className="text-body">Fabricantes confirmados: {verifiedManufacturerRelationships}</p>
        <p className="text-body">Relações parcialmente documentadas: {partiallySupportedRelationships}</p>
        <p className="text-body">Sites ainda sem confirmação: {unresolvedRelationships}</p>
      </div>
      {rows.length === 0 ? <p className="text-body text-muted-foreground">Nenhum site mapeado.</p> : null}
      {rows.map((row) => {
        const friendly = friendlyIdentity(row);
        const canConfirm = row.availableActions.includes("CONFIRM_SELLER") || row.availableActions.includes("CONFIRM_AFFILIATE");
        return (
          <article key={row.host} className="rounded-ds-md border border-border p-ds-16" data-identity-host={row.host}>
            <div className="flex flex-wrap items-center justify-between gap-ds-8">
              <h3 className="text-label">{friendly.title}</h3>
              <Badge tone={toneFor(row.state)}>{REVIEW_IDENTITY_STATE_LABEL[row.state] ?? "Em análise"}</Badge>
            </div>
            <p className="mt-ds-12 text-body">{friendly.explanation}</p>
            <p className="mt-ds-8 text-caption text-muted-foreground">{row.host}</p>
            <div className="mt-ds-12 flex flex-wrap gap-ds-8">
              {canConfirm && row.availableActions.includes("CONFIRM_SELLER") ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => onConfirm(row.host, "SELLER")}>
                  {REVIEW_COPY.confirmSeller}
                </Button>
              ) : null}
              {canConfirm && row.availableActions.includes("CONFIRM_AFFILIATE") ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onConfirm(row.host, "AFFILIATE")}>
                  {REVIEW_COPY.confirmAffiliate}
                </Button>
              ) : null}
              {row.availableActions.includes("REJECT_RELATION") && row.relationIds[0] ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onReject(row.relationIds[0]!)}>
                  {REVIEW_COPY.rejectRelation}
                </Button>
              ) : null}
              {row.availableActions.includes("REQUEST_MORE_EVIDENCE") ? (
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onRequestEvidence(row.host)}>
                  {REVIEW_COPY.requestProof}
                </Button>
              ) : null}
              {row.availableActions.includes("KEEP_PENDING") ? (
                <p className="text-caption text-muted-foreground">{REVIEW_COPY.decideLater} não altera o registro.</p>
              ) : null}
            </div>
            <Accordion type="single" collapsible className="mt-ds-16">
              <AccordionItem value="tech">
                <AccordionTrigger>{REVIEW_COPY.technical}</AccordionTrigger>
                <AccordionContent>
                  <p>Host: {row.host}</p>
                  <p>Identidade interna: {row.identityFound}</p>
                  <p>Relação: {row.relationToProduct}</p>
                  <p>Confiança: {row.confidence}</p>
                  {row.pending.map((item) => <p key={item}>{item}</p>)}
                  {row.evidence.map((item) => (
                    <p key={item.id} className="break-all">{item.excerpt} {item.url ? `· ${item.url}` : ""}</p>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </article>
        );
      })}
    </section>
  );
}
