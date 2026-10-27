"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function sourceLabel(item: FieldProposal): string {
  if (item.sourceType === "SALES_PAGE") return "Página oficial do produto";
  if (item.sourceType === "AFFILIATE_RESOURCE") return "Página de recursos para afiliados";
  return item.sourceUrl || "Fonte não registrada";
}

function statusLabel(item: FieldProposal, researched: boolean): string {
  if (item.status === "ACCEPTED") return "Aprovado";
  if (item.status === "REJECTED") return "Rejeitado";
  if (item.status === "SELLER_STATED") return "Declarado pelo vendedor";
  return displayFieldStatus({ researched, status: item.status });
}

function toneFor(status: string): "success" | "warning" | "review" | "danger" | "info" | "neutral" {
  if (status === "ACCEPTED" || status === "Aprovado") return "success";
  if (status === "REJECTED" || status === "Rejeitado") return "danger";
  if (status === "SELLER_STATED" || status === "Declarado pelo vendedor") return "review";
  return "neutral";
}

function FactCard({
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
  const label = statusLabel(item, researched);
  return (
    <article className="rounded-ds-md border border-border p-ds-16" data-field={item.field} data-proposal-kind={item.proposalKind ?? ""} data-description-kind={item.descriptionKind ?? ""}>
      <div className="flex flex-wrap items-center justify-between gap-ds-8">
        <h3 className="text-label">{LABELS[item.field]}</h3>
        <Badge tone={toneFor(item.status === "ACCEPTED" ? "Aprovado" : item.status)}>{label}</Badge>
      </div>
      <p className="mt-ds-12 whitespace-pre-wrap text-body">{item.suggestedValue || item.currentValue || "Sem evidência suficiente"}</p>
      <p className="mt-ds-8 text-caption text-muted-foreground">Fonte: {sourceLabel(item)}</p>
      {item.proposalKind ? <p className="mt-ds-4 text-caption text-muted-foreground">Classificação editorial: {item.proposalKind}{item.descriptionKind ? ` · ${item.descriptionKind}` : ""}{item.faqKind ? ` · FAQ ${item.faqKind}` : ""}</p> : null}
      {item.supersedesNote ? <p className="mt-ds-4 text-caption text-muted-foreground">{item.supersedesNote}</p> : null}
      {item.status !== "ACCEPTED" && item.status !== "REJECTED" ? (
        <div className="mt-ds-12 flex flex-wrap gap-ds-8">
          <Button type="button" size="sm" disabled={busy || !item.suggestedValue || item.evidenceIncomplete || !item.evidenceIds.length} onClick={() => onDecide(item.field, "ACCEPT")}>
            Aprovar
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy || item.status === "NOT_FOUND"} onClick={() => onDecide(item.field, "REJECT")}>
            Rejeitar
          </Button>
        </div>
      ) : null}
      <Accordion type="single" collapsible className="mt-ds-12">
        <AccordionItem value="evidence">
          <AccordionTrigger>Detalhes da evidência</AccordionTrigger>
          <AccordionContent>
            <p>Evidence ID: {item.evidenceIds.join(", ") || "EVIDENCE_INCOMPLETE"}</p>
            <p>Source Classification: {item.sourceType || item.sourceClass || "—"}</p>
            <p>Collected At: {item.collectedAt || "—"}</p>
            <p>Trecho original: {item.originalText || item.evidenceExcerpt || "—"}</p>
            <p>Trecho recuperado: {item.recoveredText || "—"}</p>
            <p>Grounding / verificação: {item.verification || item.status}</p>
            <p>Status de revisão: {item.status}</p>
            <p className="break-all">URL: {item.sourceUrl || "—"}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </article>
  );
}

export function FactsStep({
  run,
  busy,
  onDecide,
}: {
  run: ProductResearchRun | null;
  busy: boolean;
  onDecide: (fields: ProductResearchField[], action: "ACCEPT" | "REJECT") => void;
}) {
  const researched = Boolean(run && run.status !== "NOT_RESEARCHED" && run.status !== "NEED_URL" && run.status !== "QUEUED" && run.status !== "RESEARCHING");
  const proposals = run?.proposals ?? [];
  const approved = proposals.filter((item) => item.status === "ACCEPTED");
  const found = proposals.filter((item) => item.suggestedValue.trim() && item.status !== "ACCEPTED" && item.status !== "REJECTED");
  const pending = proposals.filter((item) => !item.suggestedValue.trim() || item.status === "CONFLICTING" || item.status === "UNVERIFIED");
  return (
    <div id="etapa-informacoes" className="flex flex-col gap-ds-24">
      <section>
        <h2 className="text-h3">Fatos aprovados</h2>
        {approved.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Nenhum fato aprovado ainda.</p> : (
          <div className="mt-ds-12 flex flex-col gap-ds-16">
            {approved.map((item) => <FactCard key={item.field} item={item} busy={busy} researched={researched} onDecide={(field, action) => onDecide([field], action)} />)}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-h3">Fatos encontrados</h2>
        {found.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Nenhuma proposta pendente de revisão.</p> : (
          <div className="mt-ds-12 flex flex-col gap-ds-16">
            {found.map((item) => <FactCard key={item.field} item={item} busy={busy} researched={researched} onDecide={(field, action) => onDecide([field], action)} />)}
          </div>
        )}
      </section>
      <section>
        <h2 className="text-h3">Fatos pendentes</h2>
        {pending.length === 0 ? <p className="mt-ds-8 text-body text-muted-foreground">Não há lacunas registradas nesta pesquisa.</p> : (
          <ul className="mt-ds-12 grid gap-ds-8">
            {pending.map((item) => (
              <li key={item.field} className="text-body">{LABELS[item.field]} — {statusLabel(item, researched)}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
