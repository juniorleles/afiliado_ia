import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockedLanding } from "@/components/campaign-wizard/blocked-landing";
import { PageTemplate } from "@/components/layout/page-template";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById } from "@/lib/campaigns";
import { blockedLandingFacts } from "@/lib/blocked-landing";
import { readKnowledgeText } from "@/lib/product-knowledge";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign ? `Landing page bloqueada · ${campaign.name}` : "Landing page bloqueada" };
}

export default async function BlockedLandingPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const { text } = readKnowledgeText(campaign, readCampaignBrief(id));
  const { percent, facts } = blockedLandingFacts(text);

  return (
    <PageTemplate
      title="Landing Page bloqueada"
      description="A IA não possui informações suficientes para gerar uma Landing Page confiável. Complete os Fatos do Produto antes de continuar."
      primaryAction={null}
    >
      <BlockedLanding
        percent={percent}
        facts={facts}
        factsHref={`/admin/${campaign.id}/fatos?retorno=estrategia`}
        cancelHref={`/admin/${campaign.id}/estrategia`}
      />
    </PageTemplate>
  );
}
