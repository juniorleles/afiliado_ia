"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SourceIdentityPanelRow } from "@/lib/presell-quality/commercial-graph";

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
        <h2 className="text-label">Identidade das fontes</h2>
        <p className="mt-ds-8 text-caption text-muted-foreground">
          Confirmar um site de vendedor não confirma o fabricante. Cada ação registra somente a relação escolhida.
        </p>
      </div>
      <div className="grid gap-ds-12 md:grid-cols-2">
        <p className="text-body">Relações de vendedor verificadas: {verifiedSellerRelationships}</p>
        <p className="text-body">Relações de fabricante verificadas: {verifiedManufacturerRelationships}</p>
        <p className="text-body">Relações parcialmente sustentadas: {partiallySupportedRelationships}</p>
        <p className="text-body">Relações sem resolução: {unresolvedRelationships}</p>
      </div>
      {rows.length === 0 ? <p className="text-body text-muted-foreground">Nenhum domínio mapeado.</p> : null}
      {rows.map((row) => (
        <article key={row.host} className="rounded-ds-md border border-border p-ds-16" data-identity-host={row.host}>
          <div className="flex flex-wrap items-center justify-between gap-ds-8">
            <h3 className="text-label">{row.host}</h3>
            <Badge tone={toneFor(row.state)}>{row.state}</Badge>
          </div>
          <p className="mt-ds-12 text-body"><span className="text-caption text-muted-foreground">Identidade encontrada:</span> {row.identityFound}</p>
          <p className="mt-ds-8 text-body"><span className="text-caption text-muted-foreground">Relação com o produto:</span> {row.relationToProduct}</p>
          <p className="mt-ds-8 text-caption">Confiança: {row.confidence}</p>
          <div className="mt-ds-8 flex flex-col gap-ds-8">
            <p className="text-caption text-muted-foreground">Evidências</p>
            {row.evidence.length === 0 ? <p className="text-caption">Nenhum trecho armazenado.</p> : null}
            {row.evidence.map((item) => (
              <p key={item.id} className="break-all text-caption">
                {item.excerpt} {item.url ? `· ${item.url}` : ""} {item.selfDeclared ? "· autodeclaração" : ""}
              </p>
            ))}
          </div>
          <div className="mt-ds-8 flex flex-col gap-ds-4">
            <p className="text-caption text-muted-foreground">Pendências</p>
            {row.pending.map((item) => <p key={item} className="text-caption">{item}</p>)}
          </div>
          <div className="mt-ds-12 flex flex-wrap gap-ds-8">
            {row.availableActions.includes("CONFIRM_SELLER") ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => onConfirm(row.host, "SELLER")}>
                Confirmar site do vendedor
              </Button>
            ) : null}
            {row.availableActions.includes("CONFIRM_AFFILIATE") ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onConfirm(row.host, "AFFILIATE")}>
                Confirmar material de afiliado
              </Button>
            ) : null}
            {row.availableActions.includes("REJECT_RELATION") && row.relationIds[0] ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onReject(row.relationIds[0]!)}>
                Rejeitar relação
              </Button>
            ) : null}
            {row.availableActions.includes("REQUEST_MORE_EVIDENCE") ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onRequestEvidence(row.host)}>
                Pedir mais evidências
              </Button>
            ) : null}
            {row.availableActions.includes("KEEP_PENDING") ? (
              <p className="text-caption text-muted-foreground">Manter pendente não altera o registro.</p>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
