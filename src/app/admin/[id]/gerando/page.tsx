import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingGenerationRun } from "@/components/campaign-wizard/landing-generation-run";
import { PageTemplate } from "@/components/layout/page-template";
import { getCampaignById } from "@/lib/campaigns";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign ? `Gerando landing page · ${campaign.name}` : "Gerando landing page" };
}

export default async function GeneratingLandingPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();

  return (
    <PageTemplate
      title="Gerando Landing Page"
      description="A IA está criando sua Landing Page utilizando os fatos do produto, inteligência de mercado e estratégia escolhida."
      primaryAction={null}
    >
      <LandingGenerationRun campaignId={campaign.id} backHref={`/admin/${campaign.id}/estrategia`} />
    </PageTemplate>
  );
}
