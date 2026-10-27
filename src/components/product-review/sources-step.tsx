"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presentCampaignSources } from "@/lib/campaign-sources/present";
import type { CampaignSource } from "@/lib/campaign-sources/types";
import type { ProductResearchRun } from "@/lib/product-research/types";

function tone(status: string): "success" | "danger" | "neutral" | "warning" {
  if (status === "VALID") return "success";
  if (status === "CHECKOUT_SUSPECTED" || status === "BLOCKED") return "danger";
  if (status === "RESTRICTED") return "warning";
  return "neutral";
}

function SourceField({
  id,
  label,
  value,
  status,
  hint,
  readOnly = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  status: string;
  hint: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-ds-8">
      <div className="flex items-center gap-ds-8">
        <Label htmlFor={id}>{label}</Label>
        <Badge tone={tone(status)}>{status}</Badge>
      </div>
      <Input id={id} value={value} readOnly={readOnly} onChange={onChange ? (event) => onChange(event.target.value) : undefined} placeholder="https://" />
      <p className="text-caption text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SourcesStep({
  sources,
  productUrl,
  affiliateResourceUrl,
  onProductUrl,
  onAffiliateResourceUrl,
  onSearch,
  busy,
  run,
  error,
}: {
  sources: CampaignSource[];
  productUrl: string;
  affiliateResourceUrl: string;
  onProductUrl: (value: string) => void;
  onAffiliateResourceUrl: (value: string) => void;
  onSearch: () => void;
  busy: boolean;
  run: ProductResearchRun | null;
  error: string;
}) {
  const presented = presentCampaignSources(sources);
  const hop = presented.trackingHop?.originalUrl ?? "";
  return (
    <div id="etapa-fontes" className="flex flex-col gap-ds-24">
      <SourceField
        id="review-sales-url"
        label="Página de vendas"
        value={productUrl}
        status={presented.salesPage?.sourceStatus ?? "NOT_CHECKED"}
        hint="Página comercial atual. Checkout histórico não entra neste campo."
        onChange={onProductUrl}
      />
      <SourceField
        id="review-affiliate-resource-url"
        label="Página de recursos para afiliados"
        value={affiliateResourceUrl}
        status={presented.affiliateResource?.sourceStatus ?? "NOT_CHECKED"}
        hint="Materiais do vendedor. Não comprova alegações de saúde."
        onChange={onAffiliateResourceUrl}
      />
      <SourceField
        id="review-hop-url"
        label="HopLink de rastreamento"
        value={hop}
        status={presented.trackingHop?.sourceStatus ?? "NOT_CHECKED"}
        hint="Metadado de rastreamento. Não é CTA comercial nem destino autorizado."
        readOnly
      />
      <div className="flex flex-col gap-ds-8">
        <div className="flex items-center gap-ds-8">
          <Label>Destino autorizado</Label>
          <Badge tone="neutral">{presented.authorizedDestination?.sourceStatus ?? "NOT_CHECKED"}</Badge>
        </div>
        <p className="text-body">{presented.authorizedDestination?.originalUrl || "Vazio. Não é preenchido automaticamente."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-ds-12">
        <Button type="button" onClick={onSearch} disabled={busy}>
          Pesquisar produto
        </Button>
        {run ? <Badge tone={run.status === "COMPLETED" ? "success" : "info"}>{run.status}</Badge> : <Badge tone="neutral">NOT_RESEARCHED</Badge>}
        {run?.finishedAt ? <p className="text-caption text-muted-foreground">Última pesquisa: {run.finishedAt}</p> : null}
      </div>
      {error ? <Alert tone="danger" title="Pesquisa interrompida">{error}</Alert> : null}
      <Accordion type="single" collapsible>
        <AccordionItem value="historico">
          <AccordionTrigger>Detalhes e auditoria de URLs</AccordionTrigger>
          <AccordionContent>
            <ul className="grid gap-ds-8">
              {presented.historical.length === 0 ? <li>Nenhum registro histórico além das fontes atuais.</li> : null}
              {presented.historical.map((item) => (
                <li key={item.sourceId} className="break-all">
                  <Badge tone={tone(item.sourceStatus)}>{item.sourceStatus}</Badge> {item.sourceType} — {item.originalUrl}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
        {run?.affiliatePolicy ? (
          <AccordionItem value="regras">
            <AccordionTrigger>Regras para afiliados</AccordionTrigger>
            <AccordionContent>
              <p className="mb-ds-8">UNKNOWN não significa permitido. Este contrato não autoriza publicação comercial.</p>
              <p>Brand bidding: {run.affiliatePolicy.brandBiddingPolicy.verdict}</p>
              <p>Paid search: {run.affiliatePolicy.paidSearchPolicy.verdict}</p>
              <p>Direct linking: {run.affiliatePolicy.directLinkingPolicy.verdict}</p>
              <p>Pre-sell: {run.affiliatePolicy.presellPolicy.verdict}</p>
            </AccordionContent>
          </AccordionItem>
        ) : null}
      </Accordion>
    </div>
  );
}
