import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductFactsForm } from "@/app/admin/[id]/fatos/facts-form";
import { WizardSection } from "@/components/campaign-wizard/wizard-section";
import { PageTemplate } from "@/components/layout/page-template";
import { Alert } from "@/components/ui/alert";
import { getCampaignById } from "@/lib/campaigns";
import { CAMPAIGN_GOALS, COUNTRIES, LANGUAGES, MARKETPLACES, labelFor, readCampaignBrief } from "@/lib/campaign-brief";
import { knowledgeChecks, knowledgePercent, readKnowledgeText } from "@/lib/product-knowledge";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERRORS: Record<string, string> = {
  url: "Use apenas endereços http ou https, um por linha.",
  marca: "Use um nome de marca mais curto.",
  categoria: "Use uma categoria mais curta.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign ? `Fatos do produto · ${campaign.name}` : "Fatos do produto" };
}

export default async function ProductFactsPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const query = await searchParams;
  const aviso = typeof query.aviso === "string" ? query.aviso : "";
  const erro = typeof query.erro === "string" ? ERRORS[query.erro] : "";
  const brief = readCampaignBrief(id);
  const { text, extracted } = readKnowledgeText(campaign, brief);
  const checks = knowledgeChecks(text);
  const percent = knowledgePercent(checks);

  return (
    <PageTemplate
      title="Fatos do produto"
      description="Revise as informações do produto antes da pesquisa de mercado. Esses dados serão utilizados pela IA para gerar a landing page e os anúncios."
      primaryAction={null}
    >
      <div className="flex flex-col gap-ds-32">
        <p className="text-caption text-muted-foreground">Etapa 2</p>
        {aviso === "salvo" ? <Alert tone="success" title="Rascunho salvo">Os fatos do produto foram gravados.</Alert> : null}
        {aviso === "incompleto" ? <Alert tone="warning" title="Fatos incompletos">Ainda há campos vazios. A estratégia recebe estes fatos quando a completude chegar a 100%.</Alert> : null}
        {erro ? <Alert tone="danger" title="Não foi possível salvar">{erro}</Alert> : null}

        <WizardSection id="resumo-produto" title="Resumo">
          <dl className="grid gap-ds-16 sm:grid-cols-2 lg:grid-cols-3">
            <Summary label="Produto" value={brief?.productName || "Não informado"} />
            <Summary label="Marketplace" value={brief ? labelFor(MARKETPLACES, brief.marketplace) : "Não informado"} />
            <Summary label="Idioma da campanha" value={brief ? labelFor(LANGUAGES, brief.language) : "Não informado"} />
            <Summary label="País" value={brief ? labelFor(COUNTRIES, brief.country) : "Não informado"} />
            <Summary label="Categoria" value={text.category || "Não informada"} />
            <Summary label="Marca" value={text.brand || "Não informada"} />
            <Summary label="Objetivo da campanha" value={brief ? labelFor(CAMPAIGN_GOALS, brief.goal) : "Não informado"} />
          </dl>
        </WizardSection>

        <WizardSection id="completude-produto" title="Completude do produto">
          <div className="flex flex-col gap-ds-16">
            <div>
              <p className="text-h2">{percent}%</p>
              <div
                className="mt-ds-8 h-2 overflow-hidden rounded-ds-full bg-secondary"
                role="progressbar"
                aria-label="Completude do produto"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            </div>
            <ul className="grid gap-ds-8 sm:grid-cols-2">
              {checks.map((item) => (
                <li key={item.id} className="text-body">
                  {item.filled ? "✔" : "❌"} {item.label}
                </li>
              ))}
            </ul>
          </div>
        </WizardSection>

        <ProductFactsForm
          campaignId={campaign.id}
          text={text}
          extracted={extracted}
          locked={{
            product: brief?.productName || "Não informado",
            marketplace: brief ? labelFor(MARKETPLACES, brief.marketplace) : "Não informado",
            language: brief ? labelFor(LANGUAGES, brief.language) : "Não informado",
            country: brief ? labelFor(COUNTRIES, brief.country) : "Não informado",
          }}
          returnToStrategy={query.retorno === "estrategia"}
        />
      </div>
    </PageTemplate>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body">{value}</dd>
    </div>
  );
}
