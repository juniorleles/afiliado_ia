import type { Metadata } from "next";
import { CampaignWizardForm } from "@/app/admin/new/wizard-form";
import { PageTemplate } from "@/components/layout/page-template";
import { listCampaigns } from "@/lib/campaigns";
import { parseCampaignFacts } from "@/lib/manual-overrides";

export const metadata: Metadata = { title: "Nova campanha" };

function knownProductNames(): string[] {
  const names = new Set<string>();
  for (const campaign of listCampaigns()) {
    const product = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl).productName.trim();
    if (product) names.add(product);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

export default function NewCampaignPage() {
  return (
    <PageTemplate
      title="Nova campanha"
      description="Comece pelo produto e pelas configurações da campanha. A IA vai pesquisar o mercado, gerar a landing page e preparar os anúncios."
      primaryAction={null}
    >
      <CampaignWizardForm productNames={knownProductNames()} />
    </PageTemplate>
  );
}
