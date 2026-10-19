import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CampaignStrategySummary } from "@/components/campaign-wizard/campaign-strategy";
import { PageTemplate } from "@/components/layout/page-template";
import { Alert } from "@/components/ui/alert";
import { getCampaignById } from "@/lib/campaigns";
import { strategyFromDecision } from "@/lib/campaign-strategy";
import { readStoredStrategyDecision } from "@/lib/strategy-decision/store";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> };

const ERRORS: Record<string, string> = {
  geracao: "A landing page não foi gerada. Nada foi salvo.",
  publicada: "Uma campanha publicada não recebe uma landing page por este caminho.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const campaign = Number.isInteger(id) ? getCampaignById(id) : undefined;
  return { title: campaign ? `Estratégia da campanha · ${campaign.name}` : "Estratégia da campanha" };
}

export default async function CampaignStrategyPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const code = (await searchParams).erro ?? "";
  if (code === "bloqueada") redirect(`/admin/${id}/bloqueada`);
  const error = ERRORS[code];
  const strategy = strategyFromDecision(readStoredStrategyDecision(id));

  return (
    <PageTemplate
      title="Estratégia da Campanha"
      description="Resumo da decisão de estratégia já salva."
      primaryAction={null}
    >
      <div className="flex flex-col gap-ds-32">
        {error ? <Alert tone="danger" title="Geração interrompida">{error}</Alert> : null}
        <CampaignStrategySummary
          campaignId={campaign.id}
          strategy={strategy}
          backHref={`/admin/${campaign.id}/research`}
        />
      </div>
    </PageTemplate>
  );
}
