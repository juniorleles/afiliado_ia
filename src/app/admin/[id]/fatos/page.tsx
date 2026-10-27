import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductFactsForm } from "@/app/admin/[id]/fatos/facts-form";
import { ProductReviewWorkspace } from "@/components/product-review/workspace";
import { PageTemplate } from "@/components/layout/page-template";
import { Alert } from "@/components/ui/alert";
import { getCampaignById } from "@/lib/campaigns";
import { COUNTRIES, LANGUAGES, MARKETPLACES, labelFor, readCampaignBrief } from "@/lib/campaign-brief";
import { readKnowledgeText } from "@/lib/product-knowledge";
import { snapshotProductResearch } from "@/lib/product-research/run";
import { readCampaignSources } from "@/lib/campaign-sources/store";

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

export const dynamic = "force-dynamic";

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
  const research = snapshotProductResearch(id);
  const sources = readCampaignSources(id);
  const marketplace = brief ? labelFor(MARKETPLACES, brief.marketplace) : "Não informado";

  return (
    <PageTemplate
      title="Revisão do produto"
      description="Revise fontes, fatos e imagens antes de gerar um rascunho SANDBOX. Cobertura não autoriza publicação."
      primaryAction={null}
    >
      <div className="flex flex-col gap-ds-24">
        {aviso === "salvo" ? <Alert tone="success" title="Rascunho salvo">Os fatos do produto foram gravados.</Alert> : null}
        {aviso === "incompleto" ? <Alert tone="warning" title="Fatos incompletos">Ainda há campos vazios. A estratégia recebe estes fatos quando a completude chegar a 100%.</Alert> : null}
        {erro ? <Alert tone="danger" title="Não foi possível salvar">{erro}</Alert> : null}
        <ProductReviewWorkspace
          campaignId={campaign.id}
          productName={brief?.productName || campaign.name}
          marketplace={marketplace}
          initial={research.latest}
          sources={sources}
          knowledge={text}
          defaultProductUrl={text.productUrl}
          defaultAffiliateResourceUrl={text.affiliateResourceUrl ?? ""}
          advanced={
            <ProductFactsForm
              campaignId={campaign.id}
              text={text}
              extracted={extracted}
              sources={sources}
              locked={{
                product: brief?.productName || "Não informado",
                marketplace,
                language: brief ? labelFor(LANGUAGES, brief.language) : "Não informado",
                country: brief ? labelFor(COUNTRIES, brief.country) : "Não informado",
              }}
              returnToStrategy={query.retorno === "estrategia"}
            />
          }
        />
      </div>
    </PageTemplate>
  );
}
