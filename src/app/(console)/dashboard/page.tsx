import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { PageTemplate } from "@/components/layout/page-template";
import { exampleCampaigns, exampleOffers } from "@/lib/ui/shell-examples";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PageTemplate
      title="Trabalho em aberto"
      description="Estrutura do dashboard. Os números abaixo são exemplos e não vêm de uma busca."
      primaryAction={
        <Button asChild>
          <Link href="/pesquisa">Pesquisar</Link>
        </Button>
      }
      sidebar={
        <div className="rounded-ds-md border border-border bg-card p-ds-16">
          <h2 className="text-h3">Nesta página</h2>
          <p className="mt-ds-8 text-body text-muted-foreground">O próximo passo de exemplo abre a Pesquisa de Mercado.</p>
        </div>
      }
    >
      <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard subject="Pesquisas" value="1" period="Exemplo" />
        <MetricCard subject="Products" value="3" period="Exemplo" />
        <MetricCard subject="Rascunhos" value="1" period="Exemplo" />
        <MetricCard subject="Ações" value="1" period="Exemplo" />
      </div>
      <ul className="mt-ds-24 flex flex-col gap-ds-12">
        {exampleOffers.map((offer) => (
          <li key={offer.name} className="flex flex-wrap items-center justify-between gap-ds-12 rounded-ds-md border border-border bg-card p-ds-16">
            <span className="text-body">{offer.name}</span>
            <Badge status={offer.status} />
          </li>
        ))}
        {exampleCampaigns.slice(0, 1).map((campaign) => (
          <li key={campaign.name} className="flex flex-wrap items-center justify-between gap-ds-12 rounded-ds-md border border-border bg-card p-ds-16">
            <span className="text-body">{campaign.name}</span>
            <Badge status={campaign.status} />
          </li>
        ))}
      </ul>
    </PageTemplate>
  );
}
