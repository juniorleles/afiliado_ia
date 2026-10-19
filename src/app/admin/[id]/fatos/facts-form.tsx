import { saveProductFactsAction } from "@/app/admin/[id]/fatos/actions";
import { WizardSection } from "@/components/campaign-wizard/wizard-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { KnowledgeText } from "@/lib/product-knowledge";

function Extracted({ show }: { show: boolean }) {
  if (!show) return null;
  return <Badge tone="info">Extraído</Badge>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-ds-4">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-body">{value || "Não informado"}</p>
    </div>
  );
}

function Area({
  id,
  name,
  label,
  value,
  extracted,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  extracted: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-8">
        <Label htmlFor={id}>{label}</Label>
        <Extracted show={extracted} />
      </div>
      <Textarea id={id} name={name} defaultValue={value} rows={5} />
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ProductFactsForm({
  campaignId,
  text,
  extracted,
  locked,
  returnToStrategy = false,
}: {
  campaignId: number;
  text: KnowledgeText;
  extracted: Record<string, boolean>;
  locked: { product: string; marketplace: string; language: string; country: string };
  returnToStrategy?: boolean;
}) {
  return (
    <form action={saveProductFactsAction} className="flex flex-col gap-ds-32">
      <input type="hidden" name="campaignId" value={campaignId} />
      {returnToStrategy ? <input type="hidden" name="retorno" value="estrategia" /> : null}
      <WizardSection id="identidade-produto" title="Identidade">
        <div className="grid gap-ds-16 lg:grid-cols-2">
          <ReadOnly label="Produto" value={locked.product} />
          <ReadOnly label="Marketplace" value={locked.marketplace} />
          <ReadOnly label="Idioma da campanha" value={locked.language} />
          <ReadOnly label="País" value={locked.country} />
          <div className="flex flex-col gap-ds-4">
            <Label htmlFor="brand">Marca</Label>
            <Input id="brand" name="brand" defaultValue={text.brand} />
          </div>
          <div className="flex flex-col gap-ds-4">
            <Label htmlFor="category">Categoria</Label>
            <Input id="category" name="category" defaultValue={text.category} />
          </div>
        </div>
      </WizardSection>

      <WizardSection id="conhecimento-produto" title="Conhecimento do produto">
        <Area id="description" name="description" label="Descrição" value={text.description} extracted={extracted.description} />
        <Area id="ingredients" name="ingredients" label="Ingredientes" value={text.ingredients} extracted={extracted.ingredients} hint="Um item por linha." />
        <Area id="benefits" name="benefits" label="Benefícios" value={text.benefits} extracted={extracted.benefits} hint="Um item por linha." />
        <Area id="how-it-works" name="howItWorks" label="Como funciona" value={text.howItWorks} extracted={extracted.howItWorks} />
        <Area id="warnings" name="warnings" label="Avisos" value={text.warnings} extracted={extracted.warnings} />
        <Area id="pricing" name="pricing" label="Preço" value={text.pricing} extracted={extracted.pricing} />
        <Area id="guarantee" name="guarantee" label="Garantia" value={text.guarantee} extracted={extracted.guarantee} />
        <Area id="manufacturer" name="manufacturer" label="Fabricante" value={text.manufacturer} extracted={extracted.manufacturer} />
        <Area id="faq" name="faq" label="FAQ" value={text.faq} extracted={extracted.faq} />
        <Area id="images" name="images" label="Imagens" value={text.images} extracted={extracted.images} hint="Um endereço http ou https por linha." />
        <Area id="videos" name="videos" label="Vídeos" value={text.videos} extracted={extracted.videos} hint="Um endereço http ou https por linha." />
      </WizardSection>

      <div className="flex flex-col-reverse gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" name="intent" value="draft" variant="secondary">
          Salvar rascunho
        </Button>
        {returnToStrategy ? (
          <Button type="submit" name="intent" value="strategy" className="h-12 px-ds-24 sm:min-w-64">
            Salvar e voltar à estratégia
          </Button>
        ) : (
          <Button type="submit" name="intent" value="research" className="h-12 px-ds-24 sm:min-w-64">
            Pesquisar mercado
          </Button>
        )}
      </div>
    </form>
  );
}
